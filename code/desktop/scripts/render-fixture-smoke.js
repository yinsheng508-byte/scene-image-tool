#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { Canvas } = require("skia-canvas");
const { PDFiumLibrary } = require("@hyzyla/pdfium");

const DEFAULT_OUTPUT_ROOT = path.join(__dirname, "..", "_test_output", "render-fixture-smoke");

function parseArgs(argv) {
  const args = {
    output: DEFAULT_OUTPUT_ROOT,
    report: "",
    keepOutput: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--output" && argv[index + 1]) {
      args.output = argv[index + 1];
      index += 1;
    } else if (token === "--report" && argv[index + 1]) {
      args.report = argv[index + 1];
      index += 1;
    } else if (token === "--keep-output") {
      args.keepOutput = true;
    }
  }
  return args;
}

function writeReport(reportPath, payload) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function getImageProbe(filePath) {
  const metadata = await sharp(filePath).metadata();
  const stats = await sharp(filePath).stats();
  const variedChannels = stats.channels
    .slice(0, 3)
    .filter((channel) => Number(channel.max) > Number(channel.min))
    .length;
  return {
    path: filePath,
    size: fs.statSync(filePath).size,
    width: Number(metadata.width) || 0,
    height: Number(metadata.height) || 0,
    format: metadata.format || "",
    variedChannels
  };
}

function assertCase(condition, id, message, details, cases) {
  const ok = Boolean(condition);
  cases.push({
    id,
    ok,
    message: ok ? "ok" : message,
    details
  });
}

async function renderSkiaFixture(outputDir) {
  const outputPath = path.join(outputDir, "skia-source.png");
  const canvas = new Canvas(800, 500);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, 800, 500);
  gradient.addColorStop(0, "#f8fafc");
  gradient.addColorStop(1, "#e0f2fe");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 800, 500);

  ctx.fillStyle = "#0f766e";
  ctx.fillRect(64, 72, 240, 150);
  ctx.fillStyle = "#2563eb";
  ctx.beginPath();
  ctx.arc(560, 250, 92, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111827";
  ctx.font = "700 48px Arial";
  ctx.fillText("Mac Render Smoke", 64, 330);
  ctx.font = "400 28px Arial";
  ctx.fillText("skia-canvas -> sharp -> png", 64, 378);

  await fs.promises.writeFile(outputPath, await canvas.toBuffer("png"));
  return getImageProbe(outputPath);
}

async function processSharpFixture(sourcePath, outputDir) {
  const outputPath = path.join(outputDir, "sharp-resized.png");
  await sharp(sourcePath)
    .resize(400, 250, { fit: "fill", kernel: "lanczos3" })
    .modulate({ brightness: 1.03, saturation: 1.08 })
    .png({ compressionLevel: 1 })
    .toFile(outputPath);
  return getImageProbe(outputPath);
}

function createMinimalPdfBuffer() {
  const stream = [
    "q",
    "0.95 0.97 1 rg",
    "0 0 320 180 re f",
    "0.05 0.35 0.70 rg",
    "24 30 118 72 re f",
    "0.00 0.55 0.35 rg",
    "178 68 112 60 re f",
    "0.90 0.20 0.16 rg",
    "132 116 62 38 re f",
    "Q"
  ].join("\n");
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 180] /Contents 4 0 R /Resources << >> >>\nendobj\n",
    `4 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream\nendobj\n`
  ];

  let payload = "%PDF-1.4\n%\n";
  const offsets = [];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(payload, "utf8"));
    payload += object;
  }
  const xrefOffset = Buffer.byteLength(payload, "utf8");
  payload += `xref\n0 ${objects.length + 1}\n`;
  payload += "0000000000 65535 f \n";
  offsets.forEach((offset) => {
    payload += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  payload += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  payload += `startxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(payload, "utf8");
}

async function renderPdfFixture(outputDir) {
  const pdfPath = path.join(outputDir, "pdfium-basic.pdf");
  const pngPath = path.join(outputDir, "pdfium-basic-1.png");
  await fs.promises.writeFile(pdfPath, createMinimalPdfBuffer());

  const library = await PDFiumLibrary.init();
  const buffer = await fs.promises.readFile(pdfPath);
  const document = await library.loadDocument(buffer);
  try {
    const pages = Array.from(document.pages());
    if (!pages.length) {
      throw new Error("PDF fixture has no pages");
    }
    await pages[0].render({
      scale: 3,
      render: async (renderOptions) => {
        await sharp(renderOptions.data, {
          raw: {
            width: renderOptions.width,
            height: renderOptions.height,
            channels: 4
          }
        }).png({ compressionLevel: 1 }).toFile(pngPath);
        return Buffer.alloc(0);
      }
    });
    return {
      pdf: {
        path: pdfPath,
        size: fs.statSync(pdfPath).size,
        pageCount: pages.length
      },
      png: await getImageProbe(pngPath)
    };
  } finally {
    if (typeof document.destroy === "function") {
      document.destroy();
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputRoot = path.resolve(args.output);
  const reportPath = args.report
    ? path.resolve(args.report)
    : path.join(outputRoot, "report.json");
  if (!args.keepOutput) {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(outputRoot, { recursive: true });

  const cases = [];
  const skia = await renderSkiaFixture(outputRoot);
  assertCase(
    skia.width === 800 && skia.height === 500 && skia.size > 0 && skia.variedChannels >= 2,
    "skia-canvas-png",
    "skia-canvas failed to render a nonblank PNG",
    skia,
    cases
  );

  const resized = await processSharpFixture(skia.path, outputRoot);
  assertCase(
    resized.width === 400 && resized.height === 250 && resized.size > 0 && resized.variedChannels >= 2,
    "sharp-resize-png",
    "sharp failed to resize/process the PNG fixture",
    resized,
    cases
  );

  const pdfium = await renderPdfFixture(outputRoot);
  assertCase(
    pdfium.pdf.pageCount === 1
      && pdfium.pdf.size > 0
      && pdfium.png.width > 0
      && pdfium.png.height > 0
      && pdfium.png.size > 0
      && pdfium.png.variedChannels >= 2,
    "pdfium-render-png",
    "PDFium failed to render the PDF fixture to a nonblank PNG",
    pdfium,
    cases
  );

  const report = {
    ok: cases.every((item) => item.ok),
    platform: process.platform,
    outputRoot,
    reportPath,
    cases,
    summary: {
      total: cases.length,
      passed: cases.filter((item) => item.ok).length,
      failed: cases.filter((item) => !item.ok).length
    }
  };
  report.message = report.ok
    ? "Render fixture smoke passed."
    : "Render fixture smoke failed.";
  writeReport(reportPath, report);
  console.log(report.ok ? "[render-fixture-smoke] PASS" : "[render-fixture-smoke] FAIL");
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 1;
}

main().catch((error) => {
  console.error("[render-fixture-smoke] ERROR", error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
