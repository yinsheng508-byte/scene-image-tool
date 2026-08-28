const {
  createCapabilitySuccess,
  createUnsupportedCapability
} = require("./common/capability-result");
const { killPidWithSignal } = require("./common/process-utils");
const darwinProcessTree = require("./darwin/process-tree");
const { detectDarwinLibreOfficeRuntime } = require("./darwin/libreoffice-runtime");
const win32ProcessTree = require("./win32/process-tree");

function createProcessAdapter(platform) {
  if (platform === "win32") {
    return {
      platform,
      killProcessTreeByPid: win32ProcessTree.killProcessTreeByPid
    };
  }
  if (platform === "darwin") {
    return {
      platform,
      killProcessTreeByPid: darwinProcessTree.killProcessTreeByPid
    };
  }
  return {
    platform,
    killProcessTreeByPid(pid) {
      return killPidWithSignal(pid, "SIGTERM");
    }
  };
}

function createPlatformAdapter(platform = process.platform) {
  return {
    platform,
    runtime: {
      resolveLibreOffice(options = {}) {
        if (platform === "darwin") {
          return detectDarwinLibreOfficeRuntime(options);
        }
        return null;
      }
    },
    process: createProcessAdapter(platform),
    office: {
      getCapability() {
        if (platform === "win32") {
          return createCapabilitySuccess({
            platform,
            capability: "office-com",
            message: "Microsoft Office COM capability is handled by the legacy Windows path."
          });
        }
        return createUnsupportedCapability({
          platform,
          capability: "office-com",
          message: "macOS 不支持 Windows Office COM 高保真导出，请切换 LibreOffice。",
          actions: ["Switch to LibreOffice export", "Install LibreOffice for macOS"]
        });
      }
    },
    packaging: {
      getCapability() {
        return createUnsupportedCapability({
          platform,
          capability: "packaging",
          message: "Packaging capability is not wired into the platform adapter yet.",
          actions: ["Use the platform-specific npm script when it is added"]
        });
      }
    }
  };
}

const currentPlatformAdapter = createPlatformAdapter();

module.exports = {
  createPlatformAdapter,
  currentPlatformAdapter
};
