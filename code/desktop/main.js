const { app, BrowserWindow, Menu, dialog, ipcMain, shell, clipboard } = require("electron");
const { spawn, spawnSync, execFile } = require("child_process");
const { pathToFileURL } = require("url");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { detectDarwinLibreOfficeRuntime } = require("./platform/darwin/libreoffice-runtime");
let PDFiumLibrary = null;
let sharp = null;

let mainWindow = null;
const APP_SETTINGS_FILE_NAME = "app-settings.json";
const allowedExtensions = new Set([".doc", ".docx", ".ppt", ".pptx", ".pdf"]);
const imageExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".bmp",
  ".gif",
  ".tif",
  ".tiff",
  ".svg",
  ".ico",
  ".jfif",
  ".pjpeg",
  ".pjp",
  ".avif",
  ".apng"
]);
let pdfiumInitPromise = null;
let conversionAbortRequested = false;
const activeLibreOfficePids = new Set();
const activeOfficePids = new Set();
const activeOfficeChildPidFiles = new Map();
let cachedLibreOfficeRuntime = null;
const libreOfficeSpeedState = {
  forcedSafe: false,
  reason: "",
  updatedAt: ""
};
let uploadAbortRequested = false;
let xhsAbortRequested = false;
let renderSpecPromise = null;
let textLayoutPromise = null;
let fontConfigPromise = null;
let canvasLib = null;
let textFontsRegistered = false;
const DEFAULT_EXPORT_FONT_FAMILY = "SourceHanSansCN";
const EXPORT_FONT_PROBE_TEXTS = ["拼图字体Probe123", "中文字体可用性检测", "AaBbCc123混排"];
const EXPORT_FONT_PROBE_FONT_SIZE = 42;
const registeredFontFaces = new Map();
const exportFontCapabilityMap = new Map();
const fontDebugCache = new Set();
const fontRegistrationLogCache = new Set();
const exportFontProbeLogCache = new Set();
let fontsDirLogged = false;

function getRenderSpec() {
  if (!renderSpecPromise) {
    const specPath = path.join(__dirname, "shared", "puzzle-render-spec.mjs");
    renderSpecPromise = import(pathToFileURL(specPath).href);
  }
  return renderSpecPromise;
}

function getTextLayoutModule() {
  if (!textLayoutPromise) {
    const modulePath = path.join(__dirname, "shared", "text-layout.mjs");
    textLayoutPromise = import(pathToFileURL(modulePath).href);
  }
  return textLayoutPromise;
}

function getFontConfigModule() {
  if (!fontConfigPromise) {
    const modulePath = path.join(__dirname, "shared", "font-config.mjs");
    fontConfigPromise = import(pathToFileURL(modulePath).href);
  }
  return fontConfigPromise;
}

function getCanvasLib() {
  if (!canvasLib) {
    const skia = require("skia-canvas");
    canvasLib = {
      createCanvas: (width, height) => new skia.Canvas(width, height),
      loadImage: skia.loadImage,
      FontLibrary: skia.FontLibrary
    };
  }
  return canvasLib;
}

function getFontsDir() {
  if (app.isPackaged) {
    const unpacked = path.join(process.resourcesPath, "app.asar.unpacked", "fonts");
    if (fs.existsSync(unpacked)) {
      return unpacked;
    }
    const resourcesFonts = path.join(process.resourcesPath, "fonts");
    if (fs.existsSync(resourcesFonts)) {
      return resourcesFonts;
    }
  }
  return path.join(__dirname, "fonts");
}

function containsCjkText(value) {
  return /[\u3400-\u9FFF\uF900-\uFAFF]/.test(String(value || ""));
}

function getWindowsSystemRoot() {
  return process.env.SystemRoot || process.env.windir || "C:\\Windows";
}

function getWindowsPowerShellAbsoluteCandidates() {
  if (process.platform !== "win32") return [];
  const systemRoot = getWindowsSystemRoot();
  return [
    path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    path.join(systemRoot, "Sysnative", "WindowsPowerShell", "v1.0", "powershell.exe"),
    path.join(systemRoot, "SysWOW64", "WindowsPowerShell", "v1.0", "powershell.exe")
  ];
}

function resolveWindowsPowerShellAbsolutePath() {
  const candidates = getWindowsPowerShellAbsoluteCandidates();
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return "";
}

function normalizeSystemFontRecord(input) {
  if (!input) return null;
  const familyRaw = String(input.family || input.familyName || input.postScriptName || input.name || "").trim();
  const displayRaw = String(input.displayName || input.name || familyRaw).trim();
  if (!familyRaw || !displayRaw) return null;

  const aliases = [];
  const pushAlias = (value) => {
    const text = String(value || "").trim();
    if (!text) return;
    if (!aliases.includes(text)) {
      aliases.push(text);
    }
  };

  pushAlias(familyRaw);
  pushAlias(displayRaw);
  if (Array.isArray(input.aliases)) {
    input.aliases.forEach((item) => pushAlias(item));
  }
  pushAlias(input.postScriptName);
  pushAlias(input.familyName);
  pushAlias(input.name);

  return {
    family: familyRaw,
    displayName: displayRaw,
    aliases
  };
}

function mergeSystemFontRecords(records) {
  const output = [];
  const indexMap = new Map();
  (records || []).forEach((record) => {
    const normalized = normalizeSystemFontRecord(record);
    if (!normalized) return;
    const key = normalized.family.toLowerCase();
    if (!indexMap.has(key)) {
      indexMap.set(key, output.length);
      output.push(normalized);
      return;
    }
    const index = indexMap.get(key);
    const existing = output[index];
    normalized.aliases.forEach((alias) => {
      if (!existing.aliases.includes(alias)) {
        existing.aliases.push(alias);
      }
    });
    const existingHasCjk = containsCjkText(existing.displayName);
    const nextHasCjk = containsCjkText(normalized.displayName);
    if ((!existing.displayName || existing.displayName === existing.family) && normalized.displayName) {
      existing.displayName = normalized.displayName;
    } else if (!existingHasCjk && nextHasCjk) {
      existing.displayName = normalized.displayName;
    }
  });
  output.sort((left, right) =>
    String(left.displayName || left.family).localeCompare(String(right.displayName || right.family), "zh-CN", {
      numeric: true,
      sensitivity: "base"
    })
  );
  return output;
}

function runPowerShellFontQuery(executablePath, timeoutMs = 20000) {
  const command = `
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName PresentationCore
$zhLangs = @("zh-cn", "zh-hans", "zh")
$enLangs = @("en-us", "en")
$fontList = @()
$families = [Windows.Media.Fonts]::SystemFontFamilies
foreach ($fontFamily in $families) {
  $displayName = ""
  foreach ($lang in $zhLangs) {
    if ($fontFamily.FamilyNames.TryGetValue([Windows.Markup.XmlLanguage]::GetLanguage($lang), [ref]$displayName) -and $displayName) {
      break
    }
  }
  if (-not $displayName) {
    $displayName = $fontFamily.Source
  }
  $familyName = ""
  foreach ($lang in $enLangs) {
    if ($fontFamily.FamilyNames.TryGetValue([Windows.Markup.XmlLanguage]::GetLanguage($lang), [ref]$familyName) -and $familyName) {
      break
    }
  }
  if (-not $familyName) {
    $familyName = $fontFamily.Source
  }
  $aliases = @()
  foreach ($entry in $fontFamily.FamilyNames.GetEnumerator()) {
    $alias = [string]$entry.Value
    if ($alias -and ($aliases -notcontains $alias)) {
      $aliases += $alias
    }
  }
  if ($familyName) {
    $fontList += [PSCustomObject]@{
      family = $familyName
      displayName = $displayName
      aliases = $aliases
    }
  }
}
$fontList | ConvertTo-Json -Compress -Depth 6
`.trim();

  return new Promise((resolve, reject) => {
    execFile(
      executablePath,
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        command
      ],
      {
        windowsHide: true,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024 * 30,
        encoding: "buffer"
      },
      (error, stdout, stderr) => {
        const stdoutText = Buffer.isBuffer(stdout) ? decodePowerShellBuffer(stdout) : String(stdout || "");
        const stderrText = Buffer.isBuffer(stderr) ? decodePowerShellBuffer(stderr) : String(stderr || "");

        if (error) {
          const wrapped = new Error(stderrText.trim() || stdoutText.trim() || error.message || "PowerShell 字体枚举失败");
          wrapped.code = error.code || "PS_FONT_ENUM_FAILED";
          wrapped.stdout = stdoutText;
          wrapped.stderr = stderrText;
          wrapped.executablePath = executablePath;
          reject(wrapped);
          return;
        }

        let parsed = null;
        try {
          parsed = parsePowerShellJsonOutput(stdoutText, "PowerShell 字体枚举输出为空");
        } catch (parseError) {
          parseError.stdout = stdoutText;
          parseError.stderr = stderrText;
          parseError.executablePath = executablePath;
          reject(parseError);
          return;
        }

        const records = Array.isArray(parsed) ? parsed : [parsed];
        resolve(records);
      }
    );
  });
}

async function enumerateFontsWithFontListDetailed() {
  const fontList = require("font-list");
  const detailed = await fontList.getFonts2({ disableQuoting: true });
  if (!Array.isArray(detailed)) return [];
  return detailed.map((item) => ({
    family: item?.familyName || item?.postScriptName || item?.name || "",
    displayName: item?.name || item?.familyName || item?.postScriptName || "",
    aliases: [item?.familyName, item?.name, item?.postScriptName]
  }));
}

async function enumerateFontsWithFontListBasic() {
  const fontList = require("font-list");
  const fonts = await fontList.getFonts({ disableQuoting: true });
  if (!Array.isArray(fonts)) return [];
  return fonts.map((name) => ({
    family: name,
    displayName: name,
    aliases: [name]
  }));
}

async function enumerateSystemFonts() {
  const attempts = [];
  const methodCandidates = [];

  if (process.platform === "win32") {
    const absolutePowerShell = resolveWindowsPowerShellAbsolutePath();
    if (absolutePowerShell) {
      methodCandidates.push({
        method: "powershell_absolute",
        run: () => runPowerShellFontQuery(absolutePowerShell)
      });
    }
    methodCandidates.push({
      method: "powershell_path",
      run: () => runPowerShellFontQuery("powershell.exe")
    });
  }

  methodCandidates.push({
    method: "fontlist_getFonts2",
    run: enumerateFontsWithFontListDetailed
  });
  methodCandidates.push({
    method: "fontlist_getFonts",
    run: enumerateFontsWithFontListBasic
  });

  for (const candidate of methodCandidates) {
    try {
      const rawRecords = await candidate.run();
      const deduped = mergeSystemFontRecords(rawRecords);
      const rawCount = Array.isArray(rawRecords) ? rawRecords.length : 0;
      attempts.push(`${candidate.method}:ok(${rawCount}->${deduped.length})`);
      if (deduped.length > 0) {
        return {
          method: candidate.method,
          fonts: deduped,
          stats: {
            rawCount,
            dedupCount: deduped.length,
            truncatedCount: 0,
            attemptedMethods: attempts
          }
        };
      }
    } catch (error) {
      const message = error?.message || "unknown";
      attempts.push(`${candidate.method}:fail(${message})`);
    }
  }

  throw new Error(`系统字体枚举失败: ${attempts.join(" | ")}`);
}

function addRegisteredFontFace({ family, weight, style, weightKey, fontPath }) {
  if (!family) return;
  const safeStyle = style || "normal";
  const numericWeight = Number(weight) || 400;
  let styleMap = registeredFontFaces.get(family);
  if (!styleMap) {
    styleMap = new Map();
    registeredFontFaces.set(family, styleMap);
  }
  let weightMap = styleMap.get(safeStyle);
  if (!weightMap) {
    weightMap = new Map();
    styleMap.set(safeStyle, weightMap);
  }
  if (!weightMap.has(numericWeight)) {
    weightMap.set(numericWeight, { weightKey, fontPath });
  }
}

function normalizeFontStyle(style) {
  return style === "italic" ? "italic" : "normal";
}

function createFontFaceKey(family, weight, style) {
  const safeFamily = String(family || "").trim();
  const numericWeight = Number(weight) || 400;
  const safeStyle = normalizeFontStyle(style);
  return `${safeFamily}|${numericWeight}|${safeStyle}`;
}

function normalizeProbeWidth(width) {
  return Math.round((Number(width) || 0) * 1000) / 1000;
}

function computeAlphaSignature(data) {
  if (!data || data.length === 0) return "0:0";
  let hash = 2166136261;
  let filled = 0;
  for (let i = 3; i < data.length; i += 4) {
    const alpha = data[i];
    if (alpha === 0) continue;
    filled += 1;
    hash ^= (alpha + (i & 255));
    hash = Math.imul(hash, 16777619);
  }
  return `${hash >>> 0}:${filled}`;
}

function isGenericFontFamily(family) {
  const safe = String(family || "").toLowerCase();
  return safe === "sans-serif" || safe === "serif" || safe === "monospace" || safe === "system-ui";
}

function collectConfiguredWeights(fontConfig) {
  const weightMap = new Map();
  const addWeight = (family, weight) => {
    const safeFamily = String(family || "").trim();
    const numericWeight = Number(weight) || 400;
    if (!safeFamily) return;
    if (!weightMap.has(safeFamily)) {
      weightMap.set(safeFamily, new Set());
    }
    weightMap.get(safeFamily).add(numericWeight);
  };

  (fontConfig || []).forEach((font) => {
    if (!font?.family) return;
    if (Array.isArray(font.platform) && font.platform.length > 0 && !font.platform.includes(process.platform)) {
      return;
    }
    addWeight(font.family, font.weight);
    if (font.displayName) {
      addWeight(font.displayName, font.weight);
    }
  });

  registeredFontFaces.forEach((styleMap, family) => {
    styleMap.forEach((weightMapByStyle) => {
      weightMapByStyle.forEach((meta, weight) => addWeight(family, weight));
    });
  });

  return weightMap;
}

function getWeightCandidates(weightMap, family, targetWeight) {
  const safeFamily = String(family || "").trim();
  const numericTarget = Number(targetWeight) || 400;
  const bucket = weightMap.get(safeFamily);
  if (!bucket || bucket.size === 0) {
    return [numericTarget];
  }
  const sorted = Array.from(bucket).sort((a, b) => {
    const diff = Math.abs(a - numericTarget) - Math.abs(b - numericTarget);
    if (diff !== 0) return diff;
    return b - a;
  });
  const result = [numericTarget];
  sorted.forEach((weight) => {
    if (!result.includes(weight)) {
      result.push(weight);
    }
  });
  return result;
}

function pushExportFontCandidate(list, seen, family, weight, style, reason) {
  const safeFamily = String(family || "").trim();
  if (!safeFamily) return;
  const numericWeight = Number(weight) || 400;
  const safeStyle = normalizeFontStyle(style);
  const key = createFontFaceKey(safeFamily, numericWeight, safeStyle);
  if (seen.has(key)) return;
  seen.add(key);
  list.push({
    family: safeFamily,
    weight: numericWeight,
    style: safeStyle,
    reason: String(reason || "fallback")
  });
}

async function probeExportFontCapability(family, weight = 400, style = "normal") {
  const safeFamily = String(family || "").trim();
  const safeWeight = Number(weight) || 400;
  const safeStyle = normalizeFontStyle(style);
  const cacheKey = createFontFaceKey(safeFamily, safeWeight, safeStyle);
  if (exportFontCapabilityMap.has(cacheKey)) {
    return exportFontCapabilityMap.get(cacheKey);
  }

  if (!safeFamily) {
    const emptyResult = {
      family: safeFamily,
      weight: safeWeight,
      style: safeStyle,
      capable: false,
      reason: "empty_family",
      samples: []
    };
    exportFontCapabilityMap.set(cacheKey, emptyResult);
    return emptyResult;
  }

  if (isGenericFontFamily(safeFamily)) {
    const genericResult = {
      family: safeFamily,
      weight: safeWeight,
      style: safeStyle,
      capable: true,
      reason: "generic_family",
      samples: []
    };
    exportFontCapabilityMap.set(cacheKey, genericResult);
    return genericResult;
  }

  const { createCanvas } = getCanvasLib();
  const { applyTextStyle, measureLineWidth } = await getTextLayoutModule();
  const probeCanvas = createCanvas(1200, 180);
  const probeCtx = probeCanvas.getContext("2d");
  const fallbackMissingFamily = "__scene_tool_missing_font__";
  const samples = [];
  let differsFromFallback = false;

  for (const text of EXPORT_FONT_PROBE_TEXTS) {
    probeCtx.clearRect(0, 0, probeCanvas.width, probeCanvas.height);
    applyTextStyle(probeCtx, {
      fontFamily: safeFamily,
      fontWeight: safeWeight,
      fontStyle: safeStyle,
      fontSize: EXPORT_FONT_PROBE_FONT_SIZE,
      letterSpacing: 0,
      lineHeight: 1.2,
      textAlign: "left",
      color: "#000000"
    });
    const targetWidth = normalizeProbeWidth(measureLineWidth(probeCtx, text, 0));
    probeCtx.fillText(text, 6, 6);
    const targetSignature = computeAlphaSignature(
      probeCtx.getImageData(0, 0, probeCanvas.width, probeCanvas.height).data
    );

    probeCtx.clearRect(0, 0, probeCanvas.width, probeCanvas.height);
    applyTextStyle(probeCtx, {
      fontFamily: fallbackMissingFamily,
      fontWeight: safeWeight,
      fontStyle: safeStyle,
      fontSize: EXPORT_FONT_PROBE_FONT_SIZE,
      letterSpacing: 0,
      lineHeight: 1.2,
      textAlign: "left",
      color: "#000000"
    });
    const fallbackWidth = normalizeProbeWidth(measureLineWidth(probeCtx, text, 0));
    probeCtx.fillText(text, 6, 6);
    const fallbackSignature = computeAlphaSignature(
      probeCtx.getImageData(0, 0, probeCanvas.width, probeCanvas.height).data
    );

    const widthDelta = Math.abs(targetWidth - fallbackWidth);
    const signatureChanged = targetSignature !== fallbackSignature;
    if (widthDelta > 0.01 || signatureChanged) {
      differsFromFallback = true;
    }
    samples.push({
      text,
      targetWidth,
      fallbackWidth,
      widthDelta: Number(widthDelta.toFixed(3)),
      targetSignature,
      fallbackSignature
    });
  }

  const result = {
    family: safeFamily,
    weight: safeWeight,
    style: safeStyle,
    capable: differsFromFallback,
    reason: differsFromFallback ? "probe_differs_from_missing_font" : "probe_matches_missing_font",
    samples
  };
  exportFontCapabilityMap.set(cacheKey, result);

  if (!exportFontProbeLogCache.has(cacheKey)) {
    exportFontProbeLogCache.add(cacheKey);
    const brief = samples
      .map((item) => `${item.targetWidth}/${item.fallbackWidth}/${item.targetSignature === item.fallbackSignature ? "same" : "diff"}`)
      .join(" | ");
    const level = result.capable ? 1 : 2;
    logToRenderer(
      level,
      `字体探针: ${safeFamily} weight=${safeWeight} style=${safeStyle} capable=${result.capable} detail=${brief}`
    );
  }

  return result;
}

async function registerTextFonts() {
  if (textFontsRegistered) return { attempted: 0, succeeded: 0 };
  const fontsDir = getFontsDir();
  const { FontLibrary } = getCanvasLib();
  const { FONT_CONFIG } = await getFontConfigModule();
  let attempted = 0;
  let succeeded = 0;

  if (!fontsDirLogged) {
    logToRenderer(1, `字体目录: ${fontsDir} (packaged=${app.isPackaged})`);
    fontsDirLogged = true;
  }

  const familyFileMap = new Map();
  (FONT_CONFIG || []).forEach((font) => {
    if (font.type !== "local" || !font.file) return;
    const fontPath = path.join(fontsDir, font.file);
    if (!fs.existsSync(fontPath)) {
      logToRenderer(3, `字体文件缺失: ${font.family} (${fontPath})`);
      return;
    }
    const aliases = new Set([font.family]);
    if (font.displayName && font.displayName !== font.family) {
      aliases.add(font.displayName);
    }
    const numericWeight = Number(font.weight) || 400;
    const style = normalizeFontStyle(font.style);
    aliases.forEach((alias) => {
      if (!familyFileMap.has(alias)) {
        familyFileMap.set(alias, new Map());
      }
      const fileMap = familyFileMap.get(alias);
      if (!fileMap.has(fontPath)) {
        fileMap.set(fontPath, {
          weight: numericWeight,
          style,
          fontPath
        });
      }
    });
  });

  for (const [family, fileMap] of familyFileMap) {
    attempted += 1;
    const paths = Array.from(fileMap.keys());
    try {
      const registered = FontLibrary.use(family, paths);
      let descriptors = [];
      if (Array.isArray(registered)) {
        descriptors = registered;
      } else if (registered && Array.isArray(registered.fonts)) {
        descriptors = registered.fonts;
      }
      if (descriptors.length === 0) {
        descriptors = Array.from(fileMap.values()).map((meta) => ({
          weight: meta.weight,
          style: meta.style,
          file: meta.fontPath
        }));
      }
      descriptors.forEach((item) => {
        const numericWeight = Number(item?.weight) || 400;
        const safeStyle = normalizeFontStyle(item?.style);
        const fontPath = item?.file || item?.path || item?.fontPath || "";
        const weightKey = String(numericWeight);
        addRegisteredFontFace({
          family,
          weight: numericWeight,
          style: safeStyle,
          weightKey,
          fontPath
        });
        const logKey = `${family}|${numericWeight}|${safeStyle}`;
        if (!fontRegistrationLogCache.has(logKey)) {
          fontRegistrationLogCache.add(logKey);
          logToRenderer(1, `字体注册成功: ${family} weight=${numericWeight} path=${fontPath || "-"}`);
        }
      });
      succeeded += 1;
    } catch (error) {
      logToRenderer(3, `字体注册失败: ${family} -> ${error.message || "unknown"}`);
    }
  }

  if (succeeded > 0) {
    textFontsRegistered = true;
    logToRenderer(1, `字体注册完成: ${succeeded}/${attempted}`);
  } else {
    textFontsRegistered = false;
    logToRenderer(3, `字体注册完成: 0/${attempted}，下次导出会重试注册`);
  }

  return { attempted, succeeded };
}

async function verifyFontsAvailable(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return { checked: 0, replaced: 0, fallbackToSans: 0 };
  }

  if (registeredFontFaces.size === 0) {
    logToRenderer(3, "未注册任何本地字体，导出可能回退到系统字体");
  }
  const {
    FONT_CONFIG,
    resolveFontFamilyName,
    resolveFontWeight,
    resolveExportFontFamily,
    getExportFallbackFamilies
  } = await getFontConfigModule();
  const configuredWeights = collectConfiguredWeights(FONT_CONFIG);

  let checked = 0;
  let replaced = 0;
  let fallbackToSans = 0;
  const warnings = [];

  const textStyleSummary = new Set();
  tasks.forEach((task) => {
    const texts = Array.isArray(task?.texts) ? task.texts : [];
    texts.forEach((text) => {
      if (!text || (text.type && text.type !== "text")) return;
      const style = text.style || {};
      const family = resolveFontFamilyName(style.fontFamily || DEFAULT_EXPORT_FONT_FAMILY) || DEFAULT_EXPORT_FONT_FAMILY;
      const weight = Number(style.fontWeight) || 400;
      const fontStyle = normalizeFontStyle(style.fontStyle);
      textStyleSummary.add(`${family}|${weight}|${fontStyle}`);
    });
  });
  if (textStyleSummary.size > 0) {
    logToRenderer(1, `导出字体检查: 样式组合 ${textStyleSummary.size}，探针缓存 ${exportFontCapabilityMap.size}`);
  }

  for (const task of tasks) {
    const texts = Array.isArray(task?.texts) ? task.texts : [];
    for (const text of texts) {
      if (!text || (text.type && text.type !== "text")) continue;
      const style = text.style || {};
      const rawFamily = style.fontFamily || DEFAULT_EXPORT_FONT_FAMILY;
      const requestedFamily = resolveFontFamilyName(rawFamily) || rawFamily || DEFAULT_EXPORT_FONT_FAMILY;
      const requestedStyle = normalizeFontStyle(style.fontStyle);
      const requestedWeight = resolveFontWeight(requestedFamily, style.fontWeight);
      const exportFamily = resolveExportFontFamily(requestedFamily) || requestedFamily;
      const exportWeight = resolveFontWeight(exportFamily, style.fontWeight);
      checked += 1;

      const candidateFamilies = getExportFallbackFamilies(exportFamily);
      if (!candidateFamilies.includes("sans-serif")) {
        candidateFamilies.push("sans-serif");
      }

      const candidates = [];
      const seenCandidates = new Set();
      const addFamilyCandidates = (family, reasonPrefix) => {
        const resolvedFamily = resolveExportFontFamily(resolveFontFamilyName(family) || family) || family;
        if (!resolvedFamily) return;
        const weights = getWeightCandidates(configuredWeights, resolvedFamily, exportWeight);
        weights.forEach((weightCandidate, weightIndex) => {
          const reason = weightIndex === 0 ? reasonPrefix : `${reasonPrefix}_weight`;
          pushExportFontCandidate(
            candidates,
            seenCandidates,
            resolvedFamily,
            weightCandidate,
            requestedStyle,
            reason
          );
          if (requestedStyle !== "normal") {
            pushExportFontCandidate(
              candidates,
              seenCandidates,
              resolvedFamily,
              weightCandidate,
              "normal",
              `${reason}_style`
            );
          }
        });
      };

      addFamilyCandidates(exportFamily, exportFamily === requestedFamily ? "requested" : "remap");
      candidateFamilies.forEach((family) => {
        if (family === exportFamily) return;
        addFamilyCandidates(family, "family_fallback");
      });
      pushExportFontCandidate(candidates, seenCandidates, "sans-serif", 400, "normal", "generic_fallback");

      let selected = null;
      for (const candidate of candidates) {
        const probeResult = await probeExportFontCapability(
          candidate.family,
          candidate.weight,
          candidate.style
        );
        if (!probeResult.capable && !isGenericFontFamily(candidate.family)) {
          continue;
        }
        selected = {
          family: candidate.family,
          weight: candidate.weight,
          style: candidate.style,
          reason: candidate.reason,
          probeReason: probeResult.reason
        };
        break;
      }

      if (!selected) {
        selected = {
          family: "sans-serif",
          weight: 400,
          style: "normal",
          reason: "forced_generic_fallback",
          probeReason: "all_candidates_failed"
        };
      }

      text.style = {
        ...style,
        fontFamily: selected.family,
        fontWeight: selected.weight,
        fontStyle: selected.style
      };

      if (selected.family === "sans-serif") {
        fallbackToSans += 1;
      }

      const changed =
        selected.family !== requestedFamily ||
        selected.weight !== requestedWeight ||
        selected.style !== requestedStyle;
      if (changed) {
        replaced += 1;
        warnings.push(
          `字体替换: from=${requestedFamily}/${requestedWeight}/${requestedStyle} ` +
          `to=${selected.family}/${selected.weight}/${selected.style} ` +
          `reason=${selected.reason}|${selected.probeReason}`
        );
      }
    }
  }

  logToRenderer(
    1,
    `导出字体检查完成: checked=${checked} replaced=${replaced} sansFallback=${fallbackToSans}`
  );
  if (warnings.length > 0) {
    logToRenderer(2, `导出字体替换: ${replaced}/${checked}`);
    warnings.slice(0, 20).forEach((item) => logToRenderer(2, item));
    if (warnings.length > 20) {
      logToRenderer(2, `... 其余 ${warnings.length - 20} 条省略`);
    }
  }

  return {
    checked,
    replaced,
    fallbackToSans,
    warningCount: warnings.length,
    replacementDetails: warnings.slice(0, 50)
  };
}

async function createTextLayerBuffer(task, scale = 1) {
  const texts = Array.isArray(task?.texts) ? task.texts : [];
  if (!texts.length) return null;
  const canvasSize = task?.canvasSize || { w: 1, h: 1 };
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const width = Math.max(1, Math.round(canvasSize.w * safeScale));
  const height = Math.max(1, Math.round(canvasSize.h * safeScale));
  const { createCanvas } = getCanvasLib();
  const { drawText } = await getTextLayoutModule();
  await registerTextFonts();
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.scale(safeScale, safeScale);
  const orderedTexts = [...texts].sort(compareElementsByLayerOrder);
  orderedTexts.forEach((textItem) => {
    if (textItem?.type && textItem.type !== "text") return;
    drawText(ctx, textItem, { shadowScale: safeScale });
  });
  return await canvas.toBuffer("png");
}

async function loadCanvasImageWithFallback(loadImage, imageBuffer, fileLabel = "") {
  let directImage = null;
  let directError = null;
  try {
    directImage = await loadImage(imageBuffer);
  } catch (error) {
    directError = error;
  }
  if (directImage) {
    return directImage;
  }

  let normalizedImage = null;
  let normalizedError = null;
  try {
    if (!sharp) {
      sharp = require("sharp");
    }
    const normalizedBuffer = await sharp(imageBuffer, { failOn: "none" })
      .rotate()
      .png({ compressionLevel: 6 })
      .toBuffer();
    normalizedImage = await loadImage(normalizedBuffer);
  } catch (error) {
    normalizedError = error;
  }
  if (normalizedImage) {
    return normalizedImage;
  }

  const reason =
    normalizedError?.message ||
    directError?.message ||
    "未知错误";
  const label = fileLabel ? `(${fileLabel})` : "";
  throw new Error(`图片元素解码失败${label}: ${reason}`);
}

function getLayerOrderValue(item) {
  const zOrder = Number(item?.zOrder);
  if (Number.isFinite(zOrder)) return zOrder;
  const createdAt = Number(item?.createdAt);
  return Number.isFinite(createdAt) ? createdAt : 0;
}

function compareElementsByLayerOrder(a, b) {
  const diff = getLayerOrderValue(a) - getLayerOrderValue(b);
  if (diff !== 0) return diff;
  return String(a?.id || "").localeCompare(String(b?.id || ""), "zh-CN");
}

function compareSlotsByZOrder(a, b) {
  const aOrder = Number(a?.zOrder);
  const bOrder = Number(b?.zOrder);
  const diff = (Number.isFinite(aOrder) ? aOrder : 0) - (Number.isFinite(bOrder) ? bOrder : 0);
  if (diff !== 0) return diff;
  return String(a?.id || "").localeCompare(String(b?.id || ""), "zh-CN");
}

const NATURAL_SORT_LOCALE = "zh-CN";
const NATURAL_SORT_OPTIONS = {
  numeric: true,
  sensitivity: "base"
};

function compareNaturalText(left, right) {
  return String(left || "").localeCompare(
    String(right || ""),
    NATURAL_SORT_LOCALE,
    NATURAL_SORT_OPTIONS
  );
}

function comparePuzzleImageEntryNatural(a, b) {
  const byName = compareNaturalText(a?.name, b?.name);
  if (byName !== 0) return byName;
  // Keep duplicate file names stable by falling back to full path.
  return compareNaturalText(a?.path, b?.path);
}

function compareImageFilePathNatural(a, b) {
  const byName = compareNaturalText(path.basename(a || ""), path.basename(b || ""));
  if (byName !== 0) return byName;
  return compareNaturalText(a, b);
}

