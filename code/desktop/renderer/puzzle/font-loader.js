import { FONT_CONFIG, resolveFontFamilyName, resolveFontWeight } from "../../shared/font-config.mjs";

const loadedFonts = new Set();
let systemFontCache = null;
let systemFontMeta = null;
const systemFontAliasMap = new Map();
const SYSTEM_FONT_LIMIT = 2000;

function getPlatform() {
  const ua = navigator.userAgent || "";
  if (ua.includes("Windows")) return "win32";
  if (ua.includes("Mac")) return "darwin";
  if (ua.includes("Linux")) return "linux";
  return "unknown";
}

export function getPlatformFonts() {
  const platform = getPlatform();
  return FONT_CONFIG.filter((font) => {
    if (!font.platform || font.platform.length === 0) return true;
    return font.platform.includes(platform);
  });
}

export function getFontFamilies() {
  const fonts = getPlatformFonts();
  const map = new Map();
  fonts.forEach((font) => {
    if (!map.has(font.family)) {
      map.set(font.family, {
        family: font.family,
        displayName: font.displayName || font.family,
        weights: new Set()
      });
    }
    map.get(font.family).weights.add(font.weight);
  });
  return Array.from(map.values()).map((item) => ({
    family: item.family,
    displayName: item.displayName,
    weights: Array.from(item.weights).sort((a, b) => a - b)
  }));
}

function hasCjkText(value) {
  return /[\u3400-\u9FFF\uF900-\uFAFF]/.test(String(value || ""));
}

function normalizeFontRecord(item) {
  if (typeof item === "string") {
    const name = item.trim();
    if (!name) return null;
    return {
      family: name,
      displayName: name,
      aliases: [name]
    };
  }
  if (!item || typeof item !== "object") return null;
  const family = String(item.family || item.familyName || item.postScriptName || item.name || "").trim();
  if (!family) return null;
  const displayName = String(item.displayName || item.name || family).trim() || family;
  const aliases = [];
  const pushAlias = (value) => {
    const text = String(value || "").trim();
    if (!text) return;
    if (!aliases.includes(text)) aliases.push(text);
  };
  pushAlias(family);
  pushAlias(displayName);
  if (Array.isArray(item.aliases)) {
    item.aliases.forEach((alias) => pushAlias(alias));
  }
  pushAlias(item.familyName);
  pushAlias(item.postScriptName);
  pushAlias(item.name);
  return {
    family,
    displayName,
    aliases
  };
}

function resolveSystemFamilyAlias(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  return systemFontAliasMap.get(raw) || raw;
}

