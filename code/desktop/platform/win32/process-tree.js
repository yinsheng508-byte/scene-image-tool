const { spawn } = require("child_process");
const { normalizePid } = require("../common/process-utils");

function killProcessTreeByPid(pid) {
  const normalizedPid = normalizePid(pid);
  if (!normalizedPid) {
    return {
      ok: false,
      skipped: true,
      reason: "invalid_pid"
    };
  }
  try {
    const killer = spawn("taskkill", ["/PID", String(normalizedPid), "/T", "/F"], {
      windowsHide: true
    });
    killer.on("error", () => {
      // Ignore cleanup errors and rely on default process exit.
    });
    return {
      ok: true,
      pid: normalizedPid,
      command: "taskkill"
    };
  } catch (error) {
    return {
      ok: false,
      pid: normalizedPid,
      command: "taskkill",
      error: error?.message || String(error || "unknown")
    };
  }
}

module.exports = {
  killProcessTreeByPid
};
