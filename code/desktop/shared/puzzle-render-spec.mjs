export const DEFAULT_SHADOW = {
  alpha: 0.45,
  blur: 22,
  offsetX: 10,
  offsetY: 10
};

export const SHADOW_PIPELINE_LEGACY_VERSION = 1;
export const SHADOW_PIPELINE_VERSION = 2;
export const SHADOW_BLOCK_MODE = "slot-aware";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeOrderValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeSlotMask(mask) {
  const sourceRect = mask?.slotRect || mask?.rect || mask;
  if (!sourceRect) return null;
  const w = Math.max(1, Math.round(Number(sourceRect.w) || 0));
  const h = Math.max(1, Math.round(Number(sourceRect.h) || 0));
  return {
    x: Math.round(Number(sourceRect.x) || 0),
    y: Math.round(Number(sourceRect.y) || 0),
    w,
    h,
    radius: Math.max(
      0,
      Math.min(
        Number(mask?.radius ?? mask?.borderRadius ?? mask?.spec?.borderRadius) || 0,
        w / 2,
        h / 2
      )
    )
  };
}

function isRectIntersected(a, b) {
  if (!a || !b) return false;
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

export function resolveShadowPipelineVersion(version) {
  const numeric = Number(version);
  if (!Number.isFinite(numeric)) return SHADOW_PIPELINE_VERSION;
  if (numeric <= SHADOW_PIPELINE_LEGACY_VERSION) return SHADOW_PIPELINE_LEGACY_VERSION;
  return SHADOW_PIPELINE_VERSION;
}

export function getSlotZOrderValue(slot) {
  return normalizeOrderValue(slot?.zOrder);
}

export function compareSlotsByZOrder(a, b) {
  const diff = getSlotZOrderValue(a) - getSlotZOrderValue(b);
  if (diff !== 0) return diff;
  return String(a?.id || "").localeCompare(String(b?.id || ""), "zh-CN");
}

export function sortSlotsByZOrder(slots) {
  if (!Array.isArray(slots)) return [];
  return [...slots].sort(compareSlotsByZOrder);
}

export function getShadowPadding(shadowSpec) {
  if (!shadowSpec) return 0;
  const blur = Math.max(1, Math.round(Number(shadowSpec.blur) || 1));
  const offsetX = Math.round(Number(shadowSpec.offsetX) || 0);
  const offsetY = Math.round(Number(shadowSpec.offsetY) || 0);
  const extra = Math.max(Math.abs(offsetX), Math.abs(offsetY));
  return blur * 2 + extra;
}

export function buildShadowInfluenceRect(slotRect, shadowSpec) {
  const mask = normalizeSlotMask(slotRect);
  if (!mask) return null;
  const padding = getShadowPadding(shadowSpec);
  return {
    x: mask.x - padding,
    y: mask.y - padding,
    w: mask.w + padding * 2,
    h: mask.h + padding * 2
  };
}

export function buildShadowCutoutMasks(slotEntries, ownerIndex, options = {}) {
  if (!Array.isArray(slotEntries)) return [];
  if (!Number.isInteger(ownerIndex) || ownerIndex < 0 || ownerIndex >= slotEntries.length) {
    return [];
  }
  const includeOwner = options.includeOwner !== false;
  const onlyAbove = options.onlyAbove !== false;
  const mode = options.mode || SHADOW_BLOCK_MODE;
  const ownerEntry = slotEntries[ownerIndex];
  const ownerMask = normalizeSlotMask(ownerEntry);
  if (!ownerMask) return [];

  const ownerShadow = ownerEntry?.shadow || ownerEntry?.spec?.shadow || null;
  const influenceRect = buildShadowInfluenceRect(ownerMask, ownerShadow);
  const result = [];
  const seen = new Set();
  const pushMask = (mask) => {
    const key = `${mask.x}|${mask.y}|${mask.w}|${mask.h}|${mask.radius}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(mask);
  };

  if (includeOwner) {
    pushMask(ownerMask);
  }

  const startIndex = onlyAbove ? ownerIndex + 1 : 0;
  for (let i = startIndex; i < slotEntries.length; i += 1) {
    if (i === ownerIndex) continue;
    const blockerMask = normalizeSlotMask(slotEntries[i]);
    if (!blockerMask) continue;
    if (mode === SHADOW_BLOCK_MODE && influenceRect && !isRectIntersected(influenceRect, blockerMask)) {
      continue;
    }
    pushMask(blockerMask);
  }
  return result;
}

export function computeContainRect(imageW, imageH, slotW, slotH) {
  const safeW = Math.max(1, imageW || 1);
  const safeH = Math.max(1, imageH || 1);
  const scale = Math.min(slotW / safeW, slotH / safeH);
  const drawW = safeW * scale;
  const drawH = safeH * scale;
  return {
    x: (slotW - drawW) / 2,
    y: (slotH - drawH) / 2,
    w: drawW,
    h: drawH
  };
}

export function computeImageRect(imageW, imageH, slotW, slotH, crop = null) {
  const safeW = Math.max(1, imageW || 1);
  const safeH = Math.max(1, imageH || 1);
  const baseScale = Math.min(slotW / safeW, slotH / safeH);
  const baseW = safeW * baseScale;
  const baseH = safeH * baseScale;

  if (!crop) {
    return {
      x: (slotW - baseW) / 2,
      y: (slotH - baseH) / 2,
      w: baseW,
      h: baseH
    };
  }

  const scale = clamp(crop.scale ?? 1, 0.5, 3);
  const finalW = baseW * scale;
  const finalH = baseH * scale;

  let offsetX = clamp(crop.offsetX ?? 0, -50, 50);
  let offsetY = clamp(crop.offsetY ?? 0, -50, 50);
  if (finalW <= slotW && finalH <= slotH) {
    offsetX = 0;
    offsetY = 0;
  }

  const pixelOffsetX = slotW * (offsetX / 100);
  const pixelOffsetY = slotH * (offsetY / 100);

  return {
    x: (slotW - finalW) / 2 + pixelOffsetX,
    y: (slotH - finalH) / 2 + pixelOffsetY,
    w: finalW,
    h: finalH
  };
}

export function getShadowSpec(scale = 1) {
  const factor = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return {
    alpha: DEFAULT_SHADOW.alpha,
    blur: Math.max(1, Math.round(DEFAULT_SHADOW.blur * factor)),
    offsetX: Math.round(DEFAULT_SHADOW.offsetX * factor),
    offsetY: Math.round(DEFAULT_SHADOW.offsetY * factor)
  };
}

export function getSlotRenderSpec({ slot, imageW, imageH, scale = 1 }) {
  const factor = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const slotW = Math.max(1, Math.round((slot?.w || 1) * factor));
  const slotH = Math.max(1, Math.round((slot?.h || 1) * factor));
  const slotX = Math.round((slot?.x || 0) * factor);
  const slotY = Math.round((slot?.y || 0) * factor);
  const borderRadius = Math.max(0, (slot?.style?.borderRadius || 0) * factor);
  const borderWidth = Math.max(0, (slot?.style?.borderWidth || 0) * factor);
  const borderColor = slot?.style?.borderColor || "#ffffff";
  const hasImage = Number.isFinite(imageW) && Number.isFinite(imageH) && imageW > 0 && imageH > 0;
  const crop = slot?.crop || null;
  const imageRect = hasImage ? computeImageRect(imageW, imageH, slotW, slotH, crop) : null;
  return {
    slotRect: { x: slotX, y: slotY, w: slotW, h: slotH },
    imageRect,
    hasImage,
    borderRadius,
    borderWidth,
    borderColor,
    shadow: slot?.style?.shadow ? getShadowSpec(factor) : null
  };
}
