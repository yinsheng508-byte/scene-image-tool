#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const sharp = require("sharp");
const { Canvas } = require("skia-canvas");

function assertPass(condition, message, details, failures) {
  if (condition) return;
  failures.push({ message, details });
}

async function loadTextLayout() {
  const filePath = path.join(__dirname, "..", "shared", "text-layout.mjs");
  return import(pathToFileURL(filePath).href);
}

async function renderBuffer(drawText, textItem, canvasSize, scale = 1) {
  const width = Math.max(1, Math.round(canvasSize.w * scale));
  const height = Math.max(1, Math.round(canvasSize.h * scale));
  const canvas = new Canvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  ctx.scale(scale, scale);
  drawText(ctx, textItem);
  return canvas.toBuffer("png");
}

async function alphaStats(imageBuffer) {
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  const channels = info.channels;
  let nonTransparent = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * channels + 3];
      if (alpha === 0) continue;
      nonTransparent += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  const bbox =
    nonTransparent === 0
      ? { x: 0, y: 0, w: 0, h: 0 }
      : {
        x: minX,
        y: minY,
        w: maxX - minX + 1,
        h: maxY - minY + 1
      };

  return { width, height, nonTransparent, bbox };
}

async function meanAlphaDiff(leftBuffer, rightBuffer, width, height) {
  const leftRaw = await sharp(leftBuffer)
    .resize(width, height, { kernel: "lanczos3", fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const rightRaw = await sharp(rightBuffer)
    .resize(width, height, { kernel: "lanczos3", fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const pixelCount = width * height;
  let total = 0;
  for (let i = 0; i < pixelCount; i += 1) {
    const alphaIndex = i * 4 + 3;
    total += Math.abs(leftRaw[alphaIndex] - rightRaw[alphaIndex]);
  }
  return total / (pixelCount * 255);
}

async function main() {
  const failures = [];
  const mainJs = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
  const preloadJs = fs.readFileSync(path.join(__dirname, "..", "preload.js"), "utf8");
  const puzzleIndexJs = fs.readFileSync(
    path.join(__dirname, "..", "renderer", "puzzle", "index.js"),
    "utf8"
  );
  assertPass(
    mainJs.includes("puzzle:renderExportPreview"),
    "主进程缺少导出同源预览 IPC",
    { file: "main.js" },
    failures
  );
  assertPass(
    preloadJs.includes("renderPuzzleExportPreview"),
    "preload 缺少 renderPuzzleExportPreview 桥接",
    { file: "preload.js" },
    failures
  );
  assertPass(
    puzzleIndexJs.includes("renderPuzzleExportPreview"),
    "渲染层未调用导出同源预览接口",
    { file: "renderer/puzzle/index.js" },
    failures
  );
  assertPass(
    puzzleIndexJs.includes("normalizePreviewMode(AppState.previewMode) === \"export\""),
    "渲染层缺少精确预览分支",
    { file: "renderer/puzzle/index.js" },
    failures
  );

  const { drawText, normalizeStyle } = await loadTextLayout();

  const normalized = normalizeStyle({});
  assertPass(normalized.strokeWidth === 0, "normalizeStyle 默认 strokeWidth 应为 0", normalized, failures);
  assertPass(normalized.shadowBlur === 0, "normalizeStyle 默认 shadowBlur 应为 0", normalized, failures);

  const canvasSize = { w: 720, h: 320 };
  const baseText = {
    type: "text",
    content: "拼图文字回归ABC123",
    x: 60,
    y: 90,
    width: 580,
    rotation: 0,
    style: {
      fontFamily: "SourceHanSansCN",
      fontSize: 72,
      fontWeight: 700,
      fontStyle: "normal",
      color: "#111111",
      textAlign: "left",
      letterSpacing: 0,
      lineHeight: 1.2,
      strokeWidth: 0,
      strokeColor: "#000000",
      shadowColor: "#000000",
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0
    }
  };

  const strokeText = {
    ...baseText,
    style: {
      ...baseText.style,
      strokeWidth: 4,
      strokeColor: "#ff3b30"
    }
  };

  const shadowText = {
    ...baseText,
    style: {
      ...baseText.style,
      shadowColor: "#000000",
      shadowBlur: 10,
      shadowOffsetX: 10,
      shadowOffsetY: 8
    }
  };

  const comboText = {
    ...baseText,
    style: {
      ...baseText.style,
      strokeWidth: 3,
      strokeColor: "#ff8a00",
      shadowColor: "#000000",
      shadowBlur: 8,
      shadowOffsetX: 8,
      shadowOffsetY: 6
    }
  };

  const baseBuffer = await renderBuffer(drawText, baseText, canvasSize, 1);
  const strokeBuffer = await renderBuffer(drawText, strokeText, canvasSize, 1);
  const shadowBuffer = await renderBuffer(drawText, shadowText, canvasSize, 1);
  const combo1x = await renderBuffer(drawText, comboText, canvasSize, 1);
  const combo2x = await renderBuffer(drawText, comboText, canvasSize, 2);

  const baseStats = await alphaStats(baseBuffer);
  const strokeStats = await alphaStats(strokeBuffer);
  const shadowStats = await alphaStats(shadowBuffer);

  assertPass(
    strokeStats.nonTransparent > baseStats.nonTransparent,
    "描边渲染后非透明像素应增加",
    { base: baseStats.nonTransparent, stroke: strokeStats.nonTransparent },
    failures
  );
  assertPass(
    shadowStats.bbox.w >= baseStats.bbox.w && shadowStats.bbox.h >= baseStats.bbox.h,
    "阴影渲染后包围盒不应小于基础文字",
    { base: baseStats.bbox, shadow: shadowStats.bbox },
    failures
  );

  const meanDiff = await meanAlphaDiff(combo1x, combo2x, canvasSize.w, canvasSize.h);
  assertPass(
    meanDiff <= 0.12,
    "1x 预览与 2x 导出缩放回采样差异超阈值",
    { meanDiff },
    failures
  );

  const report = {
    passed: failures.length === 0,
    failed: failures.length,
    metrics: {
      baseNonTransparent: baseStats.nonTransparent,
      strokeNonTransparent: strokeStats.nonTransparent,
      baseBBox: baseStats.bbox,
      shadowBBox: shadowStats.bbox,
      previewExportMeanAlphaDiff: meanDiff,
      exportPreviewWiring: true
    },
    failures
  };

  if (report.passed) {
    console.log("[puzzle-text-style-regression] PASS");
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.error("[puzzle-text-style-regression] FAIL");
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
}

main().catch((error) => {
  console.error("[puzzle-text-style-regression] FATAL", error?.message || String(error));
  process.exit(2);
});
