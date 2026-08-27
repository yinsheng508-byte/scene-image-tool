#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const SAMPLE_TEXTS = ["拼图字体Probe123", "中文字体可用性检测", "AaBbCc123混排"];
const PROBE_FONT_SIZE = 42;
const MISSING_FAMILY = "__scene_tool_missing_font__";

function parseArgs(argv) {
  const args = {
    mode: "both",
    strict: false,
    minPassRate: 0.65,
    output: "",
    packagedRoot: "",
    requiredFamilies: ["SourceHanSansCN", "SourceHanSerifCN"]
  };

  argv.forEach((arg) => {
    if (arg === "--strict") {
      args.strict = true;
      return;
    }
    if (!arg.startsWith("--")) return;
    const [rawKey, rawValue] = arg.split("=");
    const key = rawKey.trim();
    const value = rawValue === undefined ? "" : rawValue.trim();

    if (key === "--mode" && value) {
      args.mode = value;
      return;
    }
    if (key === "--output" && value) {
      args.output = value;
      return;
    }
    if (key === "--packaged-root" && value) {
      args.packagedRoot = value;
      return;
    }
    if (key === "--min-pass-rate" && value) {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 1) {
        args.minPassRate = numeric;
      }
      return;
    }
    if (key === "--required-families" && value) {
      const families = value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      if (families.length > 0) {
        args.requiredFamilies = families;
      }
    }
  });

  return args;
}

function normalizeStyle(style) {
  return style === "italic" ? "italic" : "normal";
}

