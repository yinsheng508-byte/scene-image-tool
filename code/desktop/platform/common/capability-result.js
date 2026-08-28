function normalizeTextList(items) {
  const seen = new Set();
  const out = [];
  (Array.isArray(items) ? items : [items]).forEach((item) => {
    const text = String(item || "").trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(text);
  });
  return out;
}

function createCapabilityResult(input = {}) {
  const {
    actions,
    capability,
    errorCode,
    message,
    ok: rawOk,
    path: capabilityPath,
    platform,
    source,
    version,
    warnings,
    ...details
  } = input || {};
  const ok = Boolean(rawOk);
  return {
    ...details,
    ok,
    platform: String(platform || process.platform || "unknown"),
    capability: String(capability || ""),
    source: String(source || ""),
    path: String(capabilityPath || ""),
    version: String(version || ""),
    warnings: normalizeTextList(warnings || []),
    errorCode: ok ? "" : String(errorCode || "CAPABILITY_UNAVAILABLE"),
    message: String(message || ""),
    actions: normalizeTextList(actions || [])
  };
}

function createCapabilitySuccess(input = {}) {
  return createCapabilityResult({
    ...input,
    ok: true
  });
}

function createCapabilityFailure(input = {}) {
  return createCapabilityResult({
    ...input,
    ok: false
  });
}

function createUnsupportedCapability({ platform = process.platform, capability, message, actions = [] } = {}) {
  return createCapabilityFailure({
    platform,
    capability,
    errorCode: "PLATFORM_UNSUPPORTED",
    message: message || `${capability || "capability"} is not supported on ${platform}.`,
    actions
  });
}

module.exports = {
  createCapabilityFailure,
  createCapabilityResult,
  createCapabilitySuccess,
  createUnsupportedCapability,
  normalizeTextList
};
