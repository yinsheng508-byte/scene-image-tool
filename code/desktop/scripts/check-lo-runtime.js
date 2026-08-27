const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function fail(message) {
  console.error(`[check-lo-runtime] ${message}`);
  process.exit(1);
}

function info(message) {
  console.log(`[check-lo-runtime] ${message}`);
}

if (String(process.env.SCENE_SKIP_LO_RUNTIME_CHECK || "").trim() === "1") {
  info("Skip check enabled by SCENE_SKIP_LO_RUNTIME_CHECK=1");
  process.exit(0);
}

const desktopRoot = path.resolve(__dirname, "..");
const runtimeRoot = path.join(desktopRoot, "vendor", "libreoffice");
const programDir = path.join(runtimeRoot, "program");
const shareDir = path.join(runtimeRoot, "share");
const presetsDir = path.join(runtimeRoot, "presets");
const system64Dir = path.join(runtimeRoot, "System64");
const requiredFiles = [
  path.join(programDir, "soffice.exe"),
  path.join(programDir, "soffice.bin"),
  path.join(programDir, "bootstrap.ini")
];
const requiredSystem64Dlls = [
  path.join(system64Dir, "msvcp140.dll"),
  path.join(system64Dir, "vcruntime140.dll"),
  path.join(system64Dir, "vcruntime140_1.dll")
];
const versionCandidates = [
  path.join(programDir, "bootstrap.ini"),
  path.join(programDir, "version.ini")
];

