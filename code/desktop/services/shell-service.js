const fs = require("fs");
const path = require("path");

const DEFAULT_ALLOWED_EXTERNAL_PROTOCOLS = ["https:"];

function failure(errorCode, message) {
  return {
    ok: false,
    error: message,
    errorCode,
    message
  };
}

function hasExplicitUrlScheme(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/^[a-zA-Z]:[\\/]/.test(text)) return false;
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(text);
}

function normalizePayloadPath(payload) {
  if (typeof payload === "string") {
    return {
      path: payload,
      source: "legacy-renderer"
    };
  }
  return {
    path: payload?.path || payload?.targetPath || "",
    source: payload?.source || "renderer"
  };
}

function createShellService({
  shell,
  fsModule = fs,
  pathModule = path,
  allowedExternalProtocols = DEFAULT_ALLOWED_EXTERNAL_PROTOCOLS
} = {}) {
  if (!shell || typeof shell.openExternal !== "function" || typeof shell.openPath !== "function") {
    throw new Error("createShellService requires an Electron shell-like object.");
  }

  const allowedProtocols = new Set(
    (allowedExternalProtocols || DEFAULT_ALLOWED_EXTERNAL_PROTOCOLS).map((item) => String(item).toLowerCase())
  );
  const allowedOpenRoots = new Map();

  function toComparablePath(targetPath) {
    const resolved = pathModule.resolve(String(targetPath || ""));
    let realPath = resolved;
    try {
      realPath = fsModule.realpathSync.native
        ? fsModule.realpathSync.native(resolved)
        : fsModule.realpathSync(resolved);
    } catch (error) {
      realPath = resolved;
    }
    const normalized = pathModule.normalize(realPath);
    return process.platform === "win32" ? normalized.toLowerCase() : normalized;
  }

  function rememberOpenPath(targetPath, source = "main") {
    const text = String(targetPath || "").trim();
    if (!text || hasExplicitUrlScheme(text) || !pathModule.isAbsolute(text)) {
      return false;
    }
    try {
      const stat = fsModule.statSync(text);
      if (!stat.isDirectory()) {
        return false;
      }
      allowedOpenRoots.set(toComparablePath(text), String(source || "main"));
      return true;
    } catch (error) {
      return false;
    }
  }

  function rememberOpenPaths(targetPaths, source = "main") {
    return (Array.isArray(targetPaths) ? targetPaths : [targetPaths])
      .filter(Boolean)
      .reduce((count, item) => count + (rememberOpenPath(item, source) ? 1 : 0), 0);
  }

  function isAllowedOpenPath(targetPath) {
    const comparablePath = toComparablePath(targetPath);
    for (const rootPath of allowedOpenRoots.keys()) {
      if (comparablePath === rootPath) {
        return true;
      }
      const relative = pathModule.relative(rootPath, comparablePath);
      if (relative && !relative.startsWith("..") && !pathModule.isAbsolute(relative)) {
        return true;
      }
    }
    return false;
  }

  async function openExternal(payload) {
    const rawUrl = typeof payload === "string" ? payload : payload?.url;
    const urlText = String(rawUrl || "").trim();
    if (!urlText) {
      return failure("URL_MISSING", "缺少链接");
    }

    let parsed = null;
    try {
      parsed = new URL(urlText);
    } catch (error) {
      return failure("URL_INVALID", "链接格式不合法");
    }

    const protocol = String(parsed.protocol || "").toLowerCase();
    if (!allowedProtocols.has(protocol)) {
      return failure("URL_SCHEME_BLOCKED", "只允许打开 https 链接");
    }

    try {
      await shell.openExternal(parsed.toString());
      return {
        ok: true,
        url: parsed.toString(),
        protocol
      };
    } catch (error) {
      return failure("OPEN_EXTERNAL_FAILED", error.message || "打开链接失败");
    }
  }

  async function openPath(payload) {
    const normalizedPayload = normalizePayloadPath(payload);
    const rawPath = String(normalizedPayload.path || "").trim();
    const source = String(normalizedPayload.source || "renderer").trim() || "renderer";
    if (!rawPath) {
      return failure("PATH_MISSING", "缺少路径");
    }
    if (hasExplicitUrlScheme(rawPath)) {
      return failure("OPEN_PATH_URL_BLOCKED", "本地路径打开不接受 URL，请使用外部链接入口");
    }
    if (!pathModule.isAbsolute(rawPath)) {
      return failure("PATH_NOT_ABSOLUTE", "只能打开主进程确认过的绝对目录");
    }

    const resolvedPath = pathModule.resolve(rawPath);
    let stat = null;
    try {
      stat = fsModule.statSync(resolvedPath);
    } catch (error) {
      return failure("PATH_NOT_FOUND", "目录不存在");
    }
    if (!stat.isDirectory()) {
      return failure("PATH_NOT_DIRECTORY", "只能打开目录");
    }
    if (!isAllowedOpenPath(resolvedPath)) {
      return failure("PATH_NOT_ALLOWED", "只能打开已选择或本次生成的目录");
    }

    try {
      const result = await shell.openPath(resolvedPath);
      if (result) {
        return failure("OPEN_PATH_FAILED", result);
      }
      return {
        ok: true,
        path: resolvedPath,
        source
      };
    } catch (error) {
      return failure("OPEN_PATH_FAILED", error.message || "打开目录失败");
    }
  }

  function registerIpc(ipcMain) {
    ipcMain.handle("shell:openExternal", async (_event, payload) => openExternal(payload));
    ipcMain.handle("shell:openPath", async (_event, payload) => openPath(payload));
  }

  return {
    openExternal,
    openPath,
    rememberOpenPath,
    rememberOpenPaths,
    registerIpc
  };
}

module.exports = {
  DEFAULT_ALLOWED_EXTERNAL_PROTOCOLS,
  createShellService,
  hasExplicitUrlScheme
};