async function createElementLayerBuffer(task, scale = 1) {
  const texts = Array.isArray(task?.texts) ? task.texts : [];
  const images = Array.isArray(task?.images) ? task.images : [];
  if (!texts.length && !images.length) return null;
  const canvasSize = task?.canvasSize || { w: 1, h: 1 };
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const width = Math.max(1, Math.round(canvasSize.w * safeScale));
  const height = Math.max(1, Math.round(canvasSize.h * safeScale));
  const { createCanvas, loadImage } = getCanvasLib();
  const { drawText } = await getTextLayoutModule();
  await registerTextFonts();
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.scale(safeScale, safeScale);
  const elements = [
    ...texts.map((item) => ({ ...item, _type: "text" })),
    ...images.map((item) => ({ ...item, _type: "image" }))
  ].sort(compareElementsByLayerOrder);
  for (const element of elements) {
    if (element._type === "text") {
      if (element?.type && element.type !== "text") continue;
      const style = element?.style || {};
      const debugKey = `export-font:${style.fontFamily}|${style.fontWeight}|${style.fontStyle}|${style.fontSize}|${style.lineHeight}|${style.letterSpacing}`;
      if (!fontDebugCache.has(debugKey)) {
        fontDebugCache.add(debugKey);
        logToRenderer(1, `导出文本样式: ${JSON.stringify(style)}`);
      }
      drawText(ctx, element, { shadowScale: safeScale });
      const fontKey = `${debugKey}:ctxfont`;
      if (!fontDebugCache.has(fontKey)) {
        fontDebugCache.add(fontKey);
        logToRenderer(1, `导出 ctx.font: ${ctx.font}`);
      }
      continue;
    }
    if (element._type !== "image") continue;
    const imagePath = element.imagePath;
    if (!imagePath) continue;
    const resolvedPath = path.isAbsolute(imagePath)
      ? imagePath
      : path.join(getPuzzleDataDir(), imagePath);
    const fileName = path.basename(resolvedPath);
    if (!fs.existsSync(resolvedPath)) {
      throw createPuzzleStageError(
        "element_decode",
        "图片元素文件不存在",
        { file: fileName, imagePath }
      );
    }
    let img = null;
    try {
      const imageBuffer = await fs.promises.readFile(resolvedPath);
      img = await loadCanvasImageWithFallback(loadImage, imageBuffer, fileName);
    } catch (error) {
      throw createPuzzleStageError(
        "element_decode",
        "图片元素解码失败",
        { file: fileName, imagePath },
        error
      );
    }
    if (!img) continue;
    const widthValue = Math.max(1, Number(element.width) || img.width || 1);
    const heightValue = Math.max(1, Number(element.height) || img.height || 1);
    const x = Number(element.x) || 0;
    const y = Number(element.y) || 0;
    const rotation = (Number(element.rotation) || 0) * Math.PI / 180;
    const centerX = x + widthValue / 2;
    const centerY = y + heightValue / 2;
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(rotation);
    ctx.drawImage(img, -widthValue / 2, -heightValue / 2, widthValue, heightValue);
    ctx.restore();
  }
  return await canvas.toBuffer("png");
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: "#f3f4f6",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
      webviewTag: true
    }
  });

  const rendererPath = path.join(__dirname, "renderer", "index.html");
  mainWindow.loadFile(rendererPath);

  mainWindow.webContents.on("console-message", (event, level, message, line, sourceId) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const text = String(message || "");
    const hasCjk = /[\u4e00-\u9fff]/.test(text);
    if (!hasCjk && level < 2) {
      return;
    }
    mainWindow.webContents.send("app-log", {
      level,
      message: text,
      line,
      sourceId,
      time: new Date().toISOString()
    });
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    const reason = details?.reason || "unknown";
    const exitCode = Number(details?.exitCode);
    const codeText = Number.isFinite(exitCode) ? exitCode : "n/a";
    console.error(`[renderer-process-gone] reason=${reason} exitCode=${codeText}`);
  });

  mainWindow.webContents.on("unresponsive", () => {
    console.error("[renderer-unresponsive] main window renderer became unresponsive");
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function logToRenderer(level, message) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("app-log", {
    level,
    message,
    time: new Date().toISOString()
  });
}

function sendProgress(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

function serializeError(error) {
  if (!error) {
    return { message: "未知错误" };
  }
  if (typeof error === "string") {
    return { message: error };
  }
  const message = error.message || String(error);
  const code = error.code || error.error_code || error.errno || error?.cause?.code;
  const status = error.status || error.statusCode || error?.cause?.status;
  return {
    message,
    code,
    status
  };
}

function translateSharpError(msg) {
  if (!msg) return "未知错误";
  if (msg.includes("Illegal byte sequence")) {
    return "图片解码失败（可能与文件名编码、图片损坏或格式兼容性有关），请替换该图片后重试";
  }
  if (msg.includes("composite") && msg.includes("dimensions")) {
    return "图层（阴影/边框）超出画布范围，请调整坑位位置或缩小阴影参数后重试";
  }
  if (msg.includes("extract_area")) {
    return "裁剪区域超出图片范围，请检查坑位设置";
  }
  if (msg.includes("Input image exceeds")) {
    return "输入图片尺寸过大，请使用较小的图片";
  }
  return msg;
}

const DEFAULT_OFFICE_TIMEOUT_MS = 180000;
const DEFAULT_PPT_RETRY_COUNT = 1;
const DEFAULT_PPT_PER_FILE_TIMEOUT_MS = 60000;
const DEFAULT_PPT_BATCH_TIMEOUT_CAP_MS = 8 * 60 * 1000;
const DEFAULT_PPT_OFFICE_CONCURRENCY = 2;
const DEFAULT_PPT_DEGRADED_CONCURRENCY = 1;
const DEFAULT_PPT_BATCH_COM_RESTART_SIZE = 5;
const DEFAULT_PPT_BATCH_COM_RESTART_SIZE_DEGRADED = 3;
const DEFAULT_PPT_DEGRADE_FAIL_STREAK = 2;
const DEFAULT_PPT_RECOVER_SUCCESS_WINDOW = 6;
const DEFAULT_PPT_ROLLOUT_PERCENT = 100;
const DEFAULT_LO_LARGE_FILE_THRESHOLD_MB = 100;
const DEFAULT_LO_LARGE_FILE_MAX_ATTEMPTS = 2;
const DEFAULT_LO_SMALL_QUEUE_CONCURRENCY = 2;
const DEFAULT_LO_PERF_TUNING_ENABLED = true;
const DEFAULT_LO_RUNTIME_MODE = "auto";
const DEFAULT_LO_RUNTIME_PROBE_TIMEOUT_MS = 10000;
const DEFAULT_LO_OUTPUT_WAIT_MS = 2500;
const DEFAULT_LO_OUTPUT_POLL_MS = 200;
const EXPORT_ENGINE_LIBREOFFICE = "libreoffice";
const EXPORT_ENGINE_OFFICE = "office";
const DEFAULT_PUZZLE_MAX_DIMENSION = 8192;
const DEFAULT_PUZZLE_MAX_PIXELS = 60 * 1000 * 1000;
const DEFAULT_PUZZLE_PREVIEW_MAX_PIXELS = 36 * 1000 * 1000;
function parseBooleanOption(value, fallback) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
    if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  }
  return fallback;
}
const PPT_ISOLATED_MODE = parseBooleanOption(process.env.SCENE_PPT_ISOLATED_MODE, true);
const PPT_PER_FILE_TIMEOUT_MS = parsePositiveInt(
  process.env.SCENE_PPT_PER_FILE_TIMEOUT_MS,
  DEFAULT_PPT_PER_FILE_TIMEOUT_MS
);
const PPT_BATCH_TIMEOUT_CAP_MS = parsePositiveInt(
  process.env.SCENE_PPT_BATCH_TIMEOUT_CAP_MS,
  DEFAULT_PPT_BATCH_TIMEOUT_CAP_MS
);
const PPT_BATCH_COM_RESTART_SIZE = parsePositiveInt(
  process.env.SCENE_PPT_BATCH_COM_RESTART_SIZE,
  DEFAULT_PPT_BATCH_COM_RESTART_SIZE
);
const PPT_BATCH_COM_RESTART_SIZE_DEGRADED = parsePositiveInt(
  process.env.SCENE_PPT_BATCH_COM_RESTART_SIZE_DEGRADED,
  DEFAULT_PPT_BATCH_COM_RESTART_SIZE_DEGRADED
);
const PPT_ADAPTIVE_MODE = parseBooleanOption(
  process.env.SCENE_PPT_ADAPTIVE_ENABLE,
  parseBooleanOption(process.env.SCENE_PPT_ADAPTIVE_MODE, true)
);
const PPT_FORCE_MODE = normalizePptMode(process.env.SCENE_PPT_FORCE_MODE, "auto");
const PPT_ROLLOUT_PERCENT = clampPercent(
  parsePositiveInt(process.env.SCENE_PPT_ROLLOUT_PERCENT, DEFAULT_PPT_ROLLOUT_PERCENT),
  DEFAULT_PPT_ROLLOUT_PERCENT
);
const PPT_PRECHECK_MODE = normalizePrecheckMode(
  process.env.SCENE_OFFICE_PREFLIGHT_MODE,
  normalizePrecheckMode(process.env.SCENE_PPT_PRECHECK_MODE, "warn")
);
const LO_PERF_TUNING_ENABLED = parseBooleanOption(
  process.env.SCENE_LO_PERF_TUNING,
  DEFAULT_LO_PERF_TUNING_ENABLED
);
const PUZZLE_MAX_DIMENSION = parsePositiveInt(
  process.env.SCENE_PUZZLE_MAX_DIMENSION,
  DEFAULT_PUZZLE_MAX_DIMENSION
);
const PUZZLE_MAX_PIXELS = parsePositiveInt(
  process.env.SCENE_PUZZLE_MAX_PIXELS,
  DEFAULT_PUZZLE_MAX_PIXELS
);
const PUZZLE_PREVIEW_MAX_PIXELS = parsePositiveInt(
  process.env.SCENE_PUZZLE_PREVIEW_MAX_PIXELS,
  DEFAULT_PUZZLE_PREVIEW_MAX_PIXELS
);
const RETRYABLE_OFFICE_ERROR_CODES = new Set([
  "0x80004005",
  "0x80010001",
  "0x80010105",
  "0x8001010a",
  "0x800ac472",
  "0x800706ba",
  "LO_TIMEOUT",
  "LO_NON_ZERO_EXIT",
  "LO_PROFILE_LOCK",
  "LO_OUTPUT_MISSING"
]);
const OFFICE_ERROR_HINTS = new Map([
  ["0x80070570", "文件或目录损坏且无法读取，请先在 PowerPoint 中手动另存为后再重试"],
  ["0x80070020", "文件被其他程序占用，请关闭正在打开该文件的 PowerPoint/WPS 后重试"],
  ["0x80004005", "PowerPoint 返回未指定错误，常见于修复/安全弹窗阻塞"],
  ["0x80010001", "PowerPoint COM 调用被拒绝，请重试"],
  ["0x80010105", "PowerPoint 进程繁忙或未响应，请重试"],
  ["0x8001010a", "PowerPoint 正忙，请稍后重试"],
  ["0x800ac472", "PowerPoint 正在处理其它操作，请稍后重试"],
  ["0x800706ba", "无法连接 PowerPoint COM 服务，请确认 Office 正常安装并重试"],
  ["PS_TIMEOUT", "PowerShell 执行超时，请检查系统环境后重试"],
  ["PS_NON_ZERO_EXIT", "Office 转 PDF 脚本执行失败，请查看原始错误并确认文件可在 Office 中打开"],
  ["LO_MISSING_BINARY", "未检测到可用 LibreOffice 运行时，请重装 Full 安装包或改用系统 LibreOffice"],
  ["LO_BINARY_UNEXECUTABLE", "LibreOffice 可执行文件不可用，请重装 Full 安装包后重试"],
  ["LO_TIMEOUT", "LibreOffice 转换超时，建议降低并发或重试"],
  ["LO_NON_ZERO_EXIT", "文件疑似损坏，请先用 PowerPoint/WPS 打开并修复，再另存为新的 PPT/PPTX 后重试导出"],
  ["LO_PROFILE_LOCK", "LibreOffice 配置目录被锁定，请稍后重试"],
  ["LO_OUTPUT_MISSING", "LibreOffice 未生成 PDF 输出，请重试"],
  ["OFFICE_OUTPUT_MISSING", "Microsoft Office 未生成 PDF 输出，请先手动打开文件确认可另存为 PDF"]
]);

function parsePositiveInt(value, fallback) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  const integerValue = Math.floor(numberValue);
  return integerValue > 0 ? integerValue : fallback;
}

function clampPercent(value, fallback = 100) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(0, Math.min(100, Math.floor(raw)));
}

function normalizePptMode(value, fallback = "auto") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "isolated" || normalized === "batch" || normalized === "auto") {
    return normalized;
  }
  return fallback;
}

function normalizePrecheckMode(value, fallback = "warn") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "off" || normalized === "warn" || normalized === "fix") {
    return normalized;
  }
  return fallback;
}

function normalizeExportEngine(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === EXPORT_ENGINE_OFFICE) return EXPORT_ENGINE_OFFICE;
  return EXPORT_ENGINE_LIBREOFFICE;
}

function mergeSpawnEnv(overrides) {
  const merged = { ...process.env };
  if (!overrides || typeof overrides !== "object") {
    return merged;
  }
  Object.entries(overrides).forEach(([key, value]) => {
    if (!key) return;
    if (value === undefined || value === null) return;
    merged[key] = String(value);
  });
  return merged;
}

function resolvePathEnvKey(env) {
  if (!env || typeof env !== "object") return "PATH";
  const key = Object.keys(env).find((item) => String(item).toLowerCase() === "path");
  return key || "PATH";
}

function prependEnvPath(env, entries = []) {
  if (!env || typeof env !== "object") return env;
  const pathEntries = (entries || []).map((item) => String(item || "").trim()).filter(Boolean);
  if (!pathEntries.length) return env;
  const pathKey = resolvePathEnvKey(env);
  const currentPath = String(env[pathKey] || "");
  const combined = [...pathEntries, ...currentPath.split(path.delimiter)];
  const seen = new Set();
  const merged = [];
  combined.forEach((item) => {
    const text = String(item || "").trim();
    if (!text) return;
    const key = process.platform === "win32" ? text.toLowerCase() : text;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(text);
  });
  env[pathKey] = merged.join(path.delimiter);
  return env;
}

function createLibreOfficeSpawnEnv(sofficePath, overrides) {
  const env = mergeSpawnEnv(overrides);
  const normalizedSofficePath = normalizeSofficeCandidatePath(sofficePath);
  if (!normalizedSofficePath) return env;
  const loRootDir = path.dirname(path.dirname(normalizedSofficePath));
  const system64Dir = path.join(loRootDir, "System64");
  let hasSystem64 = false;
  try {
    hasSystem64 = fs.existsSync(system64Dir) && fs.statSync(system64Dir).isDirectory();
  } catch (error) {
    hasSystem64 = false;
  }
  if (!hasSystem64) {
    return env;
  }
  return prependEnvPath(env, [system64Dir]);
}

function computeRolloutBucket(seed) {
  const source = String(seed || "scene-ppt-default-seed");
  const hex = crypto.createHash("md5").update(source).digest("hex");
  const bucket = Number.parseInt(hex.slice(0, 8), 16);
  if (!Number.isFinite(bucket)) return 0;
  return bucket % 100;
}

function normalizeOfficeErrorCode(code) {
  if (!code) return "";
  const upperCode = String(code).toUpperCase();
  if (upperCode === "PS_TIMEOUT") return "PS_TIMEOUT";
  if (upperCode === "PS_NON_ZERO_EXIT") return "PS_NON_ZERO_EXIT";
  if (upperCode.startsWith("LO_")) return upperCode;
  if (upperCode.startsWith("OFFICE_")) return upperCode;
  const match = String(code).match(/0x[0-9a-fA-F]{8}/);
  if (!match) return "";
  return match[0].toLowerCase();
}

function extractOfficeErrorCode(message) {
  if (!message) return "";
  const match = String(message).match(/0x[0-9a-fA-F]{8}/);
  return match ? match[0].toLowerCase() : "";
}

function isRetryableOfficeError(errorCode, rawMessage = "") {
  const normalizedCode = normalizeOfficeErrorCode(errorCode);
  const retryLookupCode = normalizedCode.startsWith("LO_")
    ? normalizedCode.toUpperCase()
    : normalizedCode;
  if (retryLookupCode && RETRYABLE_OFFICE_ERROR_CODES.has(retryLookupCode)) {
    return true;
  }
  const msg = String(rawMessage || "").toLowerCase();
  if (!msg) return false;
  if (msg.includes("rpc_e_servercall_retrylater")) return true;
  if (msg.includes("call was rejected by callee")) return true;
  if (msg.includes("服务器忙")) return true;
  if (msg.includes("正在使用中")) return true;
  return false;
}

function formatOfficeErrorMessage(rawMessage, errorCode, fallback = "文档转换失败") {
  const message = String(rawMessage || "").trim();
  if (errorCode === "PS_TIMEOUT") {
    return `${OFFICE_ERROR_HINTS.get("PS_TIMEOUT")} (PS_TIMEOUT)`;
  }
  const hint = OFFICE_ERROR_HINTS.get(errorCode || "");
  if (hint && errorCode) {
    return `${hint} (${errorCode})`;
  }
  if (message && errorCode) {
    return `${message} (${errorCode})`;
  }
  if (message) {
    return message;
  }
  if (errorCode) {
    return `${fallback} (${errorCode})`;
  }
  return fallback;
}

function buildOfficeFailure(error, context = {}) {
  const serialized = serializeError(error);
  const timeout = Boolean(
    context.timeout
    || error?.code === "PS_TIMEOUT"
    || error?.code === "LO_TIMEOUT"
    || normalizeOfficeErrorCode(context.errorCode) === "LO_TIMEOUT"
  );
  const rawMessage = String(
    context.rawMessage
    || serialized.message
    || error?.stderr
    || error?.stdout
    || "文档转换失败"
  ).trim();
  let errorCode = normalizeOfficeErrorCode(
    context.errorCode
    || error?.errorCode
    || serialized.code
    || extractOfficeErrorCode(rawMessage)
  );
  if (!errorCode && timeout) {
    const timeoutSourceCode = normalizeOfficeErrorCode(
      context.errorCode
      || error?.code
      || error?.errorCode
      || serialized.code
    );
    errorCode = timeoutSourceCode.startsWith("LO_") ? "LO_TIMEOUT" : "PS_TIMEOUT";
  }
  const retryable = timeout || Boolean(context.retryable) || isRetryableOfficeError(errorCode, rawMessage);
  return {
    rawMessage,
    errorCode,
    retryable,
    message: formatOfficeErrorMessage(rawMessage, errorCode, context.fallbackMessage)
  };
}

function createPptConversionError(failure, context = {}, cause = null) {
  const error = new Error(failure.message || "PPT 转 PDF 失败");
  error.stage = "ppt_to_pdf";
  error.errorCode = failure.errorCode || "";
  error.rawMessage = failure.rawMessage || failure.message || "";
  error.retryable = Boolean(failure.retryable);
  error.attempts = Number(context.attempts) || 1;
  error.retries = Number(context.retries) || 0;
  error.timeoutMs = Number(context.timeoutMs) || 0;
  error.durationMs = Number(context.durationMs) || 0;
  error.openMode = context.openMode || "";
  error.repaired = Boolean(context.repaired);
  error.fallbackReason = context.fallbackReason || "";
  error.envWarning = context.envWarning || "";
  error.engineRequested = context.engineRequested || "";
  error.engineUsed = context.engineUsed || "";
  if (cause) {
    error.cause = cause;
  }
  return error;
}

function createDocumentConversionError(stage, failure, context = {}, cause = null) {
  const fallbackMessage = stage === "word_to_pdf" ? "Word 转 PDF 失败" : "文档转 PDF 失败";
  const error = new Error(failure.message || fallbackMessage);
  error.stage = stage || "";
  error.errorCode = failure.errorCode || "";
  error.rawMessage = failure.rawMessage || failure.message || "";
  error.retryable = Boolean(failure.retryable);
  error.attempts = Number(context.attempts) || 1;
  error.retries = Number(context.retries) || 0;
  error.timeoutMs = Number(context.timeoutMs) || 0;
  error.durationMs = Number(context.durationMs) || 0;
  error.openMode = context.openMode || "";
  error.repaired = Boolean(context.repaired);
  error.fallbackReason = context.fallbackReason || "";
  error.envWarning = context.envWarning || "";
  error.engineRequested = context.engineRequested || "";
  error.engineUsed = context.engineUsed || "";
  if (cause) {
    error.cause = cause;
  }
  return error;
}

function getPuzzleStageLabel(stage) {
  const mapping = {
    background_decode: "背景解码",
    slot_decode: "坑位图片处理",
    element_decode: "图片元素处理",
    canvas_limit: "画布尺寸检查",
    composite: "图层合成",
    output_write: "文件写入",
    generate: "导出流程"
  };
  return mapping[stage] || "导出流程";
}

function createPuzzleStageError(stage, message, context = {}, cause = null) {
  const finalMessage = cause?.message ? `${message}: ${cause.message}` : message;
  const error = new Error(finalMessage);
  error.stage = stage || cause?.stage || "generate";
  error.file = context.file || cause?.file || "";
  error.imagePath = context.imagePath || cause?.imagePath || "";
  error.puzzleName = context.puzzleName || cause?.puzzleName || "";
  if (Number.isInteger(context.taskIndex)) {
    error.taskIndex = context.taskIndex;
  } else if (Number.isInteger(cause?.taskIndex)) {
    error.taskIndex = cause.taskIndex;
  }
  if (cause?.code) {
    error.code = cause.code;
  }
  if (cause?.status) {
    error.status = cause.status;
  }
  if (cause) {
    error.cause = cause;
  }
  return error;
}

function formatPuzzleExportError(error, fallbackStage = "generate", context = {}) {
  const serialized = serializeError(error);
  const rawMessage = serialized.message || "未知错误";
  const stage = context.stage || error?.stage || fallbackStage;
  const file = context.file || error?.file || "";
  const imagePath = context.imagePath || error?.imagePath || "";
  const puzzleName = context.puzzleName || error?.puzzleName || "";
  const taskIndex = Number.isInteger(context.taskIndex)
    ? context.taskIndex
    : (Number.isInteger(error?.taskIndex) ? error.taskIndex : null);
  const stageLabel = getPuzzleStageLabel(stage);
  const translated = translateSharpError(rawMessage);
  const detailParts = [];
  if (puzzleName) detailParts.push(`拼图: ${puzzleName}`);
  if (Number.isInteger(taskIndex)) detailParts.push(`任务: ${taskIndex + 1}`);
  if (file) detailParts.push(`文件: ${file}`);
  const detailSuffix = detailParts.length ? `（${detailParts.join("，")}）` : "";
  return {
    stage,
    file,
    imagePath,
    puzzleName,
    taskIndex,
    rawMessage,
    message: `${stageLabel}失败${detailSuffix}: ${translated}`,
    code: serialized.code,
    status: serialized.status
  };
}

function getAppSettingsPath() {
  return path.join(app.getPath("userData"), APP_SETTINGS_FILE_NAME);
}

function sanitizeAppSettings(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const next = {};
  Object.entries(input).forEach(([key, value]) => {
    const safeKey = String(key || "").trim();
    if (!safeKey) return;
    if (value === undefined || value === null) return;
    next[safeKey] = String(value);
  });
  return next;
}

function readAppSettings() {
  const filePath = getAppSettingsPath();
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return sanitizeAppSettings(parsed);
  } catch (error) {
    return {};
  }
}

function writeAppSettings(settings) {
  const filePath = getAppSettingsPath();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const payload = JSON.stringify(sanitizeAppSettings(settings), null, 2);
    fs.writeFileSync(filePath, payload, "utf8");
    return true;
  } catch (error) {
    return false;
  }
}

function setAppSetting(key, value) {
  const safeKey = String(key || "").trim();
  if (!safeKey) {
    return { ok: false, error: "配置键不能为空" };
  }

  const next = readAppSettings();
  const hasValue = value !== undefined && value !== null && String(value).length > 0;
  if (hasValue) {
    next[safeKey] = String(value);
  } else {
    delete next[safeKey];
  }

  if (!writeAppSettings(next)) {
    return { ok: false, error: "配置保存失败" };
  }

  return { ok: true, value: hasValue ? next[safeKey] : null };
}

const LICENSE_VERIFY_INTERVAL = 7 * 24 * 60 * 60 * 1000;
const LICENSE_FREE_LIMIT = 5;
const LICENSE_APP_ID = "biji_tool";
const WECHAT_LOGIN_API_BASE = "https://key.liuliangfeng.com";
const WECHAT_LOGIN_ENDPOINT = "/api/wechat/login";
const APP_EDITION_TRIAL = "trial";

function getLicenseConfigPath() {
  return path.join(app.getPath("userData"), "license-config.json");
}

function buildDefaultFreeUsage() {
  return {
    export: LICENSE_FREE_LIMIT,
    compose: LICENSE_FREE_LIMIT,
    puzzle: LICENSE_FREE_LIMIT,
    upload: LICENSE_FREE_LIMIT,
    xhs: LICENSE_FREE_LIMIT
  };
}

function readLicenseConfig() {
  const filePath = getLicenseConfigPath();
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    return {};
  }
}

function writeLicenseConfig(config) {
  const filePath = getLicenseConfigPath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf8");
    return true;
  } catch (error) {
    return false;
  }
}

function ensureLicenseDefaults(config) {
  if (!config || typeof config !== "object") {
    config = {};
  }
  if (!config.freeUsage || typeof config.freeUsage !== "object") {
    config.freeUsage = buildDefaultFreeUsage();
  } else {
    config.freeUsage = { ...buildDefaultFreeUsage(), ...config.freeUsage };
  }
  if (!config.update || typeof config.update !== "object") {
    config.update = { skippedVersion: null, lastCheckTime: null };
  }
  if (!config.license || typeof config.license !== "object") {
    config.license = {};
  }
  return config;
}

function readAppPackageJson() {
  try {
    const pkgPath = path.join(app.getAppPath(), "package.json");
    const raw = fs.readFileSync(pkgPath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function resolveAppEdition() {
  const envEdition = process.env.APP_EDITION;
  if (envEdition) return String(envEdition).toLowerCase();
  const pkg = readAppPackageJson();
  if (pkg && typeof pkg.appEdition === "string") {
    return pkg.appEdition.toLowerCase();
  }
  const appName = app.getName();
  if (appName && appName.includes("体验版")) {
    return APP_EDITION_TRIAL;
  }
  return "standard";
}

function getAppMeta() {
  const edition = resolveAppEdition();
  const displayName =
    edition === APP_EDITION_TRIAL ? "流量蜂虚拟笔记工具体验版" : "流量蜂虚拟笔记工具";
  return {
    name: app.getName(),
    version: app.getVersion(),
    edition,
    isTrial: edition === APP_EDITION_TRIAL,
    displayName
  };
}

function generateDeviceId() {
  const networkInterfaces = os.networkInterfaces();
  const hostname = os.hostname();
  const platform = os.platform();
  let mac = "";

  for (const name of Object.keys(networkInterfaces)) {
    for (const net of networkInterfaces[name]) {
      if (!net.internal && net.mac !== "00:00:00:00:00:00") {
        mac = net.mac;
        break;
      }
    }
    if (mac) break;
  }

  const uniqueString = `${mac}-${hostname}-${platform}`;
  return crypto.createHash("md5").update(uniqueString).digest("hex");
}

async function verifyLicenseRemote(key, deviceId, appVersion) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch("https://key.liuliangfeng.com/api/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        key,
        device_id: deviceId,
        app_id: LICENSE_APP_ID,
        app_version: appVersion
      }),
      signal: controller.signal
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (error) {
      throw new Error("响应解析失败");
    }
    return json;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getWechatLoginState() {
  const config = ensureLicenseDefaults(readLicenseConfig());
  let dirty = false;
  const currentDeviceId = config.deviceId || generateDeviceId();
  const currentAppVersion = app.getVersion();
  if (!config.deviceId) {
    config.deviceId = currentDeviceId;
    dirty = true;
  }

  const state =
    config.wechatLogin && typeof config.wechatLogin === "object"
      ? config.wechatLogin
      : {};
  let verified = !!state.verified;
  const stateDeviceId =
    typeof state.deviceId === "string" && state.deviceId ? state.deviceId : null;
  const stateVerifiedVersion =
    typeof state.verifiedVersion === "string" && state.verifiedVersion
      ? state.verifiedVersion
      : null;
  let reason = "not_verified";

  if (verified && stateDeviceId && stateDeviceId !== currentDeviceId) {
    verified = false;
    reason = "device_mismatch";
  } else if (verified && stateVerifiedVersion !== currentAppVersion) {
    verified = false;
    reason = "version_changed";
  } else if (verified) {
    reason = "verified";
    if (!stateDeviceId) {
      config.wechatLogin = {
        ...state,
        deviceId: currentDeviceId
      };
      dirty = true;
    }
  }

  if (dirty) {
    writeLicenseConfig(config);
  }

  return {
    required: true,
    verified,
    verifiedAt: state.verifiedAt || null,
    reason
  };
}

function markWechatLoginVerified(user) {
  const config = ensureLicenseDefaults(readLicenseConfig());
  const currentDeviceId = config.deviceId || generateDeviceId();
  const currentAppVersion = app.getVersion();
  if (!config.deviceId) {
    config.deviceId = currentDeviceId;
  }
  const nextState = {
    verified: true,
    verifiedAt: new Date().toISOString(),
    deviceId: currentDeviceId,
    verifiedVersion: currentAppVersion
  };
  if (user && typeof user === "object") {
    nextState.user = {
      id: user.id ?? null,
      openid: user.openid ?? null,
      nickname: user.nickname ?? null
    };
  }
  config.wechatLogin = nextState;
  writeLicenseConfig(config);
  return nextState;
}

async function loginWithWechatCode(code) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const deviceId = generateDeviceId();
    const response = await fetch(`${WECHAT_LOGIN_API_BASE}${WECHAT_LOGIN_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        code,
        with_version_check: false,
        device_id: deviceId
      }),
      signal: controller.signal
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (error) {
      json = null;
    }
    if (!response.ok) {
      const detail = json?.detail || json?.message || text || `HTTP ${response.status}`;
      return { ok: false, message: detail };
    }
    return { ok: true, data: json };
  } catch (error) {
    if (error?.name === "AbortError") {
      return { ok: false, message: "请求超时，请重试" };
    }
    return { ok: false, message: `网络错误: ${error.message}` };
  } finally {
    clearTimeout(timeoutId);
  }
}

function createMenu() {
  Menu.setApplicationMenu(null);
}

ipcMain.handle("license:getDeviceId", async () => {
  const config = ensureLicenseDefaults(readLicenseConfig());
  if (!config.deviceId) {
    config.deviceId = generateDeviceId();
    writeLicenseConfig(config);
  }
  return config.deviceId;
});

ipcMain.handle("license:getConfig", async () => {
  const config = ensureLicenseDefaults(readLicenseConfig());
  if (!config.deviceId) {
    config.deviceId = generateDeviceId();
  }
  writeLicenseConfig(config);
  return config;
});

ipcMain.handle("license:saveConfig", async (_event, payload) => {
  if (!payload || typeof payload !== "object") return false;
  const current = ensureLicenseDefaults(readLicenseConfig());
  const hasLicense = Object.prototype.hasOwnProperty.call(payload, "license");
  const hasUpdate = Object.prototype.hasOwnProperty.call(payload, "update");
  const hasFreeUsage = Object.prototype.hasOwnProperty.call(payload, "freeUsage");
  let nextLicense = current.license;
  if (hasLicense) {
    if (payload.license && typeof payload.license === "object") {
      nextLicense = { ...current.license, ...payload.license };
    } else {
      nextLicense = {};
    }
  }
  const next = {
    ...current,
    ...payload,
    freeUsage: hasFreeUsage
      ? {
          ...current.freeUsage,
          ...(payload.freeUsage || {})
        }
      : current.freeUsage,
    license: nextLicense,
    update: hasUpdate
      ? {
          ...current.update,
          ...(payload.update || {})
        }
      : current.update
  };
  if (!next.deviceId) {
    next.deviceId = generateDeviceId();
  }
  return writeLicenseConfig(next);
});

ipcMain.handle("license:verify", async (_event, payload) => {
  const key = payload?.key?.trim();
  if (!key) {
    return { success: false, message: "缺少密钥", update: null };
  }
  const config = ensureLicenseDefaults(readLicenseConfig());
  const deviceId = config.deviceId || generateDeviceId();
  const appVersion = app.getVersion();
  try {
    const result = await verifyLicenseRemote(key, deviceId, appVersion);
    config.deviceId = deviceId;
    config.license = {
      key,
      lastVerifyTime: new Date().toISOString(),
      expireAt: result.expire_at,
      verifyResult: {
        success: !!result.success,
        message: result.message || ""
      }
    };
    config.update = {
      ...config.update,
      lastCheckTime: new Date().toISOString()
    };
    writeLicenseConfig(config);
    return result;
  } catch (error) {
    return { success: false, message: `网络错误: ${error.message}`, update: null };
  }
});

ipcMain.handle("license:checkUpdate", async () => {
  const config = ensureLicenseDefaults(readLicenseConfig());
  const key = config.license?.key;
  if (!key) {
    return { ok: false, message: "未设置密钥", update: null };
  }
  const deviceId = config.deviceId || generateDeviceId();
  const appVersion = app.getVersion();
  try {
    const result = await verifyLicenseRemote(key, deviceId, appVersion);
    config.deviceId = deviceId;
    config.license = {
      key,
      lastVerifyTime: new Date().toISOString(),
      expireAt: result.expire_at,
      verifyResult: {
        success: !!result.success,
        message: result.message || ""
      }
    };
    config.update = {
      ...config.update,
      lastCheckTime: new Date().toISOString()
    };
    writeLicenseConfig(config);
    if (!result.success) {
      return { ok: false, message: result.message || "验证失败", update: result.update || null };
    }
    return { ok: true, update: result.update || { has_update: false } };
  } catch (error) {
    return { ok: false, message: `网络错误: ${error.message}`, update: null };
  }
});

ipcMain.handle("shell:openExternal", async (_event, payload) => {
  const url = typeof payload === "string" ? payload : payload?.url;
  if (!url) return { ok: false, error: "缺少链接" };
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("app:getVersion", async () => {
  return app.getVersion();
});

ipcMain.handle("app:getMeta", async () => {
  return getAppMeta();
});

ipcMain.handle("settings:getAll", async () => {
  return {
    ok: true,
    settings: readAppSettings()
  };
});

ipcMain.handle("settings:set", async (_event, payload) => {
  const key = payload?.key;
  const value = payload?.value;
  return setAppSetting(key, value);
});

ipcMain.handle("wechat:getStatus", async () => {
  return getWechatLoginState();
});

ipcMain.handle("wechat:login", async (_event, payload) => {
  const code = String(payload?.code || "").trim();
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, message: "请输入6位数字验证码" };
  }
  const result = await loginWithWechatCode(code);
  if (!result.ok) {
    return result;
  }
  markWechatLoginVerified(result.data?.user);
  return { ok: true };
});

ipcMain.handle("dialog:open", async (event, options) => {
  if (!mainWindow) return null;
  return dialog.showOpenDialog(mainWindow, options);
});

ipcMain.handle("dialog:openFiles", async () => {
  if (!mainWindow) return null;
  return dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Documents", extensions: ["doc", "docx", "ppt", "pptx", "pdf"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });
});

ipcMain.handle("dialog:openFilesOrFolders", async () => {
  if (!mainWindow) return null;
  const choice = await dialog.showMessageBox(mainWindow, {
    type: "question",
    message: "请选择要扫描的内容",
    detail: "可选择多个文件或文件夹。",
    buttons: ["选择文件", "选择文件夹", "取消"],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  });

  if (choice.response === 2) {
    return { canceled: true, files: [], folders: [] };
  }

  if (choice.response === 1) {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "multiSelections"]
    });
    if (result.canceled) {
      return { canceled: true, files: [], folders: [] };
    }
    return { canceled: false, files: [], folders: result.filePaths || [] };
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Documents", extensions: ["doc", "docx", "ppt", "pptx", "pdf"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });
  if (result.canceled) {
    return { canceled: true, files: [], folders: [] };
  }
  return { canceled: false, files: result.filePaths || [], folders: [] };
});

ipcMain.handle("dialog:openFolder", async () => {
  if (!mainWindow) return null;
  return dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "multiSelections"]
  });
});

ipcMain.handle("dialog:openOutputFolder", async () => {
  if (!mainWindow) return null;
  return dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"]
  });
});

ipcMain.handle("file:save", async (event, payload) => {
  if (!mainWindow) return { ok: false, error: "No window" };
  const defaultPath = payload?.defaultPath || "log.txt";
  const content = payload?.content || "";
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath,
    filters: [
      { name: "Text", extensions: ["txt"] },
      { name: "JSON", extensions: ["json"] }
    ]
  });
  if (result.canceled || !result.filePath) {
    return { ok: false, cancelled: true };
  }
  await fs.promises.writeFile(result.filePath, content, "utf8");
  return { ok: true, filePath: result.filePath };
});

ipcMain.handle("dialog:openImageFolder", async () => {
  if (!mainWindow) return null;
  return dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"]
  });
});

ipcMain.handle("dialog:openImageFolders", async () => {
  if (!mainWindow) return null;
  return dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "multiSelections"]
  });
});

ipcMain.handle("dialog:openImageFile", async () => {
  if (!mainWindow) return null;
  return dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "bmp", "gif", "tif", "tiff"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });
});

ipcMain.handle("dialog:openImageFiles", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "bmp", "gif", "tif", "tiff"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });
  if (result.canceled) {
    return { canceled: true, files: [] };
  }
  return { canceled: false, files: result.filePaths || [] };
});

ipcMain.handle("dialog:openImageFilesOrFolder", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "选择图片或文件夹",
    properties: ["openFile", "openDirectory", "multiSelections"]
  });
  if (result.canceled) {
    return { canceled: true, files: [], folders: [] };
  }
  const paths = result.filePaths || [];
  const files = [];
  const folders = [];
  paths.forEach((itemPath) => {
    try {
      const stat = fs.statSync(itemPath);
      if (stat.isDirectory()) {
        folders.push(itemPath);
      } else {
        files.push(itemPath);
      }
    } catch (error) {
      files.push(itemPath);
    }
  });
  return { canceled: false, files, folders };
});

ipcMain.handle("dialog:selectSaveDirectory", async () => {
  if (!mainWindow) return null;
  return dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"],
    title: "选择保存目录"
  });
});

ipcMain.handle("shell:openPath", async (_event, targetPath) => {
  if (!targetPath) {
    return { ok: false, error: "缺少路径" };
  }
  try {
    const result = await shell.openPath(targetPath);
    if (result) {
      return { ok: false, error: result };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("puzzle:openTemplateLibrary", async () => {
  try {
    await ensurePuzzleDirs();
    const templateLibraryPath = getPuzzleDataDir();
    await fs.promises.mkdir(templateLibraryPath, { recursive: true });
    const result = await shell.openPath(templateLibraryPath);
    if (result) {
      logToRenderer(4, `打开模板库目录失败: ${result}`);
      return { ok: false, error: result };
    }
    logToRenderer(1, `打开模板库目录: ${templateLibraryPath}`);
    return { ok: true, path: templateLibraryPath };
  } catch (error) {
    logToRenderer(4, `打开模板库目录失败: ${error.message}`);
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("file:createDirectory", async (_event, payload) => {
  const { baseDir, dirName } = payload;
  if (!baseDir || !dirName) {
    return { ok: false, error: "参数不完整" };
  }
  try {
    let fullPath = path.join(baseDir, dirName);

    // 检查是否存在,如果存在则自动添加序号
    if (fs.existsSync(fullPath)) {
      let counter = 1;
      while (fs.existsSync(path.join(baseDir, `${dirName}（${counter}）`))) {
        counter++;
        if (counter > 999) { // 防止无限循环
          return { ok: false, error: "无法创建目录,已存在过多同名文件夹" };
        }
      }
      fullPath = path.join(baseDir, `${dirName}（${counter}）`);
    }

    await fs.promises.mkdir(fullPath, { recursive: true });
    return { ok: true, path: fullPath };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("file:saveImage", async (_event, payload) => {
  const { directory, fileName, buffer } = payload;
  if (!directory || !fileName || !buffer) {
    return { ok: false, error: "参数不完整" };
  }
  try {
    const fullPath = path.join(directory, fileName);
    // buffer 可能是 ArrayBuffer 或 Uint8Array
    const bufferData = Buffer.from(buffer);
    await fs.promises.writeFile(fullPath, bufferData);
    return { ok: true, path: fullPath };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

function getPuzzleDataDir() {
  return path.join(app.getPath("userData"), "PPT-Stitcher");
}

function getPuzzleBackgroundDir() {
  return path.join(getPuzzleDataDir(), "backgrounds");
}

function getPuzzleStickerDir() {
  return path.join(getPuzzleDataDir(), "stickers");
}

function getPuzzleTemplateFile() {
  return path.join(getPuzzleDataDir(), "templates.json");
}

async function ensurePuzzleDirs() {
  await fs.promises.mkdir(getPuzzleBackgroundDir(), { recursive: true });
  await fs.promises.mkdir(getPuzzleStickerDir(), { recursive: true });
}

function sanitizeBaseName(name) {
  return String(name || "template")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60) || "template";
}

function parseHexColor(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  let hex = raw.startsWith("#") ? raw.slice(1) : raw;
  if (hex.length === 3) {
    hex = hex.split("").map((ch) => ch + ch).join("");
  }
  if (hex.length !== 6 && hex.length !== 8) {
    return null;
  }
  const intValue = Number.parseInt(hex, 16);
  if (Number.isNaN(intValue)) return null;
  const r = (intValue >>> (hex.length === 8 ? 24 : 16)) & 0xff;
  const g = (intValue >>> (hex.length === 8 ? 16 : 8)) & 0xff;
  const b = (intValue >>> (hex.length === 8 ? 8 : 0)) & 0xff;
  const a = hex.length === 8 ? (intValue >>> 0) & 0xff : 255;
  return {
    r,
    g,
    b,
    alpha: Math.max(0, Math.min(1, a / 255))
  };
}

function resolveUniqueFilePath(dir, fileName) {
  let candidate = path.join(dir, fileName);
  if (!fs.existsSync(candidate)) return candidate;
  const ext = path.extname(fileName);
  const base = fileName.slice(0, -ext.length);
  for (let i = 1; i <= 999; i += 1) {
    candidate = path.join(dir, `${base}(${i})${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  return path.join(dir, `${base}_${Date.now()}${ext}`);
}

function sanitizeImportedExt(sourcePath, fallbackExt = ".png") {
  const fallback = fallbackExt.startsWith(".") ? fallbackExt : `.${fallbackExt}`;
  const extName = path.extname(sourcePath || "").toLowerCase();
  if (!extName) return fallback;
  return /^[.a-z0-9]+$/.test(extName) ? extName : fallback;
}

function buildImportedAssetFileName(sourcePath, targetDir, fallbackExt = ".png") {
  const ext = sanitizeImportedExt(sourcePath, fallbackExt);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const stamp = Date.now();
    const salt = `${sourcePath || ""}|${process.pid}|${stamp}|${Math.random()}|${attempt}`;
    const digest = crypto.createHash("sha1").update(salt).digest("hex").slice(0, 10);
    const candidate = `${stamp}_${digest}${ext}`;
    if (!fs.existsSync(path.join(targetDir, candidate))) {
      return candidate;
    }
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}${ext}`;
}

async function readTemplatesFile() {
  try {
    const filePath = getPuzzleTemplateFile();
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const raw = await fs.promises.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.templates) ? parsed.templates : [];
  } catch (error) {
    return [];
  }
}

async function writeTemplatesFile(templates) {
  await fs.promises.mkdir(getPuzzleDataDir(), { recursive: true });
  const targetFile = getPuzzleTemplateFile();
  const tempFile = `${targetFile}.${process.pid}.${Date.now()}.tmp`;
  const payload = JSON.stringify({ templates }, null, 2);
  await fs.promises.writeFile(tempFile, payload, "utf8");
  try {
    await fs.promises.rename(tempFile, targetFile);
  } catch (error) {
    if (fs.existsSync(targetFile)) {
      await fs.promises.unlink(targetFile);
      await fs.promises.rename(tempFile, targetFile);
    } else {
      throw error;
    }
  } finally {
    if (fs.existsSync(tempFile)) {
      await fs.promises.unlink(tempFile).catch(() => {});
    }
  }
}

function normalizeTemplateAssetRef(inputPath) {
  const raw = String(inputPath || "").trim();
  if (!raw) return "";
  if (raw.startsWith("file://")) return "";
  if (/^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith("\\\\") || raw.startsWith("/")) {
    return "";
  }
  const normalized = raw.replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (!normalized) return "";
  const parts = normalized.split("/").filter(Boolean);
  if (!parts.length || parts.includes("..")) return "";
  const safePath = parts.join("/");
  if (!safePath.startsWith("backgrounds/") && !safePath.startsWith("stickers/")) {
    return "";
  }
  return safePath;
}

function collectTemplateAssetRefs(template) {
  const refs = new Set();
  const puzzles = Array.isArray(template?.puzzles) ? template.puzzles : [];
  puzzles.forEach((puzzle) => {
    const bgRef = normalizeTemplateAssetRef(puzzle?.backgroundPath);
    if (bgRef) refs.add(bgRef);
    const images = Array.isArray(puzzle?.images) ? puzzle.images : [];
    images.forEach((image) => {
      const imageRef = normalizeTemplateAssetRef(image?.imagePath);
      if (imageRef) refs.add(imageRef);
    });
  });
  return refs;
}

function isPathUnderPuzzleData(absPath) {
  const base = path.resolve(getPuzzleDataDir());
  const target = path.resolve(absPath || "");
  if (!target) return false;
  const baseLower = base.toLowerCase();
  const targetLower = target.toLowerCase();
  return targetLower === baseLower || targetLower.startsWith(`${baseLower}${path.sep}`);
}

ipcMain.handle("puzzle:loadTemplates", async () => {
  const templates = await readTemplatesFile();
  logToRenderer(1, `拼图模板加载: ${templates.length} 个`);
  return { ok: true, templates };
});

ipcMain.handle("font:getSystemFonts", async () => {
  try {
    const result = await enumerateSystemFonts();
    logToRenderer(
      1,
      `系统字体枚举完成: method=${result.method} raw=${result.stats.rawCount} dedup=${result.stats.dedupCount}`
    );
    return {
      ok: true,
      fonts: Array.isArray(result.fonts) ? result.fonts : [],
      method: result.method,
      stats: result.stats
    };
  } catch (error) {
    const message = error?.message || "未知错误";
    logToRenderer(2, `系统字体枚举失败: ${message}`);
    return {
      ok: false,
      fonts: [],
      error: message,
      method: "failed",
      stats: {
        rawCount: 0,
        dedupCount: 0,
        truncatedCount: 0,
        attemptedMethods: []
      }
    };
  }
});

ipcMain.handle("puzzle:saveTemplates", async (event, payload) => {
  const templates = Array.isArray(payload?.templates) ? payload.templates : [];
  try {
    await writeTemplatesFile(templates);
    logToRenderer(1, `拼图模板保存: ${templates.length} 个`);
    return { ok: true };
  } catch (error) {
    logToRenderer(4, `拼图模板保存失败: ${error.message}`);
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("puzzle:deleteTemplate", async (_event, payload) => {
  const templateId = String(payload?.templateId || "").trim();
  if (!templateId) {
    return { ok: false, error: "缺少模板ID" };
  }

  try {
    const templates = await readTemplatesFile();
    const target = templates.find((item) => item?.id === templateId);
    if (!target) {
      return { ok: false, error: "模板不存在" };
    }

    const remainingTemplates = templates.filter((item) => item?.id !== templateId);
    const targetRefs = collectTemplateAssetRefs(target);
    const remainingRefs = new Set();
    remainingTemplates.forEach((item) => {
      const refs = collectTemplateAssetRefs(item);
      refs.forEach((ref) => remainingRefs.add(ref));
    });

    const deletableRefs = Array.from(targetRefs).filter((ref) => !remainingRefs.has(ref));
    await writeTemplatesFile(remainingTemplates);

    const deletedFiles = [];
    const skippedShared = [];
    const missingFiles = [];
    const failedFiles = [];
    for (const ref of deletableRefs) {
      const absolutePath = path.join(getPuzzleDataDir(), ref);
      if (!isPathUnderPuzzleData(absolutePath)) {
        failedFiles.push({ path: ref, error: "路径越界，已拒绝删除" });
        continue;
      }
      try {
        const stat = await fs.promises.stat(absolutePath).catch((error) => {
          if (error?.code === "ENOENT") return null;
          throw error;
        });
        if (!stat) {
          missingFiles.push(ref);
          continue;
        }
        if (!stat.isFile()) {
          failedFiles.push({ path: ref, error: "目标不是文件" });
          continue;
        }
        await fs.promises.unlink(absolutePath);
        deletedFiles.push(ref);
      } catch (error) {
        failedFiles.push({ path: ref, error: error?.message || "删除失败" });
      }
    }

    Array.from(targetRefs).forEach((ref) => {
      if (remainingRefs.has(ref)) {
        skippedShared.push(ref);
      }
    });

    const cleanup = {
      targetRefCount: targetRefs.size,
      deletableRefCount: deletableRefs.length,
      deletedFiles,
      deletedCount: deletedFiles.length,
      skippedShared,
      skippedSharedCount: skippedShared.length,
      missingFiles,
      missingCount: missingFiles.length,
      failedFiles,
      failedCount: failedFiles.length
    };

    logToRenderer(
      1,
      `模板删除完成: id=${templateId} deleted=${cleanup.deletedCount} shared=${cleanup.skippedSharedCount} missing=${cleanup.missingCount} failed=${cleanup.failedCount}`
    );

    return {
      ok: true,
      templateId,
      templates: remainingTemplates,
      cleanup
    };
  } catch (error) {
    logToRenderer(4, `删除模板失败: ${error?.message || "unknown"}`);
    return { ok: false, error: error?.message || "删除模板失败" };
  }
});

ipcMain.handle("puzzle:copyBackground", async (event, payload) => {
  try {
    const sourcePath = typeof payload === "string" ? payload : payload?.path;
    if (!sourcePath) {
      return { ok: false, error: "缺少背景图路径" };
    }
    await ensurePuzzleDirs();
    const targetDir = getPuzzleBackgroundDir();
    const fileName = buildImportedAssetFileName(sourcePath, targetDir, ".png");
    const targetPath = path.join(targetDir, fileName);
    await fs.promises.copyFile(sourcePath, targetPath);
    const relativePath = path.join("backgrounds", fileName).replace(/\\/g, "/");
    logToRenderer(1, `拼图背景图已复制: ${relativePath}`);
    return { ok: true, relativePath };
  } catch (error) {
    logToRenderer(4, `拼图背景图复制失败: ${error.message}`);
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("puzzle:copySticker", async (event, payload) => {
  try {
    const sourcePath = typeof payload === "string" ? payload : payload?.path;
    if (!sourcePath) {
      return { ok: false, error: "缺少图片路径" };
    }
    await ensurePuzzleDirs();
    const targetDir = getPuzzleStickerDir();
    const fileName = buildImportedAssetFileName(sourcePath, targetDir, ".png");
    const targetPath = path.join(targetDir, fileName);
    await fs.promises.copyFile(sourcePath, targetPath);
    const relativePath = path.join("stickers", fileName).replace(/\\/g, "/");
    logToRenderer(1, `拼图图片元素已复制: ${relativePath}`);
    return { ok: true, relativePath };
  } catch (error) {
    logToRenderer(4, `拼图图片元素复制失败: ${error.message}`);
    return { ok: false, error: error.message };
  }
});

function hashClipboardPayload(value) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function buildClipboardSummary() {
  let formats = [];
  try {
    formats = Array.from(new Set(clipboard.availableFormats())).sort();
  } catch (error) {
    formats = [];
  }

  let imageInfo = null;
  try {
    const image = clipboard.readImage();
    if (image && !image.isEmpty()) {
      const size = image.getSize ? image.getSize() : { width: null, height: null };
      let hash = "";
      try {
        hash = hashClipboardPayload(image.toPNG());
      } catch (error) {
        hash = "unavailable";
      }
      imageInfo = {
        width: Number(size.width) || 0,
        height: Number(size.height) || 0,
        hash
      };
    }
  } catch (error) {
    imageInfo = null;
  }

  let textInfo = null;
  try {
    const text = clipboard.readText() || "";
    if (text.trim()) {
      textInfo = {
        length: text.length,
        hash: hashClipboardPayload(text)
      };
    }
  } catch (error) {
    textInfo = null;
  }

  const signature = hashClipboardPayload(JSON.stringify({ formats, imageInfo, textInfo }));
  return {
    ok: true,
    hasImage: !!imageInfo,
    hasText: !!textInfo,
    signature,
    formats
  };
}

ipcMain.handle("puzzle:getClipboardSummary", async () => {
  try {
    return buildClipboardSummary();
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("puzzle:readClipboardImage", async () => {
  try {
    const image = clipboard.readImage();
    if (!image || image.isEmpty()) {
      return { ok: false, empty: true };
    }
    await ensurePuzzleDirs();
    const stamp = Date.now();
    const fileName = `clipboard_${stamp}.png`;
    const targetPath = path.join(getPuzzleStickerDir(), fileName);
    await fs.promises.writeFile(targetPath, image.toPNG());
    const relativePath = path.join("stickers", fileName).replace(/\\/g, "/");
    const size = image.getSize ? image.getSize() : { width: null, height: null };
    logToRenderer(1, `拼图剪贴板图片已保存: ${relativePath}`);
    return { ok: true, relativePath, width: size.width, height: size.height };
  } catch (error) {
    logToRenderer(4, `剪贴板图片读取失败: ${error.message}`);
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("puzzle:readClipboardText", async () => {
  try {
    const text = clipboard.readText();
    if (!text) {
      return { ok: false, empty: true };
    }
    return { ok: true, text };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("puzzle:loadBackground", async (event, payload) => {
  const relativePath = typeof payload === "string" ? payload : payload?.path;
  if (!relativePath) {
    return { ok: false, error: "缺少背景图路径" };
  }
  const absolutePath = path.join(getPuzzleDataDir(), relativePath);
  if (!fs.existsSync(absolutePath)) {
    logToRenderer(3, `拼图背景图不存在: ${relativePath}`);
    return { ok: false, error: "背景图不存在" };
  }
  return { ok: true, absolutePath };
});

ipcMain.handle("puzzle:scanImages", async (event, payload) => {
  const folder = payload?.folder;
  if (!folder) {
    return { ok: false, error: "未选择图片文件夹" };
  }
  try {
    const images = [];
    const walk = async (dir) => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
          continue;
        }
        if (!entry.isFile()) {
          continue;
        }
        const ext = path.extname(entry.name).toLowerCase();
        if (!imageExtensions.has(ext)) {
          continue;
        }
        const relativeName = path.relative(folder, fullPath);
        images.push({
          name: relativeName || entry.name,
          path: fullPath
        });
      }
    };
    await walk(folder);
    images.sort(comparePuzzleImageEntryNatural);
    logToRenderer(1, `拼图图片扫描完成: ${images.length} 张`);
    return { ok: true, images };
  } catch (error) {
    logToRenderer(4, `拼图图片扫描失败: ${error.message}`);
    return { ok: false, error: error.message };
  }
});

async function getFirstLevelPuzzleImages(folderPath) {
  const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
  const images = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!imageExtensions.has(ext)) continue;
    const fullPath = path.join(folderPath, entry.name);
    images.push({
      name: entry.name,
      path: fullPath
    });
  }
  images.sort(comparePuzzleImageEntryNatural);
  return images;
}

ipcMain.handle("puzzle:checkFolderAccess", async (_event, payload) => {
  const folder = typeof payload?.folder === "string" ? payload.folder.trim() : "";
  if (!folder) {
    return { ok: false, error: "未选择文件夹" };
  }
  try {
    const stat = await fs.promises.stat(folder);
    return {
      ok: true,
      accessible: stat.isDirectory()
    };
  } catch (error) {
    return {
      ok: true,
      accessible: false,
      error: error?.message || "路径不可访问"
    };
  }
});

ipcMain.handle("puzzle:scanSubfolderGroups", async (_event, payload) => {
  const parentFolder = typeof payload?.parentFolder === "string"
    ? payload.parentFolder.trim()
    : "";
  if (!parentFolder) {
    return { ok: false, error: "未选择父文件夹" };
  }
  try {
    const parentStat = await fs.promises.stat(parentFolder);
    if (!parentStat.isDirectory()) {
      return { ok: false, error: "所选路径不是文件夹" };
    }
    const entries = await fs.promises.readdir(parentFolder, { withFileTypes: true });
    const childDirs = entries
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => compareNaturalText(left.name, right.name));
    const groups = [];
    let imageCount = 0;
    for (const entry of childDirs) {
      const folderPath = path.join(parentFolder, entry.name);
      const images = await getFirstLevelPuzzleImages(folderPath);
      imageCount += images.length;
      groups.push({
        name: entry.name,
        folderPath,
        images
      });
    }
    logToRenderer(1, `拼图子文件夹扫描完成: ${groups.length} 个子文件夹，共 ${imageCount} 张`);
    return {
      ok: true,
      parentFolder,
      parentFolderAccessible: true,
      groups,
      subfolderCount: groups.length,
      imageCount
    };
  } catch (error) {
    logToRenderer(4, `拼图子文件夹扫描失败: ${error.message}`);
    return {
      ok: false,
      parentFolder,
      parentFolderAccessible: false,
      error: error.message
    };
  }
});

async function buildRoundedMask(width, height, radius) {
  const r = Math.max(0, Math.min(radius || 0, width / 2, height / 2));
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${width}" height="${height}" rx="${r}" ry="${r}" fill="#fff"/>
  </svg>`;
  return Buffer.from(svg);
}

async function buildBorderSvg(width, height, radius, borderWidth, borderColor) {
  const bw = Math.max(0, borderWidth || 0);
  if (bw <= 0) return null;
  const r = Math.max(0, Math.min(radius || 0, width / 2, height / 2));
  const half = bw / 2;
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${half}" y="${half}" width="${width - bw}" height="${height - bw}"
      rx="${r}" ry="${r}" fill="none" stroke="${borderColor || "#ffffff"}" stroke-width="${bw}"/>
  </svg>`;
  return Buffer.from(svg);
}

function buildSlotCutoutSvg(canvasWidth, canvasHeight, slotMasks, options = {}) {
  if (!Array.isArray(slotMasks) || slotMasks.length === 0) return null;
  const safeCanvasW = Math.max(1, Math.round(canvasWidth || 1));
  const safeCanvasH = Math.max(1, Math.round(canvasHeight || 1));
  const offsetX = Math.round(Number(options?.offsetX) || 0);
  const offsetY = Math.round(Number(options?.offsetY) || 0);
  const rects = slotMasks
    .map((mask) => {
      const w = Math.max(1, Math.round(mask?.w || 0));
      const h = Math.max(1, Math.round(mask?.h || 0));
      const x = Math.round((mask?.x || 0) - offsetX);
      const y = Math.round((mask?.y || 0) - offsetY);
      const r = Math.max(0, Math.min(Number(mask?.radius) || 0, w / 2, h / 2));
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="#ffffff"/>`;
    })
    .join("");
  if (!rects) return null;
  return Buffer.from(
    `<svg width="${safeCanvasW}" height="${safeCanvasH}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`
  );
}

