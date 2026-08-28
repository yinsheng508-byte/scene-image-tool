const {
  createCapabilityResult,
  normalizeTextList
} = require("./capability-result");

function clampScore(value, fallback = 0) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.max(0, Math.min(100, Math.floor(numericValue)));
}

function normalizeHealthChecks(checks = []) {
  return (Array.isArray(checks) ? checks : [])
    .filter((check) => check && typeof check === "object")
    .map((check) => ({
      ...check,
      name: String(check.name || "unknown"),
      ok: Boolean(check.ok),
      severity: String(check.severity || "medium"),
      detail: String(check.detail || "")
    }));
}

function normalizeCapabilityList(capabilities, primaryCapability) {
  const seen = new Set();
  const out = [];
  const pushCapability = (input) => {
    if (!input || typeof input !== "object") return;
    const capability = createCapabilityResult(input);
    const key = [
      capability.platform,
      capability.capability,
      capability.source,
      capability.path,
      capability.errorCode
    ].join("|").toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(capability);
  };

  pushCapability(primaryCapability);
  if (Array.isArray(capabilities)) {
    capabilities.forEach((capability) => pushCapability(capability));
  }
  return out;
}

function createHealthReport(input = {}) {
  const {
    actions,
    blockExport: rawBlockExport,
    capabilities,
    capability,
    checks,
    engine,
    errorCode,
    message,
    ok: rawOk,
    platform,
    raw,
    score,
    suggestions,
    warnings,
    ...details
  } = input || {};
  const normalizedCapabilities = normalizeCapabilityList(capabilities, capability);
  const primaryCapability = normalizedCapabilities[0] || null;
  const capabilityWarnings = normalizedCapabilities.flatMap((item) => item.warnings || []);
  const capabilityActions = normalizedCapabilities.flatMap((item) => item.actions || []);
  const hasFailedCapability = normalizedCapabilities.some((item) => !item.ok);
  const blockExport = typeof rawBlockExport === "boolean" ? rawBlockExport : hasFailedCapability;
  const ok = rawOk === undefined ? !blockExport && !hasFailedCapability : Boolean(rawOk);
  const fallbackScore = ok ? 100 : 0;

  return {
    ...details,
    ok,
    platform: String(platform || primaryCapability?.platform || process.platform || "unknown"),
    engine: String(engine || ""),
    capability: primaryCapability,
    capabilities: normalizedCapabilities,
    blockExport,
    score: clampScore(score, fallbackScore),
    checks: normalizeHealthChecks(checks),
    warnings: normalizeTextList([...(Array.isArray(warnings) ? warnings : [warnings]), ...capabilityWarnings]),
    suggestions: normalizeTextList(suggestions || []),
    actions: normalizeTextList([...(Array.isArray(actions) ? actions : [actions]), ...capabilityActions]),
    errorCode: ok ? "" : String(errorCode || primaryCapability?.errorCode || "HEALTH_CHECK_FAILED"),
    message: String(message || primaryCapability?.message || ""),
    raw: raw && typeof raw === "object" ? raw : {}
  };
}

module.exports = {
  clampScore,
  createHealthReport,
  normalizeHealthChecks
};
