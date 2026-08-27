#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let sharp = null;
let loadImage = null;

try {
  sharp = require("sharp");
  ({ loadImage } = require("skia-canvas"));
} catch (error) {
  console.error("[smoke] Missing dependency:", error.message);
  process.exit(2);
}

const allowedExt = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".bmp",
  ".gif",
  ".tif",
  ".tiff",
  ".avif",
  ".apng"
]);

function getDefaultRoot() {
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, "scene-image-tool-desktop", "PPT-Stitcher");
}

function walkImages(dir, output) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkImages(fullPath, output);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!allowedExt.has(ext)) continue;
    output.push(fullPath);
  }
}

async function probeFile(filePath) {
  const result = {
    filePath,
    readOk: false,
    sharpOk: false,
    canvasOk: false,
    errorStage: "",
    error: ""
  };
  let buffer = null;
  try {
    buffer = await fs.promises.readFile(filePath);
    result.readOk = true;
  } catch (error) {
    result.errorStage = "read";
    result.error = error.message || String(error);
    return result;
  }

  try {
    await sharp(buffer, { failOn: "none" }).metadata();
    result.sharpOk = true;
  } catch (error) {
    result.errorStage = "sharp";
    result.error = error.message || String(error);
    return result;
  }

  try {
    await loadImage(buffer);
    result.canvasOk = true;
  } catch (error) {
    result.errorStage = "canvas";
    result.error = error.message || String(error);
    return result;
  }
  return result;
}

async function main() {
  const rootArg = process.argv[2];
  const rootDir = rootArg ? path.resolve(rootArg) : getDefaultRoot();
  const folders = ["stickers", "backgrounds"].map((name) => path.join(rootDir, name));
  const files = [];
  for (const folder of folders) {
    walkImages(folder, files);
  }
  if (!files.length) {
    console.log("[smoke] no images found under:", rootDir);
    process.exit(0);
    return;
  }

  files.sort((a, b) => a.localeCompare(b));

  let pass = 0;
  const failed = [];
  for (const filePath of files) {
    const result = await probeFile(filePath);
    if (result.readOk && result.sharpOk && result.canvasOk) {
      pass += 1;
      console.log("[PASS]", path.basename(filePath));
      continue;
    }
    failed.push(result);
    console.log(
      "[FAIL]",
      path.basename(filePath),
      "stage=" + (result.errorStage || "unknown"),
      "error=" + (result.error || "unknown")
    );
  }

  console.log("");
  console.log("[summary] total=", files.length, "pass=", pass, "fail=", failed.length);
  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[smoke] fatal:", error.message || String(error));
  process.exit(2);
});