function fillRoundedRectCanvas(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius || 0, width / 2, height / 2));
  ctx.beginPath();
  if (r <= 0) {
    ctx.rect(x, y, width, height);
  } else {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }
  ctx.fill();
}

async function buildShadowBuffer(width, height, radius, shadowSpec) {
  const spec = shadowSpec || { alpha: 0.45, blur: 22, offsetX: 10, offsetY: 10 };
  const blur = Math.max(1, Math.round(spec.blur || 1));
  const offsetX = Math.round(spec.offsetX || 0);
  const offsetY = Math.round(spec.offsetY || 0);
  const extra = Math.max(Math.abs(offsetX), Math.abs(offsetY));
  const padding = blur * 2 + extra;
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const r = Math.max(0, Math.min(radius || 0, safeWidth / 2, safeHeight / 2));
  const { createCanvas } = getCanvasLib();
  const canvas = createCanvas(safeWidth + padding * 2, safeHeight + padding * 2);
  const ctx = canvas.getContext("2d");
  const alpha = Math.max(0, Math.min(1, spec.alpha ?? 0.45));
  ctx.shadowColor = `rgba(0, 0, 0, ${alpha})`;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = offsetX;
  ctx.shadowOffsetY = offsetY;
  ctx.fillStyle = "#000000";
  fillRoundedRectCanvas(ctx, padding, padding, safeWidth, safeHeight, r);
  ctx.globalCompositeOperation = "destination-out";
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  fillRoundedRectCanvas(ctx, padding, padding, safeWidth, safeHeight, r);
  return { buffer: await canvas.toBuffer("png"), padding, offsetX: 0, offsetY: 0 };
}

async function createSlotImage(slot, scale = 1) {
  if (!slot.imagePath || !fs.existsSync(slot.imagePath)) {
    return null;
  }
  let sourceBuffer = null;
  try {
    sourceBuffer = await fs.promises.readFile(slot.imagePath);
  } catch (error) {
    throw new Error(`读取拼图素材失败: ${error.message}`);
  }
  let metadata = null;
  try {
    metadata = await sharp(sourceBuffer, { failOn: "none" }).metadata();
  } catch (error) {
    metadata = null;
  }
  const { getSlotRenderSpec } = await getRenderSpec();
  const spec = getSlotRenderSpec({
    slot,
    imageW: metadata?.width,
    imageH: metadata?.height,
    scale
  });
  if (!spec.hasImage || !spec.imageRect) {
    return null;
  }
  const width = spec.slotRect.w;
  const height = spec.slotRect.h;
  const radius = spec.borderRadius;
  const drawW = Math.max(1, Math.round(spec.imageRect.w));
  const drawH = Math.max(1, Math.round(spec.imageRect.h));
  const drawX = Math.round(spec.imageRect.x);
  const drawY = Math.round(spec.imageRect.y);

  let canvas = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .png()
    .toBuffer();

  const overlapLeft = Math.max(0, drawX);
  const overlapTop = Math.max(0, drawY);
  const overlapRight = Math.min(width, drawX + drawW);
  const overlapBottom = Math.min(height, drawY + drawH);
  const overlapW = Math.max(0, overlapRight - overlapLeft);
  const overlapH = Math.max(0, overlapBottom - overlapTop);

  if (overlapW > 0 && overlapH > 0) {
    const srcX = Math.max(0, overlapLeft - drawX);
    const srcY = Math.max(0, overlapTop - drawY);
    const safeW = Math.min(overlapW, drawW - srcX);
    const safeH = Math.min(overlapH, drawH - srcY);
    if (safeW > 0 && safeH > 0) {
      const buffer = await sharp(sourceBuffer, { failOn: "none" })
        .resize(drawW, drawH, { fit: "fill" })
        .extract({
          left: Math.max(0, Math.round(srcX)),
          top: Math.max(0, Math.round(srcY)),
          width: Math.max(1, Math.round(safeW)),
          height: Math.max(1, Math.round(safeH))
        })
        .png()
        .toBuffer();
      canvas = await sharp(canvas)
        .composite([{ input: buffer, left: Math.round(overlapLeft), top: Math.round(overlapTop) }])
        .png()
        .toBuffer();
    }
  }

  if (radius > 0) {
    const mask = await buildRoundedMask(width, height, radius);
    canvas = await sharp(canvas).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  }

  const border = await buildBorderSvg(width, height, radius, spec.borderWidth, spec.borderColor);
  if (border) {
    canvas = await sharp(canvas).composite([{ input: border }]).png().toBuffer();
  }

  return {
    buffer: canvas,
    rect: { x: drawX, y: drawY, w: drawW, h: drawH },
    slotRect: spec.slotRect,
    radius: spec.borderRadius,
    shadow: spec.shadow
  };
}

function resolvePuzzleRenderPlan(canvasSize, requestedScale = 1, scene = "generate") {
  const sourceW = Math.max(1, Math.round(Number(canvasSize?.w) || 1));
  const sourceH = Math.max(1, Math.round(Number(canvasSize?.h) || 1));
  const baseScale = Number.isFinite(Number(requestedScale)) && Number(requestedScale) > 0
    ? Number(requestedScale)
    : 1;
  const pixelLimit = scene === "preview" ? PUZZLE_PREVIEW_MAX_PIXELS : PUZZLE_MAX_PIXELS;
  const dimensionScale = Math.min(PUZZLE_MAX_DIMENSION / sourceW, PUZZLE_MAX_DIMENSION / sourceH);
  const pixelScale = Math.sqrt(pixelLimit / (sourceW * sourceH));
  let scale = Math.min(baseScale, dimensionScale, pixelScale);

  if (!Number.isFinite(scale) || scale <= 0) {
    return {
      ok: false,
      reason: "invalid_scale",
      sourceW,
      sourceH,
      requestedScale: baseScale,
      maxDimension: PUZZLE_MAX_DIMENSION,
      pixelLimit
    };
  }

  let width = Math.max(1, Math.round(sourceW * scale));
  let height = Math.max(1, Math.round(sourceH * scale));
  let pixels = width * height;
  while ((width > PUZZLE_MAX_DIMENSION || height > PUZZLE_MAX_DIMENSION || pixels > pixelLimit) && scale > 0.01) {
    scale *= 0.98;
    width = Math.max(1, Math.round(sourceW * scale));
    height = Math.max(1, Math.round(sourceH * scale));
    pixels = width * height;
  }

  if (width > PUZZLE_MAX_DIMENSION || height > PUZZLE_MAX_DIMENSION || pixels > pixelLimit) {
    return {
      ok: false,
      reason: "exceed_hard_limit",
      sourceW,
      sourceH,
      requestedScale: baseScale,
      maxScale: scale,
      maxDimension: PUZZLE_MAX_DIMENSION,
      pixelLimit
    };
  }

  if (scale < 0.1) {
    return {
      ok: false,
      reason: "scale_too_small",
      sourceW,
      sourceH,
      requestedScale: baseScale,
      maxScale: scale,
      maxDimension: PUZZLE_MAX_DIMENSION,
      pixelLimit
    };
  }

  return {
    ok: true,
    sourceW,
    sourceH,
    requestedScale: baseScale,
    scale,
    width,
    height,
    pixels,
    pixelLimit,
    adjusted: Math.abs(scale - baseScale) > 1e-6
  };
}

async function renderPuzzleTaskBuffer(task, options = {}) {
  if (!sharp) {
    sharp = require("sharp");
  }
  const taskContext = {
    taskIndex: Number(options?.taskContext?.taskIndex) || 0,
    puzzleName:
      options?.taskContext?.puzzleName ||
      task?.puzzleName ||
      task?.name ||
      task?.puzzleId ||
      "拼图"
  };
  const scene = options?.scene === "preview" ? "preview" : "generate";
  const requestedScale = Number(options?.scale) > 0 ? Number(options.scale) : 1;
  const renderPlan = resolvePuzzleRenderPlan(task?.canvasSize, requestedScale, scene);
  if (!renderPlan.ok) {
    const sceneLabel = scene === "preview" ? "预览" : "导出";
    const maxScaleText = Number.isFinite(renderPlan.maxScale)
      ? renderPlan.maxScale.toFixed(3)
      : "0.000";
    throw createPuzzleStageError(
      "canvas_limit",
      `${sceneLabel}尺寸过大：画布 ${renderPlan.sourceW}x${renderPlan.sourceH}，请求倍率 ${requestedScale}x，最大安全倍率约 ${maxScaleText}x（上限 ${PUZZLE_MAX_DIMENSION}px，${renderPlan.pixelLimit} 像素）`,
      taskContext
    );
  }
  const scale = renderPlan.scale;
  if (renderPlan.adjusted) {
    const sceneLabel = scene === "preview" ? "预览" : "导出";
    logToRenderer(
      2,
      `拼图${sceneLabel}自动降级倍率: ${requestedScale}x -> ${scale.toFixed(3)}x（${renderPlan.width}x${renderPlan.height}，上限 ${renderPlan.pixelLimit} 像素）`
    );
  }
  const shadowPipelineVersion = Number(options?.shadowPipelineVersion) || 1;
  const shadowPipelineLegacyVersion = Number(options?.shadowPipelineLegacyVersion) || 1;
  const buildShadowMasks =
    typeof options?.buildShadowMasks === "function" ? options.buildShadowMasks : null;
  const getOrderedSlots =
    typeof options?.getOrderedSlots === "function"
      ? options.getOrderedSlots
      : (slots) => (Array.isArray(slots) ? [...slots].sort(compareSlotsByZOrder) : []);

  const scaledCanvas = {
    w: renderPlan.width,
    h: renderPlan.height
  };
  let base;
  try {
    if (task.backgroundMode === "image" && task.backgroundPath) {
      const bgPath = path.join(getPuzzleDataDir(), task.backgroundPath);
      const bgFile = path.basename(task.backgroundPath || bgPath);
      if (!fs.existsSync(bgPath)) {
        throw createPuzzleStageError(
          "background_decode",
          "背景图文件不存在",
          { ...taskContext, file: bgFile, imagePath: task.backgroundPath }
        );
      }
      const bgBuffer = await fs.promises.readFile(bgPath);
      base = sharp(bgBuffer, { failOn: "none" }).resize(scaledCanvas.w, scaledCanvas.h);
    } else if (task.backgroundMode === "color") {
      const color = parseHexColor(task.backgroundColor) || { r: 255, g: 255, b: 255, alpha: 1 };
      base = sharp({
        create: {
          width: scaledCanvas.w,
          height: scaledCanvas.h,
          channels: 4,
          background: color
        }
      });
    } else {
      base = sharp({
        create: {
          width: scaledCanvas.w,
          height: scaledCanvas.h,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      });
    }
  } catch (error) {
    if (error?.stage) throw error;
    throw createPuzzleStageError("background_decode", "背景图处理失败", taskContext, error);
  }

  const composites = [];
  const shadowComposites = [];
  const slotComposites = [];
  const slotEntries = [];
  const slotMasks = [];
  const orderedSlots = getOrderedSlots(task.slots);

  for (const slot of orderedSlots) {
    if (!slot.imagePath) continue;
    const slotFile = path.basename(slot.imagePath || "");
    let slotResult = null;
    try {
      slotResult = await createSlotImage(slot, scale);
    } catch (error) {
      throw createPuzzleStageError(
        "slot_decode",
        "坑位图片处理失败",
        { ...taskContext, file: slotFile, imagePath: slot.imagePath },
        error
      );
    }
    if (!slotResult) continue;

    const normalizedSlotRect = {
      x: Math.round(slotResult.slotRect.x),
      y: Math.round(slotResult.slotRect.y),
      w: Math.round(slotResult.slotRect.w),
      h: Math.round(slotResult.slotRect.h)
    };
    const radius = Math.max(0, Number(slotResult.radius) || 0);
    slotEntries.push({
      imagePath: slot.imagePath,
      slotRect: normalizedSlotRect,
      radius,
      shadow: slotResult.shadow
    });
    if (shadowPipelineVersion <= shadowPipelineLegacyVersion) {
      slotMasks.push({
        x: normalizedSlotRect.x,
        y: normalizedSlotRect.y,
        w: normalizedSlotRect.w,
        h: normalizedSlotRect.h,
        radius
      });
    }
    slotComposites.push({
      input: slotResult.buffer,
      left: normalizedSlotRect.x,
      top: normalizedSlotRect.y
    });
  }

  for (let slotIndex = 0; slotIndex < slotEntries.length; slotIndex += 1) {
    const entry = slotEntries[slotIndex];
    if (!entry.shadow) continue;
    const slotFile = path.basename(entry.imagePath || "");
    try {
      const shadow = await buildShadowBuffer(
        entry.slotRect.w,
        entry.slotRect.h,
        entry.radius,
        entry.shadow
      );
      let sLeft = Math.round(entry.slotRect.x - shadow.padding + shadow.offsetX);
      let sTop = Math.round(entry.slotRect.y - shadow.padding + shadow.offsetY);
      let shadowBuf = shadow.buffer;
      const sMeta = await sharp(shadowBuf).metadata();
      let cropLeft = 0;
      let cropTop = 0;
      let cropW = sMeta.width;
      let cropH = sMeta.height;
      if (sLeft < 0) {
        cropLeft = -sLeft;
        cropW -= cropLeft;
        sLeft = 0;
      }
      if (sTop < 0) {
        cropTop = -sTop;
        cropH -= cropTop;
        sTop = 0;
      }
      if (sLeft + cropW > scaledCanvas.w) {
        cropW = scaledCanvas.w - sLeft;
      }
      if (sTop + cropH > scaledCanvas.h) {
        cropH = scaledCanvas.h - sTop;
      }
      if (cropW <= 0 || cropH <= 0) {
        continue;
      }
      if (cropLeft > 0 || cropTop > 0 || cropW !== sMeta.width || cropH !== sMeta.height) {
        shadowBuf = await sharp(shadowBuf)
          .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
          .png()
          .toBuffer();
      }

      if (shadowPipelineVersion > shadowPipelineLegacyVersion && buildShadowMasks) {
        const cutouts = buildShadowMasks(slotEntries, slotIndex, {
          includeOwner: true,
          onlyAbove: true
        });
        if (cutouts.length) {
          const cutoutSvg = buildSlotCutoutSvg(cropW, cropH, cutouts, { offsetX: sLeft, offsetY: sTop });
          if (cutoutSvg) {
            shadowBuf = await sharp(shadowBuf)
              .composite([{ input: cutoutSvg, blend: "dest-out" }])
              .png()
              .toBuffer();
          }
        }
      }

      shadowComposites.push({ input: shadowBuf, left: sLeft, top: sTop, slotIndex });
    } catch (error) {
      throw createPuzzleStageError(
        "slot_decode",
        "坑位阴影处理失败",
        { ...taskContext, file: slotFile, imagePath: entry.imagePath },
        error
      );
    }
  }

  if (shadowPipelineVersion <= shadowPipelineLegacyVersion) {
    if (shadowComposites.length) {
      try {
        const shadowLayerInputs = shadowComposites.map((item) => ({
          input: item.input,
          left: item.left,
          top: item.top
        }));
        let shadowLayer = await sharp({
          create: {
            width: scaledCanvas.w,
            height: scaledCanvas.h,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          }
        })
          .png()
          .toBuffer();
        shadowLayer = await sharp(shadowLayer).composite(shadowLayerInputs).png().toBuffer();
        const cutoutSvg = buildSlotCutoutSvg(scaledCanvas.w, scaledCanvas.h, slotMasks);
        if (cutoutSvg) {
          shadowLayer = await sharp(shadowLayer)
            .composite([{ input: cutoutSvg, blend: "dest-out" }])
            .png()
            .toBuffer();
        }
        composites.push({ input: shadowLayer, left: 0, top: 0 });
      } catch (error) {
        throw createPuzzleStageError("composite", "坑位阴影层合成失败", taskContext, error);
      }
    }
    composites.push(...slotComposites);
  } else if (slotComposites.length) {
    const shadowBySlotIndex = new Map();
    for (const item of shadowComposites) {
      if (!Number.isInteger(item.slotIndex)) continue;
      shadowBySlotIndex.set(item.slotIndex, item);
    }
    for (let slotIndex = 0; slotIndex < slotComposites.length; slotIndex += 1) {
      const shadowItem = shadowBySlotIndex.get(slotIndex);
      if (shadowItem) {
        composites.push({
          input: shadowItem.input,
          left: shadowItem.left,
          top: shadowItem.top
        });
      }
      composites.push(slotComposites[slotIndex]);
    }
  }

  let elementLayer = null;
  try {
    elementLayer = await createElementLayerBuffer(task, scale);
  } catch (error) {
    if (error?.stage) {
      error.taskIndex = taskContext.taskIndex;
      error.puzzleName = taskContext.puzzleName;
      throw error;
    }
    throw createPuzzleStageError("element_decode", "图片元素处理失败", taskContext, error);
  }
  if (elementLayer) {
    composites.push({
      input: elementLayer,
      left: 0,
      top: 0
    });
  }

  if (composites.length) {
    base = base.composite(composites);
  }

  let outputBuffer = null;
  try {
    outputBuffer = await base.png().toBuffer();
  } catch (error) {
    throw createPuzzleStageError("composite", "图层合成失败", taskContext, error);
  }
  return { buffer: outputBuffer, scaledCanvas };
}

ipcMain.handle("puzzle:generate", async (event, payload) => {
  try {
    if (!sharp) {
      sharp = require("sharp");
    }
    const outputRoot = payload?.outputDir;
    const tasks = Array.isArray(payload?.tasks) ? payload.tasks : [];
    const templateName = sanitizeBaseName(payload?.templateName || "拼图模板");
    const outputFormat = "png";
    const generationMode = payload?.generationMode === "multi-folder" ? "multi-folder" : "single";
    const multiFolderSubMode = payload?.multiFolderSubMode === "subfolder-batch"
      ? "subfolder-batch"
      : "per-puzzle-folder";
    const outputByPuzzleFolder = generationMode === "multi-folder" && payload?.outputByPuzzleFolder;
    const isSubfolderBatchOutput = outputByPuzzleFolder && multiFolderSubMode === "subfolder-batch";
    const isPerPuzzleFolderOutput = outputByPuzzleFolder && multiFolderSubMode !== "subfolder-batch";
    if (payload?.outputFormat && payload.outputFormat !== "png") {
      logToRenderer(2, "拼图导出格式已强制为 PNG");
    }
    const outputScale = Number(payload?.outputScale) || 1;
    const renderSpec = await getRenderSpec();
    const getOrderedSlots =
      typeof renderSpec?.sortSlotsByZOrder === "function"
        ? renderSpec.sortSlotsByZOrder
        : (slots) => (Array.isArray(slots) ? [...slots].sort(compareSlotsByZOrder) : []);
    const resolvePipelineVersion =
      typeof renderSpec?.resolveShadowPipelineVersion === "function"
        ? renderSpec.resolveShadowPipelineVersion
        : () => 1;
    const buildShadowMasks =
      typeof renderSpec?.buildShadowCutoutMasks === "function"
        ? renderSpec.buildShadowCutoutMasks
        : null;
    const shadowPipelineVersion = resolvePipelineVersion(payload?.shadowPipelineVersion);
    const shadowPipelineLegacyVersion = Number(renderSpec?.SHADOW_PIPELINE_LEGACY_VERSION) || 1;
    if (!outputRoot) {
      return { ok: false, error: "未设置输出目录" };
    }
    if (!tasks.length) {
      return { ok: false, error: "没有生成任务" };
    }
    const continueOnError = payload?.continueOnError !== false;
    await registerTextFonts();
    const fontCheck = await verifyFontsAvailable(tasks);
    logToRenderer(
      1,
      `拼图字体检查摘要: checked=${fontCheck.checked} replaced=${fontCheck.replaced} sansFallback=${fontCheck.fallbackToSans}`
    );
    await fs.promises.mkdir(outputRoot, { recursive: true });
    const outputDir = resolveUniquePath(path.join(outputRoot, `${templateName}_${formatTimestamp()}`));
    await fs.promises.mkdir(outputDir, { recursive: true });

    logToRenderer(1, `拼图开始生成: ${tasks.length} 张`);
    logToRenderer(1, `拼图阴影管线: v${shadowPipelineVersion}`);
    sendProgress("puzzle:progress", {
      phase: "start",
      total: tasks.length
    });

    let count = 0;
    const failedItems = [];
    const outputGroupDirMap = new Map();
    const outputCountMap = new Map();
    for (let index = 0; index < tasks.length; index += 1) {
      const task = tasks[index];
      const taskContext = {
        taskIndex: index,
        puzzleName: task.puzzleName || task.name || task.puzzleId || `拼图${index + 1}`
      };
      try {
        const scale = outputScale > 0 ? outputScale : 1;
        const rendered = await renderPuzzleTaskBuffer(task, {
          scale,
          scene: "generate",
          shadowPipelineVersion,
          shadowPipelineLegacyVersion,
          buildShadowMasks,
          getOrderedSlots,
          taskContext
        });

        let targetDir = outputDir;
        let fileName;
        if (isSubfolderBatchOutput) {
          const groupKey = task.sourceGroupPath || task.sourceGroupName || `group-${index}`;
          let groupDir = outputGroupDirMap.get(groupKey);
          if (!groupDir) {
            const safeGroupName = sanitizeBaseName(task.sourceGroupName || "分组");
            groupDir = resolveUniquePath(path.join(outputDir, safeGroupName));
            await fs.promises.mkdir(groupDir, { recursive: true });
            outputGroupDirMap.set(groupKey, groupDir);
          }
          targetDir = groupDir;
          const nextIndex = (outputCountMap.get(groupKey) || 0) + 1;
          outputCountMap.set(groupKey, nextIndex);
          fileName = `${templateName}_${nextIndex}.${outputFormat}`;
        } else if (isPerPuzzleFolderOutput) {
          const puzzleKey = task.puzzleId || task.puzzleName || `puzzle-${index}`;
          let puzzleDir = outputGroupDirMap.get(puzzleKey);
          if (!puzzleDir) {
            const safePuzzleName = sanitizeBaseName(task.puzzleName || "拼图");
            puzzleDir = resolveUniquePath(path.join(outputDir, safePuzzleName));
            await fs.promises.mkdir(puzzleDir, { recursive: true });
            outputGroupDirMap.set(puzzleKey, puzzleDir);
          }
          targetDir = puzzleDir;
          const nextIndex = (outputCountMap.get(puzzleKey) || 0) + 1;
          outputCountMap.set(puzzleKey, nextIndex);
          const safeName = sanitizeBaseName(task.puzzleName || "拼图");
          fileName = `${templateName}_${safeName}_${nextIndex}.${outputFormat}`;
        } else {
          const nextIndex = (outputCountMap.get("__all__") || 0) + 1;
          outputCountMap.set("__all__", nextIndex);
          fileName = `${templateName}_${nextIndex}.${outputFormat}`;
        }
        const outputPath = resolveUniqueFilePath(targetDir, fileName);
        const outputBuffer = rendered.buffer;
        try {
          await fs.promises.writeFile(outputPath, outputBuffer);
        } catch (error) {
          throw createPuzzleStageError(
            "output_write",
            "输出文件写入失败",
            { ...taskContext, file: path.basename(outputPath), imagePath: outputPath },
            error
          );
        }
        count += 1;
        const processed = count + failedItems.length;
        logToRenderer(1, `拼图已生成: ${outputPath}`);
        sendProgress("puzzle:progress", {
          phase: "item",
          current: processed,
          total: tasks.length,
          success: count,
          failed: failedItems.length,
          outputPath
        });
      } catch (error) {
        const formatted = formatPuzzleExportError(error, "generate", taskContext);
        const failedItem = {
          index,
          puzzleId: task.puzzleId || "",
          puzzleName: taskContext.puzzleName,
          stage: formatted.stage,
          file: formatted.file,
          imagePath: formatted.imagePath,
          error: formatted.message,
          raw: formatted.rawMessage,
          code: formatted.code,
          status: formatted.status
        };
        failedItems.push(failedItem);
        const processed = count + failedItems.length;
        logToRenderer(4, `拼图任务失败 #${index + 1}: ${formatted.message}`);
        sendProgress("puzzle:progress", {
          phase: "item-error",
          current: processed,
          total: tasks.length,
          success: count,
          failed: failedItems.length,
          stage: failedItem.stage,
          file: failedItem.file,
          error: failedItem.error
        });
        if (!continueOnError) {
          sendProgress("puzzle:progress", {
            phase: "done",
            total: tasks.length,
            success: count,
            failed: failedItems.length,
            aborted: true
          });
          return {
            ok: false,
            error: failedItem.error,
            detail: failedItem,
            count,
            failed: failedItems,
            total: tasks.length,
            outputDir,
            partial: count > 0,
            fontCheck
          };
        }
      }
    }

    sendProgress("puzzle:progress", {
      phase: "done",
      total: tasks.length,
      success: count,
      failed: failedItems.length
    });
    if (failedItems.length > 0) {
      logToRenderer(3, `拼图生成部分完成: 成功 ${count} 张，失败 ${failedItems.length} 张`);
      if (count === 0) {
        return {
          ok: false,
          error: failedItems[0]?.error || "拼图生成失败",
          detail: failedItems[0] || null,
          count,
          failed: failedItems,
          total: tasks.length,
          outputDir,
          partial: false,
          fontCheck
        };
      }
      return {
        ok: true,
        count,
        failed: failedItems,
        total: tasks.length,
        outputDir,
        partial: true,
        fontCheck
      };
    }
    logToRenderer(1, `拼图生成完成: ${count} 张`);
    return { ok: true, count, failed: [], total: tasks.length, outputDir, partial: false, fontCheck };
  } catch (error) {
    const formatted = formatPuzzleExportError(error, "generate");
    logToRenderer(4, `拼图生成失败: ${formatted.rawMessage}`);
    return { ok: false, error: formatted.message, detail: formatted, failed: [] };
  }
});

ipcMain.handle("puzzle:renderExportPreview", async (_event, payload) => {
  try {
    if (!sharp) {
      sharp = require("sharp");
    }
    const taskRaw = payload?.task;
    if (!taskRaw || typeof taskRaw !== "object") {
      return { ok: false, error: "预览任务为空" };
    }
    const task = JSON.parse(JSON.stringify(taskRaw));
    const outputScale = Number(payload?.outputScale) || 1;
    const renderSpec = await getRenderSpec();
    const getOrderedSlots =
      typeof renderSpec?.sortSlotsByZOrder === "function"
        ? renderSpec.sortSlotsByZOrder
        : (slots) => (Array.isArray(slots) ? [...slots].sort(compareSlotsByZOrder) : []);
    const resolvePipelineVersion =
      typeof renderSpec?.resolveShadowPipelineVersion === "function"
        ? renderSpec.resolveShadowPipelineVersion
        : () => 1;
    const buildShadowMasks =
      typeof renderSpec?.buildShadowCutoutMasks === "function"
        ? renderSpec.buildShadowCutoutMasks
        : null;
    const shadowPipelineVersion = resolvePipelineVersion(payload?.shadowPipelineVersion);
    const shadowPipelineLegacyVersion = Number(renderSpec?.SHADOW_PIPELINE_LEGACY_VERSION) || 1;
    await registerTextFonts();
    const fontCheck = await verifyFontsAvailable([task]);
    const rendered = await renderPuzzleTaskBuffer(task, {
      scale: outputScale > 0 ? outputScale : 1,
      scene: "preview",
      shadowPipelineVersion,
      shadowPipelineLegacyVersion,
      buildShadowMasks,
      getOrderedSlots,
      taskContext: {
        taskIndex: 0,
        puzzleName: task?.puzzleName || task?.name || task?.puzzleId || "预览"
      }
    });
    return {
      ok: true,
      imageBase64: rendered.buffer.toString("base64"),
      width: rendered.scaledCanvas.w,
      height: rendered.scaledCanvas.h,
      fontCheck
    };
  } catch (error) {
    const formatted = formatPuzzleExportError(error, "preview_render");
    logToRenderer(3, `导出同源预览失败: ${formatted.rawMessage}`);
    return { ok: false, error: formatted.message, detail: formatted };
  }
});

async function walkFolder(rootPath, dirPath, items, errors) {
  let entries = [];
  try {
    entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    errors.push({
      path: dirPath,
      message: error.message
    });
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await walkFolder(rootPath, fullPath, items, errors);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!allowedExtensions.has(ext)) {
      continue;
    }
    const relativeDir = path.relative(rootPath, path.dirname(fullPath));
    items.push({
      sourcePath: fullPath,
      fileName: path.basename(entry.name),
      ext,
      rootPath,
      relativeDir: relativeDir === "." ? "" : relativeDir
    });
  }
}

