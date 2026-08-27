import {
  getSlotRenderSpec,
  sortSlotsByZOrder,
  buildShadowCutoutMasks,
  computeContainRect as sharedComputeContainRect
} from "../../shared/puzzle-render-spec.mjs";
import { drawText } from "./text-renderer.js";
import { ensureFontLoaded } from "./font-loader.js";

const shadowCache = new Map();

function getShadowCanvas(width, height, radius, shadowSpec) {
  if (!shadowSpec) return null;
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const alpha = Math.max(0, Math.min(1, shadowSpec.alpha ?? 0.45));
  const blur = Math.max(1, Math.round(shadowSpec.blur || 1));
  const offsetX = Math.round(shadowSpec.offsetX || 0);
  const offsetY = Math.round(shadowSpec.offsetY || 0);
  const r = Math.max(0, Math.min(radius || 0, safeWidth / 2, safeHeight / 2));
  const key = `${safeWidth}x${safeHeight}|r${r}|a${alpha.toFixed(3)}|b${blur}|x${offsetX}|y${offsetY}`;
  const cached = shadowCache.get(key);
  if (cached) return cached;

  const extra = Math.max(Math.abs(offsetX), Math.abs(offsetY));
  const padding = blur * 2 + extra;
  const canvas = document.createElement("canvas");
  canvas.width = safeWidth + padding * 2;
  canvas.height = safeHeight + padding * 2;
  const ctx = canvas.getContext("2d");
  ctx.shadowColor = `rgba(0, 0, 0, ${alpha})`;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = offsetX;
  ctx.shadowOffsetY = offsetY;
  ctx.fillStyle = "#000000";
  fillRoundedRect(ctx, padding, padding, safeWidth, safeHeight, r);
  ctx.globalCompositeOperation = "destination-out";
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  fillRoundedRect(ctx, padding, padding, safeWidth, safeHeight, r);

  const result = { canvas, padding };
  shadowCache.set(key, result);
  return result;
}

function drawImageElement(ctx, imageItem, image) {
  if (!imageItem || !image) return;
  const width = Math.max(1, Number(imageItem.width) || image.width || 1);
  const height = Math.max(1, Number(imageItem.height) || image.height || 1);
  const x = Number(imageItem.x) || 0;
  const y = Number(imageItem.y) || 0;
  const rotation = (Number(imageItem.rotation) || 0) * (Math.PI / 180);
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(rotation);
  ctx.drawImage(image, -width / 2, -height / 2, width, height);
  ctx.restore();
}

function getElementZOrderValue(item) {
  const zOrder = Number(item?.zOrder);
  if (Number.isFinite(zOrder)) return zOrder;
  const createdAt = Number(item?.createdAt);
  return Number.isFinite(createdAt) ? createdAt : 0;
}

function compareElementsByZOrder(a, b) {
  const diff = getElementZOrderValue(a) - getElementZOrderValue(b);
  if (diff !== 0) return diff;
  return String(a?.id || "").localeCompare(String(b?.id || ""), "zh-CN");
}

