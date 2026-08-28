const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const DEFAULT_PROBE_TIMEOUT_MS = 10000;
const DARWIN_LIBREOFFICE_CANDIDATES = [
  { source: "system_app", path: "/Applications/LibreOffice.app/Contents/MacOS/soffice" },
  { source: "homebrew_arm64", path: "/opt/homebrew/bin/soffice" },
  { source: "homebrew_intel", path: "/usr/local/bin/soffice" }
];

function parsePositiveInt(value, fallback) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  const integerValue = Math.floor(numberValue);
  return integerValue > 0 ? integerValue : fallback;
}

function normalizeRuntimeMode(value, fallback = "auto") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "embedded" || normalized === "system" || normalized === "auto") {
    return normalized;
  }
  return fallback;
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
    if (match && match[1]) return match[1];
  }
  return "";
}

function expandHomePath(value, env = process.env) {
  const text = String(value || "").trim();
  if (!text.startsWith("~")) return text;
  const homeDir = String(env.HOME || process.env.HOME || "").trim();
  if (!homeDir) return text;
  if (text === "~") return homeDir;
  if (text.startsWith("~/")) return path.join(homeDir, text.slice(2));
  return text;
}

function expandEnvironmentVariables(value, env = process.env) {
  return String(value || "")
    .replace(/%([^%]+)%/g, (_all, envName) => {
      const key = String(envName || "").trim();
      return key && env[key] ? String(env[key]) : `%${key}%`;
    })
    .replace(/\$\{([^}]+)\}/g, (_all, envName) => {
      const key = String(envName || "").trim();
      return key && env[key] ? String(env[key]) : "";
    })
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_all, envName) => {
      const key = String(envName || "").trim();
      return key && env[key] ? String(env[key]) : "";
    });
}

function normalizeSofficeCandidatePath(rawPath, env = process.env) {
  if (!rawPath) return "";
  let candidate = String(rawPath || "").trim();
  if (!candidate) return "";
  candidate = candidate.replace(/^"(.+)"$/, "$1").trim();
  candidate = expandHomePath(expandEnvironmentVariables(candidate, env), env);
  if (!candidate) return "";

  const basename = path.basename(candidate);
  if (basename === "soffice") return candidate;

  try {
    if (candidate.endsWith(".app") || (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory())) {
      const appBinary = path.join(candidate, "Contents", "MacOS", "soffice");
      if (fs.existsSync(appBinary)) return appBinary;
      const directBinary = path.join(candidate, "soffice");
      if (fs.existsSync(directBinary)) return directBinary;
    }
  } catch (error) {
    // Keep the original path below; the caller records the failed candidate.
  }
  return candidate;
}

function createProbeEnv(overrides = {}) {
  return {
    ...process.env,
    ...Object.fromEntries(
      Object.entries(overrides || {})
        .filter(([key, value]) => key && value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value)])
    )
  };
}

function probeLibreOfficeBinary(sofficePath, options = {}) {
  const timeoutMs = Math.max(
    1000,
    parsePositiveInt(options.timeoutMs, DEFAULT_PROBE_TIMEOUT_MS)
  );
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
    const result = spawnSync(sofficePath, ["--headless", "--version"], {
      timeout: timeoutMs,
      encoding: "utf8",
      env: createProbeEnv(options.env)
    });
    const stdout = String(result?.stdout || "").trim();
    const stderr = String(result?.stderr || "").trim();
    const exitCode = Number.isFinite(Number(result?.status)) ? Number(result.status) : -1;
    const timedOut = Boolean(result?.error?.code === "ETIMEDOUT");
    const durationMs = Date.now() - startedAt;
    const version = extractLibreOfficeVersion(`${stdout}\n${stderr}`);

    if (timedOut) {
      return {
        ok: false,
        exitCode,
        timedOut: true,
        durationMs,
        version,
        reason: "timeout:soffice"
      };
    }
    if (result?.error) {
      return {
        ok: false,
        exitCode,
        timedOut: false,
        durationMs,
        version,
        reason: `spawn_error:${result.error.code || result.error.message || "unknown"}:soffice`
      };
    }
    if (exitCode !== 0) {
      return {
        ok: false,
        exitCode,
        timedOut: false,
        durationMs,
        version,
        reason: `exit_${exitCode}:soffice`
      };
    }
    return {
      ok: true,
      exitCode,
      timedOut: false,
      durationMs,
      version,
      reason: "ok:soffice"
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

function buildCandidateList(options = {}) {
  const env = options.env || process.env;
  const runtimeMode = normalizeRuntimeMode(options.runtimeMode);
  if (Array.isArray(options.candidates)) {
    return options.candidates
      .map((candidate, index) => {
        if (typeof candidate === "string") {
          return { source: `override_${index + 1}`, path: candidate };
        }
        return {
          source: String(candidate?.source || `override_${index + 1}`),
          path: candidate?.path || ""
        };
      });
  }
  if (runtimeMode === "embedded") {
    return [];
  }

  const candidates = [];
  const envPath = String(options.libreOfficePath || env.LIBREOFFICE_PATH || "").trim();
  if (envPath) {
    candidates.push({ source: "env", path: envPath });
  }
  candidates.push(...DARWIN_LIBREOFFICE_CANDIDATES);
  return candidates;
}

function dedupeCandidates(candidates, env = process.env) {
  const seen = new Set();
  const out = [];
  candidates.forEach((candidate) => {
    const normalizedPath = normalizeSofficeCandidatePath(candidate.path, env);
    if (!normalizedPath) return;
    const key = normalizedPath.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      source: String(candidate.source || "unknown"),
      path: normalizedPath
    });
  });
  return out;
}