ipcMain.handle("scan:documents", async (event, payload) => {
  const files = Array.isArray(payload?.files) ? payload.files : [];
  const folders = Array.isArray(payload?.folders) ? payload.folders : [];
  const items = [];
  const errors = [];

  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    if (!allowedExtensions.has(ext)) {
      errors.push({
        path: filePath,
        message: "不支持的文件类型"
      });
      continue;
    }
    items.push({
      sourcePath: filePath,
      fileName: path.basename(filePath),
      ext,
      rootPath: path.dirname(filePath),
      relativeDir: ""
    });
  }

  for (const folderPath of folders) {
    await walkFolder(folderPath, folderPath, items, errors);
  }

  return {
    items,
    errors
  };
});

function getScriptsPath() {
  if (app.isPackaged) {
    // 生产环境：extraResources 放在 resources/scripts
    // process.resourcesPath 指向 <安装目录>/resources
    return path.join(process.resourcesPath, "scripts");
  } else {
    // 开发环境：项目根目录的 scripts 文件夹
    return path.join(__dirname, "scripts");
  }
}

function getPowerShellExe() {
  const absolute = resolveWindowsPowerShellAbsolutePath();
  if (absolute) {
    return absolute;
  }
  return process.platform === "win32" ? "powershell.exe" : "powershell";
}

let gb18030Decoder = null;

function decodePowerShellBuffer(buffer) {
  if (!buffer || buffer.length === 0) return "";
  const utf8Text = buffer.toString("utf8");
  if (!utf8Text.includes("\uFFFD")) {
    return utf8Text;
  }
  try {
    if (!gb18030Decoder) {
      gb18030Decoder = new TextDecoder("gb18030");
    }
    const gbText = gb18030Decoder.decode(buffer);
    const utf8Replacement = (utf8Text.match(/\uFFFD/g) || []).length;
    const gbReplacement = (gbText.match(/\uFFFD/g) || []).length;
    return gbReplacement <= utf8Replacement ? gbText : utf8Text;
  } catch (error) {
    return utf8Text;
  }
}

function killProcessTreeByPid(pid) {
  if (!pid || Number(pid) <= 0) return;
  if (process.platform !== "win32") {
    try {
      process.kill(Number(pid), "SIGTERM");
    } catch (error) {
      // Ignore cleanup errors.
    }
    return;
  }
  try {
    const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
    killer.on("error", () => {
      // Ignore taskkill errors and rely on default process exit.
    });
  } catch (error) {
    // Ignore cleanup errors.
  }
}

function normalizeProcessName(value) {
  return String(value || "")
    .trim()
    .replace(/\.exe$/i, "")
    .toLowerCase();
}

function getProcessNameByPid(pid) {
  const numericPid = Number(pid);
  if (!Number.isInteger(numericPid) || numericPid <= 0) return "";
  try {
    const result = spawnSync(getPowerShellExe(), [
      "-NoProfile",
      "-Command",
      `try { (Get-Process -Id ${numericPid} -ErrorAction Stop).ProcessName } catch { "" }`
    ], {
      windowsHide: true,
      encoding: "utf8",
      timeout: 5000
    });
    return String(result.stdout || "").trim();
  } catch (error) {
    return "";
  }
}

function readPidFile(pidFile) {
  if (!pidFile) return [];
  try {
    const content = fs.readFileSync(pidFile, "utf8").replace(/^\uFEFF/, "");
    return content
      .split(/\r?\n/)
      .map((line) => Number(String(line || "").trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch (error) {
    return [];
  }
}

function terminateOfficeProcessesFromPidFile(pidFile, processNames = []) {
  const allowedNames = new Set((processNames || []).map(normalizeProcessName).filter(Boolean));
  if (allowedNames.size === 0) return;
  for (const pid of readPidFile(pidFile)) {
    const processName = normalizeProcessName(getProcessNameByPid(pid));
    if (!processName || !allowedNames.has(processName)) continue;
    killProcessTreeByPid(pid);
  }
}

function parsePowerShellJsonOutput(stdout, fallbackMessage = "PowerShell 输出解析失败") {
  const cleaned = String(stdout || "").replace(/^\uFEFF/, "").trim();
  if (!cleaned) {
    throw new Error(fallbackMessage);
  }
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const lines = cleaned.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (!line.startsWith("{") && !line.startsWith("[")) continue;
      try {
        return JSON.parse(line);
      } catch (innerError) {
        // Continue trying previous lines.
      }
    }
    throw new Error(fallbackMessage);
  }
}

function runPowerShellScript(scriptName, args, options = {}) {
  const scriptPath = path.join(getScriptsPath(), scriptName);
  if (!fs.existsSync(scriptPath)) {
    return Promise.reject(new Error(`脚本不存在: ${scriptPath}`));
  }
  const timeoutMs = parsePositiveInt(
    options.timeoutMs,
    parsePositiveInt(process.env.SCENE_OFFICE_TIMEOUT_MS, DEFAULT_OFFICE_TIMEOUT_MS)
  );
  const explicitSofficePath = normalizeSofficeCandidatePath(
    options.sofficePath || options.runtimePath || ""
  );
  const useLibreOfficeEnv = options.useLibreOfficeEnv !== false;
  let spawnSofficePath = explicitSofficePath;
  if (useLibreOfficeEnv && !spawnSofficePath) {
    const runtime = resolveLibreOfficeRuntime({
      runtimeMode: options.runtimeMode
    });
    spawnSofficePath = runtime.ok ? runtime.path : "";
  }
  const spawnEnv = useLibreOfficeEnv
    ? createLibreOfficeSpawnEnv(spawnSofficePath, options.env)
    : mergeSpawnEnv(options.env);
  const trackAs = String(options.trackAs || "").trim().toLowerCase();
  const officeChildPidFile = String(options.officeChildPidFile || "").trim();
  const officeChildProcessNames = Array.isArray(options.officeChildProcessNames)
    ? options.officeChildProcessNames
    : [];

  return new Promise((resolve, reject) => {
    const ps = spawn(getPowerShellExe(), [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      ...args
    ], {
      windowsHide: true,
      env: spawnEnv
    });

    const pid = Number(ps?.pid) || 0;
    if (trackAs === "office" && pid > 0) {
      activeOfficePids.add(pid);
      if (officeChildPidFile) {
        activeOfficeChildPidFiles.set(officeChildPidFile, officeChildProcessNames);
      }
    }
    const startedAt = Date.now();
    let finished = false;
    let timedOut = false;
    let timeoutId = null;
    const stdoutChunks = [];
    const stderrChunks = [];

    if (ps.stdout) {
      ps.stdout.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
    }
    if (ps.stderr) {
      ps.stderr.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));
    }

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        if (finished) return;
        timedOut = true;
        killProcessTreeByPid(ps.pid);
        if (trackAs === "office" && officeChildPidFile) {
          terminateOfficeProcessesFromPidFile(officeChildPidFile, officeChildProcessNames);
        }
      }, timeoutMs);
    }

    const cleanupTracking = () => {
      if (trackAs === "office" && pid > 0) {
        activeOfficePids.delete(pid);
      }
      if (trackAs === "office" && officeChildPidFile) {
        activeOfficeChildPidFiles.delete(officeChildPidFile);
      }
    };

    ps.on("error", (error) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (finished) return;
      finished = true;
      cleanupTracking();
      const wrapped = new Error(`PowerShell 启动失败: ${error.message}`);
      wrapped.code = "PS_LAUNCH_FAILED";
      wrapped.scriptName = scriptName;
      reject(wrapped);
    });

    ps.on("close", (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (finished) return;
      finished = true;
      cleanupTracking();

      const stdout = decodePowerShellBuffer(Buffer.concat(stdoutChunks)).trim();
      const stderr = decodePowerShellBuffer(Buffer.concat(stderrChunks)).trim();
      const durationMs = Date.now() - startedAt;

      if (timedOut) {
        if (trackAs === "office" && officeChildPidFile) {
          terminateOfficeProcessesFromPidFile(officeChildPidFile, officeChildProcessNames);
        }
        const timeoutError = new Error(`PowerShell 执行超时（>${timeoutMs}ms）`);
        timeoutError.code = "PS_TIMEOUT";
        timeoutError.scriptName = scriptName;
        timeoutError.timeoutMs = timeoutMs;
        timeoutError.durationMs = durationMs;
        timeoutError.stdout = stdout;
        timeoutError.stderr = stderr;
        reject(timeoutError);
        return;
      }

      if (code === 0) {
        resolve({
          stdout,
          stderr,
          durationMs,
          timeoutMs,
          exitCode: 0,
          scriptName
        });
        return;
      }

      const runtimeError = new Error(stderr || stdout || "PowerShell execution failed");
      runtimeError.code = "PS_NON_ZERO_EXIT";
      runtimeError.exitCode = code;
      runtimeError.scriptName = scriptName;
      runtimeError.durationMs = durationMs;
      runtimeError.stdout = stdout;
      runtimeError.stderr = stderr;
      reject(runtimeError);
    });
  });
}

async function runPowerShell(scriptName, args, options = {}) {
  await runPowerShellScript(scriptName, args, options);
}

async function runPowerShellWithOutput(scriptName, args, options = {}) {
  const result = await runPowerShellScript(scriptName, args, options);
  return result.stdout || "";
}

function normalizeLibreOfficeRuntimeMode(value, fallback = DEFAULT_LO_RUNTIME_MODE) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "embedded" || normalized === "system" || normalized === "auto") {
    return normalized;
  }
  return fallback;
}

function normalizeSofficeCandidatePath(rawPath) {
  if (!rawPath) return "";
  let candidate = String(rawPath || "").trim();
  if (!candidate) return "";
  candidate = candidate.replace(/^"(.+)"$/, "$1").trim();
  if (!candidate) return "";

  const expanded = candidate.replace(/%([^%]+)%/g, (_all, envName) => {
    const key = String(envName || "").trim();
    if (!key) return "";
    return process.env[key] || `%${key}%`;
  });
  const normalized = expanded.trim();
  if (!normalized) return "";
  const lower = normalized.toLowerCase();
  if (lower.endsWith("soffice.exe")) return normalized;

  try {
    if (fs.existsSync(normalized) && fs.statSync(normalized).isDirectory()) {
      const inProgram = path.join(normalized, "program", "soffice.exe");
      if (fs.existsSync(inProgram)) return inProgram;
      const direct = path.join(normalized, "soffice.exe");
      if (fs.existsSync(direct)) return direct;
    }
  } catch (error) {
    // Ignore fs probing errors.
  }
  return normalized;
}

function readRegistryDefaultValue(keyPath) {
  try {
    const result = spawnSync("reg", ["query", keyPath, "/ve"], {
      windowsHide: true,
      encoding: "utf8"
    });
    const stdout = String(result?.stdout || "");
    if (Number(result?.status) !== 0 || !stdout.trim()) return "";
    const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      const match = line.match(/REG_\w+\s+(.+)$/i);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  } catch (error) {
    // Ignore registry read errors.
  }
  return "";
}