function extractVersion(rawText) {
  const text = String(rawText || "").trim();
  if (!text) return "";
  const patterns = [
    /\bLibreOffice(?:\s+\w+)?\s+(\d+\.\d+(?:\.\d+){0,3})\b/i,
    /^\s*ProductKey\s*=\s*LibreOffice\s+(\d+\.\d+(?:\.\d+){0,3})\s*$/im,
    /^\s*(?:ProductVersion|Version|OOO_BASE_VERSION)\s*=\s*(\d+\.\d+(?:\.\d+){0,3})\s*$/im
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return "";
}

if (!fs.existsSync(runtimeRoot) || !fs.statSync(runtimeRoot).isDirectory()) {
  fail(`Runtime root not found: ${runtimeRoot}`);
}
if (!fs.existsSync(programDir) || !fs.statSync(programDir).isDirectory()) {
  fail(`Program directory not found: ${programDir}`);
}
if (!fs.existsSync(shareDir) || !fs.statSync(shareDir).isDirectory()) {
  fail(`Share directory not found: ${shareDir}`);
}
if (!fs.existsSync(presetsDir) || !fs.statSync(presetsDir).isDirectory()) {
  fail(`Presets directory not found: ${presetsDir}`);
}
if (!fs.existsSync(system64Dir) || !fs.statSync(system64Dir).isDirectory()) {
  fail(`System64 directory not found: ${system64Dir}`);
}

const missing = [];
requiredFiles.forEach((filePath) => {
  if (!fs.existsSync(filePath)) {
    missing.push(filePath);
    return;
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size <= 0) {
    missing.push(`${filePath} (empty_or_not_file)`);
  }
});

if (missing.length > 0) {
  fail(`Required runtime files missing:\n- ${missing.join("\n- ")}`);
}

const missingSystem64Dlls = requiredSystem64Dlls.filter((filePath) => {
  if (!fs.existsSync(filePath)) return true;
  const stat = fs.statSync(filePath);
  return !stat.isFile() || stat.size <= 0;
});
if (missingSystem64Dlls.length > 0) {
  fail(`Required System64 runtime DLLs missing:\n- ${missingSystem64Dlls.join("\n- ")}`);
}

function resolvePathEnvKey(env) {
  if (!env || typeof env !== "object") return "PATH";
  const key = Object.keys(env).find((item) => String(item).toLowerCase() === "path");
  return key || "PATH";
}

function prependEnvPath(env, entries = []) {
  const pathEntries = (entries || []).map((item) => String(item || "").trim()).filter(Boolean);
  if (!pathEntries.length) return env;
  const pathKey = resolvePathEnvKey(env);
  const currentPath = String(env[pathKey] || "");
  const merged = [...pathEntries, ...currentPath.split(";")];
  const seen = new Set();
  const finalPath = [];
  merged.forEach((item) => {
    const text = String(item || "").trim();
    if (!text) return;
    const key = process.platform === "win32" ? text.toLowerCase() : text;
    if (seen.has(key)) return;
    seen.add(key);
    finalPath.push(text);
  });
  env[pathKey] = finalPath.join(";");
  return env;
}

function createProbeEnv(sofficeExePath) {
  const env = { ...process.env };
  const loRootDir = path.dirname(path.dirname(sofficeExePath));
  const runtimeSystem64Dir = path.join(loRootDir, "System64");
  if (fs.existsSync(runtimeSystem64Dir) && fs.statSync(runtimeSystem64Dir).isDirectory()) {
    prependEnvPath(env, [runtimeSystem64Dir]);
  }
  return env;
}

function runProbe(binaryPath, sofficeExePath) {
  return spawnSync(binaryPath, ["--headless", "--version"], {
    windowsHide: true,
    timeout: 20000,
    encoding: "utf8",
    env: createProbeEnv(sofficeExePath)
  });
}

const sofficePath = path.join(programDir, "soffice.exe");
const sofficeComPath = path.join(programDir, "soffice.com");
const primaryProbePath = fs.existsSync(sofficeComPath) ? sofficeComPath : sofficePath;
const primaryProbe = runProbe(primaryProbePath, sofficePath);
if (primaryProbe?.error) {
  fail(`soffice probe failed: ${primaryProbe.error.code || primaryProbe.error.message} (${path.basename(primaryProbePath)})`);
}

let effectiveProbe = primaryProbe;
let effectiveProbePath = primaryProbePath;
if (Number(primaryProbe?.status) !== 0 && primaryProbePath.toLowerCase() === sofficeComPath.toLowerCase()) {
  const fallbackProbe = runProbe(sofficePath, sofficePath);
  if (fallbackProbe?.error) {
    fail(
      `soffice probe failed on fallback: ${fallbackProbe.error.code || fallbackProbe.error.message} `
      + `(primary=${path.basename(primaryProbePath)} status=${primaryProbe?.status}, `
      + `fallback=${path.basename(sofficePath)})`
    );
  }
  if (Number(fallbackProbe?.status) !== 0) {
    fail(
      `soffice probe exited with non-zero status: primary=${primaryProbe?.status} `
      + `(${path.basename(primaryProbePath)}), fallback=${fallbackProbe?.status} `
      + `(${path.basename(sofficePath)})`
    );
  }
  effectiveProbe = fallbackProbe;
  effectiveProbePath = sofficePath;
} else if (Number(primaryProbe?.status) !== 0) {
  fail(`soffice probe exited with non-zero status: ${primaryProbe.status} (${path.basename(primaryProbePath)})`);
}

const probeStdout = String(effectiveProbe?.stdout || "").trim();
const probeStderr = String(effectiveProbe?.stderr || "").trim();
const probeVersion = extractVersion(`${probeStdout}\n${probeStderr}`);

let versionText = "";
if (probeVersion) {
  versionText = probeVersion;
} else {
  for (const candidate of versionCandidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const raw = fs.readFileSync(candidate, "utf8");
      const parsed = extractVersion(raw);
      if (parsed) {
        versionText = parsed;
        break;
      }
    } catch (error) {
      // Ignore parse failure and continue to next candidate.
    }
  }
}

if (!versionText) {
  fail("Unable to parse LibreOffice runtime version from version.ini/bootstrap.ini");
}

const usedProbe = path.basename(effectiveProbePath).toLowerCase();
const fallbackText = usedProbe === "soffice.exe" && primaryProbePath.toLowerCase() === sofficeComPath.toLowerCase()
  ? " fallback_from=soffice.com"
  : "";
info(`Runtime check passed. version=${versionText} probe=${usedProbe}${fallbackText}`);
