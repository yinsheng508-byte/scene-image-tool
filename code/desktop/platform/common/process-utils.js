function normalizePid(value) {
  const pid = Number(value);
  if (!Number.isInteger(pid) || pid <= 0) return 0;
  return pid;
}

function killPidWithSignal(pid, signal = "SIGTERM") {
  const normalizedPid = normalizePid(pid);
  if (!normalizedPid) {
    return {
      ok: false,
      skipped: true,
      reason: "invalid_pid"
    };
  }
  try {
    process.kill(normalizedPid, signal);
    return {
      ok: true,
      pid: normalizedPid,
      signal
    };
  } catch (error) {
    return {
      ok: false,
      pid: normalizedPid,
      signal,
      error: error?.message || String(error || "unknown")
    };
  }
}

module.exports = {
  killPidWithSignal,
  normalizePid
};