function normalizeWidth(width) {
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

function collectRuntimes(desktopRoot, mode, packagedRoot) {
  const defaultPackagedRoot = path.join(
    desktopRoot,
    "dist",
    "win-unpacked",
    "resources",
    "app.asar.unpacked"
  );
  const packagedBase = packagedRoot ? path.resolve(packagedRoot) : defaultPackagedRoot;
  const all = [
    {
      name: "dev",
      canvasModulePath: path.join(desktopRoot, "node_modules", "skia-canvas"),
      fontsDir: path.join(desktopRoot, "fonts"),
      mode: "dev"
    },
    {
      name: "packaged",
      canvasModulePath: path.join(packagedBase, "node_modules", "skia-canvas"),
      fontsDir: path.join(packagedBase, "fonts"),
      mode: "packaged"
    }
  ];
  if (mode === "dev") return [all[0]];
  if (mode === "packaged") return [all[1]];
  return all;
}

function createFontFaceList(fontConfig) {
  const faces = [];
  const seen = new Set();

  const pushFace = (face) => {
    const family = String(face?.family || "").trim();
    if (!family) return;
    const weight = Number(face.weight) || 400;
    const style = normalizeStyle(face.style);
    const key = `${family}|${weight}|${style}`;
    if (seen.has(key)) return;
    seen.add(key);
    faces.push({
      family,
      weight,
      style,
      type: face.type || "unknown",
      file: face.file || ""
    });
  };

  (fontConfig || []).forEach((font) => {
    if (!font?.family) return;
    if (Array.isArray(font.platform) && font.platform.length > 0 && !font.platform.includes(process.platform)) {
      return;
    }
    pushFace(font);
  });

  return faces;
}

function createFamilyStats(results) {
  const map = new Map();
  results.forEach((item) => {
    const family = item.family;
    if (!map.has(family)) {
      map.set(family, { total: 0, capable: 0 });
    }
    const stat = map.get(family);
    stat.total += 1;
    if (item.capable) {
      stat.capable += 1;
    }
  });
  return map;
}

function probeFace(ctx, family, weight, style) {
  let capable = false;
  const samples = [];
  const styleToken = normalizeStyle(style);
  const weightToken = String(Number(weight) || 400);

  for (const text of SAMPLE_TEXTS) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.font = `${styleToken} ${weightToken} ${PROBE_FONT_SIZE}px "${family}"`;
    ctx.fillStyle = "#000000";
    ctx.textBaseline = "top";
    const targetWidth = normalizeWidth(ctx.measureText(text).width);
    ctx.fillText(text, 6, 6);
    const targetSignature = computeAlphaSignature(ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data);

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.font = `${styleToken} ${weightToken} ${PROBE_FONT_SIZE}px "${MISSING_FAMILY}"`;
    ctx.fillStyle = "#000000";
    ctx.textBaseline = "top";
    const fallbackWidth = normalizeWidth(ctx.measureText(text).width);
    ctx.fillText(text, 6, 6);
    const fallbackSignature = computeAlphaSignature(ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data);

    const widthDelta = Math.abs(targetWidth - fallbackWidth);
    const signatureDelta = targetSignature !== fallbackSignature;
    if (widthDelta > 0.01 || signatureDelta) {
      capable = true;
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

  return {
    family,
    weight: Number(weight) || 400,
    style: styleToken,
    capable,
    reason: capable ? "probe_differs_from_missing_font" : "probe_matches_missing_font",
    samples
  };
}

async function probeRuntime(runtime, moduleInfo) {
  const result = {
    runtime: runtime.name,
    mode: runtime.mode,
    canvasModulePath: runtime.canvasModulePath,
    fontsDir: runtime.fontsDir,
    status: "ok",
    message: "",
    registerAttempted: 0,
    registerSucceeded: 0,
    faces: [],
    failures: []
  };

  if (!fs.existsSync(runtime.canvasModulePath)) {
    result.status = "skipped";
    result.message = `skia-canvas 模块不存在: ${runtime.canvasModulePath}`;
    return result;
  }

  let canvasLib = null;
  try {
    canvasLib = require(runtime.canvasModulePath);
  } catch (error) {
    result.status = "error";
    result.message = `加载 skia-canvas 失败: ${error.message || String(error)}`;
    return result;
  }

  const { FontLibrary, Canvas } = canvasLib;
  const faces = createFontFaceList(moduleInfo.FONT_CONFIG);
  const familyFileMap = new Map();

  (moduleInfo.FONT_CONFIG || []).forEach((font) => {
    if (font.type !== "local" || !font.file || !font.family) return;
    if (Array.isArray(font.platform) && font.platform.length > 0 && !font.platform.includes(process.platform)) {
      return;
    }
    const fontPath = path.join(runtime.fontsDir, font.file);
    if (!fs.existsSync(fontPath)) {
      result.failures.push({
        stage: "register",
        family: font.family,
        weight: Number(font.weight) || 400,
        style: normalizeStyle(font.style),
        file: font.file,
        message: `字体文件不存在: ${fontPath}`
      });
      return;
    }
    const aliases = new Set([font.family]);
    if (font.displayName && font.displayName !== font.family) {
      aliases.add(font.displayName);
    }
    aliases.forEach((alias) => {
      if (!familyFileMap.has(alias)) {
        familyFileMap.set(alias, []);
      }
      const list = familyFileMap.get(alias);
      if (!list.includes(fontPath)) {
        list.push(fontPath);
      }
    });
  });

  for (const [family, paths] of familyFileMap) {
    result.registerAttempted += 1;
    try {
      FontLibrary.use(family, paths);
      result.registerSucceeded += 1;
    } catch (error) {
      result.failures.push({
        stage: "register",
        family,
        weight: 400,
        style: "normal",
        file: paths[0] || "",
        message: error.message || String(error)
      });
    }
  }

  const canvas = new Canvas(1200, 180);
  const ctx = canvas.getContext("2d");
  faces.forEach((face) => {
    const probe = probeFace(
      ctx,
      face.family,
      face.weight,
      face.style
    );
    result.faces.push({
      family: face.family,
      weight: face.weight,
      style: face.style,
      type: face.type,
      file: face.file,
      capable: probe.capable,
      reason: probe.reason,
      samples: probe.samples
    });
  });

  return result;
}

function summarizeRuntime(runtimeResult) {
  const total = runtimeResult.faces.length;
  const capable = runtimeResult.faces.filter((face) => face.capable).length;
  const failed = total - capable;
  const passRate = total > 0 ? capable / total : 0;
  return { total, capable, failed, passRate };
}

function logRuntime(runtimeResult) {
  const summary = summarizeRuntime(runtimeResult);
  console.log(
    `[font-probe] runtime=${runtimeResult.runtime} status=${runtimeResult.status} ` +
    `registered=${runtimeResult.registerSucceeded}/${runtimeResult.registerAttempted} ` +
    `faces=${summary.total} capable=${summary.capable} failed=${summary.failed} ` +
    `passRate=${summary.passRate.toFixed(2)}`
  );

  if (runtimeResult.message) {
    console.log(`  message: ${runtimeResult.message}`);
  }

  runtimeResult.failures.slice(0, 20).forEach((item) => {
    console.log(
      `  [register-fail] family=${item.family} weight=${item.weight} style=${item.style} ` +
      `file=${item.file || "-"} msg=${item.message}`
    );
  });
  if (runtimeResult.failures.length > 20) {
    console.log(`  ... 其余 ${runtimeResult.failures.length - 20} 条注册失败省略`);
  }

  runtimeResult.faces
    .filter((face) => !face.capable)
    .slice(0, 30)
    .forEach((face) => {
      console.log(
        `  [probe-fail] family=${face.family} weight=${face.weight} style=${face.style} ` +
        `type=${face.type} reason=${face.reason}`
      );
    });
}

function evaluateStrict(results, args) {
  const targetResults = results.filter((item) => item.status === "ok");
  if (targetResults.length === 0) {
    return {
      passed: false,
      reasons: ["没有可检查的运行时结果（全部跳过或失败）"]
    };
  }

  const reasons = [];
  targetResults.forEach((runtimeResult) => {
    const summary = summarizeRuntime(runtimeResult);
    if (summary.total > 0 && summary.passRate < args.minPassRate) {
      reasons.push(
        `运行时 ${runtimeResult.runtime} 通过率过低: ${summary.passRate.toFixed(2)} < ${args.minPassRate.toFixed(2)}`
      );
    }

    const familyStats = createFamilyStats(runtimeResult.faces);
    args.requiredFamilies.forEach((family) => {
      const stats = familyStats.get(family);
      if (!stats || stats.capable === 0) {
        reasons.push(`运行时 ${runtimeResult.runtime} 关键字体不可用: ${family}`);
      }
    });
  });

  return {
    passed: reasons.length === 0,
    reasons
  };
}

async function loadFontConfigModule(desktopRoot) {
  const modulePath = path.join(desktopRoot, "shared", "font-config.mjs");
  const moduleUrl = pathToFileURL(modulePath).href;
  return import(moduleUrl);
}

function writeReport(reportPath, payload) {
  const dir = path.dirname(reportPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2), "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const desktopRoot = path.resolve(__dirname, "..");
  const runtimes = collectRuntimes(desktopRoot, args.mode, args.packagedRoot);
  const fontModule = await loadFontConfigModule(desktopRoot);

  const results = [];
  for (const runtime of runtimes) {
    const runtimeResult = await probeRuntime(runtime, fontModule);
    logRuntime(runtimeResult);
    results.push(runtimeResult);
  }

  const strictResult = evaluateStrict(results, args);
  if (args.strict && !strictResult.passed) {
    strictResult.reasons.forEach((reason) => console.error(`[strict-fail] ${reason}`));
  }

  const reportPath = args.output
    ? path.resolve(args.output)
    : path.join(desktopRoot, "dist", "font-probe-report.json");
  const payload = {
    generatedAt: new Date().toISOString(),
    args,
    results,
    strict: strictResult
  };
  writeReport(reportPath, payload);
  console.log(`[font-probe] report written: ${reportPath}`);

  if (args.strict && !strictResult.passed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[font-probe] fatal:", error.message || String(error));
  process.exit(2);
});