function extractLibreOfficeVersion(rawText) {
  const text = String(rawText || "").trim();
  if (!text) return "";
  const patterns = [
    /\bLibreOffice(?:\s+\w+)?\s+(\d+\.\d+(?:\.\d+){0,3})\b/i,
    /\bVersion\s*[:=]?\s*(\d+\.\d+(?:\.\d+){0,3})\b/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return "";
}

function detectLibreOfficeVersionFromConfig(sofficePath) {
  if (!sofficePath) return "";
  const programDir = path.dirname(sofficePath);
  const versionFiles = [
    path.join(programDir, "bootstrap.ini"),
    path.join(programDir, "version.ini")
  ];
  for (const versionFile of versionFiles) {
    try {
      if (!fs.existsSync(versionFile)) continue;
      const content = fs.readFileSync(versionFile, "utf8");
      const productKeyMatch = content.match(
        /^\s*ProductKey\s*=\s*LibreOffice\s+(\d+\.\d+(?:\.\d+){0,3})\s*$/im
      );
      if (productKeyMatch && productKeyMatch[1]) {
        return productKeyMatch[1];
      }
      const versionKeyMatch = content.match(
        /^\s*(?:ProductVersion|Version|OOO_BASE_VERSION)\s*=\s*(\d+\.\d+(?:\.\d+){0,3})\s*$/im
      );
      if (versionKeyMatch && versionKeyMatch[1]) {
        return versionKeyMatch[1];
      }
    } catch (error) {
      // Ignore version parse errors.
    }
  }
  return "";
}

function detectLibreOfficeVersion(sofficePath, preferredVersion = "") {
  const fromPreferred = extractLibreOfficeVersion(preferredVersion);
  if (fromPreferred) return fromPreferred;
  return detectLibreOfficeVersionFromConfig(sofficePath);
}

function probeLibreOfficeBinary(sofficePath, options = {}) {
  const timeoutMs = Math.max(1000, parsePositiveInt(options.timeoutMs, DEFAULT_LO_RUNTIME_PROBE_TIMEOUT_MS));
  const startedAt = Date.now();
  if (!sofficePath) {
    return {
      ok: false,
      exitCode: -1,
      timedOut: false,
      durationMs: 0,
      version: "",
      reason: "missing_path"
    };
  }
  try {
    const programDir = path.dirname(sofficePath);
    const sofficeComPath = path.join(programDir, "soffice.com");
    const runProbeOnce = (binaryPath) => {
      const result = spawnSync(binaryPath, ["--headless", "--version"], {
        windowsHide: true,
        timeout: timeoutMs,
        env: createLibreOfficeSpawnEnv(sofficePath, options.env)
      });
      const stdout = decodePowerShellBuffer(Buffer.from(result?.stdout || Buffer.alloc(0))).trim();
      const stderr = decodePowerShellBuffer(Buffer.from(result?.stderr || Buffer.alloc(0))).trim();
      const exitCode = Number.isFinite(Number(result?.status)) ? Number(result.status) : -1;
      const timedOut = Boolean(result?.error?.code === "ETIMEDOUT");
      const durationMs = Date.now() - startedAt;
      const version = detectLibreOfficeVersion(sofficePath, `${stdout}\n${stderr}`);
      const binaryLabel = path.basename(binaryPath).toLowerCase();
      if (timedOut) {
        return {
          ok: false,
          exitCode,
          timedOut: true,
          durationMs,
          version,
          reason: `timeout:${binaryLabel}`
        };
      }
      if (result?.error) {
        return {
          ok: false,
          exitCode,
          timedOut: false,
          durationMs,
          version,
          reason: `spawn_error:${result.error.code || "unknown"}:${binaryLabel}`
        };
      }
      if (exitCode !== 0) {
        return {
          ok: false,
          exitCode,
          timedOut: false,
          durationMs,
          version,
          reason: `exit_${exitCode}:${binaryLabel}`
        };
      }
      return {
        ok: true,
        exitCode,
        timedOut: false,
        durationMs,
        version,
        reason: `ok:${binaryLabel}`
      };
    };

    const hasSofficeCom = fs.existsSync(sofficeComPath);
    const primaryBinaryPath = hasSofficeCom ? sofficeComPath : sofficePath;
    const primaryResult = runProbeOnce(primaryBinaryPath);
    if (primaryResult.ok || !hasSofficeCom) {
      return primaryResult;
    }

    const primaryReason = String(primaryResult.reason || "");
    const shouldFallbackToExe = !primaryResult.timedOut && !primaryReason.startsWith("spawn_error:");
    if (!shouldFallbackToExe) {
      return primaryResult;
    }

    const fallbackResult = runProbeOnce(sofficePath);
    if (fallbackResult.ok) {
      return {
        ...fallbackResult,
        reason: "ok:soffice.exe:fallback_from_com",
        fallbackFrom: "soffice.com",
        primaryReason
      };
    }
    return {
      ...fallbackResult,
      reason: `${String(fallbackResult.reason || "unknown")}:fallback_from_com:${primaryReason}`,
      fallbackFrom: "soffice.com",
      primaryReason
    };
  } catch (error) {
    return {
      ok: false,
      exitCode: -1,
      timedOut: false,
      durationMs: Date.now() - startedAt,
      version: "",
      reason: `probe_exception:${error?.code || error?.message || "unknown"}`
    };
  }
}

function resolveLibreOfficeRuntime(options = {}) {
  const mode = normalizeLibreOfficeRuntimeMode(
    options.runtimeMode,
    normalizeLibreOfficeRuntimeMode(process.env.SCENE_LO_RUNTIME_MODE, DEFAULT_LO_RUNTIME_MODE)
  );
  const refresh = Boolean(options.refresh);
  if (
    !refresh
    && cachedLibreOfficeRuntime
    && cachedLibreOfficeRuntime.mode === mode
    && (cachedLibreOfficeRuntime.platform || process.platform) === process.platform
  ) {
    return { ...cachedLibreOfficeRuntime };
  }

  const warnings = [];
  const checkedCandidates = [];
  const probeTimeoutMs = Math.max(
    1000,
    parsePositiveInt(options.probeTimeoutMs, DEFAULT_LO_RUNTIME_PROBE_TIMEOUT_MS)
  );

  if (process.platform === "darwin") {
    const resolved = detectDarwinLibreOfficeRuntime({
      runtimeMode: mode,
      probeTimeoutMs,
      env: options.env,
      libreOfficePath: options.libreOfficePath
    });
    cachedLibreOfficeRuntime = { ...resolved };
    return { ...resolved };
  }

  const seen = new Set();
  const candidates = [];
  const pushCandidate = (source, value) => {
    const candidate = normalizeSofficeCandidatePath(value);
    if (!candidate) return;
    const key = `${String(source || "").toLowerCase()}|${candidate.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ source, path: candidate });
  };

  const embeddedPath = path.join(process.resourcesPath || "", "libreoffice", "program", "soffice.exe");
  const localVendorPath = path.join(__dirname, "vendor", "libreoffice", "program", "soffice.exe");
  const envPath = process.env.LIBREOFFICE_PATH;
  if (mode === "embedded") {
    pushCandidate("embedded", embeddedPath);
    pushCandidate("local_vendor", localVendorPath);
    pushCandidate("env", envPath);
  } else if (mode === "system") {
    pushCandidate("env", envPath);
  } else {
    pushCandidate("embedded", embeddedPath);
    pushCandidate("local_vendor", localVendorPath);
    pushCandidate("env", envPath);
  }

  if (mode !== "embedded") {
    const appPathKeys = [
      "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\soffice.exe",
      "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\soffice.exe",
      "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\soffice.exe"
    ];
    appPathKeys.forEach((keyPath) => {
      const registryPath = readRegistryDefaultValue(keyPath);
      pushCandidate("registry", registryPath);
    });
    try {
      const whereResult = spawnSync("where", ["soffice.exe"], {
        windowsHide: true,
        encoding: "utf8"
      });
      if (Number(whereResult?.status) === 0) {
        const whereHits = String(whereResult?.stdout || "")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        whereHits.forEach((hit) => pushCandidate("path", hit));
      }
    } catch (error) {
      warnings.push("where_soffice_unavailable");
    }
    pushCandidate("program_files", "C:\\Program Files\\LibreOffice\\program\\soffice.exe");
    pushCandidate("program_files_x86", "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe");
  }

  for (const candidate of candidates) {
    const checked = {
      source: candidate.source,
      path: candidate.path,
      exists: false,
      isFile: false,
      probeOk: false,
      probeReason: "",
      version: ""
    };
    checkedCandidates.push(checked);
    try {
      if (!candidate.path || !fs.existsSync(candidate.path)) continue;
      checked.exists = true;
      const stats = fs.statSync(candidate.path);
      if (!stats.isFile()) continue;
      checked.isFile = true;
      const probe = probeLibreOfficeBinary(candidate.path, { timeoutMs: probeTimeoutMs });
      checked.probeOk = Boolean(probe.ok);
      checked.probeReason = String(probe.reason || "");
      checked.version = String(probe.version || "");
      if (!probe.ok) {
        warnings.push(`candidate_unusable:${candidate.source}:${probe.reason || "unknown"}`);
        continue;
      }
      const version = detectLibreOfficeVersion(candidate.path, probe.version);
      const resolved = {
        ok: true,
        mode,
        source: candidate.source || "",
        path: candidate.path,
        version: version || "",
        checkedAt: new Date().toISOString(),
        probeResult: "ok",
        probeDurationMs: Number(probe.durationMs) || 0,
        warnings,
        checkedCandidates
      };
      cachedLibreOfficeRuntime = { ...resolved };
      return resolved;
    } catch (error) {
      checked.probeReason = `exception:${error?.message || "unknown"}`;
      warnings.push(`candidate_probe_failed:${candidate.source}`);
    }
  }

  const missing = {
    ok: false,
    mode,
    source: "",
    path: "",
    version: "",
    checkedAt: new Date().toISOString(),
    probeResult: "missing",
    probeDurationMs: 0,
    warnings,
    checkedCandidates
  };
  cachedLibreOfficeRuntime = { ...missing };
  return missing;
}

function createLibreOfficeRuntimeActionText(runtime) {
  if (!runtime?.ok) return "";
  const versionLabel = runtime.version ? ` version=${runtime.version}` : "";
  const probeLabel = runtime.probeResult ? ` probe=${runtime.probeResult}` : "";
  return `Runtime: source=${runtime.source || "unknown"} path=${runtime.path}${versionLabel}${probeLabel}`;
}

function runNodeOfficeHealthFallback(runtime = {}) {
  const checks = [];
  const warnings = [];
  const suggestions = [];
  const actions = [];
  let score = 100;
  let blockExport = false;
  const addCheck = (name, ok, severity, detail, penalty = 0) => {
    checks.push({
      name,
      ok: Boolean(ok),
      severity,
      detail: String(detail || "")
    });
    if (!ok && penalty > 0) {
      score = Math.max(0, score - penalty);
    }
  };

  const tempDir = String(process.env.TEMP || process.env.TMP || process.env.TMPDIR || os.tmpdir() || "").trim();
  let tempWritable = false;
  let tempDetail = "";
  try {
    if (!tempDir) {
      throw new Error("TEMP is empty");
    }
    fs.mkdirSync(tempDir, { recursive: true });
    const probePath = path.join(tempDir, `scene-lo-probe-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`);
    fs.writeFileSync(probePath, "ok", { encoding: "utf8" });
    fs.rmSync(probePath, { force: true });
    tempWritable = true;
    tempDetail = tempDir;
  } catch (error) {
    tempWritable = false;
    tempDetail = `TEMP 不可写: ${error?.message || "unknown"}`;
  }
  addCheck("temp_dir_writable", tempWritable, "high", tempDetail, 35);
  if (!tempWritable) {
    blockExport = true;
    suggestions.push("请检查 TEMP 目录权限与磁盘可用空间。");
  }

  let userProfileOk = false;
  let userProfileDetail = "";
  const profileEnvName = process.platform === "win32" ? "USERPROFILE" : "HOME";
  try {
    const userProfile = String(process.env[profileEnvName] || "").trim();
    userProfileOk = Boolean(userProfile) && fs.existsSync(userProfile);
    userProfileDetail = userProfileOk ? userProfile : `${profileEnvName} 不可用`;
  } catch (error) {
    userProfileOk = false;
    userProfileDetail = `${profileEnvName} 不可用`;
  }
  addCheck(process.platform === "win32" ? "user_profile_path" : "home_path", userProfileOk, "medium", userProfileDetail, 20);
  if (!userProfileOk) {
    blockExport = true;
    suggestions.push(`请确认当前账户具备可访问的 ${profileEnvName} 目录。`);
  }

  let tempSpaceOk = true;
  let tempSpaceDetail = "";
  try {
    const fallbackTemp = tempDir || os.tmpdir();
    const diskRoot = path.parse(path.resolve(fallbackTemp)).root || fallbackTemp;
    const statFs = fs.statfsSync(diskRoot);
    const freeBytes = Number(statFs.bavail) * Number(statFs.bsize);
    const freeMb = Math.round(freeBytes / (1024 * 1024));
    tempSpaceOk = Number.isFinite(freeMb) && freeMb >= 1024;
    tempSpaceDetail = `TEMP 可用空间: ${Number.isFinite(freeMb) ? freeMb : 0}MB`;
  } catch (error) {
    tempSpaceOk = false;
    tempSpaceDetail = `TEMP 空间检测失败: ${error?.message || "unknown"}`;
  }
  addCheck("temp_disk_space", tempSpaceOk, "medium", tempSpaceDetail, 15);
  if (!tempSpaceOk) {
    warnings.push("TEMP 可用空间不足可能导致大文件导出失败。");
    suggestions.push("建议释放至少 2GB 临时磁盘空间后再导出。");
  }

  let loProcessCount = 0;
  try {
    if (process.platform === "win32") {
      const taskList = spawnSync(
        "tasklist",
        ["/FI", "IMAGENAME eq soffice*.exe", "/FO", "CSV", "/NH"],
        { windowsHide: true, encoding: "utf8" }
      );
      const stdout = String(taskList?.stdout || "").trim();
      if (stdout && !/^INFO:/i.test(stdout)) {
        loProcessCount = stdout.split(/\r?\n/).filter((line) => line.trim() && !/^INFO:/i.test(line)).length;
      }
    } else {
      const pgrep = spawnSync("pgrep", ["-f", "soffice|LibreOffice.app"], {
        encoding: "utf8"
      });
      const stdout = String(pgrep?.stdout || "").trim();
      if (stdout) {
        loProcessCount = stdout.split(/\r?\n/).filter((line) => line.trim()).length;
      }
    }
  } catch (error) {
    loProcessCount = 0;
  }
  const processOk = loProcessCount < 8;
  addCheck("libreoffice_process_pressure", processOk, "low", `运行中 LibreOffice 进程: ${loProcessCount}`, 5);
  if (!processOk) {
    warnings.push("LibreOffice 残留进程较多，建议先关闭后再导出。");
  }

  if (score < 40) {
    blockExport = true;
  }
  if (!blockExport) {
    actions.push("Node 兜底预检通过，可继续导出。");
  }
  if (runtime?.ok && runtime?.source && runtime.source !== "embedded" && runtime.source !== "local_vendor") {
    warnings.push(`当前运行时来自系统路径（source=${runtime.source}）。`);
  }

  return {
    score,
    blockExport,
    checks,
    warnings,
    suggestions,
    actions
  };
}

async function runLibreOfficeHealthCheck(options = {}) {
  const timeoutMs = parsePositiveInt(options.timeoutMs, 20000);
  const runtime = resolveLibreOfficeRuntime({
    runtimeMode: options.runtimeMode,
    refresh: options.refreshRuntime
  });
  let payload = {};
  const warnings = [];
  const checks = [];
  const suggestions = [];
  const actions = [];
  let score = 100;
  let blockExport = false;
  let scriptError = "";

  if (process.platform === "win32") {
    try {
      const stdout = await runPowerShellWithOutput("libreoffice-health-check.ps1", [], { timeoutMs });
      const parsed = parsePowerShellJsonOutput(stdout, "LibreOffice 预检输出解析失败");
      payload = parsed && typeof parsed === "object" ? parsed : {};
      score = Number.isFinite(Number(payload.score)) ? Math.max(0, Math.min(100, Math.floor(Number(payload.score)))) : 100;
      blockExport = Boolean(payload.blockExport);
      if (Array.isArray(payload.checks)) checks.push(...payload.checks);
      if (Array.isArray(payload.warnings)) warnings.push(...payload.warnings);
      if (Array.isArray(payload.suggestions)) suggestions.push(...payload.suggestions);
      if (Array.isArray(payload.actions)) actions.push(...payload.actions);
    } catch (error) {
      const serialized = serializeError(error);
      scriptError = String(serialized.message || "unknown");
      checks.push({
        name: "health_script",
        ok: false,
        severity: "medium",
        detail: `预检脚本执行失败: ${scriptError}`
      });
      warnings.push(`预检脚本执行失败: ${scriptError}`);
      actions.push("预检脚本失败，切换 Node 兜底预检。");
      const fallback = runNodeOfficeHealthFallback(runtime);
      score = Number(fallback.score) || 0;
      blockExport = Boolean(fallback.blockExport);
      checks.push(...(Array.isArray(fallback.checks) ? fallback.checks : []));
      warnings.push(...(Array.isArray(fallback.warnings) ? fallback.warnings : []));
      suggestions.push(...(Array.isArray(fallback.suggestions) ? fallback.suggestions : []));
      actions.push(...(Array.isArray(fallback.actions) ? fallback.actions : []));
      payload = {
        fallbackSource: "node",
        fallback
      };
    }
  } else {
    actions.push("非 Windows 平台跳过 PowerShell 预检，切换 Node 兜底预检。");
    const fallback = runNodeOfficeHealthFallback(runtime);
    score = Number(fallback.score) || 0;
    blockExport = Boolean(fallback.blockExport);
    checks.push(...(Array.isArray(fallback.checks) ? fallback.checks : []));
    warnings.push(...(Array.isArray(fallback.warnings) ? fallback.warnings : []));
    suggestions.push(...(Array.isArray(fallback.suggestions) ? fallback.suggestions : []));
    actions.push(...(Array.isArray(fallback.actions) ? fallback.actions : []));
    payload = {
      fallbackSource: "node",
      fallback
    };
  }

  const runtimeVersionText = runtime.version ? ` version=${runtime.version}` : "";
  const runtimeProbeText = runtime.probeResult ? ` probe=${runtime.probeResult}` : "";
  checks.unshift({
    name: "libreoffice_runtime",
    ok: Boolean(runtime.ok),
    severity: "high",
    detail: runtime.ok
      ? `source=${runtime.source || "unknown"} path=${runtime.path}${runtimeVersionText}${runtimeProbeText}`
      : `mode=${runtime.mode || "auto"} 未找到可用 soffice.exe`
  });

  if (runtime.ok) {
    actions.unshift(createLibreOfficeRuntimeActionText(runtime));
    if (runtime.source !== "embedded" && runtime.source !== "local_vendor") {
      warnings.push(`内置运行时不可用，当前回退到系统路径（source=${runtime.source || "unknown"}）。`);
      suggestions.push("若系统 LibreOffice 被卸载，建议重装 Full 安装包恢复内置运行时。");
    }
  } else {
    blockExport = true;
    score = Math.max(0, score - 40);
    const hasDllCrash = (runtime.checkedCandidates || []).some((candidate) =>
      String(candidate?.probeReason || "").includes("exit_3221225781")
    );
    if (hasDllCrash) {
      suggestions.splice(0, suggestions.length);
      suggestions.push("系统缺少 VC++ 运行时（错误码 0xC0000135），LibreOffice 无法启动。");
      suggestions.push("请下载安装 VC++ Redistributable: https://aka.ms/vs/17/release/vc_redist.x64.exe");
      suggestions.push("安装完成后点击“重新检测”。");
    } else {
      suggestions.unshift("优先处理：重新安装本软件 Full 安装包（可能是被系统安全软件拦截）");
      suggestions.push("备用方案：安装系统 LibreOffice，并保持默认安装目录（请勿修改安装路径）。");
      suggestions.push("下载地址：https://www.libreoffice.org/download/download-libreoffice/");
    }
  }
  runtime.warnings.forEach((warning) => warnings.push(String(warning)));

  if (score < 40) {
    blockExport = true;
  }

  const dedupeTextList = (list) => {
    const seen = new Set();
    const out = [];
    (list || []).forEach((item) => {
      const text = String(item || "").trim();
      if (!text) return;
      const key = text.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(text);
    });
    return out;
  };

  const normalized = {
    ok: !blockExport,
    blockExport,
    score,
    checks,
    suggestions: dedupeTextList(suggestions),
    warnings: dedupeTextList(warnings),
    actions: dedupeTextList(actions),
    runtime,
    raw: {
      ...payload,
      runtime,
      scriptError
    }
  };
  return normalized;
}

function normalizeRequiredOfficeApps(requiredApps = []) {
  const out = [];
  const seen = new Set();
  const source = Array.isArray(requiredApps)
    ? requiredApps
    : String(requiredApps || "").split(",");
  source.forEach((item) => {
    const normalized = String(item || "").trim().toLowerCase();
    const appName = normalized === "ppt" || normalized === "powerpoint" ? "powerpoint"
      : normalized === "doc" || normalized === "word" ? "word"
        : "";
    if (!appName || seen.has(appName)) return;
    seen.add(appName);
    out.push(appName);
  });
  return out;
}

async function runMicrosoftOfficeHealthCheck(options = {}) {
  const timeoutMs = parsePositiveInt(options.timeoutMs, 20000);
  const requiredApps = normalizeRequiredOfficeApps(options.requiredApps);
  const args = [
    "-RequiredApps",
    requiredApps.join(",")
  ];
  if (options.light) {
    args.push("-Light");
  }

  try {
    const stdout = await runPowerShellWithOutput("office-health-check.ps1", args, {
      timeoutMs,
      useLibreOfficeEnv: false
    });
    const parsed = parsePowerShellJsonOutput(stdout, "Microsoft Office 预检输出解析失败");
    const payload = parsed && typeof parsed === "object" ? parsed : {};
    const apps = payload.apps && typeof payload.apps === "object" ? payload.apps : {};
    const checks = Array.isArray(payload.checks) ? payload.checks : [];
    const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
    const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions : [];
    const actions = Array.isArray(payload.actions) ? payload.actions : [];
    let blockExport = Boolean(payload.blockExport);
    for (const appName of requiredApps) {
      if (!apps?.[appName]?.ok) {
        blockExport = true;
      }
    }
    const score = Number.isFinite(Number(payload.score))
      ? Math.max(0, Math.min(100, Math.floor(Number(payload.score))))
      : (blockExport ? 0 : 100);
    return {
      ok: !blockExport,
      engine: EXPORT_ENGINE_OFFICE,
      blockExport,
      score,
      requiredApps,
      apps,
      checks,
      warnings,
      suggestions,
      actions,
      raw: payload
    };
  } catch (error) {
    const serialized = serializeError(error);
    const checks = [{
      name: "office_health_script",
      ok: false,
      severity: "high",
      detail: serialized.message || "Microsoft Office 预检脚本执行失败"
    }];
    return {
      ok: false,
      engine: EXPORT_ENGINE_OFFICE,
      blockExport: requiredApps.length > 0,
      score: 0,
      requiredApps,
      apps: {},
      checks,
      warnings: [serialized.message || "Microsoft Office 预检脚本执行失败"],
      suggestions: ["请确认本机已安装 Microsoft Office，并至少手动打开 Word/PowerPoint 完成首次初始化。"],
      actions: [],
      raw: {
        scriptError: serialized
      }
    };
  }
}

async function runExportEngineHealthCheck(options = {}) {
  const engine = normalizeExportEngine(options.engine);
  if (engine === EXPORT_ENGINE_OFFICE) {
    return runMicrosoftOfficeHealthCheck(options);
  }
  const report = await runLibreOfficeHealthCheck(options);
  return {
    ...report,
    engine: EXPORT_ENGINE_LIBREOFFICE
  };
}

async function runOfficeHealthCheck(options = {}) {
  return runLibreOfficeHealthCheck(options);
}

async function runOfficeHealthFix(options = {}) {
  const mode = String(options.mode || "safe").trim() || "safe";
  return {
    ok: true,
    mode,
    actions: ["office:healthFix 兼容壳已执行（LibreOffice 模式无需 COM 治理）"],
    warnings: [],
    message: "LibreOffice 模式下无需执行 Office 治理",
    raw: {
      mode,
      compatibility: true
    }
  };
}

function getLibreOfficePath(options = {}) {
  const runtime = resolveLibreOfficeRuntime(options);
  return runtime.ok ? runtime.path : "";
}

function toFileUri(targetPath) {
  return pathToFileURL(path.resolve(targetPath)).href;
}

function calcLoTimeout(inputPath, baseTimeoutMs = DEFAULT_OFFICE_TIMEOUT_MS) {
  const safeBase = Math.max(15000, Number(baseTimeoutMs) || DEFAULT_OFFICE_TIMEOUT_MS);
  let sizeMb = 0;
  try {
    sizeMb = Math.max(0, fs.statSync(inputPath).size / (1024 * 1024));
  } catch (error) {
    sizeMb = 0;
  }
  const dynamicTimeoutMs = safeBase + Math.round(sizeMb * 800);
  return Math.min(12 * 60 * 1000, Math.max(safeBase, dynamicTimeoutMs));
}

function isLikelyProfileLock(rawMessage) {
  const text = String(rawMessage || "").toLowerCase();
  if (!text) return false;
  return (
    text.includes("user installation could not be completed")
    || text.includes("cannot create folder")
    || text.includes("locked")
    || text.includes("in use")
    || text.includes("another process")
  );
}

function resolveLibreOfficePdfFilter(inputPath, options = {}) {
  const ext = String(options.inputExt || path.extname(inputPath) || "").trim().toLowerCase();
  if (ext === ".doc" || ext === ".docx" || ext === ".odt") {
    return "pdf:writer_pdf_Export";
  }
  if (ext === ".ppt" || ext === ".pptx" || ext === ".odp") {
    return "pdf:impress_pdf_Export";
  }
  return "pdf";
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findLibreOfficeOutputPdf(taskOutDir, inputPath) {
  const inputBaseName = path.basename(inputPath, path.extname(inputPath));
  const expectedPdfPath = path.join(taskOutDir, `${inputBaseName}.pdf`);
  if (fs.existsSync(expectedPdfPath)) {
    return expectedPdfPath;
  }
  try {
    const files = await fs.promises.readdir(taskOutDir);
    const pdfCandidates = files
      .filter((name) => path.extname(name).toLowerCase() === ".pdf")
      .sort((left, right) => left.localeCompare(right));
    if (pdfCandidates.length > 0) {
      return path.join(taskOutDir, pdfCandidates[0]);
    }
  } catch (error) {
    return "";
  }
  return "";
}

async function waitForLibreOfficeOutputPdf(taskOutDir, inputPath, waitMs, pollMs) {
  const firstHit = await findLibreOfficeOutputPdf(taskOutDir, inputPath);
  if (firstHit) return firstHit;
  const timeoutMs = Math.max(0, Number(waitMs) || 0);
  if (timeoutMs <= 0) return "";
  const intervalMs = Math.max(50, Number(pollMs) || DEFAULT_LO_OUTPUT_POLL_MS);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remainMs = deadline - Date.now();
    await sleepMs(Math.min(intervalMs, Math.max(20, remainMs)));
    const hit = await findLibreOfficeOutputPdf(taskOutDir, inputPath);
    if (hit) return hit;
  }
  return "";
}

function resolveLibreOfficeLaunchBinary(sofficePath, options = {}) {
  const normalizedSofficePath = normalizeSofficeCandidatePath(sofficePath);
  const preferSofficeCom = options.preferSofficeCom !== false;
  const forceSofficeExe = Boolean(options.forceSofficeExe);
  if (!normalizedSofficePath) {
    return {
      launchPath: "",
      launchBinary: "",
      usedSofficeCom: false
    };
  }
  const programDir = path.dirname(normalizedSofficePath);
  const sofficeComPath = path.join(programDir, "soffice.com");
  const hasSofficeCom = fs.existsSync(sofficeComPath);
  if (!forceSofficeExe && preferSofficeCom && hasSofficeCom) {
    return {
      launchPath: sofficeComPath,
      launchBinary: "soffice.com",
      usedSofficeCom: true
    };
  }
  return {
    launchPath: normalizedSofficePath,
    launchBinary: path.basename(normalizedSofficePath) || "soffice",
    usedSofficeCom: false
  };
}

async function runLibreOfficeToPdfOnce(inputPath, outDir, options = {}) {
  const runtime = resolveLibreOfficeRuntime({
    runtimeMode: options.runtimeMode,
    refresh: options.refreshRuntime
  });
  const sofficePath = runtime.ok ? runtime.path : "";
  if (!sofficePath) {
    const missingError = new Error("未找到可用 LibreOffice 运行时");
    missingError.code = "LO_MISSING_BINARY";
    missingError.runtimeMode = runtime.mode || "";
    missingError.runtimeSource = runtime.source || "";
    missingError.runtimePath = runtime.path || "";
    missingError.checkedCandidates = runtime.checkedCandidates || [];
    throw missingError;
  }

  const timeoutMs = parsePositiveInt(
    options.timeoutMs,
    calcLoTimeout(inputPath, parsePositiveInt(process.env.SCENE_OFFICE_TIMEOUT_MS, DEFAULT_OFFICE_TIMEOUT_MS))
  );
  const profileDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "scene-lo-profile-"));
  await fs.promises.mkdir(outDir, { recursive: true });
  const taskOutDir = await fs.promises.mkdtemp(path.join(outDir, "lo-out-"));
  const spawnEnv = createLibreOfficeSpawnEnv(sofficePath, options.env);
  const convertFilter = resolveLibreOfficePdfFilter(inputPath, options);
  const launchPlan = resolveLibreOfficeLaunchBinary(sofficePath, options);
  const launchPath = launchPlan.launchPath || sofficePath;
  const outputWaitMs = parsePositiveInt(
    options.outputWaitMs,
    parsePositiveInt(process.env.SCENE_LO_OUTPUT_WAIT_MS, DEFAULT_LO_OUTPUT_WAIT_MS)
  );
  const outputPollMs = parsePositiveInt(
    options.outputPollMs,
    parsePositiveInt(process.env.SCENE_LO_OUTPUT_POLL_MS, DEFAULT_LO_OUTPUT_POLL_MS)
  );
  const args = [
    "--headless",
    "--nologo",
    "--nodefault",
    "--nofirststartwizard",
    "--nolockcheck",
    "--invisible",
    `-env:UserInstallation=${toFileUri(profileDir)}`,
    "--convert-to",
    convertFilter,
    "--outdir",
    taskOutDir,
    inputPath
  ];

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const loProcess = spawn(launchPath, args, {
      windowsHide: true,
      env: spawnEnv
    });
    const pid = Number(loProcess?.pid) || 0;
    if (pid > 0) activeLibreOfficePids.add(pid);

    let timedOut = false;
    let finished = false;
    let timeoutId = null;
    const stdoutChunks = [];
    const stderrChunks = [];

    if (loProcess.stdout) {
      loProcess.stdout.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
    }
    if (loProcess.stderr) {
      loProcess.stderr.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));
    }

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        if (finished) return;
        timedOut = true;
        killProcessTreeByPid(loProcess.pid);
      }, timeoutMs);
    }

    const cleanup = async () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (pid > 0) activeLibreOfficePids.delete(pid);
      try {
        await fs.promises.rm(profileDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors.
      }
    };
    const cleanupTaskOutDir = async () => {
      try {
        await fs.promises.rm(taskOutDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors.
      }
    };

    loProcess.on("error", async (error) => {
      if (finished) return;
      finished = true;
      await cleanup();
      await cleanupTaskOutDir();
      const wrapped = new Error(`LibreOffice 启动失败: ${error.message}`);
      wrapped.code = "LO_BINARY_UNEXECUTABLE";
      wrapped.runtimeSource = runtime.source || "";
      wrapped.runtimePath = sofficePath;
      wrapped.runtimeLaunchPath = launchPath;
      wrapped.launchedBinaryName = launchPlan.launchBinary;
      wrapped.usedSofficeCom = launchPlan.usedSofficeCom;
      wrapped.convertFilter = convertFilter;
      reject(wrapped);
    });

    loProcess.on("close", async (code) => {
      if (finished) return;
      finished = true;
      const durationMs = Date.now() - startedAt;
      const stdout = decodePowerShellBuffer(Buffer.concat(stdoutChunks)).trim();
      const stderr = decodePowerShellBuffer(Buffer.concat(stderrChunks)).trim();
      await cleanup();

      if (timedOut) {
        await cleanupTaskOutDir();
        const timeoutError = new Error(`LibreOffice 执行超时（>${timeoutMs}ms）`);
        timeoutError.code = "LO_TIMEOUT";
        timeoutError.timeoutMs = timeoutMs;
        timeoutError.durationMs = durationMs;
        timeoutError.runtimeSource = runtime.source || "";
        timeoutError.runtimePath = sofficePath;
        timeoutError.runtimeLaunchPath = launchPath;
        timeoutError.launchedBinaryName = launchPlan.launchBinary;
        timeoutError.usedSofficeCom = launchPlan.usedSofficeCom;
        timeoutError.convertFilter = convertFilter;
        timeoutError.stdout = stdout;
        timeoutError.stderr = stderr;
        reject(timeoutError);
        return;
      }

      if (code !== 0) {
        const rawMessage = stderr || stdout || `LibreOffice 非零退出: ${code}`;
        await cleanupTaskOutDir();
        const runtimeError = new Error(rawMessage);
        runtimeError.code = isLikelyProfileLock(rawMessage) ? "LO_PROFILE_LOCK" : "LO_NON_ZERO_EXIT";
        runtimeError.exitCode = code;
        runtimeError.durationMs = durationMs;
        runtimeError.runtimeSource = runtime.source || "";
        runtimeError.runtimePath = sofficePath;
        runtimeError.runtimeLaunchPath = launchPath;
        runtimeError.launchedBinaryName = launchPlan.launchBinary;
        runtimeError.usedSofficeCom = launchPlan.usedSofficeCom;
        runtimeError.convertFilter = convertFilter;
        runtimeError.stdout = stdout;
        runtimeError.stderr = stderr;
        reject(runtimeError);
        return;
      }

      const outputPdfPath = await waitForLibreOfficeOutputPdf(
        taskOutDir,
        inputPath,
        outputWaitMs,
        outputPollMs
      );

      if (!outputPdfPath || !fs.existsSync(outputPdfPath)) {
        await cleanupTaskOutDir();
        const outputError = new Error("LibreOffice 未生成 PDF 输出");
        outputError.code = "LO_OUTPUT_MISSING";
        outputError.durationMs = durationMs;
        outputError.runtimeSource = runtime.source || "";
        outputError.runtimePath = sofficePath;
        outputError.runtimeLaunchPath = launchPath;
        outputError.launchedBinaryName = launchPlan.launchBinary;
        outputError.usedSofficeCom = launchPlan.usedSofficeCom;
        outputError.outputWaitMs = outputWaitMs;
        outputError.outputPollMs = outputPollMs;
        outputError.convertFilter = convertFilter;
        outputError.stdout = stdout;
        outputError.stderr = stderr;
        reject(outputError);
        return;
      }

      resolve({
        ok: true,
        pdfPath: outputPdfPath,
        outDir: taskOutDir,
        durationMs,
        timeoutMs,
        runtimeSource: runtime.source || "",
        runtimePath: sofficePath,
        runtimeLaunchPath: launchPath,
        launchedBinaryName: launchPlan.launchBinary,
        usedSofficeCom: launchPlan.usedSofficeCom,
        runtimeVersion: runtime.version || "",
        convertFilter,
        openMode: "libreoffice",
        repaired: false,
        fallbackReason: "",
        envWarning: ""
      });
    });
  });
}

async function runLibreOfficeToPdf(inputPath, outDir, options = {}) {
  try {
    return await runLibreOfficeToPdfOnce(inputPath, outDir, options);
  } catch (error) {
    const runtimeMode = normalizeLibreOfficeRuntimeMode(
      options.runtimeMode,
      normalizeLibreOfficeRuntimeMode(process.env.SCENE_LO_RUNTIME_MODE, DEFAULT_LO_RUNTIME_MODE)
    );
    const errorCode = normalizeOfficeErrorCode(error?.code || error?.errorCode);
    const launchedBinaryName = String(error?.launchedBinaryName || "").toLowerCase();
    const shouldRetryOutputMissing = !options._outputMissingRetried && errorCode === "LO_OUTPUT_MISSING";
    if (shouldRetryOutputMissing) {
      logToRenderer(
        2,
        `LibreOffice 输出确认重试: code=${errorCode}，等待后重试 1 次`
      );
      try {
        const result = await runLibreOfficeToPdfOnce(inputPath, outDir, {
          ...options,
          refreshRuntime: runtimeMode === "auto",
          _outputMissingRetried: true
        });
        result.outputMissingRetried = true;
        return result;
      } catch (retryError) {
        retryError.previousErrorCode = errorCode;
        retryError.outputMissingRetried = true;
        throw retryError;
      }
    }
    const shouldFallbackToExe = !options._forcedSofficeExe
      && errorCode === "LO_BINARY_UNEXECUTABLE"
      && launchedBinaryName === "soffice.com";
    if (shouldFallbackToExe) {
      logToRenderer(2, "LibreOffice soffice.com 不可用，回退到 soffice.exe 重试 1 次");
      try {
        const result = await runLibreOfficeToPdfOnce(inputPath, outDir, {
          ...options,
          forceSofficeExe: true,
          _forcedSofficeExe: true
        });
        result.exeFallback = true;
        return result;
      } catch (retryError) {
        retryError.previousErrorCode = errorCode;
        retryError.exeFallback = true;
        throw retryError;
      }
    }
    const shouldRetryWithRefresh = runtimeMode === "auto"
      && !options._runtimeRefreshed
      && (errorCode === "LO_BINARY_UNEXECUTABLE" || errorCode === "LO_NON_ZERO_EXIT");
    if (!shouldRetryWithRefresh) {
      throw error;
    }
    logToRenderer(
      2,
      `LibreOffice 运行时重试: code=${errorCode || "unknown"}，刷新候选后重试 1 次`
    );
    try {
      const result = await runLibreOfficeToPdfOnce(inputPath, outDir, {
        ...options,
        refreshRuntime: true,
        _runtimeRefreshed: true
      });
      result.runtimeRefreshed = true;
      result.runtimeRetryReason = errorCode || "";
      return result;
    } catch (retryError) {
      retryError.previousErrorCode = errorCode || "";
      retryError.runtimeRefreshed = true;
      throw retryError;
    }
  }
}

async function ensurePdfium() {
  if (!pdfiumInitPromise) {
    pdfiumInitPromise = (async () => {
      if (!PDFiumLibrary) {
        ({ PDFiumLibrary } = require("@hyzyla/pdfium"));
      }
      if (!sharp) {
        sharp = require("sharp");
      }
      return PDFiumLibrary.init();
    })();
  }
  return pdfiumInitPromise;
}

function getOutputFilePath(
  outputDir,
  baseName,
  extName,
  pageNumber,
  useSubfolder = true,
  namePrefix = null
) {
  if (namePrefix) {
    return path.join(outputDir, `${namePrefix}-${pageNumber}.png`);
  }
  const extSuffix = extName.replace(".", "");
  const primaryName = useSubfolder
    ? `${baseName}-${pageNumber}.png`
    : `${baseName}-${extSuffix}-${pageNumber}.png`;
  let candidate = path.join(outputDir, primaryName);
  if (!fs.existsSync(candidate)) return candidate;

  if (useSubfolder) {
    candidate = path.join(outputDir, `${baseName}-${extSuffix}-${pageNumber}.png`);
    if (!fs.existsSync(candidate)) return candidate;
  }

  for (let i = 1; i <= 999; i += 1) {
    const withIndex = path.join(outputDir, `${baseName}-${extSuffix}-${pageNumber}-${i}.png`);
    if (!fs.existsSync(withIndex)) return withIndex;
  }
  return path.join(outputDir, `${baseName}-${extSuffix}-${pageNumber}-${Date.now()}.png`);
}

function getReservedPrefixSet(reservations, outputDir) {
  if (!reservations || typeof reservations !== "object" || typeof reservations.get !== "function") {
    return null;
  }
  const dirKey = path.normalize(path.resolve(outputDir)).toLowerCase();
  if (!reservations.has(dirKey)) {
    reservations.set(dirKey, new Set());
  }
  return reservations.get(dirKey);
}

function reservePrefix(reservedSet, prefix) {
  if (!reservedSet || !(reservedSet instanceof Set)) return;
  const normalized = String(prefix || "").trim().toLowerCase();
  if (!normalized) return;
  reservedSet.add(normalized);
}

async function resolveOutputNamePrefix(outputDir, baseName, extName, useSubfolder = true, reservations = null) {
  const extSuffix = extName.replace(".", "");
  const reservedSet = getReservedPrefixSet(reservations, outputDir);
  let existing = [];
  try {
    existing = await fs.promises.readdir(outputDir);
  } catch (error) {
    existing = [];
  }
  const hasPrefix = (prefix) => {
    const normalizedPrefix = String(prefix || "").trim().toLowerCase();
    if (!normalizedPrefix) return false;
    if (reservedSet && reservedSet.has(normalizedPrefix)) return true;
    return existing.some((name) => {
      const normalizedName = String(name || "").toLowerCase();
      return normalizedName.startsWith(`${normalizedPrefix}-`) && normalizedName.endsWith(".png");
    });
  };

  if (useSubfolder) {
    if (!hasPrefix(baseName)) {
      reservePrefix(reservedSet, baseName);
      return baseName;
    }
    const alt = `${baseName}-${extSuffix}`;
    if (!hasPrefix(alt)) {
      reservePrefix(reservedSet, alt);
      return alt;
    }
  } else {
    const base = `${baseName}-${extSuffix}`;
    if (!hasPrefix(base)) {
      reservePrefix(reservedSet, base);
      return base;
    }
  }

  for (let i = 1; i <= 999; i += 1) {
    const candidate = `${baseName}-${extSuffix}-${i}`;
    if (!hasPrefix(candidate)) {
      reservePrefix(reservedSet, candidate);
      return candidate;
    }
  }
  const fallback = `${baseName}-${extSuffix}-${Date.now()}`;
  reservePrefix(reservedSet, fallback);
  return fallback;
}

function getOutputDirForItem(outputRoot, item) {
  const baseDir = path.join(outputRoot, item.relativeDir || "");
  const baseName = item.baseName;
  let candidate = path.join(baseDir, baseName);
  if (!fs.existsSync(candidate)) return candidate;

  const extSuffix = item.ext.replace(".", "");
  candidate = path.join(baseDir, `${baseName}-${extSuffix}`);
  if (!fs.existsSync(candidate)) return candidate;

  for (let i = 1; i <= 999; i += 1) {
    const withIndex = path.join(baseDir, `${baseName}-${extSuffix}-${i}`);
    if (!fs.existsSync(withIndex)) return withIndex;
  }
  return path.join(baseDir, `${baseName}-${extSuffix}-${Date.now()}`);
}

function isAsciiPath(value) {
  return /^[\x00-\x7F]+$/.test(value);
}

async function ensureSafeInputPath(sourcePath, tempDir, ext) {
  if (isAsciiPath(sourcePath)) {
    return { path: sourcePath, cleanup: null };
  }
  await fs.promises.mkdir(tempDir, { recursive: true });
  const safePath = path.join(tempDir, `source${ext}`);
  await fs.promises.copyFile(sourcePath, safePath);
  return {
    path: safePath,
    cleanup: async () => {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  };
}

function getTargetShortSide(scale) {
  const key = Number(scale);
  if (key >= 3) return 4800;
  if (key >= 2) return 4000;
  if (key >= 1.5) return 3300;
  return 2500;
}

function getMachineTier() {
  const cpuCount = Array.isArray(os.cpus()) ? os.cpus().length : 1;
  const freeMemMB = os.freemem() / (1024 * 1024);
  if (cpuCount >= 12 && freeMemMB >= 16000) return "ultra";
  if (cpuCount >= 8 && freeMemMB >= 8000) return "high";
  if (cpuCount >= 5 && freeMemMB >= 3000) return "mid";
  return "low";
}

function getMaxConcurrency(tier = getMachineTier()) {
  if (!LO_PERF_TUNING_ENABLED) {
    const cpuCount = Array.isArray(os.cpus()) ? os.cpus().length : 1;
    const freeMemMB = os.freemem() / (1024 * 1024);
    if (cpuCount <= 2 || freeMemMB < 500) {
      return { pageConcurrency: 1, fileConcurrency: 1 };
    }
    return { pageConcurrency: 2, fileConcurrency: 2 };
  }
  if (tier === "ultra") return { pageConcurrency: 6, fileConcurrency: 3 };
  if (tier === "high") return { pageConcurrency: 4, fileConcurrency: 2 };
  if (tier === "mid") return { pageConcurrency: 2, fileConcurrency: 1 };
  return { pageConcurrency: 1, fileConcurrency: 1 };
}

function getSmallQueueConcurrencyCap(tier = getMachineTier()) {
  if (!LO_PERF_TUNING_ENABLED) {
    const cpuCount = Array.isArray(os.cpus()) ? os.cpus().length : 1;
    const freeMemMB = os.freemem() / (1024 * 1024);
    if (cpuCount <= 2 || freeMemMB < 2000) {
      return 1;
    }
    if (cpuCount <= 4 || freeMemMB < 4000) {
      return 2;
    }
    return 3;
  }
  if (tier === "ultra") return 4;
  if (tier === "high") return 3;
  if (tier === "mid") return 2;
  return 1;
}

function getPptOfficeConcurrency(tier = getMachineTier()) {
  if (tier === "low") return DEFAULT_PPT_DEGRADED_CONCURRENCY;
  if (tier === "ultra") return 3;
  return DEFAULT_PPT_OFFICE_CONCURRENCY;
}

function getPptMachinePolicyBaseline(tier = getMachineTier()) {
  if (!LO_PERF_TUNING_ENABLED) {
    const cpuCount = Array.isArray(os.cpus()) ? os.cpus().length : 1;
    const freeMemMB = os.freemem() / (1024 * 1024);
    if (cpuCount <= 2 || freeMemMB < 1500) {
      return {
        tier: "low",
        officeConcurrency: 1,
        perFileTimeoutMs: DEFAULT_PPT_PER_FILE_TIMEOUT_MS,
        batchComRestartSize: 3,
        largeFileThresholdMb: DEFAULT_LO_LARGE_FILE_THRESHOLD_MB,
        degradeFailStreak: DEFAULT_PPT_DEGRADE_FAIL_STREAK,
        recoverSuccessWindow: DEFAULT_PPT_RECOVER_SUCCESS_WINDOW
      };
    }
    if (cpuCount <= 4 || freeMemMB < 3000) {
      return {
        tier: "mid",
        officeConcurrency: DEFAULT_PPT_OFFICE_CONCURRENCY,
        perFileTimeoutMs: DEFAULT_PPT_PER_FILE_TIMEOUT_MS,
        batchComRestartSize: DEFAULT_PPT_BATCH_COM_RESTART_SIZE,
        largeFileThresholdMb: DEFAULT_LO_LARGE_FILE_THRESHOLD_MB,
        degradeFailStreak: DEFAULT_PPT_DEGRADE_FAIL_STREAK,
        recoverSuccessWindow: DEFAULT_PPT_RECOVER_SUCCESS_WINDOW
      };
    }
    return {
      tier: "high",
      officeConcurrency: DEFAULT_PPT_OFFICE_CONCURRENCY,
      perFileTimeoutMs: DEFAULT_PPT_PER_FILE_TIMEOUT_MS,
      batchComRestartSize: DEFAULT_PPT_BATCH_COM_RESTART_SIZE,
      largeFileThresholdMb: DEFAULT_LO_LARGE_FILE_THRESHOLD_MB,
      degradeFailStreak: DEFAULT_PPT_DEGRADE_FAIL_STREAK,
      recoverSuccessWindow: DEFAULT_PPT_RECOVER_SUCCESS_WINDOW
    };
  }
  if (tier === "ultra") {
    return {
      tier: "ultra",
      officeConcurrency: 3,
      perFileTimeoutMs: 180000,
      batchComRestartSize: 10,
      largeFileThresholdMb: 120,
      degradeFailStreak: 3,
      recoverSuccessWindow: 10
    };
  }
  if (tier === "high") {
    return {
      tier: "high",
      officeConcurrency: 2,
      perFileTimeoutMs: 180000,
      batchComRestartSize: 8,
      largeFileThresholdMb: 100,
      degradeFailStreak: 3,
      recoverSuccessWindow: 8
    };
  }
  if (tier === "mid") {
    return {
      tier: "mid",
      officeConcurrency: 2,
      perFileTimeoutMs: 180000,
      batchComRestartSize: 5,
      largeFileThresholdMb: 80,
      degradeFailStreak: 2,
      recoverSuccessWindow: 6
    };
  }
  return {
    tier: "low",
    officeConcurrency: 1,
    perFileTimeoutMs: 120000,
    batchComRestartSize: 3,
    largeFileThresholdMb: 60,
    degradeFailStreak: 1,
    recoverSuccessWindow: 4
  };
}

function isRolloutEnabled(seed, percent) {
  const targetPercent = clampPercent(percent, DEFAULT_PPT_ROLLOUT_PERCENT);
  if (targetPercent >= 100) return true;
  if (targetPercent <= 0) return false;
  return computeRolloutBucket(seed) < targetPercent;
}

function resolvePptPolicy(payload = {}, context = {}) {
  const machineBaseline = context.machineBaseline || getPptMachinePolicyBaseline();
  const rolloutSeed = String(context.rolloutSeed || payload?.rolloutSeed || generateDeviceId() || "scene-ppt");
  const explicitIsolatedMode = typeof payload?.pptIsolatedMode === "boolean";
  const forceMode = normalizePptMode(payload?.pptForceMode, PPT_FORCE_MODE);
  const rolloutPercent = clampPercent(
    payload?.pptRolloutPercent,
    PPT_ROLLOUT_PERCENT
  );
  const rolloutBucket = computeRolloutBucket(rolloutSeed);
  const rolloutEnabled = isRolloutEnabled(rolloutSeed, rolloutPercent);

  let isolatedMode = parseBooleanOption(payload?.pptIsolatedMode, PPT_ISOLATED_MODE);
  if (!explicitIsolatedMode) {
    if (forceMode === "isolated") {
      isolatedMode = true;
    } else if (forceMode === "batch") {
      isolatedMode = false;
    } else {
      isolatedMode = Boolean(PPT_ISOLATED_MODE) && rolloutEnabled;
    }
  }

  const officeConcurrency = parsePositiveInt(
    payload?.pptOfficeConcurrency,
    parsePositiveInt(process.env.SCENE_PPT_OFFICE_CONCURRENCY, machineBaseline.officeConcurrency)
  );
  const perFileTimeoutMs = parsePositiveInt(
    payload?.pptPerFileTimeoutMs,
    parsePositiveInt(process.env.SCENE_PPT_PER_FILE_TIMEOUT_MS, machineBaseline.perFileTimeoutMs)
  );
  const batchTimeoutCapMs = parsePositiveInt(
    payload?.pptBatchTimeoutCapMs,
    parsePositiveInt(process.env.SCENE_PPT_BATCH_TIMEOUT_CAP_MS, PPT_BATCH_TIMEOUT_CAP_MS)
  );
  const batchComRestartSize = parsePositiveInt(
    payload?.pptBatchComRestartSize,
    parsePositiveInt(process.env.SCENE_PPT_BATCH_COM_RESTART_SIZE, machineBaseline.batchComRestartSize)
  );
  const batchComRestartSizeDegraded = parsePositiveInt(
    payload?.pptBatchComRestartSizeDegraded,
    parsePositiveInt(process.env.SCENE_PPT_BATCH_COM_RESTART_SIZE_DEGRADED, PPT_BATCH_COM_RESTART_SIZE_DEGRADED)
  );
  const adaptiveEnabled = parseBooleanOption(payload?.pptAdaptiveMode, PPT_ADAPTIVE_MODE);
  const degradeFailStreak = parsePositiveInt(
    payload?.pptDegradeFailStreak,
    parsePositiveInt(
      process.env.SCENE_PPT_DEGRADE_FAIL_STREAK,
      parsePositiveInt(machineBaseline.degradeFailStreak, DEFAULT_PPT_DEGRADE_FAIL_STREAK)
    )
  );
  const recoverSuccessWindow = parsePositiveInt(
    payload?.pptRecoverSuccessWindow,
    parsePositiveInt(
      process.env.SCENE_PPT_RECOVER_SUCCESS_WINDOW,
      parsePositiveInt(machineBaseline.recoverSuccessWindow, DEFAULT_PPT_RECOVER_SUCCESS_WINDOW)
    )
  );
  const precheckMode = normalizePrecheckMode(payload?.officePrecheckMode, PPT_PRECHECK_MODE);

  return {
    machineBaseline,
    rolloutSeed,
    rolloutPercent,
    rolloutBucket,
    rolloutEnabled,
    forceMode,
    isolatedMode,
    officeConcurrency,
    perFileTimeoutMs,
    batchTimeoutCapMs,
    batchComRestartSize,
    batchComRestartSizeDegraded,
    adaptiveEnabled,
    degradeFailStreak,
    recoverSuccessWindow,
    precheckMode
  };
}

function classifyPptFailureTrigger(result) {
  if (!result || result.ok) return "";
  const errorCode = normalizeOfficeErrorCode(result.errorCode);
  if (errorCode === "PS_TIMEOUT" || errorCode === "LO_TIMEOUT") return "timeout";
  if (
    errorCode === "LO_NON_ZERO_EXIT"
    || errorCode === "LO_PROFILE_LOCK"
    || errorCode === "0x80010001"
    || errorCode === "0x8001010a"
    || errorCode === "0x800ac472"
  ) {
    return "oom_crash";
  }
  const combined = `${result.rawError || ""} ${result.error || ""}`.toLowerCase();
  if (combined.includes("call was rejected by callee")) return "oom_crash";
  if (combined.includes("rpc_e_servercall_retrylater")) return "oom_crash";
  if (combined.includes("服务器忙")) return "oom_crash";
  if (combined.includes("正在使用中")) return "oom_crash";
  return "";
}

function createPptAdaptiveController(config = {}) {
  const normalConcurrency = Math.max(1, Number(config.normalConcurrency) || DEFAULT_PPT_OFFICE_CONCURRENCY);
  const degradedConcurrency = Math.max(1, Number(config.degradedConcurrency) || DEFAULT_PPT_DEGRADED_CONCURRENCY);
  const normalRestartSize = Math.max(1, Number(config.normalRestartSize) || DEFAULT_PPT_BATCH_COM_RESTART_SIZE);
  const degradedRestartSize = Math.max(
    1,
    Number(config.degradedRestartSize) || Math.min(normalRestartSize, DEFAULT_PPT_BATCH_COM_RESTART_SIZE_DEGRADED)
  );
  const adaptiveEnabled = Boolean(config.adaptiveEnabled);
  const failStreakThreshold = Math.max(1, Number(config.failStreakThreshold) || DEFAULT_PPT_DEGRADE_FAIL_STREAK);
  const recoverSuccessWindow = Math.max(1, Number(config.recoverSuccessWindow) || DEFAULT_PPT_RECOVER_SUCCESS_WINDOW);

  const state = {
    degradeLevel: 0,
    currentConcurrency: normalConcurrency,
    currentRestartSize: normalRestartSize,
    consecutiveFailures: 0,
    stableSuccesses: 0,
    transitions: [],
    triggerStats: {
      timeout: 0,
      oom_crash: 0,
      consecutive_failures: 0
    }
  };

  const pushTransition = (from, to, reason) => {
    state.transitions.push({
      from,
      to,
      reason,
      at: new Date().toISOString()
    });
  };

  const degrade = (reason) => {
    if (!adaptiveEnabled) return;
    if (state.degradeLevel >= 1) return;
    const from = state.degradeLevel;
    state.degradeLevel = 1;
    state.currentConcurrency = degradedConcurrency;
    state.currentRestartSize = degradedRestartSize;
    state.stableSuccesses = 0;
    pushTransition(from, state.degradeLevel, reason || "degrade");
  };

  const recover = (reason) => {
    if (!adaptiveEnabled) return;
    if (state.degradeLevel <= 0) return;
    const from = state.degradeLevel;
    state.degradeLevel = 0;
    state.currentConcurrency = normalConcurrency;
    state.currentRestartSize = normalRestartSize;
    state.consecutiveFailures = 0;
    state.stableSuccesses = 0;
    pushTransition(from, state.degradeLevel, reason || "recover");
  };

  return {
    getConcurrency() {
      return state.currentConcurrency;
    },
    getBatchRestartSize() {
      return state.currentRestartSize;
    },
    getSnapshot() {
      return {
        degradeLevel: state.degradeLevel,
        currentConcurrency: state.currentConcurrency,
        currentRestartSize: state.currentRestartSize,
        consecutiveFailures: state.consecutiveFailures,
        stableSuccesses: state.stableSuccesses,
        transitions: [...state.transitions],
        triggerStats: { ...state.triggerStats }
      };
    },
    onResult(result) {
      if (!result || result.ok) {
        state.consecutiveFailures = 0;
        if (state.degradeLevel > 0) {
          state.stableSuccesses += 1;
          if (state.stableSuccesses >= recoverSuccessWindow) {
            recover("stable_window");
          }
        }
        return;
      }

      state.stableSuccesses = 0;
      state.consecutiveFailures += 1;
      const trigger = classifyPptFailureTrigger(result);
      if (trigger === "timeout" || trigger === "oom_crash") {
        state.triggerStats[trigger] += 1;
        degrade(trigger);
        return;
      }
      if (state.consecutiveFailures >= failStreakThreshold) {
        state.triggerStats.consecutive_failures += 1;
        degrade("consecutive_failures");
      }
    }
  };
}

async function runWithConcurrency(items, concurrency, fn) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const safeConcurrency = Math.max(1, Math.min(Math.floor(Number(concurrency) || 1), items.length));
  const results = new Array(items.length);
  let index = 0;

  const worker = async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await fn(items[current], current);
    }
  };

  await Promise.all(Array.from({ length: safeConcurrency }, worker));
  return results;
}

function terminateActiveLibreOfficeProcesses() {
  for (const pid of Array.from(activeLibreOfficePids)) {
    killProcessTreeByPid(pid);
  }
}

function terminateActiveOfficeProcesses() {
  for (const pid of Array.from(activeOfficePids)) {
    killProcessTreeByPid(pid);
  }
  for (const [pidFile, processNames] of Array.from(activeOfficeChildPidFiles.entries())) {
    terminateOfficeProcessesFromPidFile(pidFile, processNames);
  }
  activeOfficePids.clear();
  activeOfficeChildPidFiles.clear();
}

function startPhaseHeartbeat(label, intervalMs = 5000) {
  const startTime = Date.now();
  const interval = setInterval(() => {
    const elapsed = Math.max(1, Math.floor((Date.now() - startTime) / 1000));
    const message = `${label}处理中... 已用时 ${elapsed}s`;
    logToRenderer(1, message);
    sendProgress("convert:progress", { phase: "stage", status: message });
  }, intervalMs);
  return () => clearInterval(interval);
}

function startExportHeartbeat(getMessage, intervalMs = 10000) {
  const interval = setInterval(() => {
    const message = typeof getMessage === "function" ? getMessage() : "";
    if (!message) return;
    logToRenderer(1, message);
    sendProgress("convert:progress", { phase: "stage", status: message });
  }, intervalMs);
  return () => clearInterval(interval);
}

function applyScale(pipeline, width, height, scale) {
  let outWidth = width;
  let outHeight = height;

  // Only resize if scale is explicitly provided and not 1 (and logic demands it).
  // In the new high-res flow, we pass scale=1 here because source is already scaled.
  if (scale && scale !== 1) {
    outWidth = Math.max(1, Math.round(outWidth * scale));
    outHeight = Math.max(1, Math.round(outHeight * scale));
    pipeline = pipeline.resize(outWidth, outHeight, { kernel: sharp.kernel.lanczos3 });
  }

  return { pipeline, outWidth, outHeight };
}

async function saveImageBuffer(buffer, outputPath) {
  await fs.promises.writeFile(outputPath, buffer);
}

async function postProcessImage(inputPath, outputPath, scale) {
  const image = sharp(inputPath);
  const meta = await image.metadata();
  if (!meta.width || !meta.height) {
    throw new Error("Unable to read image dimensions");
  }

  // scale is passed as 1.0 in the new flow because input is already high-res
  const { pipeline } = applyScale(image, meta.width, meta.height, scale);

  await pipeline.png({ compressionLevel: 1 }).toFile(outputPath);
}

async function convertPdfBufferToImages(buffer, outputDir, baseName, extName, options) {
  const library = await ensurePdfium();
  const document = await library.loadDocument(buffer);
  let pageCount = 0;

  const targetShortSide = getTargetShortSide(options.scale);
  const maxPixels = 60_000_000;
  const pageConcurrency = Math.max(1, Number(options.pageConcurrency) || 1);

  try {
    const pages = Array.from(document.pages());
    const totalPages = pages.length;
    if (options.pageLimit && totalPages < options.pageLimit) {
      return {
        skipped: true,
        totalPages,
        requiredPages: options.pageLimit
      };
    }
    const limit = options.pageLimit ? Math.min(options.pageLimit, totalPages) : totalPages;
    const renderPage = async (index) => {
      if (conversionAbortRequested) return;
      const page = pages[index];
      let renderScale = (300 * options.scale) / 72;
      if (typeof page.getSize === "function") {
        const pageSize = page.getSize();
        const shortSide = Math.min(pageSize.width, pageSize.height);
        renderScale = targetShortSide / shortSide;
        const estimatedWidth = Math.floor(pageSize.width * renderScale);
        const estimatedHeight = Math.floor(pageSize.height * renderScale);
        const estimatedPixels = estimatedWidth * estimatedHeight;
        if (estimatedPixels > maxPixels) {
          const ratio = Math.sqrt(maxPixels / estimatedPixels);
          renderScale = renderScale * ratio;
        }
      }
      const pageNumber = index + 1;
      if (options.reportPage) {
        options.reportPage(pageNumber, limit);
      }
      if (options.reportStage && pageNumber === 1) {
        options.reportStage("PDF 渲染");
      }

      const outputPath = getOutputFilePath(
        outputDir,
        baseName,
        extName,
        pageNumber,
        options.useSubfolder,
        options.namePrefix
      );

      const rendered = await page.render({
        scale: renderScale,
        render: async (renderOptions) => {
          let pipeline = sharp(renderOptions.data, {
            raw: {
              width: renderOptions.width,
              height: renderOptions.height,
              channels: 4
            }
          });

          // Source is already high-res, so we pass scale: 1 to applyScale
          const processed = applyScale(
            pipeline,
            renderOptions.width,
            renderOptions.height,
            1
          );

          await processed.pipeline.png({ compressionLevel: 1 }).toFile(outputPath);
          return Buffer.alloc(0);
        }
      });

      void rendered;
      pageCount += 1;
    };

    for (let index = 0; index < limit; index += pageConcurrency) {
      if (conversionAbortRequested) break;
      const batch = [];
      for (let offset = 0; offset < pageConcurrency && index + offset < limit; offset += 1) {
        batch.push(renderPage(index + offset));
      }
      await Promise.all(batch);
    }
  } finally {
    document.destroy();
  }

  return {
    skipped: false,
    pages: pageCount
  };
}

async function convertPdfFileToImages(sourcePath, outputDir, baseName, extName, options) {
  const buffer = await fs.promises.readFile(sourcePath);
  return convertPdfBufferToImages(buffer, outputDir, baseName, extName, options);
}

function normalizePptScriptResult(rawResult) {
  const payload = rawResult && typeof rawResult === "object" ? rawResult : {};
  const rawError = String(payload.rawError || payload.error || "").trim();
  const hintedCode = normalizeOfficeErrorCode(payload.errorCode || extractOfficeErrorCode(rawError));
  const durationRaw = Number(payload.durationMs);
  const retriesRaw = Number(payload.retries);
  return {
    ok: payload.ok !== false,
    message: String(payload.message || "").trim(),
    rawError,
    errorCode: hintedCode,
    openMode: String(payload.openMode || payload.openMethod || "").trim(),
    repaired: Boolean(payload.repaired),
    fallbackReason: String(payload.fallbackReason || "").trim(),
    envWarning: String(payload.envWarning || "").trim(),
    durationMs: Number.isFinite(durationRaw) && durationRaw > 0 ? Math.floor(durationRaw) : 0,
    retries: Number.isFinite(retriesRaw) && retriesRaw >= 0 ? Math.floor(retriesRaw) : 0
  };
}

function normalizeOfficeScriptResult(rawResult) {
  return normalizePptScriptResult(rawResult);
}

async function runPptToPdfWithRetry(inputPath, pdfPath, policy = {}) {
  const baseTimeoutMs = parsePositiveInt(
    policy.timeoutMs,
    parsePositiveInt(process.env.SCENE_OFFICE_TIMEOUT_MS, DEFAULT_OFFICE_TIMEOUT_MS)
  );
  const timeoutMs = calcLoTimeout(inputPath, baseTimeoutMs);
  const envRetryRaw = Number(process.env.SCENE_PPT_RETRY_COUNT);
  const envRetryCount = Number.isFinite(envRetryRaw) && envRetryRaw >= 0
    ? Math.floor(envRetryRaw)
    : DEFAULT_PPT_RETRY_COUNT;
  const policyRetryRaw = Number(policy.retryCount);
  const retryCount = Number.isFinite(policyRetryRaw) && policyRetryRaw >= 0
    ? Math.floor(policyRetryRaw)
    : envRetryCount;
  const maxAttempts = retryCount + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptStartedAt = Date.now();
    try {
      const targetOutDir = path.dirname(pdfPath);
      await fs.promises.mkdir(targetOutDir, { recursive: true });
      const loResult = await runLibreOfficeToPdf(inputPath, targetOutDir, {
        timeoutMs,
        env: policy.env,
        runtimeMode: policy.runtimeMode || policy.loRuntimeMode
      });
      if (loResult.pdfPath !== pdfPath) {
        await fs.promises.copyFile(loResult.pdfPath, pdfPath);
      }
      try {
        await fs.promises.rm(loResult.outDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors.
      }
      return {
        ok: true,
        message: "PPT 转 PDF 完成",
        openMode: loResult.openMode || "libreoffice",
        repaired: false,
        fallbackReason: "",
        envWarning: "",
        retries: attempt - 1,
        attempts: attempt,
        durationMs: loResult.durationMs || (Date.now() - attemptStartedAt),
        timeoutMs,
        errorCode: ""
      };
    } catch (error) {
      const failure = buildOfficeFailure(error, {
        timeout: error?.code === "LO_TIMEOUT",
        rawMessage: error?.stderr || error?.stdout || error?.message,
        errorCode: error?.errorCode || error?.code,
        fallbackMessage: "PPT 转 PDF 失败"
      });
      const durationMs = Date.now() - attemptStartedAt;
      const shouldRetry = attempt < maxAttempts && failure.retryable;
      if (shouldRetry) {
        logToRenderer(
          2,
          `PPT 转 PDF 重试 ${attempt}/${maxAttempts - 1}: code=${failure.errorCode || error?.code || "unknown"}`
        );
        continue;
      }
      return {
        ok: false,
        message: failure.message,
        rawError: failure.rawMessage,
        errorCode: failure.errorCode || normalizeOfficeErrorCode(error?.code),
        retryable: failure.retryable,
        retries: attempt - 1,
        attempts: attempt,
        durationMs,
        timeoutMs,
        openMode: "",
        repaired: false,
        fallbackReason: "lo_failed",
        envWarning: ""
      };
    }
  }
  return {
    ok: false,
    message: "PPT 转 PDF 未知失败",
    rawError: "PPT 转 PDF 未知失败",
    errorCode: "",
    retryable: false,
    retries: 0,
    attempts: 1,
    durationMs: 0,
    timeoutMs: 0,
    openMode: "",
    repaired: false,
    fallbackReason: "",
    envWarning: ""
  };
}

async function convertPptSourceToPdf(sourcePath, ext, pdfPath, options = {}) {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "scene-ppt-open-"));
  const safeDir = path.join(tempDir, "safe");
  try {
    const safeInput = await ensureSafeInputPath(sourcePath, safeDir, ext);
    return await runPptToPdfWithRetry(safeInput.path, pdfPath, options);
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

function createConversionMetaFromPdfResult(item, engineRequested, engineUsed, conversion = {}) {
  return {
    engineRequested: normalizeExportEngine(engineRequested),
    engineUsed: normalizeExportEngine(engineUsed),
    stage: conversion.stage || getConversionStageByExt(item?.ext),
    openMode: conversion.openMode || "",
    repaired: Boolean(conversion.repaired),
    retries: Number(conversion.retries) || 0,
    attempts: Number(conversion.attempts) || 1,
    workerRebuilds: Number(conversion.workerRebuilds) || 0,
    durationMs: Number(conversion.durationMs) || 0,
    timeoutMs: Number(conversion.timeoutMs) || 0,
    fallbackReason: conversion.fallbackReason || "",
    errorCode: conversion.errorCode || "",
    envWarning: conversion.envWarning || ""
  };
}

async function convertWithLibreOffice(item, pdfPath, options = {}) {
  const stage = getConversionStageByExt(item?.ext);
  const engineRequested = normalizeExportEngine(options.exportEngine);
  if (item.ext === ".ppt" || item.ext === ".pptx") {
    const retryCountRaw = Number(options?.retryCount);
    const mappedRetryCount = Number.isFinite(retryCountRaw) && retryCountRaw >= 0
      ? Math.floor(retryCountRaw)
      : parsePositiveInt(options?.pptRetryCount, undefined);
    const timeoutMs = parsePositiveInt(
      options?.pptPerFileTimeoutMs,
      parsePositiveInt(options?.officeTimeoutMs, DEFAULT_OFFICE_TIMEOUT_MS)
    );
    const conversion = await convertPptSourceToPdf(item.sourcePath, item.ext, pdfPath, {
      ...options,
      timeoutMs,
      retryCount: mappedRetryCount
    });
    if (!conversion.ok) {
      throw createPptConversionError(conversion, {
        attempts: conversion.attempts,
        retries: conversion.retries,
        timeoutMs: conversion.timeoutMs,
        durationMs: conversion.durationMs,
        openMode: conversion.openMode,
        repaired: conversion.repaired,
        fallbackReason: conversion.fallbackReason,
        envWarning: conversion.envWarning,
        engineRequested,
        engineUsed: EXPORT_ENGINE_LIBREOFFICE
      });
    }
    if (conversion.openMode || conversion.repaired || conversion.retries > 0) {
      logToRenderer(
        1,
        `PPT 打开诊断: engine=libreoffice mode=${conversion.openMode || "unknown"} repaired=${conversion.repaired ? "true" : "false"} retries=${conversion.retries}`
      );
    }
    return {
      ok: true,
      pdfPath,
      ...createConversionMetaFromPdfResult(item, engineRequested, EXPORT_ENGINE_LIBREOFFICE, {
        ...conversion,
        stage
      })
    };
  }

  if (item.ext === ".doc" || item.ext === ".docx") {
    const safeDir = path.join(path.dirname(pdfPath), "safe-lo");
    const safeInput = await ensureSafeInputPath(item.sourcePath, safeDir, item.ext);
    try {
      const wordTimeoutMs = parsePositiveInt(
        options.wordTimeoutMs,
        parsePositiveInt(process.env.SCENE_WORD_TIMEOUT_MS, DEFAULT_OFFICE_TIMEOUT_MS)
      );
      const loResult = await runLibreOfficeToPdf(safeInput.path, path.dirname(pdfPath), {
        timeoutMs: calcLoTimeout(safeInput.path, wordTimeoutMs),
        runtimeMode: options.runtimeMode || options.loRuntimeMode
      });
      if (loResult.pdfPath !== pdfPath) {
        await fs.promises.copyFile(loResult.pdfPath, pdfPath);
      }
      try {
        await fs.promises.rm(loResult.outDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors.
      }
      return {
        ok: true,
        pdfPath,
        ...createConversionMetaFromPdfResult(item, engineRequested, EXPORT_ENGINE_LIBREOFFICE, {
          stage,
          openMode: loResult.openMode || "libreoffice",
          durationMs: loResult.durationMs || 0,
          timeoutMs: loResult.timeoutMs || 0,
          fallbackReason: loResult.fallbackReason || "",
          envWarning: loResult.envWarning || ""
        })
      };
    } finally {
      if (safeInput.cleanup) {
        await safeInput.cleanup();
      }
    }
  }

  throw new Error("不支持的 Office 文档类型");
}

async function runOfficeComToPdfScript(item, pdfPath, scriptName, childProcessNames, options = {}) {
  const stage = getConversionStageByExt(item?.ext);
  const baseTimeoutMs = parsePositiveInt(
    stage === "word_to_pdf" ? options.wordTimeoutMs : options.pptPerFileTimeoutMs,
    parsePositiveInt(options.officeTimeoutMs, DEFAULT_OFFICE_TIMEOUT_MS)
  );
  const timeoutMs = calcLoTimeout(item.safeSourcePath || item.sourcePath, baseTimeoutMs);
  const pidFile = path.join(path.dirname(pdfPath), `${stage}-office-child.pid`);
  const scriptArgs = [
    "-InputPath",
    item.safeSourcePath || item.sourcePath,
    "-OutputPath",
    pdfPath,
    "-PidFile",
    pidFile
  ];

  try {
    const result = await runPowerShellScript(scriptName, scriptArgs, {
      timeoutMs,
      useLibreOfficeEnv: false,
      trackAs: "office",
      officeChildPidFile: pidFile,
      officeChildProcessNames: childProcessNames
    });
    const parsed = parsePowerShellJsonOutput(result.stdout, `${scriptName} 输出解析失败`);
    const normalized = normalizeOfficeScriptResult(parsed);
    if (!normalized.ok) {
      const failure = buildOfficeFailure(new Error(normalized.rawError || normalized.message), {
        rawMessage: normalized.rawError || normalized.message,
        errorCode: normalized.errorCode,
        fallbackMessage: stage === "word_to_pdf" ? "Word 转 PDF 失败" : "PPT 转 PDF 失败"
      });
      throw createDocumentConversionError(stage, failure, {
        attempts: 1,
        retries: normalized.retries,
        timeoutMs,
        durationMs: normalized.durationMs || result.durationMs,
        openMode: normalized.openMode,
        repaired: normalized.repaired,
        fallbackReason: normalized.fallbackReason,
        envWarning: normalized.envWarning,
        engineRequested: options.exportEngine,
        engineUsed: EXPORT_ENGINE_OFFICE
      });
    }
    if (!fs.existsSync(pdfPath)) {
      const failure = buildOfficeFailure(new Error("Microsoft Office 未生成 PDF 输出"), {
        rawMessage: "Microsoft Office 未生成 PDF 输出",
        errorCode: "OFFICE_OUTPUT_MISSING",
        fallbackMessage: stage === "word_to_pdf" ? "Word 转 PDF 失败" : "PPT 转 PDF 失败"
      });
      throw createDocumentConversionError(stage, failure, {
        attempts: 1,
        retries: normalized.retries,
        timeoutMs,
        durationMs: normalized.durationMs || result.durationMs,
        openMode: normalized.openMode,
        repaired: normalized.repaired,
        fallbackReason: normalized.fallbackReason || "output_missing",
        envWarning: normalized.envWarning,
        engineRequested: options.exportEngine,
        engineUsed: EXPORT_ENGINE_OFFICE
      });
    }
    return {
      ...normalized,
      attempts: 1,
      timeoutMs,
      durationMs: normalized.durationMs || result.durationMs,
      stage
    };
  } catch (error) {
    let parsedFailure = null;
    if (error?.stdout) {
      try {
        parsedFailure = normalizeOfficeScriptResult(parsePowerShellJsonOutput(error.stdout));
      } catch (parseError) {
        parsedFailure = null;
      }
    }
    const failure = buildOfficeFailure(error, {
      timeout: error?.code === "PS_TIMEOUT",
      rawMessage: parsedFailure?.rawError || parsedFailure?.message || error?.stderr || error?.stdout || error?.message,
      errorCode: parsedFailure?.errorCode || error?.errorCode || error?.code,
      fallbackMessage: stage === "word_to_pdf" ? "Word 转 PDF 失败" : "PPT 转 PDF 失败"
    });
    throw createDocumentConversionError(stage, failure, {
      attempts: 1,
      retries: parsedFailure?.retries || 0,
      timeoutMs: error?.timeoutMs || timeoutMs,
      durationMs: parsedFailure?.durationMs || error?.durationMs || 0,
      openMode: parsedFailure?.openMode || error?.openMode || "",
      repaired: Boolean(parsedFailure?.repaired || error?.repaired),
      fallbackReason: parsedFailure?.fallbackReason || error?.fallbackReason || "office_failed",
      envWarning: parsedFailure?.envWarning || error?.envWarning || "",
      engineRequested: options.exportEngine,
      engineUsed: EXPORT_ENGINE_OFFICE
    }, error);
  } finally {
    try {
      await fs.promises.rm(pidFile, { force: true });
    } catch (error) {
      // Ignore cleanup errors.
    }
  }
}

async function convertWithMicrosoftOffice(item, pdfPath, options = {}) {
  const stage = getConversionStageByExt(item?.ext);
  const engineRequested = normalizeExportEngine(options.exportEngine);
  const safeDir = path.join(path.dirname(pdfPath), "safe-office");
  const safeInput = await ensureSafeInputPath(item.sourcePath, safeDir, item.ext);
  const taskItem = {
    ...item,
    safeSourcePath: safeInput.path
  };
  try {
    let conversion = null;
    if (item.ext === ".ppt" || item.ext === ".pptx") {
      conversion = await runOfficeComToPdfScript(taskItem, pdfPath, "ppt-to-pdf.ps1", ["POWERPNT"], options);
    } else if (item.ext === ".doc" || item.ext === ".docx") {
      conversion = await runOfficeComToPdfScript(taskItem, pdfPath, "word-to-pdf.ps1", ["WINWORD"], options);
    } else {
      throw new Error("不支持的 Office 文档类型");
    }
    return {
      ok: true,
      pdfPath,
      ...createConversionMetaFromPdfResult(item, engineRequested, EXPORT_ENGINE_OFFICE, conversion)
    };
  } finally {
    if (safeInput.cleanup) {
      await safeInput.cleanup();
    }
  }
}

async function convertOfficeSourceToPdf(item, pdfPath, options = {}) {
  const engine = normalizeExportEngine(options.exportEngine);
  if (engine === EXPORT_ENGINE_OFFICE) {
    return convertWithMicrosoftOffice(item, pdfPath, options);
  }
  return convertWithLibreOffice(item, pdfPath, options);
}

async function convertWordToImages(item, outputDir, options) {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "scene-word-"));
  const pdfPath = path.join(tempDir, "document.pdf");
  try {
    if (options.reportStage) {
      options.reportStage("Word 转 PDF");
    }
    const conversion = await convertOfficeSourceToPdf(item, pdfPath, options);
    if (options.reportStage) {
      options.reportStage("PDF 渲染");
    }
    const renderResult = await convertPdfFileToImages(pdfPath, outputDir, item.baseName, item.ext, options);
    return {
      ...renderResult,
      conversionMeta: createConversionMetaFromPdfResult(
        item,
        options.exportEngine,
        conversion.engineUsed || options.exportEngine,
        conversion
      )
    };
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

async function convertPptToImages(item, outputDir, options) {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "scene-ppt-"));
  const pdfPath = path.join(tempDir, "presentation.pdf");
  try {
    if (options.reportStage) {
      options.reportStage("PPT 转 PDF");
    }
    const conversion = await convertOfficeSourceToPdf(item, pdfPath, options);
    if (options.reportStage) {
      options.reportStage("PDF 渲染");
    }
    const renderResult = await convertPdfFileToImages(pdfPath, outputDir, item.baseName, item.ext, options);
    return {
      ...renderResult,
      conversionMeta: createConversionMetaFromPdfResult(
        item,
        options.exportEngine,
        conversion.engineUsed || options.exportEngine,
        conversion
      )
    };
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

function normalizeLibreOfficeSpeedMode(mode, fallback = "safe") {
  const normalized = String(mode || "").trim().toLowerCase();
  if (normalized === "safe" || normalized === "boost") {
    return normalized;
  }
  return fallback;
}

function markLibreOfficeSpeedRollback(reason) {
  libreOfficeSpeedState.forcedSafe = true;
  libreOfficeSpeedState.reason = String(reason || "unknown");
  libreOfficeSpeedState.updatedAt = new Date().toISOString();
}

function getLibreOfficeSpeedSnapshot() {
  return {
    forcedSafe: Boolean(libreOfficeSpeedState.forcedSafe),
    reason: libreOfficeSpeedState.reason || "",
    updatedAt: libreOfficeSpeedState.updatedAt || ""
  };
}

function shouldRollbackLibreOfficeSpeed(errorCode) {
  const normalized = normalizeOfficeErrorCode(errorCode);
  return normalized === "LO_TIMEOUT"
    || normalized === "LO_NON_ZERO_EXIT"
    || normalized === "LO_PROFILE_LOCK";
}

async function batchConvertToPdf(type, tasks, options = {}) {
  if (!tasks.length) return [];

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), `scene-batch-${type}-`));
  const cleanups = [];
  try {
    const prepared = await Promise.all(tasks.map(async (task, index) => {
      const safeDir = path.join(tempDir, "safe", String(index));
      const safeInput = await ensureSafeInputPath(task.sourcePath, safeDir, task.item.ext);
      if (safeInput.cleanup) cleanups.push(safeInput.cleanup);
      let fileSize = 0;
      try {
        fileSize = fs.statSync(task.sourcePath).size;
      } catch (error) {
        fileSize = 0;
      }
      return {
        ...task,
        safePath: safeInput.path,
        fileSize
      };
    }));

    const hasHugeFile = prepared.some((task) => task.fileSize > 100 * 1024 * 1024);
    const avgSizeMb = prepared.length > 0
      ? prepared.reduce((sum, task) => sum + task.fileSize, 0) / prepared.length / (1024 * 1024)
      : 0;
    const cpuCount = os.cpus()?.length || 1;
    const freeMemGb = os.freemem() / (1024 ** 3);
    const scale = Number(options.scale || 1);
    const baseConcurrency = Math.max(1, Number(options.concurrency) || 2);
    const requestedMode = normalizeLibreOfficeSpeedMode(
      options.speedMode,
      normalizeLibreOfficeSpeedMode(process.env.SCENE_LO_SPEED_MODE, "safe")
    );
    const speedSnapshot = getLibreOfficeSpeedSnapshot();
    const effectiveSpeedMode = speedSnapshot.forcedSafe ? "safe" : requestedMode;
    const allowBoost = !hasHugeFile
      && effectiveSpeedMode === "boost"
      && cpuCount >= 8
      && freeMemGb >= 8
      && avgSizeMb <= 25
      && scale < 3;

    const concurrency = hasHugeFile
      ? 1
      : allowBoost
        ? Math.min(3, Math.max(2, baseConcurrency))
        : Math.min(2, baseConcurrency);

    const timeoutBase = parsePositiveInt(
      options.timeoutMs,
      parsePositiveInt(process.env.SCENE_OFFICE_TIMEOUT_MS, DEFAULT_OFFICE_TIMEOUT_MS)
    );

    return await runWithConcurrency(prepared, concurrency, async (task) => {
      const startedAt = Date.now();
      if (conversionAbortRequested) {
        return {
          ...task,
          ok: false,
          error: "已取消",
          rawError: "已取消",
          errorCode: "",
          openMode: "",
          repaired: false,
          fallbackReason: "aborted",
          envWarning: "",
          retries: 0,
          durationMs: 0,
          speedMode: allowBoost ? "boost" : "safe",
          speedRollbackReason: getLibreOfficeSpeedSnapshot().reason || ""
        };
      }
      try {
        const targetOutDir = path.dirname(task.pdfPath);
        await fs.promises.mkdir(targetOutDir, { recursive: true });
        const loResult = await runLibreOfficeToPdf(task.safePath, targetOutDir, {
          timeoutMs: calcLoTimeout(task.safePath, timeoutBase),
          env: options.env,
          runtimeMode: options.runtimeMode || options.loRuntimeMode
        });
        if (loResult.pdfPath !== task.pdfPath) {
          await fs.promises.copyFile(loResult.pdfPath, task.pdfPath);
        }
        try {
          await fs.promises.rm(loResult.outDir, { recursive: true, force: true });
        } catch (error) {
          // Ignore cleanup errors.
        }
        return {
          ...task,
          ok: true,
          error: "",
          rawError: "",
          errorCode: "",
          openMode: "libreoffice",
          repaired: false,
          fallbackReason: "",
          envWarning: "",
          retries: 0,
          durationMs: loResult.durationMs || (Date.now() - startedAt),
          speedMode: allowBoost ? "boost" : "safe",
          speedRollbackReason: speedSnapshot.reason || ""
        };
      } catch (error) {
        const failure = buildOfficeFailure(error, {
          timeout: error?.code === "LO_TIMEOUT",
          rawMessage: error?.stderr || error?.stdout || error?.message,
          errorCode: error?.errorCode || error?.code,
          fallbackMessage: `${type.toUpperCase()} 转 PDF 失败`
        });
        if (shouldRollbackLibreOfficeSpeed(failure.errorCode)) {
          markLibreOfficeSpeedRollback(failure.errorCode);
        }
        return {
          ...task,
          ok: false,
          error: failure.message,
          rawError: failure.rawMessage,
          errorCode: failure.errorCode,
          openMode: "",
          repaired: false,
          fallbackReason: "lo_failed",
          envWarning: "",
          retries: 0,
          durationMs: Date.now() - startedAt,
          speedMode: allowBoost ? "boost" : "safe",
          speedRollbackReason: getLibreOfficeSpeedSnapshot().reason || ""
        };
      }
    });
  } finally {
    for (const cleanup of cleanups) {
      try {
        await cleanup();
      } catch (error) {
        // Ignore cleanup errors.
      }
    }
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors.
    }
  }
}

function createRenderReporters(item, options = {}) {
  const reportStage = (status) => {
    logToRenderer(1, `${item.fileName}：${status}`);
    sendProgress("convert:progress", {
      phase: "stage",
      status,
      fileName: item.fileName
    });
  };
  const pageReportInterval = Math.max(1, Number(options.pageReportInterval) || 1);
  const reportPage = (pageNumber, totalPages) => {
    const isLastPage = Number(pageNumber) >= Number(totalPages);
    if (!isLastPage && pageReportInterval > 1 && (Number(pageNumber) % pageReportInterval !== 0)) {
      return;
    }
    logToRenderer(1, `${item.fileName}：第 ${pageNumber}/${totalPages} 页`);
    sendProgress("convert:progress", {
      phase: "page",
      pageNumber,
      totalPages,
      fileName: item.fileName
    });
  };
  return { reportStage, reportPage };
}

async function prepareRenderContext(item, outputRoot, options) {
  const outputDir = options.useSubfolder
    ? getOutputDirForItem(outputRoot, item)
    : outputRoot;
  await fs.promises.mkdir(outputDir, { recursive: true });
  const namePrefix = await resolveOutputNamePrefix(
    outputDir,
    item.baseName,
    item.ext,
    options.useSubfolder,
    options.namePrefixReservations
  );
  const { reportStage, reportPage } = createRenderReporters(item, options);
  const nextOptions = {
    ...options,
    reportStage,
    reportPage,
    namePrefix
  };
  return { outputDir, nextOptions };
}

async function convertItem(item, outputRoot, options) {
  const { outputDir, nextOptions } = await prepareRenderContext(item, outputRoot, options);

  if (item.ext === ".pdf") {
    nextOptions.reportStage("PDF 渲染");
    const result = await convertPdfFileToImages(
      item.sourcePath,
      outputDir,
      item.baseName,
      item.ext,
      nextOptions
    );
    if (result.skipped) {
      return {
        skipped: true,
        totalPages: result.totalPages,
        requiredPages: result.requiredPages,
        outputDir
      };
    }
    return { pages: result.pages, outputDir };
  }
  if (item.ext === ".ppt" || item.ext === ".pptx") {
    const result = await convertPptToImages(item, outputDir, nextOptions);
    if (result.skipped) {
      return {
        skipped: true,
        totalPages: result.totalPages,
        requiredPages: result.requiredPages,
        outputDir
      };
    }
    return {
      pages: result.pages,
      outputDir,
      conversionMeta: result.conversionMeta || null
    };
  }
  if (item.ext === ".doc" || item.ext === ".docx") {
    const result = await convertWordToImages(item, outputDir, nextOptions);
    if (result.skipped) {
      return {
        skipped: true,
        totalPages: result.totalPages,
        requiredPages: result.requiredPages,
        outputDir
      };
    }
    return {
      pages: result.pages,
      outputDir,
      conversionMeta: result.conversionMeta || null
    };
  }

  throw new Error("不支持的文件类型");
}

async function renderPdfForItem(item, pdfPath, outputRoot, options, conversionMeta = null) {
  const { outputDir, nextOptions } = await prepareRenderContext(item, outputRoot, options);
  nextOptions.reportStage("PDF 渲染");
  const result = await convertPdfFileToImages(pdfPath, outputDir, item.baseName, item.ext, nextOptions);
  if (result.skipped) {
    return {
      skipped: true,
      totalPages: result.totalPages,
      requiredPages: result.requiredPages,
      outputDir
    };
  }
  return {
    pages: result.pages,
    outputDir,
    conversionMeta: conversionMeta || null
  };
}

function isOfficeConvertibleExt(ext) {
  return ext === ".ppt" || ext === ".pptx" || ext === ".doc" || ext === ".docx";
}

function computeRequiredOfficeAppsFromItems(items = []) {
  const required = new Set();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const ext = String(item?.ext || path.extname(item?.sourcePath || item?.fileName || "") || "").toLowerCase();
    if (ext === ".doc" || ext === ".docx") {
      required.add("word");
    } else if (ext === ".ppt" || ext === ".pptx") {
      required.add("powerpoint");
    }
  });
  return ["word", "powerpoint"].filter((appName) => required.has(appName));
}

function getConversionStageByExt(ext) {
  if (ext === ".ppt" || ext === ".pptx") return "ppt_to_pdf";
  if (ext === ".doc" || ext === ".docx") return "word_to_pdf";
  if (ext === ".pdf") return "pdf_render";
  return "";
}

function getFileSizeSafe(sourcePath) {
  try {
    return fs.statSync(sourcePath).size;
  } catch (error) {
    return 0;
  }
}

async function convertAndRenderLargeOfficeTask(task, outputRoot, options) {
  const maxAttempts = Math.max(1, parsePositiveInt(options?.largeFileMaxAttempts, DEFAULT_LO_LARGE_FILE_MAX_ATTEMPTS));
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (conversionAbortRequested) {
      const abortedError = new Error("已取消");
      abortedError.code = "ABORTED";
      abortedError.errorCode = "";
      abortedError.attempts = attempt;
      abortedError.retries = Math.max(0, attempt - 1);
      abortedError.stage = getConversionStageByExt(task?.item?.ext);
      throw abortedError;
    }

    try {
      const result = await convertItem(task.item, outputRoot, {
        ...options,
        retryCount: 0,
        pptRetryCount: 0
      });
      const baseMeta = result?.conversionMeta || {};
      return {
        ...result,
        conversionMeta: {
          ...baseMeta,
          stage: baseMeta.stage || getConversionStageByExt(task?.item?.ext),
          attempts: attempt,
          retries: Math.max(0, attempt - 1),
          workerRebuilds: Math.max(0, attempt - 1)
        }
      };
    } catch (error) {
      lastError = error;
      const errorCode = normalizeOfficeErrorCode(error?.errorCode || error?.code);
      logToRenderer(
        2,
        `大文件处理失败：${task?.item?.fileName || path.basename(task?.item?.sourcePath || "")} attempt ${attempt}/${maxAttempts} code=${errorCode || "unknown"}，执行 worker 重建`
      );
      if (normalizeExportEngine(options.exportEngine) === EXPORT_ENGINE_OFFICE) {
        terminateActiveOfficeProcesses();
      } else {
        terminateActiveLibreOfficeProcesses();
      }
      if (attempt < maxAttempts) {
        continue;
      }
    }
  }

  if (lastError && typeof lastError === "object") {
    lastError.stage = lastError.stage || getConversionStageByExt(task?.item?.ext);
    lastError.attempts = Number(lastError.attempts) || maxAttempts;
    lastError.retries = Number(lastError.retries) || Math.max(0, maxAttempts - 1);
    lastError.workerRebuilds = Number(lastError.workerRebuilds) || Math.max(0, maxAttempts - 1);
    throw lastError;
  }

  const unknownError = new Error("大文件转换失败");
  unknownError.stage = getConversionStageByExt(task?.item?.ext);
  unknownError.attempts = maxAttempts;
  unknownError.retries = Math.max(0, maxAttempts - 1);
  unknownError.workerRebuilds = Math.max(0, maxAttempts - 1);
  throw unknownError;
}

async function convertAndRenderOneFile(task, outputRoot, options) {
  if (task?.isLarge && task?.isOffice) {
    return convertAndRenderLargeOfficeTask(task, outputRoot, options);
  }
  return convertItem(task.item, outputRoot, options);
}

ipcMain.handle("convert:documents", async (event, payload) => {
  conversionAbortRequested = false;
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const outputRoot = payload?.outputRoot;
  const scale = Number(payload?.scale) || 1;
  const pageLimitRaw = payload?.pageLimit;
  const useSubfolder = payload?.useSubfolder !== false;
  const exportEngine = normalizeExportEngine(payload?.exportEngine);
  const requiredOfficeApps = computeRequiredOfficeAppsFromItems(items);
  const hasOfficeConvertibleFiles = requiredOfficeApps.length > 0;
  const forceOfficeSerial = exportEngine === EXPORT_ENGINE_OFFICE && hasOfficeConvertibleFiles;

  if (!outputRoot) {
    return { ok: false, error: "未设置输出目录" };
  }
  if (items.length === 0) {
    return { ok: false, error: "没有可导出的文件" };
  }

  const pageLimit = Number.isInteger(Number(pageLimitRaw)) && Number(pageLimitRaw) > 0
    ? Number(pageLimitRaw)
    : null;
  const machineTier = getMachineTier();
  const machineBaseline = getPptMachinePolicyBaseline(machineTier);
  const concurrency = getMaxConcurrency(machineTier);
  let pageConcurrency = concurrency.pageConcurrency;
  if (scale >= 3 || (LO_PERF_TUNING_ENABLED && machineTier === "low" && scale >= 2)) {
    pageConcurrency = 1;
  }
  const rolloutSeed = payload?.rolloutSeed || generateDeviceId();
  const pptPolicy = resolvePptPolicy(payload, {
    machineBaseline,
    rolloutSeed
  });
  const pptOfficeConcurrency = Math.max(1, Number(pptPolicy.officeConcurrency) || getPptOfficeConcurrency(machineTier));
  const allowFlatOutputConcurrency = LO_PERF_TUNING_ENABLED && (machineTier === "high" || machineTier === "ultra");
  const fileConcurrency = (useSubfolder || allowFlatOutputConcurrency) ? concurrency.fileConcurrency : 1;
  const defaultLargeThreshold = Math.max(
    1,
    parsePositiveInt(machineBaseline.largeFileThresholdMb, DEFAULT_LO_LARGE_FILE_THRESHOLD_MB)
  );
  const largeFileThresholdMb = Math.max(
    1,
    parsePositiveInt(
      payload?.largeFileThresholdMb,
      parsePositiveInt(process.env.SCENE_LO_LARGE_FILE_THRESHOLD_MB, defaultLargeThreshold)
    )
  );
  const largeFileThresholdBytes = largeFileThresholdMb * 1024 * 1024;
  const largeFileMaxAttempts = Math.max(
    1,
    parsePositiveInt(
      payload?.largeFileMaxAttempts,
      parsePositiveInt(process.env.SCENE_LO_LARGE_FILE_MAX_ATTEMPTS, DEFAULT_LO_LARGE_FILE_MAX_ATTEMPTS)
    )
  );
  const defaultSmallQueueConcurrency = Math.min(DEFAULT_LO_SMALL_QUEUE_CONCURRENCY, Math.max(1, fileConcurrency));
  const requestedSmallQueueConcurrency = Math.max(
    1,
    parsePositiveInt(payload?.smallQueueConcurrency, defaultSmallQueueConcurrency)
  );
  const smallQueueConcurrencyCap = useSubfolder
    ? getSmallQueueConcurrencyCap(machineTier)
    : Math.max(1, fileConcurrency);
  let smallQueueConcurrency = Math.max(1, Math.min(requestedSmallQueueConcurrency, smallQueueConcurrencyCap));
  if (forceOfficeSerial) {
    smallQueueConcurrency = 1;
  }
  const officeTimeoutMs = parsePositiveInt(
    payload?.officeTimeoutMs,
    parsePositiveInt(process.env.SCENE_OFFICE_TIMEOUT_MS, DEFAULT_OFFICE_TIMEOUT_MS)
  );
  const wordTimeoutMs = parsePositiveInt(
    payload?.wordTimeoutMs,
    parsePositiveInt(process.env.SCENE_WORD_TIMEOUT_MS, officeTimeoutMs)
  );
  const pptRetryRaw = Number(payload?.pptRetryCount);
  const envPptRetryRaw = Number(process.env.SCENE_PPT_RETRY_COUNT);
  const pptRetryCount = Number.isFinite(pptRetryRaw) && pptRetryRaw >= 0
    ? Math.floor(pptRetryRaw)
    : (Number.isFinite(envPptRetryRaw) && envPptRetryRaw >= 0
      ? Math.floor(envPptRetryRaw)
      : DEFAULT_PPT_RETRY_COUNT);
  const pptIsolatedModeRequested = Boolean(pptPolicy.isolatedMode);
  const pptIsolatedMode = true;
  const pptPerFileTimeoutMs = Math.max(1, Number(pptPolicy.perFileTimeoutMs) || PPT_PER_FILE_TIMEOUT_MS);
  const pptBatchTimeoutCapMs = Math.max(1, Number(pptPolicy.batchTimeoutCapMs) || PPT_BATCH_TIMEOUT_CAP_MS);
  const pptBatchComRestartSize = Math.max(1, Number(pptPolicy.batchComRestartSize) || PPT_BATCH_COM_RESTART_SIZE);
  const pptBatchComRestartSizeDegraded = Math.max(
    1,
    Number(pptPolicy.batchComRestartSizeDegraded) || PPT_BATCH_COM_RESTART_SIZE_DEGRADED
  );
  const pptAdaptiveMode = Boolean(pptPolicy.adaptiveEnabled);
  const pptDegradeFailStreak = Math.max(1, Number(pptPolicy.degradeFailStreak) || DEFAULT_PPT_DEGRADE_FAIL_STREAK);
  const pptRecoverSuccessWindow = Math.max(
    1,
    Number(pptPolicy.recoverSuccessWindow) || DEFAULT_PPT_RECOVER_SUCCESS_WINDOW
  );
  const officePrecheckMode = pptPolicy.precheckMode;
  const loRuntimeMode = normalizeLibreOfficeRuntimeMode(
    payload?.loRuntimeMode,
    normalizeLibreOfficeRuntimeMode(process.env.SCENE_LO_RUNTIME_MODE, DEFAULT_LO_RUNTIME_MODE)
  );
  const loSpeedMode = normalizeLibreOfficeSpeedMode(
    payload?.loSpeedMode,
    normalizeLibreOfficeSpeedMode(process.env.SCENE_LO_SPEED_MODE, "safe")
  );
  const options = {
    scale,
    pageLimit,
    useSubfolder,
    pageConcurrency,
    exportEngine,
    requiredOfficeApps,
    hasOfficeConvertibleFiles,
    forceOfficeSerial,
    officeTimeoutMs,
    wordTimeoutMs,
    pptRetryCount,
    pptIsolatedModeRequested,
    pptIsolatedMode,
    pptPerFileTimeoutMs,
    pptBatchTimeoutCapMs,
    pptOfficeConcurrency,
    pptBatchComRestartSize,
    pptBatchComRestartSizeDegraded,
    pptAdaptiveMode,
    pptDegradeFailStreak,
    pptRecoverSuccessWindow,
    pptRolloutPercent: pptPolicy.rolloutPercent,
    pptRolloutBucket: pptPolicy.rolloutBucket,
    pptRolloutEnabled: pptPolicy.rolloutEnabled,
    pptRolloutSeed: pptPolicy.rolloutSeed,
    pptForceMode: pptPolicy.forceMode,
    pptMachineTier: machineTier,
    machineTier,
    pageReportInterval: machineTier === "low" ? 3 : 1,
    officePrecheckMode,
    loRuntimeMode,
    loSpeedMode,
    cacheMode: "off",
    largeFileThresholdMb,
    largeFileMaxAttempts,
    smallQueueConcurrency,
    smallQueueConcurrencyRequested: requestedSmallQueueConcurrency,
    smallQueueConcurrencyCap,
    namePrefixReservations: new Map(),
    perfTuningEnabled: LO_PERF_TUNING_ENABLED
  };
  const loRuntimeSnapshotAtStart = options.exportEngine === EXPORT_ENGINE_LIBREOFFICE && options.hasOfficeConvertibleFiles
    ? resolveLibreOfficeRuntime({
      runtimeMode: options.loRuntimeMode
    })
    : {
      ok: false,
      mode: options.loRuntimeMode,
      source: "skipped",
      path: "",
      version: "",
      probeResult: "skipped",
      probeDurationMs: 0,
      checkedAt: ""
    };
  const loSpeedSnapshotAtStart = getLibreOfficeSpeedSnapshot();
  const docConvertAdaptiveController = createPptAdaptiveController({
    adaptiveEnabled: options.pptAdaptiveMode,
    normalConcurrency: options.pptOfficeConcurrency,
    degradedConcurrency: DEFAULT_PPT_DEGRADED_CONCURRENCY,
    normalRestartSize: options.pptBatchComRestartSize,
    degradedRestartSize: options.pptBatchComRestartSizeDegraded,
    failStreakThreshold: options.pptDegradeFailStreak,
    recoverSuccessWindow: options.pptRecoverSuccessWindow
  });
  logToRenderer(
    1,
    `导出诊断: exportEngine=${options.exportEngine} requiredApps=${options.requiredOfficeApps.join(",") || "none"} officeSerial=${options.forceOfficeSerial ? "true" : "false"} fileConcurrency=${fileConcurrency} pageConcurrency=${options.pageConcurrency} pageReportInterval=${options.pageReportInterval} officeTimeoutMs=${officeTimeoutMs} pptRetry=${pptRetryCount} pptMode=isolated(requested=${pptIsolatedModeRequested ? "isolated" : "batch"}) pptOfficeConcurrency=${pptOfficeConcurrency} pptPerFileTimeoutMs=${pptPerFileTimeoutMs} batchCapMs=${pptBatchTimeoutCapMs} precheck=${officePrecheckMode} tier=${options.pptMachineTier} rollout=${options.pptRolloutBucket}<${options.pptRolloutPercent}:${options.pptRolloutEnabled ? "on" : "off"} force=${options.pptForceMode} adaptive=${options.pptAdaptiveMode ? "on" : "off"} loRuntimeMode=${options.loRuntimeMode} loRuntimeSource=${loRuntimeSnapshotAtStart.source || "missing"} loRuntimeVersion=${loRuntimeSnapshotAtStart.version || "unknown"} loSpeedMode=${options.loSpeedMode} loSpeedForcedSafe=${loSpeedSnapshotAtStart.forcedSafe ? "true" : "false"} cacheMode=${options.cacheMode} perfTuning=${options.perfTuningEnabled ? "on" : "off"} largeThresholdMb=${options.largeFileThresholdMb} smallQueueConcurrency=${options.smallQueueConcurrency}/${options.smallQueueConcurrencyCap} requested=${options.smallQueueConcurrencyRequested} largeFileMaxAttempts=${options.largeFileMaxAttempts}`
  );
  if (options.exportEngine === EXPORT_ENGINE_LIBREOFFICE && loRuntimeSnapshotAtStart.ok) {
    logToRenderer(
      1,
      `LibreOffice 运行时: source=${loRuntimeSnapshotAtStart.source || "unknown"} path=${loRuntimeSnapshotAtStart.path}${loRuntimeSnapshotAtStart.version ? ` version=${loRuntimeSnapshotAtStart.version}` : ""} probe=${loRuntimeSnapshotAtStart.probeResult || "unknown"}`
    );
  } else if (options.exportEngine === EXPORT_ENGINE_LIBREOFFICE) {
    logToRenderer(
      2,
      `LibreOffice 运行时未命中: mode=${options.loRuntimeMode} candidates=${(loRuntimeSnapshotAtStart.checkedCandidates || []).length}`
    );
  }
  let officePrecheckReport = null;
  if (!options.hasOfficeConvertibleFiles) {
    officePrecheckReport = {
      mode: "skipped",
      engine: options.exportEngine,
      requiredApps: [],
      reason: "pdf_only"
    };
    logToRenderer(1, "导出预检：本批次仅包含 PDF，跳过 LibreOffice / Office 环境预检。");
  } else if (options.officePrecheckMode !== "off" || options.exportEngine === EXPORT_ENGINE_OFFICE) {
    try {
      if (options.exportEngine === EXPORT_ENGINE_OFFICE) {
        const beforeCheck = await runMicrosoftOfficeHealthCheck({
          timeoutMs: 20000,
          requiredApps: options.requiredOfficeApps,
          light: false
        });
        officePrecheckReport = {
          mode: options.officePrecheckMode,
          engine: EXPORT_ENGINE_OFFICE,
          requiredApps: options.requiredOfficeApps,
          before: beforeCheck,
          fix: null,
          after: null
        };
        logToRenderer(1, `Microsoft Office 预检得分: ${beforeCheck.score}/100, block=${beforeCheck.blockExport ? "true" : "false"} required=${options.requiredOfficeApps.join(",") || "none"}`);
        if (Array.isArray(beforeCheck.warnings) && beforeCheck.warnings.length > 0) {
          beforeCheck.warnings.slice(0, 3).forEach((warning) => {
            logToRenderer(2, `Microsoft Office 预检告警: ${warning}`);
          });
        }
        if (beforeCheck.blockExport) {
          return {
            ok: false,
            error: "Microsoft Office 环境预检未通过，请安装所需 Word/PowerPoint，或切回 LibreOffice 后重试",
            diagnostics: {
              exportEngine: {
                requested: options.exportEngine,
                effective: options.exportEngine,
                requiredApps: options.requiredOfficeApps,
                precheckSkipped: false,
                precheckReason: ""
              },
              precheck: officePrecheckReport,
              office: beforeCheck
            }
          };
        }
      } else {
        const beforeCheck = await runLibreOfficeHealthCheck({
          timeoutMs: 20000,
          runtimeMode: options.loRuntimeMode
        });
        officePrecheckReport = {
          mode: options.officePrecheckMode,
          engine: EXPORT_ENGINE_LIBREOFFICE,
          requiredApps: options.requiredOfficeApps,
          before: beforeCheck,
          fix: null,
          after: null
        };
        logToRenderer(1, `LibreOffice 预检得分: ${beforeCheck.score}/100, block=${beforeCheck.blockExport ? "true" : "false"}`);
        if (Array.isArray(beforeCheck.warnings) && beforeCheck.warnings.length > 0) {
          beforeCheck.warnings.slice(0, 3).forEach((warning) => {
            logToRenderer(2, `LibreOffice 预检告警: ${warning}`);
          });
        }

        const needsFix = beforeCheck.blockExport || beforeCheck.score < 70;
        if (options.officePrecheckMode === "fix" && needsFix) {
          logToRenderer(2, "LibreOffice 预检命中风险，执行兼容治理壳...");
          const fixResult = await runOfficeHealthFix({ mode: "safe", timeoutMs: 30000 });
          officePrecheckReport.fix = fixResult;
          if (fixResult.ok) {
            const afterCheck = await runLibreOfficeHealthCheck({
              timeoutMs: 20000,
              runtimeMode: options.loRuntimeMode,
              refreshRuntime: true
            });
            officePrecheckReport.after = afterCheck;
            logToRenderer(1, `LibreOffice 兼容治理后预检得分: ${afterCheck.score}/100, block=${afterCheck.blockExport ? "true" : "false"}`);
          }
        }

        const finalCheck = officePrecheckReport.after || beforeCheck;
        if (finalCheck.blockExport) {
          return {
            ok: false,
            error: "LibreOffice 环境预检未通过，请安装或修复后重试",
            diagnostics: {
              exportEngine: {
                requested: options.exportEngine,
                effective: options.exportEngine,
                requiredApps: options.requiredOfficeApps,
                precheckSkipped: false,
                precheckReason: ""
              },
              precheck: officePrecheckReport,
              libreoffice: finalCheck
            }
          };
        }
      }
    } catch (error) {
      const precheckFailure = serializeError(error);
      officePrecheckReport = {
        mode: options.officePrecheckMode,
        engine: options.exportEngine,
        requiredApps: options.requiredOfficeApps,
        error: precheckFailure
      };
      logToRenderer(2, `${options.exportEngine === EXPORT_ENGINE_OFFICE ? "Microsoft Office" : "LibreOffice"} 预检执行失败: ${precheckFailure.message || "unknown"}`);
      if (options.officePrecheckMode === "fix" || options.exportEngine === EXPORT_ENGINE_OFFICE) {
        return {
          ok: false,
          error: `${options.exportEngine === EXPORT_ENGINE_OFFICE ? "Microsoft Office" : "LibreOffice"} 预检失败：${precheckFailure.message || "unknown"}`,
          diagnostics: {
            exportEngine: {
              requested: options.exportEngine,
              effective: options.exportEngine,
              requiredApps: options.requiredOfficeApps,
              precheckSkipped: false,
              precheckReason: "precheck_error"
            },
            precheck: officePrecheckReport
          }
        };
      }
    }
  }

  const errors = [];
  const fileReports = [];
  let convertedFiles = 0;
  let convertedPages = 0;
  const skippedItems = [];
  const outputFolders = [];
  const normalizedItems = items.map((rawItem, index) => {
    const ext = String(rawItem.ext || path.extname(rawItem.sourcePath || rawItem.fileName || "") || "").toLowerCase();
    const baseName = path.basename(rawItem.fileName || rawItem.sourcePath, ext);
    const displayName = String(rawItem.fileName || path.basename(rawItem.sourcePath || ""));
    return {
      ...rawItem,
      ext,
      baseName,
      isOfficeTempLock: displayName.startsWith("~$"),
      order: index
    };
  });

  const totalFiles = normalizedItems.length;
  sendProgress("convert:progress", {
    phase: "start",
    totalFiles,
    completedFiles: 0
  });
  const stopExportHeartbeat = startExportHeartbeat(
    () => `导出进行中... 已完成 ${convertedFiles}/${totalFiles}`,
    10000
  );

  const recordOutputFolder = (outputDir) => {
    if (!options.useSubfolder || !outputDir) return;
    const normalizedDir = path.normalize(outputDir);
    if (!outputFolders.some((dir) => path.normalize(dir) === normalizedDir)) {
      outputFolders.push(outputDir);
    }
  };

  const reportFileStart = (item) => {
    sendProgress("convert:progress", {
      phase: "file-start",
      currentIndex: item.order + 1,
      totalFiles,
      fileName: item.fileName
    });
    logToRenderer(1, `正在导出: ${item.sourcePath}`);
  };

  const formatConversionMetaLabel = (meta) => {
    if (!meta) return "";
    const segments = [];
    if (meta.queueType) segments.push(`queue=${meta.queueType}`);
    if (meta.engineRequested) segments.push(`engineRequested=${meta.engineRequested}`);
    if (meta.engineUsed) segments.push(`engineUsed=${meta.engineUsed}`);
    if (Number.isFinite(Number(meta.queueIndex))) segments.push(`qIndex=${Number(meta.queueIndex)}`);
    if (Number.isFinite(Number(meta.fileSizeBytes)) && Number(meta.fileSizeBytes) > 0) {
      segments.push(`sizeMb=${(Number(meta.fileSizeBytes) / (1024 * 1024)).toFixed(1)}`);
    }
    if (meta.cacheMode) segments.push(`cache=${meta.cacheMode}`);
    if (meta.openMode) segments.push(`open=${meta.openMode}`);
    if (typeof meta.repaired === "boolean") segments.push(`repaired=${meta.repaired ? "true" : "false"}`);
    if (Number.isFinite(Number(meta.attempts))) segments.push(`attempts=${Number(meta.attempts)}`);
    if (Number.isFinite(Number(meta.workerRebuilds))) segments.push(`rebuilds=${Number(meta.workerRebuilds)}`);
    if (Number.isFinite(Number(meta.retries))) segments.push(`retries=${Number(meta.retries)}`);
    if (Number.isFinite(Number(meta.durationMs)) && Number(meta.durationMs) > 0) {
      segments.push(`duration=${Number(meta.durationMs)}ms`);
    }
    if (meta.fallbackReason) segments.push(`fallback=${meta.fallbackReason}`);
    if (meta.errorCode) segments.push(`code=${meta.errorCode}`);
    if (meta.envWarning) segments.push(`env=${meta.envWarning}`);
    return segments.join(" ");
  };

  const reportFileDone = (item, result) => {
    convertedFiles += 1;
    convertedPages += result.pages;
    recordOutputFolder(result.outputDir);
    logToRenderer(1, `导出完成 ${result.pages} 页: ${item.fileName}`);
    const conversionMeta = result.conversionMeta || null;
    const metaLabel = formatConversionMetaLabel(conversionMeta);
    if (metaLabel) {
      logToRenderer(1, `导出诊断 ${item.fileName}: ${metaLabel}`);
    }
    fileReports.push({
      fileName: item.fileName,
      path: item.sourcePath,
      status: "success",
      pages: result.pages,
      conversionMeta
    });
    sendProgress("convert:progress", {
      phase: "file-done",
      currentIndex: item.order + 1,
      totalFiles,
      completedFiles: fileReports.length,
      fileName: item.fileName,
      convertedPages,
      conversionMeta
    });
  };

  const reportFileError = (item, message, detail = {}) => {
    const normalizedFailure = buildOfficeFailure(
      new Error(message || detail.rawMessage || "导出失败"),
      {
        rawMessage: detail.rawMessage || message,
        errorCode: detail.errorCode,
        timeout: detail.errorCode === "PS_TIMEOUT" || detail.errorCode === "LO_TIMEOUT",
        fallbackMessage: "导出失败"
      }
    );
    const finalMessage = detail.message || normalizedFailure.message || message || "导出失败";
    const finalCode = detail.errorCode || normalizedFailure.errorCode || "";
    errors.push({
      path: item.sourcePath,
      message: finalMessage,
      errorCode: finalCode,
      rawMessage: detail.rawMessage || message || "",
      conversionMeta: detail.conversionMeta || null
    });
    fileReports.push({
      fileName: item.fileName,
      path: item.sourcePath,
      status: "failed",
      message: finalMessage,
      errorCode: finalCode,
      conversionMeta: detail.conversionMeta || null
    });
    logToRenderer(4, `导出失败: ${item.sourcePath} (${finalMessage})`);
    sendProgress("convert:progress", {
      phase: "file-error",
      currentIndex: item.order + 1,
      totalFiles,
      completedFiles: fileReports.length,
      fileName: item.fileName,
      message: finalMessage,
      errorCode: finalCode,
      conversionMeta: detail.conversionMeta || null
    });
  };

  const buildCancelledResult = () => ({
    ok: false,
    cancelled: true,
    convertedFiles,
    convertedPages,
    errors,
    fileReports,
    skippedFiles: skippedItems.length,
    skippedItems
  });

  const buildQueueConversionMeta = (task, queueType, queueIndex, extra = {}) => ({
    queueType,
    queueIndex: Number(queueIndex) + 1,
    fileSizeBytes: Number(task?.fileSizeBytes) || 0,
    largeFile: Boolean(task?.isLarge),
    largeFileThresholdMb: Number(options.largeFileThresholdMb) || DEFAULT_LO_LARGE_FILE_THRESHOLD_MB,
    cacheMode: options.cacheMode || "off",
    ...extra
  });

  const reportFileSkippedByPageLimit = async (item, result) => {
    skippedItems.push({
      fileName: item.fileName,
      totalPages: result.totalPages,
      requiredPages: result.requiredPages
    });
    fileReports.push({
      fileName: item.fileName,
      path: item.sourcePath,
      status: "skipped",
      totalPages: result.totalPages,
      requiredPages: result.requiredPages
    });
    if (options.useSubfolder && result.outputDir) {
      try {
        const existing = await fs.promises.readdir(result.outputDir);
        if (existing.length === 0) {
          await fs.promises.rm(result.outputDir, { recursive: true, force: true });
        }
      } catch (error) {
        // Ignore cleanup errors for skipped files.
      }
    }
    logToRenderer(
      3,
      `跳过（页数不足）: ${item.fileName}（共 ${result.totalPages} 页，需要 ${result.requiredPages} 页）`
    );
    sendProgress("convert:progress", {
      phase: "file-skipped",
      currentIndex: item.order + 1,
      totalFiles,
      completedFiles: fileReports.length,
      fileName: item.fileName,
      totalPages: result.totalPages,
      requiredPages: result.requiredPages
    });
  };

  const processTaskFromQueue = async (task, queueType, queueIndex) => {
    if (conversionAbortRequested) return;
    const item = task.item;
    const stage = getConversionStageByExt(item.ext);
    const isPptTask = item.ext === ".ppt" || item.ext === ".pptx";
    const queueMeta = buildQueueConversionMeta(task, queueType, queueIndex);
    reportFileStart(item);
    try {
      const result = await convertAndRenderOneFile(task, outputRoot, options);
      if (result?.skipped) {
        await reportFileSkippedByPageLimit(item, result);
        if (isPptTask) {
          docConvertAdaptiveController.onResult({ ok: true });
        }
        return;
      }
      const existingMeta = result?.conversionMeta || null;
      const mergedMeta = isOfficeConvertibleExt(item.ext)
        ? {
          stage: existingMeta?.stage || stage,
          ...(existingMeta || {}),
          ...queueMeta
        }
        : existingMeta;
      reportFileDone(item, {
        ...result,
        conversionMeta: mergedMeta
      });
      if (isPptTask) {
        docConvertAdaptiveController.onResult({ ok: true });
      }
    } catch (error) {
      const failure = buildOfficeFailure(error, {
        timeout: error?.code === "LO_TIMEOUT",
        rawMessage: error?.rawMessage || error?.stderr || error?.stdout || error?.message,
        errorCode: error?.errorCode || error?.code,
        fallbackMessage: "导出失败"
      });
      const conversionMeta = isOfficeConvertibleExt(item.ext)
        ? buildQueueConversionMeta(task, queueType, queueIndex, {
          stage: error?.stage || stage,
          engineRequested: error?.engineRequested || options.exportEngine,
          engineUsed: error?.engineUsed || options.exportEngine,
          openMode: error?.openMode || "",
          repaired: Boolean(error?.repaired),
          retries: Number(error?.retries) || 0,
          attempts: Number(error?.attempts) || 1,
          workerRebuilds: Number(error?.workerRebuilds) || 0,
          durationMs: Number(error?.durationMs) || 0,
          timeoutMs: Number(error?.timeoutMs) || 0,
          fallbackReason: error?.fallbackReason || (task?.isLarge ? "large_queue_failed" : ""),
          errorCode: error?.errorCode || failure.errorCode || "",
          envWarning: error?.envWarning || ""
        })
        : null;
      reportFileError(item, failure.message, {
        rawMessage: failure.rawMessage,
        errorCode: failure.errorCode,
        conversionMeta
      });
      if (isPptTask) {
        docConvertAdaptiveController.onResult({
          ok: false,
          errorCode: failure.errorCode,
          rawError: failure.rawMessage
        });
      }
    }
  };

  try {
    const runnableTasks = [];
    for (const item of normalizedItems) {
      if (conversionAbortRequested) {
        sendProgress("convert:progress", { phase: "cancelled" });
        return buildCancelledResult();
      }

      if (item.isOfficeTempLock) {
        reportFileStart(item);
        skippedItems.push({
          fileName: item.fileName,
          reason: "office_temp_lock"
        });
        fileReports.push({
          fileName: item.fileName,
          path: item.sourcePath,
          status: "skipped",
          reason: "office_temp_lock"
        });
        logToRenderer(2, `跳过 Office 临时锁文件: ${item.fileName}`);
        sendProgress("convert:progress", {
          phase: "file-skipped",
          currentIndex: item.order + 1,
          totalFiles,
          completedFiles: fileReports.length,
          fileName: item.fileName,
          reason: "office_temp_lock"
        });
        continue;
      }

      if (!allowedExtensions.has(item.ext)) {
        reportFileStart(item);
        reportFileError(item, "不支持的文件类型");
        continue;
      }

      const fileSizeBytes = getFileSizeSafe(item.sourcePath);
      const isOffice = isOfficeConvertibleExt(item.ext);
      const isLarge = isOffice && fileSizeBytes > largeFileThresholdBytes;
      runnableTasks.push({
        item,
        fileSizeBytes,
        isOffice,
        isLarge
      });
    }

    const smallQueue = [];
    const largeQueue = [];
    for (const task of runnableTasks) {
      if (task.isLarge) {
        largeQueue.push(task);
      } else {
        smallQueue.push(task);
      }
    }

    smallQueue.sort((left, right) => {
      const bySize = (Number(left.fileSizeBytes) || 0) - (Number(right.fileSizeBytes) || 0);
      if (bySize !== 0) return bySize;
      return Number(left.item.order) - Number(right.item.order);
    });
    largeQueue.sort((left, right) => Number(left.item.order) - Number(right.item.order));

    logToRenderer(
      1,
      `导出队列: smallQueue=${smallQueue.length} concurrency=${options.smallQueueConcurrency}/${options.smallQueueConcurrencyCap} requested=${options.smallQueueConcurrencyRequested} largeQueue=${largeQueue.length} threshold=${options.largeFileThresholdMb}MB${options.forceOfficeSerial ? " reason=office_com_serial" : ""}`
    );

    if (smallQueue.length > 0) {
      sendProgress("convert:progress", {
        phase: "stage",
        status: `smallQueue 开始（${smallQueue.length} 个，并发 ${options.smallQueueConcurrency}）`
      });
      let cursor = 0;
      let lastBatchConcurrency = 0;
      while (cursor < smallQueue.length) {
        if (conversionAbortRequested) break;
        const adaptiveConcurrency = options.pptAdaptiveMode
          ? Math.max(1, Number(docConvertAdaptiveController.getConcurrency()) || 1)
          : options.smallQueueConcurrency;
        const currentConcurrency = Math.max(1, Math.min(options.smallQueueConcurrency, adaptiveConcurrency));
        if (currentConcurrency !== lastBatchConcurrency) {
          logToRenderer(1, `smallQueue 并发调整: ${lastBatchConcurrency || 0} -> ${currentConcurrency}`);
          lastBatchConcurrency = currentConcurrency;
        }
        const batch = smallQueue.slice(cursor, cursor + currentConcurrency);
        await runWithConcurrency(batch, currentConcurrency, async (task, offset) => {
          await processTaskFromQueue(task, "small", cursor + offset);
        });
        cursor += batch.length;
      }
    }

    if (conversionAbortRequested) {
      sendProgress("convert:progress", { phase: "cancelled" });
      return buildCancelledResult();
    }

    if (largeQueue.length > 0) {
      sendProgress("convert:progress", {
        phase: "stage",
        status: `largeQueue 开始（${largeQueue.length} 个，串行，最多尝试 ${options.largeFileMaxAttempts} 次）`
      });
      for (let queueIndex = 0; queueIndex < largeQueue.length; queueIndex += 1) {
        if (conversionAbortRequested) break;
        await processTaskFromQueue(largeQueue[queueIndex], "large", queueIndex);
      }
    }

    if (conversionAbortRequested) {
      sendProgress("convert:progress", { phase: "cancelled" });
      return buildCancelledResult();
    }
  } finally {
    if (stopExportHeartbeat) {
      stopExportHeartbeat();
    }
  }

  const pptReports = fileReports.filter((item) => item?.conversionMeta?.stage === "ppt_to_pdf");
  const pptAdaptiveSnapshot = docConvertAdaptiveController.getSnapshot();
  const toSortedStats = (stats) => Object.fromEntries(
    Object.entries(stats || {}).sort((a, b) => Number(b[1]) - Number(a[1]))
  );
  const openModeStatsRaw = {};
  const errorCodeStatsRaw = {};
  const loSpeedSnapshot = getLibreOfficeSpeedSnapshot();
  let totalDurationMs = 0;
  let maxDurationMs = 0;
  let durationCount = 0;
  const queueStats = {
    small: 0,
    large: 0,
    smallFailed: 0,
    largeFailed: 0
  };
  pptReports.forEach((item) => {
    const meta = item?.conversionMeta || {};
    const openMode = String(meta.openMode || "").trim().toLowerCase() || "unknown";
    openModeStatsRaw[openMode] = (openModeStatsRaw[openMode] || 0) + 1;
    const errorCode = String(meta.errorCode || "").trim().toUpperCase();
    if (errorCode) {
      errorCodeStatsRaw[errorCode] = (errorCodeStatsRaw[errorCode] || 0) + 1;
    }
    const durationMs = Number(meta.durationMs) || 0;
    if (durationMs > 0) {
      durationCount += 1;
      totalDurationMs += durationMs;
      maxDurationMs = Math.max(maxDurationMs, durationMs);
    }
    const queueType = String(meta.queueType || "").toLowerCase();
    if (queueType === "large") {
      queueStats.large += 1;
      if (item.status === "failed") queueStats.largeFailed += 1;
    } else if (queueType === "small") {
      queueStats.small += 1;
      if (item.status === "failed") queueStats.smallFailed += 1;
    }
  });
  const conversionDiagnostics = {
    exportEngine: {
      requested: options.exportEngine,
      effective: options.exportEngine,
      requiredApps: options.requiredOfficeApps,
      precheckSkipped: !options.hasOfficeConvertibleFiles,
      precheckReason: options.hasOfficeConvertibleFiles ? "" : "pdf_only",
      officeSerial: Boolean(options.forceOfficeSerial)
    },
    precheck: officePrecheckReport,
    loRuntime: {
      ok: Boolean(loRuntimeSnapshotAtStart.ok),
      mode: String(options.loRuntimeMode || "auto"),
      source: String(loRuntimeSnapshotAtStart.source || ""),
      path: String(loRuntimeSnapshotAtStart.path || ""),
      version: String(loRuntimeSnapshotAtStart.version || ""),
      probeResult: String(loRuntimeSnapshotAtStart.probeResult || ""),
      probeDurationMs: Number(loRuntimeSnapshotAtStart.probeDurationMs) || 0,
      checkedAt: String(loRuntimeSnapshotAtStart.checkedAt || "")
    },
    office: options.exportEngine === EXPORT_ENGINE_OFFICE
      ? (officePrecheckReport?.after || officePrecheckReport?.before || null)
      : null,
    libreoffice: options.exportEngine === EXPORT_ENGINE_LIBREOFFICE
      ? (officePrecheckReport?.after || officePrecheckReport?.before || null)
      : null,
    ppt: {
      total: pptReports.length,
      repaired: pptReports.filter((item) => item?.conversionMeta?.repaired).length,
      retried: pptReports.filter((item) => Number(item?.conversionMeta?.retries) > 0).length,
      fallbackOpened: pptReports.filter((item) => {
        const mode = String(item?.conversionMeta?.openMode || "").toLowerCase();
        return mode === "open2007" || mode === "inject";
      }).length,
      envWarnings: pptReports.filter((item) => Boolean(item?.conversionMeta?.envWarning)).length,
      cacheMode: String(options.cacheMode || "off"),
      speedMode: String(options.loSpeedMode || "safe"),
      speedForcedSafe: Boolean(loSpeedSnapshot.forcedSafe),
      speedRollbackReason: String(loSpeedSnapshot.reason || ""),
      speedRollbackAt: String(loSpeedSnapshot.updatedAt || ""),
      perfTuningEnabled: Boolean(options.perfTuningEnabled),
      isolatedMode: Boolean(options.pptIsolatedMode),
      isolatedModeRequested: Boolean(options.pptIsolatedModeRequested),
      officeConcurrency: Number(options.pptOfficeConcurrency) || 1,
      perFileTimeoutMs: Number(options.pptPerFileTimeoutMs) || 0,
      batchTimeoutCapMs: Number(options.pptBatchTimeoutCapMs) || 0,
      degradeLevel: Number(pptAdaptiveSnapshot.degradeLevel) || 0,
      currentConcurrency: Number(pptAdaptiveSnapshot.currentConcurrency) || 1,
      currentRestartSize: Number(pptAdaptiveSnapshot.currentRestartSize) || 1,
      degradeTransitions: Array.isArray(pptAdaptiveSnapshot.transitions) ? pptAdaptiveSnapshot.transitions : [],
      triggerStats: pptAdaptiveSnapshot.triggerStats || {},
      openModeStats: toSortedStats(openModeStatsRaw),
      errorCodeStats: toSortedStats(errorCodeStatsRaw),
      queue: {
        small: queueStats.small,
        large: queueStats.large,
        smallFailed: queueStats.smallFailed,
        largeFailed: queueStats.largeFailed,
        smallConcurrency: Number(options.smallQueueConcurrency) || 1,
        smallConcurrencyRequested: Number(options.smallQueueConcurrencyRequested) || 1,
        smallConcurrencyCap: Number(options.smallQueueConcurrencyCap) || 1,
        fileConcurrency: Number(fileConcurrency) || 1,
        pageConcurrency: Number(options.pageConcurrency) || 1,
        pageReportInterval: Number(options.pageReportInterval) || 1,
        largeThresholdMb: Number(options.largeFileThresholdMb) || DEFAULT_LO_LARGE_FILE_THRESHOLD_MB,
        largeMaxAttempts: Number(options.largeFileMaxAttempts) || DEFAULT_LO_LARGE_FILE_MAX_ATTEMPTS
      },
      duration: {
        totalMs: totalDurationMs,
        avgMs: durationCount > 0 ? Math.round(totalDurationMs / durationCount) : 0,
        maxMs: maxDurationMs,
        count: durationCount
      },
      rollout: {
        percent: Number(options.pptRolloutPercent) || 0,
        bucket: Number(options.pptRolloutBucket) || 0,
        enabled: Boolean(options.pptRolloutEnabled),
        seed: String(options.pptRolloutSeed || ""),
        forceMode: String(options.pptForceMode || "auto"),
        machineTier: String(options.pptMachineTier || "unknown")
      },
      policy: {
        adaptiveMode: Boolean(options.pptAdaptiveMode),
        degradeFailStreak: Number(options.pptDegradeFailStreak) || 0,
        recoverSuccessWindow: Number(options.pptRecoverSuccessWindow) || 0,
        batchComRestartSize: Number(options.pptBatchComRestartSize) || 0,
        batchComRestartSizeDegraded: Number(options.pptBatchComRestartSizeDegraded) || 0,
        reservedFields: {
          loSpeedMode: true,
          pptForceMode: true,
          pptBatchTimeoutCapMs: true,
          batchComRestartSize: true,
          batchComRestartSizeDegraded: true
        }
      }
    }
  };

  sendProgress("convert:progress", {
    phase: "done",
    totalFiles,
    completedFiles: fileReports.length,
    convertedFiles,
    convertedPages,
    errorCount: errors.length,
    fileReports,
    diagnostics: conversionDiagnostics,
    skippedFiles: skippedItems.length,
    skippedItems
  });
  return {
    ok: errors.length === 0,
    convertedFiles,
    convertedPages,
    errors,
    fileReports,
    diagnostics: conversionDiagnostics,
    outputFolders,
    skippedFiles: skippedItems.length,
    skippedItems
  };
});

ipcMain.handle("convert:cancel", async () => {
  conversionAbortRequested = true;
  terminateActiveLibreOfficeProcesses();
  terminateActiveOfficeProcesses();
  return { ok: true };
});

ipcMain.handle("office:healthCheck", async (_event, payload) => {
  try {
    const result = await runLibreOfficeHealthCheck({
      timeoutMs: payload?.timeoutMs,
      runtimeMode: payload?.runtimeMode,
      refreshRuntime: payload?.refreshRuntime
    });
    return { ok: true, result };
  } catch (error) {
    return {
      ok: false,
      error: serializeError(error)
    };
  }
});

ipcMain.handle("export:healthCheck", async (_event, payload) => {
  try {
    const result = await runExportEngineHealthCheck({
      engine: payload?.engine,
      requiredApps: payload?.requiredApps,
      timeoutMs: payload?.timeoutMs,
      runtimeMode: payload?.runtimeMode,
      refreshRuntime: payload?.refreshRuntime,
      light: payload?.light
    });
    return { ok: true, result };
  } catch (error) {
    return {
      ok: false,
      error: serializeError(error)
    };
  }
});

ipcMain.handle("office:healthFix", async (_event, payload) => {
  try {
    const mode = String(payload?.mode || "safe").trim() || "safe";
    const result = await runOfficeHealthFix({ mode, timeoutMs: payload?.timeoutMs });
    return { ok: true, result };
  } catch (error) {
    return {
      ok: false,
      error: serializeError(error)
    };
  }
});

function parseBaseLink(link) {
  const url = new URL(link);
  const baseMatch = url.pathname.match(/\/base\/([^/]+)/);
  if (!baseMatch || !baseMatch[1]) {
    throw new Error("Unable to parse app_token from link");
  }
  const appToken = baseMatch[1];
  const tableId = url.searchParams.get("table");
  const viewId = url.searchParams.get("view");
  if (!tableId) throw new Error("Missing table id in link");
  if (!viewId) throw new Error("Missing view id in link");
  return { appToken, tableId, viewId };
}

async function apiRequest({ domain, path, token, method = "GET", query, body, headers }) {
  const url = new URL(`${domain}${path}`);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      url.searchParams.set(key, String(value));
    });
  }
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...headers
    },
    body
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`API response parse failed: ${text}`);
  }
  if (!response.ok || json.code !== 0) {
    const apiError = new Error(json.msg || `API error ${response.status}`);
    apiError.code = json.code;
    apiError.status = response.status;
    throw apiError;
  }
  return json;
}

async function listTables(domain, token, appToken) {
  const response = await apiRequest({
    domain,
    path: `/open-apis/bitable/v1/apps/${appToken}/tables`,
    token
  });
  return response.data?.items || [];
}

async function listFields(domain, token, appToken, tableId, viewId) {
  const response = await apiRequest({
    domain,
    path: `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
    token,
    query: { view_id: viewId }
  });
  return response.data?.items || [];
}