export async function drawPreview(
  ctx,
  task,
  backgroundImage,
  imageLoader,
  view = null,
  shouldAbort = null
) {
  if (!task) return;
  const isAborted = typeof shouldAbort === "function" ? shouldAbort : () => false;
  if (isAborted()) return;
  const { canvasSize, slots, backgroundMode, backgroundColor } = task;
  // Always clear in identity transform to avoid stale transformed clears.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();

  let scale = view?.scale;
  let offsetX = view?.offsetX;
  let offsetY = view?.offsetY;

  if (!scale || !Number.isFinite(scale)) {
    scale = Math.min(
      ctx.canvas.width / canvasSize.w,
      ctx.canvas.height / canvasSize.h
    );
  }
  if (!Number.isFinite(offsetX) || !Number.isFinite(offsetY)) {
    offsetX = (ctx.canvas.width - canvasSize.w * scale) / 2;
    offsetY = (ctx.canvas.height - canvasSize.h * scale) / 2;
  }

  ctx.save();
  try {
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    if (backgroundMode === "color") {
      ctx.fillStyle = backgroundColor || "#ffffff";
      ctx.fillRect(0, 0, canvasSize.w, canvasSize.h);
    } else if (backgroundMode === "image" && backgroundImage) {
      ctx.drawImage(backgroundImage, 0, 0, canvasSize.w, canvasSize.h);
    }

    const sortedSlots = sortSlotsByZOrder(slots);
    const slotEntries = [];
    for (const slot of sortedSlots) {
      if (isAborted()) return;
      const image = slot.imagePath ? await imageLoader(slot.imagePath) : null;
      if (isAborted()) return;
      if (!image) continue;
      const spec = getSlotRenderSpec({
        slot,
        imageW: image.width,
        imageH: image.height,
        scale: 1
      });
      if (!spec.hasImage || !spec.imageRect) continue;
      const slotX = spec.slotRect.x;
      const slotY = spec.slotRect.y;
      const slotW = spec.slotRect.w;
      const slotH = spec.slotRect.h;
      const drawX = slotX + spec.imageRect.x;
      const drawY = slotY + spec.imageRect.y;
      const drawW = spec.imageRect.w;
      const drawH = spec.imageRect.h;
      if (drawW <= 0 || drawH <= 0) continue;
      slotEntries.push({
        image,
        slotX,
        slotY,
        slotW,
        slotH,
        drawX,
        drawY,
        drawW,
        drawH,
        spec
      });
    }

    // Interleaved slot rendering (shadow -> image -> border) by zOrder:
    // this keeps upper-slot shadow visible on lower-slot image in overlap areas.
    for (let index = 0; index < slotEntries.length; index += 1) {
      if (isAborted()) return;
      const entry = slotEntries[index];
      if (entry.spec.shadow) {
        const shadow = getShadowCanvas(entry.slotW, entry.slotH, entry.spec.borderRadius, entry.spec.shadow);
        if (shadow) {
          const shadowLeft = entry.slotX - shadow.padding;
          const shadowTop = entry.slotY - shadow.padding;
          const singleShadowLayer = document.createElement("canvas");
          singleShadowLayer.width = shadow.canvas.width;
          singleShadowLayer.height = shadow.canvas.height;
          const singleCtx = singleShadowLayer.getContext("2d");
          if (singleCtx) {
            singleCtx.drawImage(shadow.canvas, 0, 0);
            const cutouts = buildShadowCutoutMasks(slotEntries, index, {
              includeOwner: true,
              onlyAbove: true
            });
            if (cutouts.length) {
              singleCtx.globalCompositeOperation = "destination-out";
              singleCtx.fillStyle = "#000000";
              for (const mask of cutouts) {
                if (isAborted()) return;
                fillRoundedRect(
                  singleCtx,
                  mask.x - shadowLeft,
                  mask.y - shadowTop,
                  mask.w,
                  mask.h,
                  mask.radius
                );
              }
              singleCtx.globalCompositeOperation = "source-over";
            }
            ctx.drawImage(singleShadowLayer, shadowLeft, shadowTop);
          }
        }
      }

      ctx.save();
      clipRoundedRect(ctx, entry.slotX, entry.slotY, entry.slotW, entry.slotH, entry.spec.borderRadius);
      ctx.drawImage(entry.image, entry.drawX, entry.drawY, entry.drawW, entry.drawH);
      ctx.restore();

      if (entry.spec.borderWidth > 0) {
        ctx.save();
        ctx.lineWidth = entry.spec.borderWidth;
        ctx.strokeStyle = entry.spec.borderColor;
        strokeRoundedRect(ctx, entry.slotX, entry.slotY, entry.slotW, entry.slotH, entry.spec.borderRadius);
        ctx.restore();
      }
    }

    const elements = [
      ...(task.texts || []).map((item) => ({ ...item, _type: "text" })),
      ...(task.images || []).map((item) => ({ ...item, _type: "image" }))
    ].sort(compareElementsByZOrder);
    for (const element of elements) {
      if (isAborted()) return;
      if (element._type === "text") {
        await ensureFontLoaded(
          element.style?.fontFamily,
          element.style?.fontWeight,
          element.style?.fontStyle
        );
        if (isAborted()) return;
        drawText(ctx, element);
        continue;
      }
      if (element._type === "image") {
        const image = element.imagePath ? await imageLoader(element.imagePath) : null;
        if (isAborted()) return;
        if (image) {
          drawImageElement(ctx, element, image);
        }
      }
    }
  } finally {
    ctx.restore();
  }
}

export const computeContainRect = sharedComputeContainRect;

export function clipRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  ctx.clip();
}

export function fillRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  ctx.fill();
}

export function strokeRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  ctx.stroke();
}
