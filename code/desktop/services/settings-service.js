const fs = require("fs");
const path = require("path");

const DEFAULT_SETTINGS_FILE_NAME = "app-settings.json";

function sanitizeAppSettings(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const next = {};
  Object.entries(input).forEach(([key, value]) => {
    const safeKey = String(key || "").trim();
    if (!safeKey) return;
    if (value === undefined || value === null) return;
    next[safeKey] = String(value);
  });
  return next;
}

function createSettingsService({
  app,
  fsModule = fs,
  pathModule = path,
  fileName = DEFAULT_SETTINGS_FILE_NAME
} = {}) {
  if (!app || typeof app.getPath !== "function") {
    throw new Error("createSettingsService requires an Electron app-like object.");
  }

  function getSettingsPath() {
    return pathModule.join(app.getPath("userData"), fileName);
  }

  function readSettings() {
    const filePath = getSettingsPath();
    if (!fsModule.existsSync(filePath)) {
      return {};
    }
    try {
      const raw = fsModule.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      return sanitizeAppSettings(parsed);
    } catch (error) {
      return {};
    }
  }

  function writeSettings(settings) {
    const filePath = getSettingsPath();
    try {
      fsModule.mkdirSync(pathModule.dirname(filePath), { recursive: true });
      const payload = JSON.stringify(sanitizeAppSettings(settings), null, 2);
      fsModule.writeFileSync(filePath, payload, "utf8");
      return true;
    } catch (error) {
      return false;
    }
  }

  function setSetting(key, value) {
    const safeKey = String(key || "").trim();
    if (!safeKey) {
      return { ok: false, error: "配置键不能为空" };
    }

    const next = readSettings();
    const hasValue = value !== undefined && value !== null && String(value).length > 0;
    if (hasValue) {
      next[safeKey] = String(value);
    } else {
      delete next[safeKey];
    }

    if (!writeSettings(next)) {
      return { ok: false, error: "配置保存失败" };
    }

    return { ok: true, value: hasValue ? next[safeKey] : null };
  }

  function registerIpc(ipcMain) {
    ipcMain.handle("settings:getAll", async () => {
      return {
        ok: true,
        settings: readSettings()
      };
    });

    ipcMain.handle("settings:set", async (_event, payload) => {
      const settingKey = payload?.key;
      const settingValue = payload?.value;
      return setSetting(settingKey, settingValue);
    });
  }

  return {
    getSettingsPath,
    readSettings,
    writeSettings,
    setSetting,
    registerIpc
  };
}

module.exports = {
  DEFAULT_SETTINGS_FILE_NAME,
  createSettingsService,
  sanitizeAppSettings
};
