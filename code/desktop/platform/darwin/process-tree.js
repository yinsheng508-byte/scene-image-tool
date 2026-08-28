const { killPidWithSignal } = require("../common/process-utils");

function killProcessTreeByPid(pid, options = {}) {
  return killPidWithSignal(pid, options.signal || "SIGTERM");
}

module.exports = {
  killProcessTreeByPid
};