async function listRecords(domain, token, appToken, tableId, viewId, limit) {
  let pageToken = undefined;
  const items = [];
  while (items.length < limit) {
    const response = await apiRequest({
      domain,
      path: `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
      token,
      query: {
        view_id: viewId,
        page_size: 200,
        page_token: pageToken
      }
    });
    const batch = response.data?.items || [];
    items.push(...batch);
    if (!response.data?.has_more) break;
    pageToken = response.data?.page_token;
  }
  return items;
}

function getMimeType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".jfif": "image/jpeg",
    ".pjpeg": "image/jpeg",
    ".pjp": "image/jpeg",
    ".avif": "image/avif",
    ".apng": "image/apng"
  };
  return mimeTypes[ext] || "application/octet-stream";
}

function getBitableParentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return imageExtensions.has(ext) ? "bitable_image" : "bitable_file";
}

async function uploadDriveFile(domain, token, filePath, parentType, parentNode) {
  const stats = await fs.promises.stat(filePath);
  const buffer = await fs.promises.readFile(filePath);
  const fileName = path.basename(filePath);
  const mimeType = getMimeType(fileName);

  const form = new FormData();
  form.append("file_name", fileName);
  form.append("parent_type", parentType);
  form.append("parent_node", parentNode);
  form.append("size", String(stats.size));

  const file = new File([buffer], fileName, { type: mimeType });
  form.append("file", file);

  const response = await apiRequest({
    domain,
    path: "/open-apis/drive/v1/medias/upload_all",
    token,
    method: "POST",
    body: form
  });
  return response.data?.file_token;
}

async function batchUpdateRecords(domain, token, appToken, tableId, records) {
  const response = await apiRequest({
    domain,
    path: `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_update`,
    token,
    method: "POST",
    query: { ignore_consistency_check: "true" },
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ records })
  });
  return response.data;
}

async function getImageFiles(folderPath) {
  const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(folderPath, entry.name))
    .filter((filePath) => imageExtensions.has(path.extname(filePath).toLowerCase()));
}

async function getImageFilesSorted(folderPath) {
  const images = await getImageFiles(folderPath);
  images.sort(compareImageFilePathNatural);
  return images;
}

async function getFirstLevelFeishuImageEntries(folderPath) {
  const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
  const images = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!imageExtensions.has(ext)) continue;
    images.push({
      name: entry.name,
      path: path.join(folderPath, entry.name)
    });
  }
  images.sort(comparePuzzleImageEntryNatural);
  return images;
}

function normalizeFeishuNotePathKey(filePath) {
  return path.resolve(filePath || "").toLowerCase();
}

function buildFeishuNoteDisplayName(entryFolder, leafFolder) {
  const entryName = path.basename(entryFolder);
  const relativePath = path.relative(entryFolder, leafFolder);
  if (!relativePath) return entryName || path.basename(leafFolder);
  const parts = relativePath.split(path.sep).filter(Boolean);
  return [entryName, ...parts].filter(Boolean).join(" / ");
}

async function collectLeafNoteFolders(entryFolder) {
  const root = path.resolve(entryFolder);
  const leaves = [];
  let rootImageCount = 0;
  let ignoredParentImageCount = 0;

  const walk = async (dir, isRoot = false) => {
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (error) {
      leaves.push({
        folderPath: dir,
        relativePath: path.relative(root, dir),
        readError: error?.message || "目录读取失败"
      });
      return;
    }

    const childDirs = entries
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => compareNaturalText(left.name, right.name));

    if (childDirs.length === 0) {
      leaves.push({
        folderPath: dir,
        relativePath: path.relative(root, dir)
      });
      return;
    }

    const directImageCount = entries.filter((entry) => {
      if (!entry.isFile()) return false;
      return imageExtensions.has(path.extname(entry.name).toLowerCase());
    }).length;
    ignoredParentImageCount += directImageCount;
    if (isRoot) {
      rootImageCount += directImageCount;
    }

    for (const child of childDirs) {
      await walk(path.join(dir, child.name), false);
    }
  };

  await walk(root, true);
  leaves.sort((left, right) => compareNaturalText(left.relativePath || "", right.relativePath || ""));
  return { leaves, rootImageCount, ignoredParentImageCount };
}

async function scanFeishuNoteFolders(entryFolders) {
  const groups = [];
  const skippedGroups = [];
  const seen = new Set();
  let dedupedCount = 0;
  let rootImageCount = 0;
  let ignoredParentImageCount = 0;
  let leafFolderCount = 0;

  for (const entryFolderRaw of entryFolders) {
    const entryFolder = String(entryFolderRaw || "").trim();
    if (!entryFolder) continue;

    let stat;
    try {
      stat = await fs.promises.stat(entryFolder);
    } catch (error) {
      skippedGroups.push({
        name: getSafeBaseName(entryFolder),
        displayName: getSafeBaseName(entryFolder),
        folderPath: entryFolder,
        sourceEntryFolder: entryFolder,
        reason: "路径不可访问"
      });
      continue;
    }
    if (!stat.isDirectory()) {
      skippedGroups.push({
        name: path.basename(entryFolder),
        displayName: path.basename(entryFolder),
        folderPath: entryFolder,
        sourceEntryFolder: entryFolder,
        reason: "不是文件夹"
      });
      continue;
    }

    const {
      leaves,
      rootImageCount: entryRootImageCount,
      ignoredParentImageCount: entryIgnoredParentImageCount
    } = await collectLeafNoteFolders(entryFolder);
    rootImageCount += entryRootImageCount;
    ignoredParentImageCount += entryIgnoredParentImageCount;
    for (const leaf of leaves) {
      const folderPath = leaf.folderPath;
      const displayName = buildFeishuNoteDisplayName(entryFolder, folderPath);
      const name = path.basename(folderPath);

      if (leaf.readError) {
        skippedGroups.push({
          name,
          displayName,
          folderPath,
          sourceEntryFolder: entryFolder,
          reason: leaf.readError
        });
        continue;
      }

      const key = normalizeFeishuNotePathKey(folderPath);
      if (seen.has(key)) {
        dedupedCount += 1;
        continue;
      }
      seen.add(key);
      leafFolderCount += 1;

      let images = [];
      try {
        images = await getFirstLevelFeishuImageEntries(folderPath);
      } catch (error) {
        skippedGroups.push({
          name,
          displayName,
          folderPath,
          sourceEntryFolder: entryFolder,
          reason: error?.message || "图片读取失败"
        });
        continue;
      }

      if (!images.length) {
        skippedGroups.push({
          name,
          displayName,
          folderPath,
          sourceEntryFolder: entryFolder,
          reason: "无可用图片"
        });
        continue;
      }

      groups.push({
        name,
        displayName,
        folderPath,
        sourceEntryFolder: entryFolder,
        images,
        imageCount: images.length
      });
    }
  }

  return {
    groups,
    skippedGroups,
    entryCount: entryFolders.length,
    leafFolderCount,
    validNoteCount: groups.length,
    imageCount: groups.reduce((sum, group) => sum + group.images.length, 0),
    rootImageCount,
    ignoredParentImageCount,
    dedupedCount
  };
}

function getSafeBaseName(filePath) {
  return path.basename(String(filePath || "")) || "未命名";
}

function pickRandomItems(list, count) {
  const result = [];
  const available = [...list];
  for (let i = available.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  for (let i = 0; i < Math.min(count, available.length); i += 1) {
    result.push(available[i]);
  }
  return result;
}

function pickSequentialItems(list, count, offset) {
  if (!list.length) return [];
  const result = [];
  for (let i = 0; i < count; i += 1) {
    result.push(list[(offset + i) % list.length]);
  }
  return result;
}

ipcMain.handle("feishu:scanNoteFolders", async (_event, payload) => {
  const entryFolders = Array.isArray(payload?.entryFolders)
    ? payload.entryFolders
    : (payload?.parentFolder ? [payload.parentFolder] : []);
  if (!entryFolders.length) {
    return { ok: false, error: "未选择入口文件夹" };
  }
  try {
    const result = await scanFeishuNoteFolders(entryFolders);
    logToRenderer(
      1,
      `飞书笔记文件夹扫描完成：${result.entryCount} 个入口，${result.validNoteCount} 篇有效笔记，共 ${result.imageCount} 张，跳过 ${result.skippedGroups.length} 个，去重 ${result.dedupedCount} 个，非笔记层忽略图片 ${result.ignoredParentImageCount} 张`
    );
    return {
      ok: true,
      entryFolders,
      ...result
    };
  } catch (error) {
    logToRenderer(4, `飞书笔记文件夹扫描失败：${error.message}`);
    return {
      ok: false,
      error: error?.message || "笔记文件夹扫描失败"
    };
  }
});

async function handleFeishuModuleUpload(_event, payload) {
  try {
    uploadAbortRequested = false;
    const token = payload?.token;
    const link = payload?.link;
    const fieldName = payload?.fieldName;
    const startRow = Number(payload?.startRow);
    const endRow = Number(payload?.endRow);
    const folders = payload?.folders;

    if (!token || !link || !fieldName) {
      return { ok: false, error: "缺少授权码、表格链接或附件字段" };
    }
    if (!Number.isInteger(startRow) || !Number.isInteger(endRow) || startRow <= 0 || endRow < startRow) {
      return { ok: false, error: "行范围不合法" };
    }
    if (!Array.isArray(folders) || folders.length === 0) {
      return { ok: false, error: "请至少配置一个图片文件夹" };
    }

    const domain = payload?.domain || "https://base-api.feishu.cn";
    const { appToken, tableId, viewId } = parseBaseLink(link);

    const folderDataList = [];
    for (const folder of folders) {
      if (!folder?.path) {
        return { ok: false, error: "存在未选择路径的文件夹配置" };
      }
      const count = Number(folder?.count) || 1;
      if (count < 1) {
        return { ok: false, error: "每行上传图片数必须至少为1" };
      }

      const mode = folder?.mode === "sequential" ? "sequential" : "random";
      const images = mode === "sequential"
        ? await getImageFilesSorted(folder.path)
        : await getImageFiles(folder.path);

      if (images.length === 0) {
        return { ok: false, error: `文件夹 "${path.basename(folder.path)}" 内无可用图片` };
      }
      if (mode === "random" && images.length < count) {
        return {
          ok: false,
          error: `文件夹 "${path.basename(folder.path)}" 图片数(${images.length})少于每行上传数(${count})`
        };
      }

      folderDataList.push({
        path: folder.path,
        mode,
        count,
        images,
        sequentialOffset: 0
      });
    }

    const rowCount = endRow - startRow + 1;
    const imagesPerRow = folderDataList.reduce((sum, item) => sum + item.count, 0);
    const totalImages = rowCount * imagesPerRow;

    sendProgress("upload:progress", {
      phase: "start",
      total: totalImages
    });

    const fields = await listFields(domain, token, appToken, tableId, viewId);
    const field = fields.find((item) => item.field_name === fieldName);
    if (!field) {
      return { ok: false, error: "未找到对应字段" };
    }
    if (field.type !== 17) {
      return { ok: false, error: "字段类型不是附件" };
    }

    const records = await listRecords(domain, token, appToken, tableId, viewId, endRow);
    if (records.length < endRow) {
      return { ok: false, error: "行范围超出记录数量" };
    }

    const recordIds = records.slice(startRow - 1, endRow).map((record) => record.record_id);
    const updates = [];
    let successCount = 0;
    const failedFiles = [];
    let imageIndex = 0;

    for (let rowIdx = 0; rowIdx < recordIds.length; rowIdx += 1) {
      if (uploadAbortRequested) {
        sendProgress("upload:progress", { phase: "cancelled" });
        return { ok: false, cancelled: true };
      }

      const recordId = recordIds[rowIdx];
      const rowNumber = startRow + rowIdx;
      const rowFileTokens = [];
      const existingAttachments = records[startRow - 1 + rowIdx].fields?.[fieldName] || [];

      for (const folderData of folderDataList) {
        const selectedForRow = folderData.mode === "sequential"
          ? pickSequentialItems(folderData.images, folderData.count, folderData.sequentialOffset)
          : pickRandomItems(folderData.images, folderData.count);

        if (folderData.mode === "sequential") {
          folderData.sequentialOffset += folderData.count;
        }

        for (const filePath of selectedForRow) {
          if (uploadAbortRequested) {
            sendProgress("upload:progress", { phase: "cancelled" });
            return { ok: false, cancelled: true };
          }

          imageIndex += 1;
          sendProgress("upload:progress", {
            phase: "file-start",
            currentIndex: imageIndex,
            total: totalImages,
            fileName: path.basename(filePath),
            rowNumber
          });
          logToRenderer(1, `上传图片 ${imageIndex}/${totalImages}: ${path.basename(filePath)} (第${rowNumber}行)`);

          try {
            const parentType = getBitableParentType(filePath);
            const fileToken = await uploadDriveFile(domain, token, filePath, parentType, appToken);
            if (fileToken) {
              rowFileTokens.push({ file_token: fileToken });
              successCount += 1;
              sendProgress("upload:progress", {
                phase: "file-done",
                currentIndex: imageIndex,
                total: totalImages,
                fileName: path.basename(filePath),
                rowNumber
              });
            } else {
              throw new Error("上传返回空 token");
            }
          } catch (error) {
            const errorInfo = serializeError(error);
            const errorMsg = errorInfo.message || "上传失败";
            const errorSuffix = errorInfo.code ? ` (错误码: ${errorInfo.code})` : "";
            failedFiles.push({
              file: path.basename(filePath),
              rowNumber,
              error: errorMsg,
              code: errorInfo.code
            });
            logToRenderer(4, `上传失败: ${path.basename(filePath)} - ${errorMsg}${errorSuffix}`);
            sendProgress("upload:progress", {
              phase: "file-error",
              currentIndex: imageIndex,
              total: totalImages,
              fileName: path.basename(filePath),
              rowNumber,
              error: errorMsg,
              code: errorInfo.code
            });
          }
        }
      }

      if (rowFileTokens.length > 0) {
        updates.push({
          record_id: recordId,
          fields: {
            [fieldName]: [...existingAttachments, ...rowFileTokens]
          }
        });
      }
    }

    if (updates.length > 0) {
      await batchUpdateRecords(domain, token, appToken, tableId, updates);
    }

    sendProgress("upload:progress", {
      phase: "done",
      total: totalImages
    });

    if (failedFiles.length > 0) {
      logToRenderer(3, `部分上传失败: ${failedFiles.length} 个文件失败`);
    }

    return {
      ok: true,
      uploaded: successCount,
      failed: failedFiles.length,
      recordIds
    };
  } catch (error) {
    return { ok: false, error: serializeError(error) };
  }
}

async function handleFeishuNoteFolderUpload(_event, payload) {
  try {
    uploadAbortRequested = false;
    const token = payload?.token;
    const link = payload?.link;
    const fieldName = payload?.fieldName;
    const startRow = Number(payload?.startRow);
    const noteGroupsRaw = Array.isArray(payload?.noteGroups) ? payload.noteGroups : [];

    if (!token || !link || !fieldName) {
      return { ok: false, error: "缺少授权码、表格链接或附件字段" };
    }
    if (!Number.isInteger(startRow) || startRow <= 0) {
      return { ok: false, error: "起始行不合法" };
    }

    const noteGroups = noteGroupsRaw
      .map((group) => {
        const images = Array.isArray(group?.images)
          ? group.images
            .filter((image) => image?.path)
            .map((image) => ({
              name: image.name || path.basename(image.path),
              path: image.path
            }))
          : [];
        images.sort((left, right) => compareImageFilePathNatural(left.path, right.path));
        return {
          name: group?.name || path.basename(group?.folderPath || ""),
          displayName: group?.displayName || group?.name || path.basename(group?.folderPath || ""),
          folderPath: group?.folderPath || "",
          images
        };
      })
      .filter((group) => group.images.length > 0);

    if (noteGroups.length === 0) {
      return { ok: false, error: "未扫描到可上传笔记" };
    }

    const domain = payload?.domain || "https://base-api.feishu.cn";
    const { appToken, tableId, viewId } = parseBaseLink(link);
    const endRow = startRow + noteGroups.length - 1;
    const totalImages = noteGroups.reduce((sum, group) => sum + group.images.length, 0);

    sendProgress("upload:progress", {
      phase: "start",
      total: totalImages
    });

    const fields = await listFields(domain, token, appToken, tableId, viewId);
    const field = fields.find((item) => item.field_name === fieldName);
    if (!field) {
      return { ok: false, error: "未找到对应字段" };
    }
    if (field.type !== 17) {
      return { ok: false, error: "字段类型不是附件" };
    }

    const records = await listRecords(domain, token, appToken, tableId, viewId, endRow);
    if (records.length < endRow) {
      return { ok: false, error: `行范围超出记录数量，需要写入到第 ${endRow} 行` };
    }

    const updates = [];
    const recordIds = [];
    const failedFiles = [];
    let successCount = 0;
    let imageIndex = 0;

    logToRenderer(1, `按笔记上传开始：${noteGroups.length} 篇笔记，共 ${totalImages} 张图片，写入第 ${startRow} 行至第 ${endRow} 行`);

    for (let groupIndex = 0; groupIndex < noteGroups.length; groupIndex += 1) {
      if (uploadAbortRequested) {
        sendProgress("upload:progress", { phase: "cancelled" });
        return { ok: false, cancelled: true };
      }

      const group = noteGroups[groupIndex];
      const rowNumber = startRow + groupIndex;
      const record = records[rowNumber - 1];
      const recordId = record.record_id;
      recordIds.push(recordId);
      const existingAttachments = record.fields?.[fieldName] || [];
      const rowFileTokens = [];

      for (const image of group.images) {
        if (uploadAbortRequested) {
          sendProgress("upload:progress", { phase: "cancelled" });
          return { ok: false, cancelled: true };
        }

        imageIndex += 1;
        const fileName = image.name || path.basename(image.path);
        sendProgress("upload:progress", {
          phase: "file-start",
          currentIndex: imageIndex,
          total: totalImages,
          fileName,
          noteName: group.displayName,
          rowNumber
        });
        logToRenderer(1, `上传图片 ${imageIndex}/${totalImages}: ${group.displayName} / ${fileName} (第${rowNumber}行)`);

        try {
          const parentType = getBitableParentType(image.path);
          const fileToken = await uploadDriveFile(domain, token, image.path, parentType, appToken);
          if (fileToken) {
            rowFileTokens.push({ file_token: fileToken });
            successCount += 1;
            sendProgress("upload:progress", {
              phase: "file-done",
              currentIndex: imageIndex,
              total: totalImages,
              fileName,
              noteName: group.displayName,
              rowNumber
            });
          } else {
            throw new Error("上传返回空 token");
          }
        } catch (error) {
          const errorInfo = serializeError(error);
          const errorMsg = errorInfo.message || "上传失败";
          const errorSuffix = errorInfo.code ? ` (错误码: ${errorInfo.code})` : "";
          failedFiles.push({
            file: fileName,
            noteName: group.displayName,
            rowNumber,
            error: errorMsg,
            code: errorInfo.code
          });
          logToRenderer(4, `上传失败: ${group.displayName} / ${fileName} - ${errorMsg}${errorSuffix}`);
          sendProgress("upload:progress", {
            phase: "file-error",
            currentIndex: imageIndex,
            total: totalImages,
            fileName,
            noteName: group.displayName,
            rowNumber,
            error: errorMsg,
            code: errorInfo.code
          });
        }
      }

      if (rowFileTokens.length > 0) {
        updates.push({
          record_id: recordId,
          fields: {
            [fieldName]: [...existingAttachments, ...rowFileTokens]
          }
        });
      }
    }

    if (updates.length > 0) {
      await batchUpdateRecords(domain, token, appToken, tableId, updates);
    }

    sendProgress("upload:progress", {
      phase: "done",
      total: totalImages
    });

    if (failedFiles.length > 0) {
      logToRenderer(3, `按笔记上传部分失败: ${failedFiles.length} 个文件失败`);
    }

    return {
      ok: true,
      uploaded: successCount,
      failed: failedFiles.length,
      recordIds
    };
  } catch (error) {
    return { ok: false, error: serializeError(error) };
  }
}

ipcMain.handle("feishu:uploadImages", async (event, payload) => {
  const uploadMode = payload?.uploadMode || "module";
  if (uploadMode === "note-folder") {
    return handleFeishuNoteFolderUpload(event, payload);
  }
  return handleFeishuModuleUpload(event, payload);
});

ipcMain.handle("feishu:uploadRandom", async (event, payload) => {
  try {
    uploadAbortRequested = false;
    const token = payload?.token;
    const link = payload?.link;
    const fieldName = payload?.fieldName;
    const startRow = Number(payload?.startRow);
    const endRow = Number(payload?.endRow);
    const imageFolder = payload?.imageFolder;

    if (!token || !link || !fieldName) {
      return { ok: false, error: "缺少授权码、表格链接或附件字段" };
    }
    if (!imageFolder) {
      return { ok: false, error: "未选择图片文件夹" };
    }
    if (!Number.isInteger(startRow) || !Number.isInteger(endRow) || startRow <= 0 || endRow < startRow) {
      return { ok: false, error: "行范围不合法" };
    }

    const domain = payload?.domain || "https://base-api.feishu.cn";
    const { appToken, tableId, viewId } = parseBaseLink(link);

    const rowCount = endRow - startRow + 1;
    const imagesPerRow = payload?.uploadCount ? Number(payload.uploadCount) : 1;
    if (imagesPerRow < 1) {
      return { ok: false, error: "每行上传图片数必须至少为1" };
    }

    const totalImagesNeeded = rowCount * imagesPerRow;

    sendProgress("upload:progress", {
      phase: "start",
      total: totalImagesNeeded
    });

    const images = await getImageFiles(imageFolder);
    if (images.length === 0) {
      return { ok: false, error: "图片文件夹内无可用图片" };
    }

    if (images.length < imagesPerRow) {
      return { ok: false, error: `图片文件夹内图片数量(${images.length})少于每行上传数(${imagesPerRow})，请增加图片或减少上传数` };
    }

    const fields = await listFields(domain, token, appToken, tableId, viewId);
    const field = fields.find((item) => item.field_name === fieldName);
    if (!field) {
      return { ok: false, error: "未找到对应字段" };
    }
    if (field.type !== 17) {
      return { ok: false, error: "字段类型不是附件" };
    }

    const records = await listRecords(domain, token, appToken, tableId, viewId, endRow);
    if (records.length < endRow) {
      return { ok: false, error: "行范围超出记录数量" };
    }

    const recordIds = records.slice(startRow - 1, endRow).map((record) => record.record_id);
    const updates = [];
    let successCount = 0;
    const failedFiles = [];
    const selectedImages = [];
    let imageIndex = 0;

    for (let rowIdx = 0; rowIdx < recordIds.length; rowIdx += 1) {
      if (uploadAbortRequested) {
        sendProgress("upload:progress", { phase: "cancelled" });
        return { ok: false, cancelled: true };
      }

      const recordId = recordIds[rowIdx];
      const rowNumber = startRow + rowIdx;
      const rowFileTokens = [];
      const existingAttachments = records[startRow - 1 + rowIdx].fields?.[fieldName] || [];

      const selectedForRow = pickRandomItems(images, imagesPerRow);
      for (let imgIdx = 0; imgIdx < selectedForRow.length; imgIdx += 1) {
        if (uploadAbortRequested) {
          sendProgress("upload:progress", { phase: "cancelled" });
          return { ok: false, cancelled: true };
        }

        const filePath = selectedForRow[imgIdx];
        selectedImages.push(filePath);
        imageIndex += 1;

        sendProgress("upload:progress", {
          phase: "file-start",
          currentIndex: imageIndex,
          total: totalImagesNeeded,
          fileName: path.basename(filePath),
          rowNumber
        });
        logToRenderer(1, `上传图片 ${imageIndex}/${totalImagesNeeded}: ${path.basename(filePath)} (第${rowNumber}行)`);

        try {
          const parentType = getBitableParentType(filePath);
          const fileToken = await uploadDriveFile(domain, token, filePath, parentType, appToken);
          if (fileToken) {
            rowFileTokens.push({ file_token: fileToken });
            successCount += 1;
            sendProgress("upload:progress", {
              phase: "file-done",
              currentIndex: imageIndex,
              total: totalImagesNeeded,
              fileName: path.basename(filePath),
              rowNumber
            });
          } else {
            throw new Error("上传返回空 token");
          }
        } catch (error) {
          const errorInfo = serializeError(error);
          const errorMsg = errorInfo.message || "上传失败";
          const errorSuffix = errorInfo.code ? ` (错误码: ${errorInfo.code})` : "";
          failedFiles.push({
            file: path.basename(filePath),
            rowNumber,
            error: errorMsg,
            code: errorInfo.code
          });
          logToRenderer(4, `上传失败: ${path.basename(filePath)} - ${errorMsg}${errorSuffix}`);
          sendProgress("upload:progress", {
            phase: "file-error",
            currentIndex: imageIndex,
            total: totalImagesNeeded,
            fileName: path.basename(filePath),
            rowNumber,
            error: errorMsg,
            code: errorInfo.code
          });
        }
      }

      if (rowFileTokens.length > 0) {
        updates.push({
          record_id: recordId,
          fields: {
            [fieldName]: [...existingAttachments, ...rowFileTokens]
          }
        });
      }
    }

    if (updates.length > 0) {
      await batchUpdateRecords(domain, token, appToken, tableId, updates);
    }

    sendProgress("upload:progress", {
      phase: "done",
      total: totalImagesNeeded
    });

    if (failedFiles.length > 0) {
      logToRenderer(3, `部分上传失败: ${failedFiles.length} 个文件失败`);
    }

    return {
      ok: true,
      uploaded: successCount,
      failed: failedFiles.length,
      recordIds,
      selected: selectedImages
    };
  } catch (error) {
    return { ok: false, error: serializeError(error) };
  }
});

ipcMain.handle("feishu:cancel", async () => {
  uploadAbortRequested = true;
  return { ok: true };
});

function sanitizeFileName(name) {
  if (!name) return "商品";
  const cleaned = String(name)
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 80) || "商品";
}

function formatTimestamp() {
  const now = new Date();
  const pad = (num) => String(num).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function resolveUniquePath(basePath) {
  if (!fs.existsSync(basePath)) return basePath;
  const ext = path.extname(basePath);
  const base = basePath.slice(0, -ext.length);
  for (let i = 1; i <= 999; i += 1) {
    const candidate = `${base}_${i}${ext}`;
    if (!fs.existsSync(candidate)) return candidate;
  }
  return `${base}_${Date.now()}${ext}`;
}

function resolveUniqueFolderPath(basePath) {
  if (!fs.existsSync(basePath)) return basePath;
  for (let i = 1; i <= 999; i += 1) {
    const candidate = `${basePath}_${i}`;
    if (!fs.existsSync(candidate)) return candidate;
  }
  return `${basePath}_${Date.now()}`;
}

function getReferer(sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    return url.toString();
  } catch (error) {
    return "https://www.xiaohongshu.com/";
  }
}

function normalizeXhsImageUrl(inputUrl) {
  try {
    const url = new URL(inputUrl);
    const host = url.host || "";
    if (!host.includes("xhscdn.com")) return inputUrl;
    if (!url.search) return inputUrl;
    if (!url.search.includes("imageView2")) return inputUrl;
    // 保留路径，重新构建参数：去掉宽度限制，使用高质量，保持 jpg 格式避免 webp 兼容问题
    // imageView2/2/w/9999 表示最大宽度9999（实际会返回原图尺寸）
    // q/100 表示100%质量
    // format/jpg 使用 jpg 格式
    return `${url.protocol}//${url.host}${url.pathname}?imageView2/2/w/9999/q/100/format/jpg`;
  } catch (error) {
    return inputUrl;
  }
}

async function downloadBuffer(url, referer) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": referer
    }
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

ipcMain.handle("xhs:download", async (event, payload) => {
  xhsAbortRequested = false;
  const outputDir = payload?.outputDir;
  const imageUrls = (Array.isArray(payload?.imageUrls) ? payload.imageUrls : [])
    .map((item) => {
      if (typeof item === "string") {
        return { url: item, zone: "general" };
      }
      if (!item || typeof item !== "object") {
        return null;
      }
      const url = typeof item.url === "string" ? item.url : "";
      if (!url) return null;
      return {
        url,
        zone: item.zone === "detail" ? "detail" : "general"
      };
    })
    .filter(Boolean);
  const taskId = payload?.taskId;
  const title = sanitizeFileName(payload?.title || "商品");
  const sourceUrl = payload?.sourceUrl || "";

  if (!sharp) {
    sharp = require("sharp");
  }

  if (!outputDir) {
    return { ok: false, error: "未设置输出目录" };
  }
  if (imageUrls.length === 0) {
    return { ok: false, error: "未提取到图片" };
  }

  await fs.promises.mkdir(outputDir, { recursive: true });

  const folderName = title;
  const folderPath = resolveUniqueFolderPath(path.join(outputDir, folderName));
  await fs.promises.mkdir(folderPath, { recursive: true });

  let success = 0;
  let failed = 0;
  let skipped = 0;
  let mainIndex = 0;
  let detailIndex = 0;

  const referer = getReferer(sourceUrl);

  try {
    sendProgress("xhs:progress", {
      taskId,
      phase: "start",
      total: imageUrls.length,
      success: 0,
      failed: 0,
      skipped: 0
    });

    for (let index = 0; index < imageUrls.length; index += 1) {
      if (xhsAbortRequested) {
        throw new Error("cancelled");
      }
      const image = imageUrls[index];
      const url = image.url;
      const isDetailZone = image.zone === "detail";
      sendProgress("xhs:progress", {
        taskId,
        phase: "downloading",
        current: index + 1,
        total: imageUrls.length,
        url
      });

      try {
        const normalizedUrl = normalizeXhsImageUrl(url);
        let buffer = null;
        try {
          buffer = await downloadBuffer(normalizedUrl, referer);
        } catch (error) {
          if (normalizedUrl !== url) {
            buffer = await downloadBuffer(url, referer);
          } else {
            throw error;
          }
        }
        let meta = null;
        try {
          meta = await sharp(buffer).metadata();
        } catch (error) {
          meta = null;
        }

        if (meta && meta.width && meta.height) {
          if (!isDetailZone && (meta.width < 200 || meta.height < 200)) {
            skipped += 1;
            continue;
          }
        }

        const jpgBuffer = await sharp(buffer)
          .jpeg({ quality: 100 })
          .toBuffer();

        const nextIndex = success + 1;
        if (isDetailZone) {
          detailIndex += 1;
        } else {
          mainIndex += 1;
        }
        const filePrefix = isDetailZone ? "详情图" : "主图";
        const fileOrder = isDetailZone ? detailIndex : mainIndex;
        const fileName = `${filePrefix}_${String(fileOrder).padStart(3, "0")}.jpg`;
        const outputPath = path.join(folderPath, fileName);
        await fs.promises.writeFile(outputPath, jpgBuffer);
        success = nextIndex;
      } catch (error) {
        failed += 1;
        logToRenderer(3, `下载失败: ${url} (${error.message})`);
      }

      sendProgress("xhs:progress", {
        taskId,
        phase: "progress",
        current: index + 1,
        total: imageUrls.length,
        success,
        failed,
        skipped
      });
    }

    sendProgress("xhs:progress", {
      taskId,
      phase: "done",
      total: imageUrls.length,
      success,
      failed,
      skipped,
      folderPath
    });

    return {
      ok: true,
      folderPath,
      total: imageUrls.length,
      success,
      failed,
      skipped
    };
  } catch (error) {
    if (error.message === "cancelled") {
      if (fs.existsSync(folderPath)) {
        await fs.promises.rm(folderPath, { recursive: true, force: true });
      }
      sendProgress("xhs:progress", {
        taskId,
        phase: "cancelled"
      });
      return { ok: false, cancelled: true };
    }

    logToRenderer(4, `小红书下载失败: ${error.message}`);
    if (fs.existsSync(folderPath)) {
      await fs.promises.rm(folderPath, { recursive: true, force: true });
    }
    return { ok: false, error: serializeError(error) };
  }
});

ipcMain.handle("xhs:cancel", async () => {
  xhsAbortRequested = true;
  return { ok: true };
});

app.on("child-process-gone", (_event, details) => {
  const type = details?.type || "unknown";
  const reason = details?.reason || "unknown";
  const exitCode = Number(details?.exitCode);
  const codeText = Number.isFinite(exitCode) ? exitCode : "n/a";
  console.error(`[child-process-gone] type=${type} reason=${reason} exitCode=${codeText}`);
});

app.whenReady().then(() => {
  const startupRuntime = resolveLibreOfficeRuntime({
    runtimeMode: normalizeLibreOfficeRuntimeMode(process.env.SCENE_LO_RUNTIME_MODE, DEFAULT_LO_RUNTIME_MODE),
    refresh: true
  });
  if (startupRuntime.ok) {
    console.log(
      `[LO_RUNTIME_STARTUP] source=${startupRuntime.source || "unknown"} path=${startupRuntime.path}${startupRuntime.version ? ` version=${startupRuntime.version}` : ""} probe=${startupRuntime.probeResult || "unknown"} durationMs=${Number(startupRuntime.probeDurationMs) || 0}`
    );
  } else {
    console.warn(
      `[LO_RUNTIME_STARTUP] missing mode=${startupRuntime.mode || "auto"} checked=${(startupRuntime.checkedCandidates || []).length}`
    );
  }
  createMainWindow();
  createMenu();
  if (startupRuntime.ok) {
    logToRenderer(
      1,
      `启动自检：LibreOffice runtime=${startupRuntime.source || "unknown"}${startupRuntime.version ? ` version=${startupRuntime.version}` : ""} probe=${startupRuntime.probeResult || "unknown"}`
    );
  } else {
    logToRenderer(
      2,
      "启动自检：未检测到可用 LibreOffice runtime，请检查 Full 安装包是否完整。"
    );
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
