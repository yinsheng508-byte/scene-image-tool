#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {
    inputs: [],
    out: ""
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--input" && argv[i + 1]) {
      const value = String(argv[i + 1]).trim();
      if (value) {
        value.split(",").map((item) => item.trim()).filter(Boolean).forEach((item) => args.inputs.push(item));
      }
      i += 1;
      continue;
    }
    if (token === "--out" && argv[i + 1]) {
      args.out = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
  }
  return args;
}

function median(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].map((value) => Number(value) || 0).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
}

function loadJsonFile(filePath) {
  const absPath = path.resolve(filePath);
  const raw = fs.readFileSync(absPath, "utf8");
  return JSON.parse(raw);
}

function normalizeRun(payload, sourcePath) {
  let fileReports = Array.isArray(payload?.fileReports) ? payload.fileReports : [];
  let errors = Array.isArray(payload?.errors) ? payload.errors : [];
  if (fileReports.length === 0 && Array.isArray(payload?.cases)) {
    fileReports = payload.cases.map((item) => ({
      status: item?.ok ? "success" : "failed",
      errorCode: item?.errorCode || "",
      conversionMeta: {
        stage: "ppt_to_pdf",
        durationMs: Number(item?.durationMs) || 0,
        retries: Number(item?.retries) || 0,
        errorCode: item?.errorCode || ""
      }
    }));
    errors = payload.cases
      .filter((item) => !item?.ok)
      .map((item) => ({
        errorCode: item?.errorCode || "",
        message: item?.error || "failed"
      }));
  }
  const totalFiles = Number(payload?.totalFiles) || fileReports.length;
  const success = fileReports.filter((item) => item?.status === "success").length;
  const failed = fileReports.filter((item) => item?.status === "failed").length || errors.length;
  const skipped = fileReports.filter((item) => item?.status === "skipped").length;
  const pptDurations = fileReports
    .filter((item) => item?.conversionMeta?.stage === "ppt_to_pdf")
    .map((item) => Number(item?.conversionMeta?.durationMs) || 0)
    .filter((value) => value > 0);
  const pptRetries = fileReports
    .filter((item) => item?.conversionMeta?.stage === "ppt_to_pdf")
    .map((item) => Number(item?.conversionMeta?.retries) || 0)
    .reduce((sum, value) => sum + value, 0);
  const errorCodes = {};
  const collectCode = (value) => {
    const code = String(value || "").trim().toUpperCase();
    if (!code) return;
    errorCodes[code] = (errorCodes[code] || 0) + 1;
  };
  errors.forEach((item) => collectCode(item?.errorCode));
  fileReports.forEach((item) => {
    if (item?.status === "failed") {
      collectCode(item?.errorCode || item?.conversionMeta?.errorCode);
    }
  });

  return {
    sourcePath,
    totalFiles,
    success,
    failed,
    skipped,
    convertedPages: Number(payload?.convertedPages) || 0,
    pptDurations,
    pptRetries,
    errorCodes
  };
}

function mergeErrorStats(statsList) {
  const merged = {};
  statsList.forEach((stats) => {
    Object.entries(stats || {}).forEach(([code, count]) => {
      merged[code] = (merged[code] || 0) + (Number(count) || 0);
    });
  });
  return Object.fromEntries(
    Object.entries(merged).sort((left, right) => Number(right[1]) - Number(left[1]))
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.inputs.length) {
    console.error("Usage: node scripts/export-baseline-report.js --input <report1.json[,report2.json]> [--out baseline.json]");
    process.exit(2);
    return;
  }

  const runs = args.inputs.map((inputPath) => normalizeRun(loadJsonFile(inputPath), path.resolve(inputPath)));
  const totalFiles = runs.reduce((sum, run) => sum + run.totalFiles, 0);
  const totalSuccess = runs.reduce((sum, run) => sum + run.success, 0);
  const totalFailed = runs.reduce((sum, run) => sum + run.failed, 0);
  const totalSkipped = runs.reduce((sum, run) => sum + run.skipped, 0);
  const totalPages = runs.reduce((sum, run) => sum + run.convertedPages, 0);
  const allPptDurations = runs.flatMap((run) => run.pptDurations);
  const pptAvgByRun = runs.map((run) => {
    if (!run.pptDurations.length) return 0;
    return Math.round(run.pptDurations.reduce((sum, value) => sum + value, 0) / run.pptDurations.length);
  }).filter((value) => value > 0);
  const report = {
    generatedAt: new Date().toISOString(),
    inputs: runs.map((run) => run.sourcePath),
    runCount: runs.length,
    aggregate: {
      totalFiles,
      totalSuccess,
      totalFailed,
      totalSkipped,
      totalPages,
      successRate: totalFiles > 0 ? Number((totalSuccess / totalFiles).toFixed(4)) : 0,
      totalPptRetries: runs.reduce((sum, run) => sum + run.pptRetries, 0)
    },
    median: {
      filesPerRun: median(runs.map((run) => run.totalFiles)),
      successPerRun: median(runs.map((run) => run.success)),
      failedPerRun: median(runs.map((run) => run.failed)),
      skippedPerRun: median(runs.map((run) => run.skipped)),
      pptToPdfAvgMsPerRun: median(pptAvgByRun),
      pptToPdfMsOverall: median(allPptDurations)
    },
    errorCodeStats: mergeErrorStats(runs.map((run) => run.errorCodes))
  };

  const outputText = JSON.stringify(report, null, 2);
  if (args.out) {
    const outPath = path.resolve(args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, outputText, "utf8");
    console.log(`[baseline] report saved: ${outPath}`);
    return;
  }
  process.stdout.write(`${outputText}\n`);
}

try {
  main();
} catch (error) {
  console.error(`[baseline] failed: ${error?.message || String(error)}`);
  process.exit(1);
}
