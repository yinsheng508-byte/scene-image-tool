export const FONT_CONFIG = [
  {
    family: "SourceHanSansCN",
    displayName: "思源黑体",
    file: "SourceHanSansCN-Light.otf",
    weight: 300,
    type: "local"
  },
  {
    family: "SourceHanSansCN",
    displayName: "思源黑体",
    file: "SourceHanSansCN-Regular.otf",
    weight: 400,
    type: "local"
  },
  {
    family: "SourceHanSansCN",
    displayName: "思源黑体",
    file: "SourceHanSansCN-Medium.otf",
    weight: 500,
    type: "local"
  },
  {
    family: "SourceHanSansCN",
    displayName: "思源黑体",
    file: "SourceHanSansCN-Bold.otf",
    weight: 700,
    type: "local"
  },
  {
    family: "SourceHanSerifCN",
    displayName: "思源宋体",
    file: "SourceHanSerifCN-Light.otf",
    weight: 300,
    type: "local"
  },
  {
    family: "SourceHanSerifCN",
    displayName: "思源宋体",
    file: "SourceHanSerifCN-Regular.otf",
    weight: 400,
    type: "local"
  },
  {
    family: "SourceHanSerifCN",
    displayName: "思源宋体",
    file: "SourceHanSerifCN-Medium.otf",
    weight: 500,
    type: "local"
  },
  {
    family: "SourceHanSerifCN",
    displayName: "思源宋体",
    file: "SourceHanSerifCN-Bold.otf",
    weight: 700,
    type: "local"
  },
  {
    family: "AlibabaPuHuiTi",
    displayName: "阿里巴巴普惠体",
    file: "AlibabaPuHuiTi-3/AlibabaPuHuiTi-3/AlibabaPuHuiTi-3-35-Thin/AlibabaPuHuiTi-3-35-Thin.ttf",
    weight: 300,
    type: "local"
  },
  {
    family: "AlibabaPuHuiTi",
    displayName: "阿里巴巴普惠体",
    file: "AlibabaPuHuiTi-3/AlibabaPuHuiTi-3/AlibabaPuHuiTi-3-55-Regular/AlibabaPuHuiTi-3-55-Regular.ttf",
    weight: 400,
    type: "local"
  },
  {
    family: "AlibabaPuHuiTi",
    displayName: "阿里巴巴普惠体",
    file: "AlibabaPuHuiTi-3/AlibabaPuHuiTi-3/AlibabaPuHuiTi-3-65-Medium/AlibabaPuHuiTi-3-65-Medium.ttf",
    weight: 500,
    type: "local"
  },
  {
    family: "AlibabaPuHuiTi",
    displayName: "阿里巴巴普惠体",
    file: "AlibabaPuHuiTi-3/AlibabaPuHuiTi-3/AlibabaPuHuiTi-3-115-Black/AlibabaPuHuiTi-3-115-Black.ttf",
    weight: 700,
    type: "local"
  },
  {
    family: "KaiTi",
    displayName: "楷体",
    file: "KaiTi.ttf",
    weight: 400,
    type: "local"
  },
  {
    family: "PingFangSC",
    displayName: "苹方",
    file: "PingFangSC-Light.otf",
    weight: 300,
    type: "local"
  },
  {
    family: "PingFangSC",
    displayName: "苹方",
    file: "PingFangSC-Regular.otf",
    weight: 400,
    type: "local"
  },
  {
    family: "PingFangSC",
    displayName: "苹方",
    file: "PingFangSC-Medium.otf",
    weight: 500,
    type: "local"
  },
  {
    family: "PingFangSC",
    displayName: "苹方",
    file: "PingFangSC-Semibold.otf",
    weight: 600,
    type: "local"
  },
  {
    family: "Microsoft YaHei",
    displayName: "微软雅黑",
    file: null,
    weight: 400,
    platform: ["win32"],
    type: "system"
  },
  {
    family: "Microsoft YaHei",
    displayName: "微软雅黑",
    file: null,
    weight: 700,
    platform: ["win32"],
    type: "system"
  },
  {
    family: "Yuanti SC",
    displayName: "圆体",
    file: null,
    weight: 400,
    platform: ["darwin"],
    type: "system"
  }
];

export const EXPORT_FONT_REMAP = Object.freeze({
  PingFangSC: "SourceHanSansCN",
  "苹方": "SourceHanSansCN",
  "Yuanti SC": "SourceHanSansCN"
});

export const EXPORT_FONT_FALLBACK_CANDIDATES = Object.freeze([
  "SourceHanSansCN",
  "SourceHanSerifCN",
  "AlibabaPuHuiTi",
  "KaiTi",
  "Microsoft YaHei"
]);

const FONT_FAMILY_SET = new Set();
const FONT_WEIGHTS = new Map();
const DISPLAY_NAME_MAP = new Map();

FONT_CONFIG.forEach((font) => {
  if (!font?.family) return;
  FONT_FAMILY_SET.add(font.family);
  if (!FONT_WEIGHTS.has(font.family)) {
    FONT_WEIGHTS.set(font.family, new Set());
  }
  if (Number.isFinite(font.weight)) {
    FONT_WEIGHTS.get(font.family).add(Number(font.weight));
  }
  if (font.displayName) {
    DISPLAY_NAME_MAP.set(font.displayName, font.family);
  }
});

export function resolveFontFamilyName(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (FONT_FAMILY_SET.has(raw)) return raw;
  const mapped = DISPLAY_NAME_MAP.get(raw);
  return mapped || raw;
}

export function resolveExportFontFamily(input) {
  const raw = String(input || "").trim();
  const resolved = resolveFontFamilyName(raw);
  const remapped = EXPORT_FONT_REMAP[resolved] || EXPORT_FONT_REMAP[raw] || resolved;
  return resolveFontFamilyName(remapped) || remapped;
}

export function getExportFallbackFamilies(preferredFamily = "") {
  const result = [];
  const pushUnique = (family) => {
    const resolved = resolveExportFontFamily(family);
    if (!resolved) return;
    if (!result.includes(resolved)) {
      result.push(resolved);
    }
  };

  pushUnique(preferredFamily);
  EXPORT_FONT_FALLBACK_CANDIDATES.forEach((family) => pushUnique(family));
  if (!result.includes("sans-serif")) {
    result.push("sans-serif");
  }
  return result;
}

export function resolveFontWeight(family, weight) {
  const resolvedFamily = resolveFontFamilyName(family);
  const weights = FONT_WEIGHTS.get(resolvedFamily);
  const numericWeight = Number(weight) || 400;
  if (!weights || weights.size === 0) return numericWeight;
  if (weights.has(numericWeight)) return numericWeight;
  const list = Array.from(weights).sort((a, b) => a - b);
  let closest = list[0];
  let closestDiff = Math.abs(list[0] - numericWeight);
  for (let i = 1; i < list.length; i += 1) {
    const diff = Math.abs(list[i] - numericWeight);
    if (diff < closestDiff || (diff === closestDiff && list[i] > closest)) {
      closest = list[i];
      closestDiff = diff;
    }
  }
  return closest;
}
