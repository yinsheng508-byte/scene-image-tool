#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

function parseArgs(argv) {
  const args = {
    input: "",
    timeoutMs: 180000,
    reportPath: "",
    limit: 0
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--input" && argv[i + 1]) {
      args.input = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--timeout" && argv[i + 1]) {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value) && value > 0) {
        args.timeoutMs = Math.floor(value);
      }
      i += 1;
      continue;
    }
    if (token === "--report" && argv[i + 1]) {
      args.reportPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--limit" && argv[i + 1]) {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value) && value > 0) {
        args.limit = Math.floor(value);
      }
      i += 1;
      continue;
    }
  }
  return args;
}

function getPowerShellExe() {
  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  const candidates = [
    path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    path.join(systemRoot, "Sysnative", "WindowsPowerShell", "v1.0", "powershell.exe"),
    "powershell.exe",
    "powershell"
  ];
  for (const candidate of candidates) {
    if (candidate === "powershell.exe" || candidate === "powershell") {
      return candidate;
    }
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return "powershell";
}

let gb18030Decoder = null;
function decodeBuffer(buffer) {
  if (!buffer || buffer.length === 0) return "";
  const utf8 = buffer.toString("utf8");
  if (!utf8.includes("\uFFFD")) return utf8;
  try {
    if (!gb18030Decoder) gb18030Decoder = new TextDecoder("gb18030");
    const gb = gb18030Decoder.decode(buffer);
    const utf8Replacement = (utf8.match(/\uFFFD/g) || []).length;
    const gbReplacement = (gb.match(/\uFFFD/g) || []).length;
    return gbReplacement <= utf8Replacement ? gb : utf8;
  } catch (error) {
    return utf8;
  }
}

function killProcessTree(pid) {
  if (!pid || Number(pid) <= 0) return;
  try {
    const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
    killer.on("error", () => {});
  } catch (error) {
    // Ignore cleanup errors.
  }
}

function parseJsonOutput(text) {
  const cleaned = String(text || "").replace(/^\uFEFF/, "").trim();
  if (!cleaned) return null;
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const lines = cleaned.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      if (!line.startsWith("{") && !line.startsWith("[")) continue;
      try {
        return JSON.parse(line);
      } catch (innerError) {
        // Continue.
      }
    }
    return null;
  }
}

function collectPptFiles(inputPath, output) {
  const stat = fs.statSync(inputPath);
  if (stat.isFile()) {
    const baseName = path.basename(inputPath);
    if (baseName.startsWith("~$")) {
      return;
    }
    const ext = path.extname(inputPath).toLowerCase();
    if (ext === ".ppt" || ext === ".pptx") {
      output.push(path.resolve(inputPath));
    }
    return;
  }
  if (!stat.isDirectory()) return;
  const entries = fs.readdirSync(inputPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(inputPath, entry.name);
    if (entry.isDirectory()) {
      collectPptFiles(fullPath, output);
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name.startsWith("~$")) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (ext === ".ppt" || ext === ".pptx") {
      output.push(path.resolve(fullPath));
    }
  }
}

function runPptToPdf(scriptPath, inputPath, outputPath, timeoutMs) {
  return new Promise((resolve) => {
    const ps = spawn(getPowerShellExe(), [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      inputPath,
      outputPath
    ], {
      windowsHide: true
    });

    let timedOut = false;
    const startedAt = Date.now();
    const stdoutChunks = [];
    const stderrChunks = [];
    const timeoutId = setTimeout(() => {
      timedOut = true;
      killProcessTree(ps.pid);
    }, timeoutMs);

    if (ps.stdout) {
      ps.stdout.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
    }
    if (ps.stderr) {
      ps.stderr.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));
    }

    ps.on("close", (code) => {
      clearTimeout(timeoutId);
      const durationMs = Date.now() - startedAt;
      resolve({
        exitCode: Number(code),
        timedOut,
        durationMs,
        stdout: decodeBuffer(Buffer.concat(stdoutChunks)).trim(),
        stderr: decodeBuffer(Buffer.concat(stderrChunks)).trim()
      });
    });

    ps.on("error", (error) => {
      clearTimeout(timeoutId);
      resolve({
        exitCode: -1,
        timedOut: false,
        durationMs: Date.now() - startedAt,
        stdout: "",
        stderr: error.message || String(error)
      });
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error("Usage: node scripts/ppt-export-smoke.js --input <file-or-dir> [--timeout 180000] [--limit 0] [--report report.json]");
    process.exit(2);
    return;
  }

  const scriptPath = path.join(__dirname, "ppt-to-pdf.ps1");
  if (!fs.existsSync(scriptPath)) {
    console.error("[smoke] missing script:", scriptPath);
    process.exit(2);
    return;
  }

  const files = [];
  try {
    collectPptFiles(path.resolve(args.input), files);
  } catch (error) {
    console.error("[smoke] input error:", error.message || String(error));
    process.exit(2);
    return;
  }
  files.sort((a, b) => a.localeCompare(b));
  if (args.limit > 0 && files.length > args.limit) {
    files.length = args.limit;
  }

  if (!files.length) {
    console.log("[smoke] no ppt/pptx found");
    process.exit(0);
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ppt-export-smoke-"));
  const report = [];
  let pass = 0;

  try {
    for (let index = 0; index < files.length; index += 1) {
      const filePath = files[index];
      const outputPath = path.join(tempDir, `case-${index + 1}.pdf`);
      const processResult = await runPptToPdf(scriptPath, filePath, outputPath, args.timeoutMs);
      const parsed = parseJsonOutput(processResult.stdout) || parseJsonOutput(processResult.stderr) || {};
      const outputExists = fs.existsSync(outputPath);
      const outputSize = outputExists ? fs.statSync(outputPath).size : 0;
      const ok = processResult.exitCode === 0 && parsed.ok !== false && outputExists && outputSize > 0;

      const item = {
        filePath,
        ok,
        exitCode: processResult.exitCode,
        timedOut: processResult.timedOut,
        durationMs: parsed.durationMs || processResult.durationMs,
        openMode: parsed.openMode || "",
        repaired: Boolean(parsed.repaired),
        retries: Number(parsed.retries) || 0,
        fallbackReason: parsed.fallbackReason || "",
        envWarning: parsed.envWarning || "",
        errorCode: parsed.errorCode || "",
        error: parsed.error || parsed.rawError || processResult.stderr || processResult.stdout || "",
        outputSize
      };
      report.push(item);

      if (ok) {
        pass += 1;
        console.log(
          "[PASS]",
          path.basename(filePath),
          `mode=${item.openMode || "unknown"}`,
          `repaired=${item.repaired ? "true" : "false"}`,
          `retries=${item.retries}`,
          `duration=${item.durationMs}ms`
        );
      } else {
        console.log(
          "[FAIL]",
          path.basename(filePath),
          `code=${item.errorCode || "n/a"}`,
          `timedOut=${item.timedOut ? "true" : "false"}`,
          `error=${item.error || "unknown"}`
        );
      }
    }
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors.
    }
  }

  const summary = {
    total: report.length,
    pass,
    fail: report.length - pass
  };
  console.log("");
  console.log("[summary]", `total=${summary.total}`, `pass=${summary.pass}`, `fail=${summary.fail}`);

  if (args.reportPath) {
    const reportPayload = { summary, cases: report };
    fs.writeFileSync(path.resolve(args.reportPath), JSON.stringify(reportPayload, null, 2), "utf8");
    console.log("[summary] report:", path.resolve(args.reportPath));
  }

  if (summary.fail > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[smoke] fatal:", error.message || String(error));
  process.exit(2);
});
