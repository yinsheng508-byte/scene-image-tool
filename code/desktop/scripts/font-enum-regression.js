#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

function hasCjk(value) {
  return /[\u3400-\u9FFF\uF900-\uFAFF]/.test(String(value || ""));
}

function getSystemRoot() {
  return process.env.SystemRoot || process.env.windir || "C:\\Windows";
}

function getPowerShellCandidates() {
  if (process.platform !== "win32") return [];
  const root = getSystemRoot();
  return [
    path.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    path.join(root, "Sysnative", "WindowsPowerShell", "v1.0", "powershell.exe"),
    path.join(root, "SysWOW64", "WindowsPowerShell", "v1.0", "powershell.exe")
  ];
}

function resolvePowerShellAbsolute() {
  return getPowerShellCandidates().find((candidate) => fs.existsSync(candidate)) || "";
}

function parseLines(stdout, stderr) {
  return String(`${stdout || ""}\n${stderr || ""}`)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseJson(stdout) {
  const text = String(stdout || "").replace(/^\uFEFF/, "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (error) {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      if (!line.startsWith("[") && !line.startsWith("{")) continue;
      try {
        const parsed = JSON.parse(line);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (parseLineError) {
        // keep scanning
      }
    }
    return [];
  }
}

function runPowerShellCommand(executablePath, command, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    execFile(
      executablePath,
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
      { windowsHide: true, timeout: timeoutMs, maxBuffer: 1024 * 1024 * 30 },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `PowerShell failed (${executablePath}): ${String(stderr || stdout || error.message || "unknown").trim()}`
            )
          );
          return;
        }
        resolve({ stdout, stderr });
      }
    );
  });
}

async function getFontsByPowerShell(executablePath) {
  const command = `
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName PresentationCore
$zhLangs = @("zh-cn", "zh-hans", "zh")
$enLangs = @("en-us", "en")
$items = @()
foreach ($fontFamily in [Windows.Media.Fonts]::SystemFontFamilies) {
  $displayName = ""
  foreach ($lang in $zhLangs) {
    if ($fontFamily.FamilyNames.TryGetValue([Windows.Markup.XmlLanguage]::GetLanguage($lang), [ref]$displayName) -and $displayName) { break }
  }
  if (-not $displayName) { $displayName = $fontFamily.Source }
  $familyName = ""
  foreach ($lang in $enLangs) {
    if ($fontFamily.FamilyNames.TryGetValue([Windows.Markup.XmlLanguage]::GetLanguage($lang), [ref]$familyName) -and $familyName) { break }
  }
  if (-not $familyName) { $familyName = $fontFamily.Source }
  if ($familyName) {
    $items += [PSCustomObject]@{ family = $familyName; displayName = $displayName }
  }
}
$items | ConvertTo-Json -Compress -Depth 6
`.trim();

  const result = await runPowerShellCommand(executablePath, command);
  const list = parseJson(result.stdout);
  return list
    .map((item) => ({
      family: String(item?.family || "").trim(),
      displayName: String(item?.displayName || item?.family || "").trim()
    }))
    .filter((item) => item.family && item.displayName);
}

function summarizeFontRecords(records) {
  const list = Array.isArray(records) ? records : [];
  const dedup = [];
  const seen = new Set();
  list.forEach((item) => {
    const family = String(item?.family || item || "").trim();
    const displayName = String(item?.displayName || family).trim();
    if (!family) return;
    const key = family.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    dedup.push({ family, displayName });
  });
  const cjkDisplayCount = dedup.filter((item) => hasCjk(item.displayName)).length;
  return {
    count: dedup.length,
    cjkDisplayCount,
    sample: dedup.slice(0, 20)
  };
}

async function getFontListFallbacks() {
  const fontList = require("font-list");
  const report = {};
  try {
    const detailed = await fontList.getFonts2({ disableQuoting: true });
    report.getFonts2 = summarizeFontRecords(
      (Array.isArray(detailed) ? detailed : []).map((item) => ({
        family: item?.familyName || item?.postScriptName || item?.name || "",
        displayName: item?.name || item?.familyName || item?.postScriptName || ""
      }))
    );
  } catch (error) {
    report.getFonts2 = { error: error.message || String(error) };
  }
  try {
    const basic = await fontList.getFonts({ disableQuoting: true });
    report.getFonts = summarizeFontRecords((Array.isArray(basic) ? basic : []).map((name) => ({ family: name, displayName: name })));
  } catch (error) {
    report.getFonts = { error: error.message || String(error) };
  }
  return report;
}

async function main() {
  const report = {
    platform: process.platform,
    powershellAbsolute: "",
    powershellAbsoluteResult: null,
    powershellPathResult: null,
    fontListFallbacks: null
  };

  if (process.platform === "win32") {
    const absolute = resolvePowerShellAbsolute();
    report.powershellAbsolute = absolute || "(not found)";

    if (absolute) {
      try {
        const records = await getFontsByPowerShell(absolute);
        report.powershellAbsoluteResult = summarizeFontRecords(records);
      } catch (error) {
        report.powershellAbsoluteResult = { error: error.message || String(error) };
      }
    }

    report.powershellPathResult = { skipped: "absolute PowerShell enumeration is authoritative" };
  }

  const absOkBeforeFallback = Number(report?.powershellAbsoluteResult?.count) > 0;
  report.fontListFallbacks = absOkBeforeFallback
    ? { skipped: "absolute PowerShell enumeration succeeded" }
    : await getFontListFallbacks();
  console.log(JSON.stringify(report, null, 2));

  const absOk = Number(report?.powershellAbsoluteResult?.count) > 0;
  const pathOk = Number(report?.powershellPathResult?.count) > 0;
  const detailedOk = Number(report?.fontListFallbacks?.getFonts2?.count) > 0;
  const basicOk = Number(report?.fontListFallbacks?.getFonts?.count) > 0;
  if (!absOk && !pathOk && !detailedOk && !basicOk) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[font-enum-regression] FATAL", error.message || String(error));
  process.exit(2);
});
