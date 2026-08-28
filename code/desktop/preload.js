const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("appLog", {
  onLog: (callback) => {
    ipcRenderer.on("app-log", (event, payload) => {
      callback(payload);
    });
  }
});

contextBridge.exposeInMainWorld("appApi", {
  openFiles: () => ipcRenderer.invoke("dialog:openFiles"),
  openFilesOrFolders: () => ipcRenderer.invoke("dialog:openFilesOrFolders"),
  openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  openOutputFolder: () => ipcRenderer.invoke("dialog:openOutputFolder"),
  openImageFolders: () => ipcRenderer.invoke("dialog:openImageFolders"),
  getMeta: () => ipcRenderer.invoke("app:getMeta"),
  getAppSettings: () => ipcRenderer.invoke("settings:getAll"),
  setAppSetting: (key, value) => ipcRenderer.invoke("settings:set", { key, value }),
  getWechatLoginStatus: () => ipcRenderer.invoke("wechat:getStatus"),
  wechatLogin: (code) => ipcRenderer.invoke("wechat:login", { code }),
  scanDocuments: (payload) => ipcRenderer.invoke("scan:documents", payload),
  convertDocuments: (payload) => ipcRenderer.invoke("convert:documents", payload),
  cancelConvert: () => ipcRenderer.invoke("convert:cancel"),
  exportHealthCheck: (payload) => ipcRenderer.invoke("export:healthCheck", payload || {}),
  getCapabilities: (payload) => ipcRenderer.invoke("capability:getAll", payload || {}),
  officeHealthCheck: (payload) => ipcRenderer.invoke("office:healthCheck", payload || {}),
  officeHealthFix: (payload) => ipcRenderer.invoke("office:healthFix", payload || {}),
  openImageFolder: () => ipcRenderer.invoke("dialog:openImageFolder"),
  openImageFile: () => ipcRenderer.invoke("dialog:openImageFile"),
  openImageFiles: () => ipcRenderer.invoke("dialog:openImageFiles"),
  openImageFilesOrFolder: () => ipcRenderer.invoke("dialog:openImageFilesOrFolder"),
  uploadRandomImages: (payload) => ipcRenderer.invoke("feishu:uploadRandom", payload),
  uploadImages: (payload) => ipcRenderer.invoke("feishu:uploadImages", payload),
  scanFeishuNoteFolders: (payload) => ipcRenderer.invoke("feishu:scanNoteFolders", payload),
  cancelUpload: () => ipcRenderer.invoke("feishu:cancel"),
  saveTextFile: (payload) => ipcRenderer.invoke("file:save", payload),
  openPath: (payload) => ipcRenderer.invoke("shell:openPath", payload),
  openPuzzleTemplateLibrary: () => ipcRenderer.invoke("puzzle:openTemplateLibrary"),
  selectSaveDirectory: () => ipcRenderer.invoke("dialog:selectSaveDirectory"),
  createDirectory: (payload) => ipcRenderer.invoke("file:createDirectory", payload),
  saveImageFile: (payload) => ipcRenderer.invoke("file:saveImage", payload),
  copyPuzzleBackground: (payload) => ipcRenderer.invoke("puzzle:copyBackground", payload),
  loadPuzzleBackground: (payload) => ipcRenderer.invoke("puzzle:loadBackground", payload),
  copyPuzzleSticker: (payload) => ipcRenderer.invoke("puzzle:copySticker", payload),
  getClipboardSummary: () => ipcRenderer.invoke("puzzle:getClipboardSummary"),
  readClipboardImage: () => ipcRenderer.invoke("puzzle:readClipboardImage"),
  readClipboardText: () => ipcRenderer.invoke("puzzle:readClipboardText"),
  scanPuzzleImages: (payload) => ipcRenderer.invoke("puzzle:scanImages", payload),
  scanPuzzleSubfolderGroups: (payload) => ipcRenderer.invoke("puzzle:scanSubfolderGroups", payload),
  checkPuzzleFolderAccess: (payload) => ipcRenderer.invoke("puzzle:checkFolderAccess", payload),
  loadPuzzleTemplates: () => ipcRenderer.invoke("puzzle:loadTemplates"),
  savePuzzleTemplates: (payload) => ipcRenderer.invoke("puzzle:saveTemplates", payload),
  deletePuzzleTemplate: (payload) => ipcRenderer.invoke("puzzle:deleteTemplate", payload),
  getSystemFonts: () => ipcRenderer.invoke("font:getSystemFonts"),
  generatePuzzleImages: (payload) => ipcRenderer.invoke("puzzle:generate", payload),
  renderPuzzleExportPreview: (payload) => ipcRenderer.invoke("puzzle:renderExportPreview", payload),
  xhsDownload: (payload) => ipcRenderer.invoke("xhs:download", payload),
  xhsCancel: () => ipcRenderer.invoke("xhs:cancel"),
  onConvertProgress: (callback) => {
    ipcRenderer.on("convert:progress", (event, data) => callback(data));
  },
  onUploadProgress: (callback) => {
    ipcRenderer.on("upload:progress", (event, data) => callback(data));
  },
  onXhsProgress: (callback) => {
    ipcRenderer.on("xhs:progress", (event, data) => callback(data));
  },
  onPuzzleProgress: (callback) => {
    ipcRenderer.on("puzzle:progress", (event, data) => callback(data));
  }
});

contextBridge.exposeInMainWorld("licenseAPI", {
  getDeviceId: () => ipcRenderer.invoke("license:getDeviceId"),
  getConfig: () => ipcRenderer.invoke("license:getConfig"),
  saveConfig: (payload) => ipcRenderer.invoke("license:saveConfig", payload),
  verify: (key) => ipcRenderer.invoke("license:verify", { key }),
  checkUpdate: () => ipcRenderer.invoke("license:checkUpdate"),
  getVersion: () => ipcRenderer.invoke("app:getVersion"),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", { url })
});