function createMissingResult({ mode, warnings, checkedCandidates, errorCode, message, actions }) {
  return {
    ok: false,
    platform: "darwin",
    capability: "libreoffice",
    mode,
    source: "",
    path: "",
    version: "",
    checkedAt: new Date().toISOString(),
    probeResult: "missing",
    probeDurationMs: 0,
    warnings,
    checkedCandidates,
    errorCode,
    message,
    actions
  };
}

function detectDarwinLibreOfficeRuntime(options = {}) {
  const mode = normalizeRuntimeMode(options.runtimeMode);
  const warnings = [];
  const checkedCandidates = [];
  const actions = [
    "Install LibreOffice for macOS: brew install --cask libreoffice",
    "Set LIBREOFFICE_PATH to the soffice binary if LibreOffice is installed in a custom location"
  ];

  if (mode === "embedded") {
    warnings.push("embedded_runtime_unsupported_on_darwin");
    return createMissingResult({
      mode,
      warnings,
      checkedCandidates,
      errorCode: "PLATFORM_UNSUPPORTED",
      message: "macOS 不使用 Windows 内置 LibreOffice runtime，请安装 macOS LibreOffice 或设置 LIBREOFFICE_PATH。",
      actions
    });
  }

  const env = options.env || process.env;
  const probeTimeoutMs = Math.max(
    1000,
    parsePositiveInt(options.probeTimeoutMs, DEFAULT_PROBE_TIMEOUT_MS)
  );
  const candidates = dedupeCandidates(buildCandidateList(options), env);
  for (const candidate of candidates) {
    const checked = {
      source: candidate.source,
      path: candidate.path,
      exists: false,
      isFile: false,
      isExecutable: false,
      probeOk: false,
      probeReason: "",
      version: ""
    };
    checkedCandidates.push(checked);

    try {
      if (!fs.existsSync(candidate.path)) continue;
      checked.exists = true;
      const stats = fs.statSync(candidate.path);
      if (!stats.isFile()) continue;
      checked.isFile = true;
      try {
        fs.accessSync(candidate.path, fs.constants.X_OK);
        checked.isExecutable = true;
      } catch (error) {
        checked.probeReason = "not_executable";
        warnings.push(`candidate_not_executable:${candidate.source}`);
        continue;
      }

      const probe = probeLibreOfficeBinary(candidate.path, {
        timeoutMs: probeTimeoutMs,
        env: options.env
      });
      checked.probeOk = Boolean(probe.ok);
      checked.probeReason = String(probe.reason || "");
      checked.version = String(probe.version || "");
      if (!probe.ok) {
        warnings.push(`candidate_unusable:${candidate.source}:${probe.reason || "unknown"}`);
        continue;
      }

      return {
        ok: true,
        platform: "darwin",
        capability: "libreoffice",
        mode,
        source: candidate.source,
        path: candidate.path,
        version: probe.version || "",
        checkedAt: new Date().toISOString(),
        probeResult: "ok",
        probeDurationMs: Number(probe.durationMs) || 0,
        warnings,
        checkedCandidates,
        errorCode: "",
        message: "LibreOffice runtime detected.",
        actions: []
      };
    } catch (error) {
      checked.probeReason = `exception:${error?.message || "unknown"}`;
      warnings.push(`candidate_probe_failed:${candidate.source}`);
    }
  }

  return createMissingResult({
    mode,
    warnings,
    checkedCandidates,
    errorCode: "LO_MISSING_BINARY",
    message: "未检测到 macOS LibreOffice。请安装 LibreOffice，或设置 LIBREOFFICE_PATH 指向 soffice 可执行文件。",
    actions
  });
}

module.exports = {
  DARWIN_LIBREOFFICE_CANDIDATES,
  detectDarwinLibreOfficeRuntime,
  extractLibreOfficeVersion,
  normalizeSofficeCandidatePath,
  probeLibreOfficeBinary
};