export async function loadSystemFonts() {
  if (systemFontCache !== null) return systemFontCache;
  if (!window.appApi?.getSystemFonts) {
    systemFontCache = [];
    return systemFontCache;
  }
  try {
    const result = await window.appApi.getSystemFonts();
    if (!result?.ok || !Array.isArray(result.fonts)) {
      systemFontCache = [];
      return systemFontCache;
    }
    const builtinFamilySet = new Set();
    getPlatformFonts().forEach((font) => {
      if (font?.family) builtinFamilySet.add(String(font.family).trim().toLowerCase());
    });
    const merged = [];
    const familyMap = new Map();
    systemFontAliasMap.clear();

    result.fonts.forEach((item) => {
      const normalized = normalizeFontRecord(item);
      if (!normalized) return;
      const familyKey = normalized.family.toLowerCase();
      if (builtinFamilySet.has(familyKey)) return;
      if (!familyMap.has(familyKey)) {
        familyMap.set(familyKey, normalized);
        merged.push(normalized);
        return;
      }
      const existing = familyMap.get(familyKey);
      normalized.aliases.forEach((alias) => {
        if (!existing.aliases.includes(alias)) {
          existing.aliases.push(alias);
        }
      });
      const existingHasCjk = hasCjkText(existing.displayName);
      const nextHasCjk = hasCjkText(normalized.displayName);
      if ((!existing.displayName || existing.displayName === existing.family) && normalized.displayName) {
        existing.displayName = normalized.displayName;
      } else if (!existingHasCjk && nextHasCjk) {
        existing.displayName = normalized.displayName;
      }
    });

    merged.sort((left, right) =>
      String(left.displayName || left.family).localeCompare(String(right.displayName || right.family), "zh-CN", {
        numeric: true,
        sensitivity: "base"
      })
    );

    const dedupCount = merged.length;
    const truncatedCount = Math.max(0, dedupCount - SYSTEM_FONT_LIMIT);
    const limited = merged.slice(0, SYSTEM_FONT_LIMIT);

    systemFontCache = limited.map((item) => ({
      family: item.family,
      displayName: item.displayName || item.family,
      aliases: item.aliases,
      weights: [400, 700],
      isSystem: true
    }));

    systemFontCache.forEach((font) => {
      const aliases = Array.isArray(font.aliases) ? font.aliases : [];
      aliases.forEach((alias) => {
        const key = String(alias || "").trim();
        if (!key || systemFontAliasMap.has(key)) return;
        systemFontAliasMap.set(key, font.family);
      });
      if (!systemFontAliasMap.has(font.family)) {
        systemFontAliasMap.set(font.family, font.family);
      }
      if (!systemFontAliasMap.has(font.displayName)) {
        systemFontAliasMap.set(font.displayName, font.family);
      }
    });

    systemFontMeta = {
      method: result.method || "unknown",
      rawCount: Number(result?.stats?.rawCount) || result.fonts.length || 0,
      dedupCount,
      returnedCount: systemFontCache.length,
      truncatedCount
    };
    console.info(
      `系统字体加载: method=${systemFontMeta.method} raw=${systemFontMeta.rawCount} dedup=${systemFontMeta.dedupCount} returned=${systemFontMeta.returnedCount} truncated=${systemFontMeta.truncatedCount}`
    );
    return systemFontCache;
  } catch (error) {
    console.warn("系统字体枚举失败", error);
    systemFontCache = [];
    systemFontMeta = {
      method: "error",
      rawCount: 0,
      dedupCount: 0,
      returnedCount: 0,
      truncatedCount: 0
    };
    systemFontAliasMap.clear();
    return systemFontCache;
  }
}

export function getSystemFontCache() {
  return systemFontCache || [];
}

export function getSystemFontMeta() {
  return systemFontMeta || null;
}

export async function loadFont(family, weight = 400, style = "normal") {
  const requestedFamily = String(family || "").trim();
  const mappedFamily = resolveSystemFamilyAlias(resolveFontFamilyName(requestedFamily) || requestedFamily);
  const resolvedWeight = resolveFontWeight(mappedFamily, weight);
  const key = `${mappedFamily}-${resolvedWeight}-${style}`;
  if (loadedFonts.has(key)) return true;
  const config = getPlatformFonts().find(
    (font) =>
      font.family === mappedFamily &&
      font.weight === resolvedWeight &&
      (font.style || "normal") === style
  );
  if (!config) {
    const inSystemCache = getSystemFontCache().some((font) => font.family === mappedFamily);
    if (inSystemCache) {
      loadedFonts.add(key);
      return true;
    }
    return false;
  }
  if (config.type === "system") {
    loadedFonts.add(key);
    return true;
  }
  try {
    const fontUrl = new URL(`../../fonts/${config.file}`, import.meta.url);
    const fontFace = new FontFace(mappedFamily, `url(${fontUrl.href})`, {
      weight: String(resolvedWeight),
      style
    });
    await fontFace.load();
    document.fonts.add(fontFace);
    loadedFonts.add(key);
    return true;
  } catch (error) {
    console.error(`字体加载失败: ${family} ${weight}`, error);
    return false;
  }
}

export async function ensureFontLoaded(family, weight = 400, style = "normal") {
  return loadFont(family, weight, style);
}
