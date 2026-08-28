// ==================== DOM元素引用 ====================
const logBody = document.getElementById("logBody");
const clearBtn = document.getElementById("clearLogBtn");
const selectFilesBtn = document.getElementById("selectFilesBtn");
const selectFolderBtn = document.getElementById("selectFolderBtn");
const selectOutputBtn = document.getElementById("selectOutputBtn");
const clearSelectionBtn = document.getElementById("clearSelectionBtn");
const filesCount = document.getElementById("filesCount");
const foldersCount = document.getElementById("foldersCount");
const outputStatus = document.getElementById("outputStatus");
const selectedFiles = document.getElementById("selectedFiles");
const selectedFolder = document.getElementById("selectedFolder");
const selectedOutput = document.getElementById("selectedOutput");
const scanCount = document.getElementById("scanCount");
const scanList = document.getElementById("scanList");
const scanResultsSection = document.getElementById("scanResultsSection");
const convertBtn = document.getElementById("convertBtn");
const cancelConvertBtn = document.getElementById("cancelConvertBtn");
const convertStatus = document.getElementById("convertStatus");
const convertProgress = document.getElementById("convertProgress");
const exportErrorsBtn = document.getElementById("exportErrorsBtn");
const exportEngineSelect = document.getElementById("exportEngineSelect");
const scaleSelect = document.getElementById("scaleSelect");
const pageLimitInput = document.getElementById("pageLimitInput");
const useSubfolderCheckbox = document.getElementById("useSubfolderCheckbox");
const feishuToken = document.getElementById("feishuToken");
const toggleFeishuToken = document.getElementById("toggleFeishuToken");
const feishuLink = document.getElementById("feishuLink");
const feishuField = document.getElementById("feishuField");
const startRow = document.getElementById("startRow");
const endRow = document.getElementById("endRow");
const uploadModuleEndRowGroup = document.getElementById("uploadModuleEndRowGroup");
const noteRowRange = document.getElementById("noteRowRange");
const uploadModeModuleTab = document.getElementById("uploadModeModuleTab");
const uploadModeNoteTab = document.getElementById("uploadModeNoteTab");
const uploadModulePanel = document.getElementById("uploadModulePanel");
const uploadNotePanel = document.getElementById("uploadNotePanel");
const addFolderConfigBtn = document.getElementById("addFolderConfigBtn");
const folderConfigList = document.getElementById("folderConfigList");
const folderConfigEmpty = document.getElementById("folderConfigEmpty");
const selectNoteParentBtn = document.getElementById("selectNoteParentBtn");
const addNoteEntryBtn = document.getElementById("addNoteEntryBtn");
const rescanNoteBtn = document.getElementById("rescanNoteBtn");
const noteEntryList = document.getElementById("noteEntryList");
const noteEntryEmpty = document.getElementById("noteEntryEmpty");
const noteScanSummary = document.getElementById("noteScanSummary");
const noteGroupList = document.getElementById("noteGroupList");
const noteGroupEmpty = document.getElementById("noteGroupEmpty");
const noteSkippedSection = document.getElementById("noteSkippedSection");
const noteSkippedList = document.getElementById("noteSkippedList");
const uploadBtn = document.getElementById("uploadBtn");
const cancelUploadBtn = document.getElementById("cancelUploadBtn");
const uploadStatus = document.getElementById("uploadStatus");
const uploadProgress = document.getElementById("uploadProgress");
const tabButtons = document.querySelectorAll(".tab-button");
const tabContents = document.querySelectorAll(".tab-content");
const xhsLinks = document.getElementById("xhsLinks");
const xhsSelectOutputBtn = document.getElementById("xhsSelectOutputBtn");
const xhsOutputPath = document.getElementById("xhsOutputPath");
const xhsStartBtn = document.getElementById("xhsStartBtn");
const xhsStopBtn = document.getElementById("xhsStopBtn");
const xhsStatus = document.getElementById("xhsStatus");
const xhsTaskList = document.getElementById("xhsTaskList");
const xhsWebview = document.getElementById("xhsWebview");
const xhsWebviewStatus = document.getElementById("xhsWebviewStatus");
const globalSelectInstances = new Map();

// 新增元素引用
const globalToast = document.getElementById("globalToast");
const convertProgressWrapper = document.getElementById("convertProgressWrapper");
const convertProgressBar = document.getElementById("convertProgressBar");
const convertProgressPercent = document.getElementById("convertProgressPercent");
const convertProgressText = document.getElementById("convertProgressText");
const uploadProgressWrapper = document.getElementById("uploadProgressWrapper");
const uploadProgressBar = document.getElementById("uploadProgressBar");
const uploadProgressPercent = document.getElementById("uploadProgressPercent");
const uploadProgressText = document.getElementById("uploadProgressText");
const exportEmptyState = document.getElementById("exportEmptyState");
const logLevelFilter = document.getElementById("logLevelFilter");
const feishuTokenError = document.getElementById("feishuTokenError");
const feishuLinkError = document.getElementById("feishuLinkError");
const feishuFieldError = document.getElementById("feishuFieldError");
const libreofficeModal = document.getElementById("libreofficeModal");
const libreofficeModalClose = document.getElementById("libreofficeModalClose");
const libreofficeDownloadBtn = document.getElementById("libreofficeDownloadBtn");
const libreofficeCopyDiagBtn = document.getElementById("libreofficeCopyDiagBtn");
const libreofficeRecheckBtn = document.getElementById("libreofficeRecheckBtn");
const libreofficeCancelBtn = document.getElementById("libreofficeCancelBtn");
const libreofficeModalMessage = document.getElementById("libreofficeModalMessage");
const libreofficeModalScore = document.getElementById("libreofficeModalScore");
const libreofficeModalSuggestions = document.getElementById("libreofficeModalSuggestions");
const libreofficeModalDiagnostics = document.getElementById("libreofficeModalDiagnostics");
const officeEngineModal = document.getElementById("officeEngineModal");
const officeEngineModalClose = document.getElementById("officeEngineModalClose");
const officeEngineCopyDiagBtn = document.getElementById("officeEngineCopyDiagBtn");
const officeEngineRecheckBtn = document.getElementById("officeEngineRecheckBtn");
const officeEngineBackBtn = document.getElementById("officeEngineBackBtn");
const officeEngineContinueBtn = document.getElementById("officeEngineContinueBtn");
const officeEngineModalMessage = document.getElementById("officeEngineModalMessage");
const officeEngineApps = document.getElementById("officeEngineApps");
const officeEngineSuggestions = document.getElementById("officeEngineSuggestions");
const officeEngineDiagnostics = document.getElementById("officeEngineDiagnostics");
const platformCapabilityStatus = document.getElementById("platformCapabilityStatus");
const platformCapabilityRefreshBtn = document.getElementById("platformCapabilityRefreshBtn");
const platformCapabilitySummary = document.getElementById("platformCapabilitySummary");
const platformCapabilityList = document.getElementById("platformCapabilityList");

// 全局 Toast
const toastContainer = document.getElementById('globalToast');
const toastMessage = toastContainer.querySelector('.toast-message');
const toastIcon = toastContainer.querySelector('.toast-icon');
const toastActions = toastContainer.querySelector('.toast-actions');

const TOAST_ICONS = {
  success: `<svg viewBox="0 0 24 24" width="24" height="24" stroke="#C45C5C" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
  error: `<svg viewBox="0 0 24 24" width="24" height="24" stroke="#991B1B" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
  warning: `<svg viewBox="0 0 24 24" width="24" height="24" stroke="#92400E" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
  info: `<svg viewBox="0 0 24 24" width="24" height="24" stroke="#C45C5C" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
};

let toastTimeout;

/**
 * 显示Toast通知
 * @param {string} msg - 消息内容
 * @param {string} type - 类型: 'success' | 'error' | 'warning' | 'info'
 * @param {number} duration - 显示时长(毫秒), 默认3000
 * @param {Object} options - 可选配置
 * @param {string} options.actionText - 按钮文字
 * @param {Function} options.actionCallback - 按钮点击回调
 */
window.showToast = (msg, type = 'info', duration = 3000, options = {}) => {
  toastMessage.textContent = msg;
  toastIcon.innerHTML = TOAST_ICONS[type] || TOAST_ICONS.info;

  // 清理操作按钮区域
  toastActions.innerHTML = '';
  toastActions.classList.remove('has-actions');

  // 如果有操作按钮配置
  if (options.actionText && typeof options.actionCallback === 'function') {
    const btn = document.createElement('button');
    btn.className = 'toast-action-btn';
    btn.textContent = options.actionText;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      options.actionCallback();
    });
    toastActions.appendChild(btn);
    toastActions.classList.add('has-actions');
  }

  // Reset classes and ensure visibility (inline style overrides CSS)
  toastContainer.style.display = 'block';
  toastContainer.className = `toast-container ${type}`;
  toastContainer.classList.add('show');

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toastContainer.classList.remove('show');
    toastContainer.classList.add('hide');
    setTimeout(() => {
        toastContainer.classList.remove('hide');
        toastContainer.style.display = 'none';
        toastActions.innerHTML = '';
        toastActions.classList.remove('has-actions');
    }, 300);
  }, duration);
};

// ==================== 文件类型图标映射 ====================
// 使用 SVG 字符串替代 Emoji
const FILE_TYPE_ICONS = {
  'doc': `<svg class="icon-svg" style="color:#2563EB;" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`,
  'docx': `<svg class="icon-svg" style="color:#2563EB;" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`,
  'ppt': `<svg class="icon-svg" style="color:#EA580C;" viewBox="0 0 24 24"><path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm0 0l2-2h10l2 2M8 12h8m-8 4h8"></path></svg>`,
  'pptx': `<svg class="icon-svg" style="color:#EA580C;" viewBox="0 0 24 24"><path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm0 0l2-2h10l2 2M8 12h8m-8 4h8"></path></svg>`,
  'pdf': `<svg class="icon-svg" style="color:#DC2626;" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M9 13h1a2 2 0 0 0 0-4H9v8"></path></svg>`
};

const DEFAULT_FILE_ICON = `<svg class="icon-svg" style="color:#9CA3AF;" viewBox="0 0 24 24"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;

function getFileIcon(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  return FILE_TYPE_ICONS[ext] || DEFAULT_FILE_ICON;
}

// ==================== 日志等级图标映射 ====================
const LOG_ICONS = {
  0: `<svg class="icon-svg" style="color:#6B7280;" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`, // Debug
  1: `<svg class="icon-svg" style="color:#3B82F6;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`, // Info
  2: `<svg class="icon-svg" style="color:#F59E0B;" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`, // Warning
  3: `<svg class="icon-svg" style="color:#8B5CF6;" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>`, // Notice
  4: `<svg class="icon-svg" style="color:#EF4444;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`  // Error
};

// ==================== 飞书错误翻译系统 ====================
const FEISHU_ERROR_MESSAGES = {
  // 认证错误
  99991663: '授权码无效或已过期,请重新获取',
  99991664: '授权码格式错误',
  99991668: '无权限访问该表格,请检查授权码权限',

  // 字段错误
  1254301: '未找到字段,请检查字段名称',
  1254044: '字段类型不是附件类型',

  // 记录错误
  1254042: '记录不存在',
  1254043: '行范围超出记录数量',

  // 网络错误
  'ENOTFOUND': '网络连接失败,请检查网络后重试',
  'ETIMEDOUT': '请求超时,请检查网络后重试',
  'ECONNREFUSED': '无法连接到服务器',

  // 通用错误
  'default': '操作失败,请查看日志了解详情'
};

function getFeishuErrorInfo(error) {
  if (!error) {
    return { message: '', code: undefined, status: undefined };
  }
  if (typeof error === 'string') {
    return { message: error, code: undefined, status: undefined };
  }
  if (typeof error === 'object') {
    const message = error.message || error.msg || error.error || '';
    return {
      message: message || String(error),
      code: error.code || error.error_code || error.errno,
      status: error.status || error.statusCode
    };
  }
  return { message: String(error), code: undefined, status: undefined };
}

function translateFeishuError(error) {
  const errorInfo = getFeishuErrorInfo(error);
  if (!errorInfo.message && !errorInfo.code) return FEISHU_ERROR_MESSAGES.default;

  // 优先匹配错误码
  if (errorInfo.code && FEISHU_ERROR_MESSAGES[errorInfo.code]) {
    return FEISHU_ERROR_MESSAGES[errorInfo.code];
  }

  // 匹配错误消息关键词
  const message = (errorInfo.message || '').toString();
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('invalid access token')) {
    return '授权码无效或已过期,请确认使用 base-api 域名';
  }
  if (lowerMessage.includes('bad request')) {
    return '请求参数错误,请检查表格链接与字段配置';
  }
  if (lowerMessage.includes('fieldnamenotfound')) {
    return '字段名称不存在,请检查字段名称是否正确';
  }
  if (lowerMessage.includes('permission') || lowerMessage.includes('forbidden')) {
    return '权限不足,请确认授权码权限或表格可访问性';
  }
  if (lowerMessage.includes('rate') && lowerMessage.includes('limit')) {
    return '请求过于频繁,请稍后再试';
  }
  if (lowerMessage.includes('token') || message.includes('授权')) {
    return '授权码无效或已过期';
  }
  if (lowerMessage.includes('field') || message.includes('字段')) {
    return '字段配置错误,请检查字段名称';
  }
  if (lowerMessage.includes('network') || message.includes('ENOTFOUND')) {
    return '网络连接失败,请检查网络';
  }

  return FEISHU_ERROR_MESSAGES.default;
}

const selectionState = {
  files: [],
  folders: [],
  outputFolder: "",
  lastScanItems: []
};

const UPLOAD_MODE_MODULE = "module";
const UPLOAD_MODE_NOTE = "note-folder";
const EXPORT_ENGINE_LIBREOFFICE = "libreoffice";
const EXPORT_ENGINE_OFFICE = "office";

const uploadState = {
  mode: UPLOAD_MODE_MODULE,
  folders: [],
  nextFolderId: 1,
  uploading: false,
  noteBatch: {
    entryFolders: [],
    groups: [],
    skippedGroups: [],
    dedupedCount: 0,
    rootImageCount: 0,
    ignoredParentImageCount: 0,
    lastScannedAt: 0,
    scanning: false,
    nextEntryId: 1,
    scanRequestId: 0
  }
};

let convertErrors = [];
let uploadErrors = [];
let latestLibreOfficeDiagnosticsText = "";
let latestOfficeDiagnosticsText = "";
let platformCapabilitiesLoaded = false;
let platformCapabilitiesLoading = false;
const convertProgressTracker = {
  total: 0,
  completed: 0
};

const xhsState = {
  outputDir: "",
  tasks: [],
  running: false,
  currentTaskId: null
};

const storageKeys = {
  activeTab: "activeTab",
  feishuToken: "feishuToken",
  feishuLink: "feishuLink",
  feishuField: "feishuField",
  exportEngine: "exportEngine",
  exportPageLimit: "exportPageLimit",
  exportUseSubfolder: "exportUseSubfolder",
  exportUseSubfolderInitialized: "exportUseSubfolderInitialized",
  xhsOutputFolder: "xhsOutputFolder"
};

const appSettingsState = {
  loaded: false,
  values: {},
  loadingPromise: null
};

function readLegacyStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

async function loadSettingsFromMain() {
  if (appSettingsState.loaded) return;
  if (appSettingsState.loadingPromise) {
    await appSettingsState.loadingPromise;
    return;
  }

  appSettingsState.loadingPromise = (async () => {
    let nextValues = {};
    if (window.appApi?.getAppSettings) {
      try {
        const result = await window.appApi.getAppSettings();
        if (result?.ok && result.settings && typeof result.settings === "object") {
          nextValues = { ...result.settings };
        }
      } catch (error) {
        nextValues = {};
      }
    }

    const migratedEntries = [];
    Object.values(storageKeys).forEach((key) => {
      const existing = nextValues[key];
      if (typeof existing === "string" && existing.length > 0) return;
      const legacy = readLegacyStorage(key);
      if (!legacy) return;
      nextValues[key] = legacy;
      migratedEntries.push([key, legacy]);
    });

    appSettingsState.values = nextValues;
    appSettingsState.loaded = true;

    if (migratedEntries.length > 0 && window.appApi?.setAppSetting) {
      await Promise.all(
        migratedEntries.map(([key, value]) =>
          window.appApi.setAppSetting(key, value).catch(() => null)
        )
      );
    }
  })();

  try {
    await appSettingsState.loadingPromise;
  } finally {
    appSettingsState.loadingPromise = null;
  }
}

function setActiveTab(tabId) {
  tabButtons.forEach((button) => {
    if (button.dataset.tab === tabId) {
      button.classList.add("active");
    } else {
      button.classList.remove("active");
    }
  });
  tabContents.forEach((panel) => {
    if (panel.dataset.tab === tabId) {
      panel.classList.add("active");
    } else {
      panel.classList.remove("active");
    }
  });
  writeStorage(storageKeys.activeTab, tabId);
  if (tabId === "settings") {
    ensurePlatformCapabilitiesLoaded();
  }
}

function readStorage(key) {
  const value = appSettingsState.values[key];
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return null;
}

function writeStorage(key, value) {
  const normalized = value === undefined || value === null ? "" : String(value);
  if (normalized) {
    appSettingsState.values[key] = normalized;
  } else {
    delete appSettingsState.values[key];
  }

  if (window.appApi?.setAppSetting) {
    window.appApi.setAppSetting(key, normalized).catch(() => {
      // Ignore storage errors
    });
  }
}

function normalizeExportEngine(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === EXPORT_ENGINE_OFFICE) return EXPORT_ENGINE_OFFICE;
  return EXPORT_ENGINE_LIBREOFFICE;
}

function getSelectedExportEngine() {
  return normalizeExportEngine(exportEngineSelect?.value);
}

function getClientFileExt(value) {
  const fileName = String(value || "").split(/[\\/]/).pop();
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : "";
}

function refreshCustomSelect(selectEl) {
  const instance = globalSelectInstances?.get?.(selectEl);
  if (instance && typeof instance.refresh === "function") {
    instance.refresh();
  }
}

function setSelectedExportEngine(engine, options = {}) {
  const normalized = normalizeExportEngine(engine);
  if (exportEngineSelect) {
    exportEngineSelect.value = normalized;
    const instance = globalSelectInstances?.get?.(exportEngineSelect);
    if (instance && typeof instance.setValue === "function") {
      instance.setValue(normalized, true);
    } else {
      refreshCustomSelect(exportEngineSelect);
    }
  }
  if (options.persist !== false) {
    writeStorage(storageKeys.exportEngine, normalized);
  }
}

function computeRequiredOfficeApps(items = []) {
  const required = new Set();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const ext = String(item?.ext || getClientFileExt(item?.sourcePath || item?.fileName || "")).trim().toLowerCase();
    if (ext === ".doc" || ext === ".docx") {
      required.add("word");
    } else if (ext === ".ppt" || ext === ".pptx") {
      required.add("powerpoint");
    }
  });
  return ["word", "powerpoint"].filter((name) => required.has(name));
}

function restoreFeishuInputs() {
  if (feishuToken) {
    const savedToken = readStorage(storageKeys.feishuToken);
    if (savedToken) {
      feishuToken.value = savedToken;
    }
  }
  if (feishuLink) {
    const savedLink = readStorage(storageKeys.feishuLink);
    if (savedLink) {
      feishuLink.value = savedLink;
    }
  }
  if (feishuField) {
    const savedField = readStorage(storageKeys.feishuField);
    if (savedField) {
      feishuField.value = savedField;
    }
  }
}

function bindFeishuStorage() {
  if (feishuToken) {
    feishuToken.addEventListener("input", () => {
      writeStorage(storageKeys.feishuToken, feishuToken.value);
    });
  }
  if (feishuLink) {
    feishuLink.addEventListener("input", () => {
      writeStorage(storageKeys.feishuLink, feishuLink.value);
    });
  }
  if (feishuField) {
    feishuField.addEventListener("input", () => {
      writeStorage(storageKeys.feishuField, feishuField.value);
    });
  }
}

function restoreExportSettings() {
  if (exportEngineSelect) {
    setSelectedExportEngine(
      normalizeExportEngine(readStorage(storageKeys.exportEngine)),
      { persist: false }
    );
  }
  if (pageLimitInput) {
    const savedPageLimit = readStorage(storageKeys.exportPageLimit);
    if (savedPageLimit) {
      pageLimitInput.value = savedPageLimit;
    }
  }
  if (useSubfolderCheckbox) {
    const initialized = readStorage(storageKeys.exportUseSubfolderInitialized) === "true";
    if (!initialized) {
      useSubfolderCheckbox.checked = false;
      writeStorage(storageKeys.exportUseSubfolder, "false");
      writeStorage(storageKeys.exportUseSubfolderInitialized, "true");
      return;
    }
    const savedUseSubfolder = readStorage(storageKeys.exportUseSubfolder);
    useSubfolderCheckbox.checked = savedUseSubfolder === "true";
  }
}

function bindExportStorage() {
  if (exportEngineSelect) {
    exportEngineSelect.addEventListener("change", async () => {
      const nextEngine = getSelectedExportEngine();
      writeStorage(storageKeys.exportEngine, nextEngine);
      if (nextEngine !== EXPORT_ENGINE_OFFICE) return;
      let action = "recheck";
      while (action === "recheck") {
        const report = await checkOfficeEngineForModal();
        action = await openOfficeEngineModal(report, { strict: false });
      }
      if (action === "libreoffice" || action === "cancel") {
        setSelectedExportEngine(EXPORT_ENGINE_LIBREOFFICE);
      }
    });
  }
  if (pageLimitInput) {
    pageLimitInput.addEventListener("input", () => {
      writeStorage(storageKeys.exportPageLimit, pageLimitInput.value);
    });
  }
  if (useSubfolderCheckbox) {
    useSubfolderCheckbox.addEventListener("change", () => {
      writeStorage(storageKeys.exportUseSubfolder, String(useSubfolderCheckbox.checked));
    });
  }
}

function setTokenVisibility(isVisible) {
  if (!feishuToken || !toggleFeishuToken) return;
  feishuToken.type = isVisible ? "text" : "password";
  toggleFeishuToken.textContent = isVisible ? "隐藏" : "显示";
  toggleFeishuToken.setAttribute("aria-label", isVisible ? "隐藏授权码" : "显示授权码");
}

// ==================== 表单验证系统 ====================
function validateField(input, errorSpan, rules) {
  if (!input || !errorSpan) return true;

  const value = input.value.trim();
  let errorMessage = '';

  // 必填验证
  if (rules.required && !value) {
    errorMessage = '此项不能为空';
  }

  // 格式验证 (URL、数字等)
  if (value && rules.pattern && !rules.pattern.test(value)) {
    errorMessage = rules.patternMessage || '格式不正确';
  }

  // 显示/隐藏错误
  if (errorMessage) {
    input.classList.add('input-error');
    errorSpan.classList.add('show');
    const textSpan = errorSpan.querySelector('span:last-child');
    if (textSpan) textSpan.textContent = errorMessage;
    return false;
  } else {
    input.classList.remove('input-error');
    errorSpan.classList.remove('show');
    return true;
  }
}

function clearFieldError(input, errorSpan) {
  if (input) input.classList.remove('input-error');
  if (errorSpan) errorSpan.classList.remove('show');
}

// ==================== 进度条更新系统 ====================
function updateConvertProgress(current, total, statusText) {
  if (!convertProgressWrapper) return;

  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  convertProgressWrapper.style.display = 'block';
  if (convertProgressBar) {
    convertProgressBar.style.width = `${percent}%`;
    convertProgressBar.classList.remove('error', 'complete');
  }
  if (convertProgressPercent) convertProgressPercent.textContent = `${percent}%`;
  if (convertProgressText) convertProgressText.textContent = statusText || '';
}

function resetConvertProgressTracker(total = 0) {
  const safeTotal = Number(total);
  convertProgressTracker.total = Number.isFinite(safeTotal) && safeTotal > 0
    ? Math.floor(safeTotal)
    : 0;
  convertProgressTracker.completed = 0;
}

function updateConvertProgressByCompleted(data, statusText) {
  const totalRaw = Number(data?.totalFiles);
  if (Number.isFinite(totalRaw) && totalRaw >= 0) {
    convertProgressTracker.total = Math.floor(totalRaw);
  }
  const completedRaw = Number(data?.completedFiles);
  if (Number.isFinite(completedRaw) && completedRaw >= 0) {
    convertProgressTracker.completed = Math.max(
      convertProgressTracker.completed,
      Math.floor(completedRaw)
    );
  }
  const total = convertProgressTracker.total;
  const completed = total > 0
    ? Math.min(convertProgressTracker.completed, total)
    : convertProgressTracker.completed;
  if (convertProgress) {
    convertProgress.textContent = `${completed}/${total}`;
  }
  updateConvertProgress(completed, total, statusText);
}

function updateUploadProgress(current, total, statusText) {
  if (!uploadProgressWrapper) return;

  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  uploadProgressWrapper.style.display = 'block';
  if (uploadProgressBar) {
    uploadProgressBar.style.width = `${percent}%`;
    uploadProgressBar.classList.remove('error', 'complete');
  }
  if (uploadProgressPercent) uploadProgressPercent.textContent = `${percent}%`;
  if (uploadProgressText) uploadProgressText.textContent = statusText || '';
}

function hideConvertProgress() {
  if (convertProgressWrapper) {
    setTimeout(() => {
      convertProgressWrapper.style.display = 'none';
      if (convertProgressBar) convertProgressBar.classList.remove('error', 'complete');
    }, 3000);
  }
}

function hideUploadProgress() {
  if (uploadProgressWrapper) {
    setTimeout(() => {
      uploadProgressWrapper.style.display = 'none';
      if (uploadProgressBar) uploadProgressBar.classList.remove('error', 'complete');
    }, 3000);
  }
}

// ==================== 日志系统升级 ====================
function appendLog(payload) {
  if (!payload || !logBody) return;
  const line = document.createElement("div");
  line.className = `log-line log-level-${payload.level || 0}`;
  line.dataset.level = payload.level || 0;

  // 图标
  const icon = document.createElement('span');
  icon.className = 'log-icon';
  icon.innerHTML = LOG_ICONS[payload.level] || '';

  // 时间
  const time = document.createElement("span");
  time.className = "log-time";
  time.textContent = formatLogTime(payload.time);

  // 消息
  const msg = document.createElement("span");
  msg.className = 'log-message';
  msg.textContent = payload.message || "";

  line.appendChild(icon);
  line.appendChild(time);
  line.appendChild(msg);
  logBody.appendChild(line);
  logBody.scrollTop = logBody.scrollHeight;
}

function formatLogTime(value) {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const formatted = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai"
  }).format(safeDate);
  return formatted.replace(/\//g, "-");
}

if (window.appLog && typeof window.appLog.onLog === "function") {
  window.appLog.onLog(appendLog);
} else {
  appendLog({ level: 4, message: "日志通道不可用。" });
}

clearBtn.addEventListener("click", () => {
  logBody.textContent = "";
});

function summarizePaths(paths) {
  if (!paths.length) return "无";
  if (paths.length === 1) return paths[0];
  return `${paths[0]}（另有 ${paths.length - 1} 项）`;
}

function formatOutputPath(pathValue) {
  if (!pathValue) return "未设置";
  const normalized = String(pathValue).replace(/\//g, "\\");
  if (normalized.length <= 42) return normalized;
  const parts = normalized.split("\\").filter(Boolean);
  if (parts.length <= 2) return normalized;
  const lastParts = parts.slice(-2).join("\\");
  if (normalized.startsWith("\\\\")) {
    const rootParts = parts.slice(0, 2).join("\\");
    return `\\\\${rootParts}\\...\\${lastParts}`;
  }
  if (/^[A-Za-z]:$/.test(parts[0])) {
    return `${parts[0]}\\...\\${lastParts}`;
  }
  return `...\\${lastParts}`;
}

function setXhsStatus(text) {
  if (xhsStatus) {
    xhsStatus.textContent = text || "";
  }
}

function setXhsWebviewStatus(text) {
  if (xhsWebviewStatus) {
    xhsWebviewStatus.textContent = text || "";
  }
}

function updateXhsOutputUI() {
  if (!xhsOutputPath) return;
  xhsOutputPath.textContent = xhsState.outputDir ? formatOutputPath(xhsState.outputDir) : "未设置";
  xhsOutputPath.title = xhsState.outputDir || "未设置";
}

function restoreXhsOutputFolder() {
  const saved = readStorage(storageKeys.xhsOutputFolder);
  if (saved) {
    xhsState.outputDir = saved;
    updateXhsOutputUI();
  }
}

function persistXhsOutputFolder() {
  writeStorage(storageKeys.xhsOutputFolder, xhsState.outputDir || "");
}

function parseXhsLinks(text) {
  if (!text) return [];
  const rawParts = text.split(/[\n,，;；\s]+/g);
  const urls = [];
  const seen = new Set();
  for (const part of rawParts) {
    const trimmed = String(part).trim();
    if (!trimmed) continue;
    let url = trimmed;
    if (!/^https?:\/\//i.test(url)) {
      continue;
    }
    try {
      const parsed = new URL(url);
      url = parsed.toString();
    } catch (error) {
      continue;
    }
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(url);
  }
  return urls;
}

function getXhsTaskStatusBadge(task) {
  const statusMap = {
    pending: { label: "待处理", icon: `<svg class="icon-svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`, color: "text-muted" },
    loading: { label: "加载中", icon: `<svg class="icon-svg spin" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>`, color: "primary" },
    extracting: { label: "提取中", icon: `<svg class="icon-svg spin" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>`, color: "primary" },
    downloading: { label: "下载中", icon: `<svg class="icon-svg spin" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>`, color: "primary" },
    zipping: { label: "保存中", icon: `<svg class="icon-svg spin" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>`, color: "primary" },
    done: { label: "完成", icon: `<svg class="icon-svg" style="color:var(--color-success);" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`, color: "success" },
    failed: { label: "失败", icon: `<svg class="icon-svg" style="color:var(--color-error);" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`, color: "error" },
    cancelled: { label: "已停止", icon: `<svg class="icon-svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>`, color: "warning" }
  };
  return statusMap[task.status] || statusMap.pending;
}

function renderXhsTaskList() {
  if (!xhsTaskList) return;
  xhsTaskList.textContent = "";

  if (!xhsState.tasks.length) {
    const empty = document.createElement("div");
    empty.className = "xhs-task-item";
    empty.textContent = "暂无任务";
    xhsTaskList.appendChild(empty);
    return;
  }

  xhsState.tasks.forEach((task) => {
    const item = document.createElement("div");
    item.className = "xhs-task-item";

    const meta = document.createElement("div");
    meta.className = "xhs-task-meta";

    const title = document.createElement("div");
    title.className = "xhs-task-title";
    title.textContent = task.title || task.url || "未命名商品";
    title.title = task.title || task.url || "";

    const sub = document.createElement("div");
    sub.className = "xhs-task-sub";
    let progressText = task.total
      ? `${task.current || 0}/${task.total}（成功${task.success || 0} 失败${task.failed || 0} 跳过${task.skipped || 0}）`
      : task.message || task.url;
    if ((task.status === "done" || task.status === "failed" || task.status === "cancelled") && task.message) {
      progressText = task.message;
    }
    sub.textContent = progressText;
    sub.title = progressText;

    meta.appendChild(title);
    meta.appendChild(sub);

    const badge = document.createElement("div");
    const { label, icon } = getXhsTaskStatusBadge(task);
    badge.className = "xhs-task-status";
    badge.innerHTML = icon;
    badge.title = label; // Tooltip for status

    item.appendChild(meta);
    item.appendChild(badge);
    xhsTaskList.appendChild(item);
  });
}

function getXhsExtractScript() {
  return `(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const GENERIC_TITLES = new Set([
      '商品',
      '详情',
      '商品详情',
      '商品详情页',
      '小红书',
      '小红书商品详情'
    ]);
    const normalizeTitle = (value) => {
      const text = String(value || '').replace(/\\s+/g, ' ').trim();
      if (!text) return '';
      const compact = text.replace(/\\s+/g, '');
      if (GENERIC_TITLES.has(compact)) return '';
      const parts = text
        .split(/[|｜丨\\-_]/g)
        .map((part) => part.trim())
        .filter(Boolean);
      if (parts.length > 1) {
        const candidates = parts.filter((part) => !GENERIC_TITLES.has(part.replace(/\\s+/g, '')));
        if (candidates.length) {
          candidates.sort((a, b) => b.length - a.length);
          return candidates[0];
        }
      }
      return text;
    };
    const pickLargestFromSrcset = (srcset) => {
      if (!srcset) return '';
      const candidates = srcset.split(',')
        .map((item) => item.trim())
        .map((item) => {
          const parts = item.split(/\s+/);
          return { url: parts[0], size: parseInt(parts[1], 10) || 0 };
        })
        .filter((item) => item.url);
      if (!candidates.length) return '';
      candidates.sort((a, b) => b.size - a.size);
      return candidates[0].url;
    };
    const pickSrc = (img) => {
      return img.getAttribute('data-src')
        || img.getAttribute('data-original')
        || img.getAttribute('data-lazy-src')
        || img.getAttribute('data-lazy')
        || pickLargestFromSrcset(img.getAttribute('data-srcset') || img.getAttribute('srcset'))
        || img.src;
    };
    const toAbs = (src) => {
      if (!src) return '';
      if (src.startsWith('//')) return location.protocol + src;
      if (src.startsWith('/')) return location.origin + src;
      return src;
    };
    const shouldExcludeImg = (img) => {
      // 排除头像、logo 等无关图片
      const excludeClasses = ['logo', 'avatar', 'user-avatar', 'seller-avatar', 'shop-logo'];
      const excludeSelectors = ['.logo', '.avatar', '[class*="avatar"]', '[class*="logo"]'];
      // 检查 class
      for (const cls of excludeClasses) {
        if (img.classList.contains(cls)) return true;
      }
      // 检查是否匹配排除选择器
      for (const sel of excludeSelectors) {
        if (img.matches(sel)) return true;
      }
      // 检查父元素是否包含排除类
      const parent = img.parentElement;
      if (parent) {
        for (const cls of excludeClasses) {
          if (parent.classList.contains(cls)) return true;
        }
      }
      // 排除 sns-avatar 头像 CDN 的图片
      const src = img.src || img.getAttribute('data-src') || '';
      if (src.includes('sns-avatar')) return true;
      return false;
    };
    const pushItem = (bucket, seenSet, src, zone) => {
      if (!src || src.startsWith('data:') || seenSet.has(src)) return;
      seenSet.add(src);
      bucket.push({ url: src, zone });
    };
    const isDetailScopedElement = (el) => {
      return !!(el && typeof el.closest === 'function' && el.closest('.content-container'));
    };
    const collectFromRoot = (root, bucket, seenSet, zone) => {
      const imgs = root.querySelectorAll('img');
      imgs.forEach((img) => {
        if (shouldExcludeImg(img)) return;
        if (zone === 'general' && isDetailScopedElement(img)) return;
        const src = toAbs(pickSrc(img));
        pushItem(bucket, seenSet, src, zone);
      });
      root.querySelectorAll('*').forEach((el) => {
        if (zone === 'general' && isDetailScopedElement(el)) return;
        const bg = getComputedStyle(el).backgroundImage;
        if (bg && bg.startsWith('url(')) {
          const raw = bg.slice(5, -2);
          const src = toAbs(raw);
          if (src && !src.includes('sns-avatar')) pushItem(bucket, seenSet, src, zone);
        }
      });
    };
    const hydrateLazyImages = (root) => {
      root.querySelectorAll('img').forEach((img) => {
        const src = pickSrc(img);
        if (src && !img.src) {
          img.src = src;
        }
      });
    };
    const collectMainFromSwiper = async (mainItems, seenMain) => {
      const swiperEl = document.querySelector('.swiper');
      const swiper = swiperEl && swiperEl.swiper;
      if (!swiper || !swiper.slides) return;
      const rawSlides = Array.from(swiper.slides || []);
      const orderedRealIndexes = [];
      const indexSeen = new Set();
      rawSlides.forEach((slide, index) => {
        const parsedIndex = Number(slide.getAttribute('data-swiper-slide-index'));
        const realIndex = Number.isInteger(parsedIndex) ? parsedIndex : index;
        if (indexSeen.has(realIndex)) return;
        indexSeen.add(realIndex);
        orderedRealIndexes.push(realIndex);
      });
      orderedRealIndexes.sort((a, b) => a - b);
      for (const realIndex of orderedRealIndexes) {
        try {
          if (typeof swiper.slideToLoop === 'function') {
            swiper.slideToLoop(realIndex, 0, false);
          } else {
            swiper.slideTo(realIndex, 0, false);
          }
          await sleep(200);
          const activeSlide = swiperEl.querySelector('.swiper-slide-active');
          const fallbackSlide = swiperEl.querySelector('[data-swiper-slide-index="' + realIndex + '"]');
          const root = activeSlide || fallbackSlide || swiperEl;
          hydrateLazyImages(root);
          collectFromRoot(root, mainItems, seenMain, 'general');
        } catch (error) {
          break;
        }
      }
    };
    const collect = async () => {
      const mainItems = [];
      const seenMain = new Set();
      await collectMainFromSwiper(mainItems, seenMain);
      const generalRoots = Array.from(document.querySelectorAll('.carousel-container, .swiper, .swiper-wrapper'));
      generalRoots.forEach((root) => {
        hydrateLazyImages(root);
        collectFromRoot(root, mainItems, seenMain, 'general');
      });
      if (!mainItems.length) {
        hydrateLazyImages(document);
        collectFromRoot(document, mainItems, seenMain, 'general');
      }
      const detailItems = [];
      const seenAll = new Set(mainItems.map((item) => item.url));
      const detailRoots = Array.from(document.querySelectorAll('.content-container'));
      detailRoots.forEach((root) => {
        hydrateLazyImages(root);
        collectFromRoot(root, detailItems, seenAll, 'detail');
      });
      return [...mainItems, ...detailItems];
    };
    const autoScroll = async () => {
      let lastHeight = 0;
      for (let i = 0; i < 8; i += 1) {
        window.scrollBy(0, window.innerHeight);
        await sleep(500);
        const height = document.body.scrollHeight;
        if (height === lastHeight) break;
        lastHeight = height;
      }
      window.scrollTo(0, 0);
      await sleep(300);
    };
    const resolveTitle = async () => {
      const selectors = ['.goods-name', '[class*="goods-name"]', 'h1'];
      for (let i = 0; i < 12; i += 1) {
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          const text = normalizeTitle(el && el.textContent);
          if (text) return text;
        }
        const docTitle = normalizeTitle(document.title);
        if (docTitle) return docTitle;
        await sleep(250);
      }
      return '商品';
    };
    await autoScroll();
    const urls = await collect();
    await sleep(300);
    const title = await resolveTitle();
    return { title, urls };
  })();`;
}

function loadXhsWebview(url) {
  if (!xhsWebview) return Promise.reject(new Error("Webview 不可用"));
  return new Promise((resolve, reject) => {
    const handleFinish = () => {
      setXhsWebviewStatus("页面已加载");
      resolve();
    };
    const handleFail = (event) => {
      reject(new Error(`页面加载失败 (${event.errorCode || "未知"})`));
    };
    xhsWebview.addEventListener("did-finish-load", handleFinish, { once: true });
    xhsWebview.addEventListener("did-fail-load", handleFail, { once: true });
    setXhsWebviewStatus("加载中...");
    if (typeof xhsWebview.loadURL === "function") {
      xhsWebview.loadURL(url);
    } else {
      xhsWebview.src = url;
    }
  });
}

async function extractXhsImages() {
  if (!xhsWebview || typeof xhsWebview.executeJavaScript !== "function") {
    throw new Error("无法执行提取脚本");
  }
  setXhsWebviewStatus("提取图片中...");
  const script = getXhsExtractScript();
  const result = await xhsWebview.executeJavaScript(script, true);
  return result || { title: "", urls: [] };
}

async function handleXhsSelectOutput() {
  if (!window.appApi) return;
  const result = await window.appApi.openOutputFolder();
  if (!result || result.canceled) return;
  xhsState.outputDir = result.filePaths?.[0] || "";
  updateXhsOutputUI();
  persistXhsOutputFolder();
}

function buildXhsTasks(urls) {
  const now = Date.now();
  return urls.map((url, index) => ({
    id: `${now}-${index}`,
    url,
    title: "",
    status: "pending",
    current: 0,
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    message: ""
  }));
}

async function processNextXhsTask() {
  if (!xhsState.running) return;
  const next = xhsState.tasks.find((task) => task.status === "pending");
  if (!next) {
    xhsState.running = false;
    setXhsStatus("完成");
    if (xhsStartBtn) xhsStartBtn.disabled = false;
    if (xhsStopBtn) xhsStopBtn.disabled = true;
    setXhsWebviewStatus("待机");
    return;
  }

  xhsState.currentTaskId = next.id;
  next.status = "loading";
  renderXhsTaskList();

  try {
    await loadXhsWebview(next.url);
    if (!xhsState.running) return;

    next.status = "extracting";
    renderXhsTaskList();
    const extractResult = await extractXhsImages();
    next.title = extractResult.title || next.url;
    const imageItems = (Array.isArray(extractResult.urls) ? extractResult.urls : [])
      .map((item) => {
        if (typeof item === "string") {
          return { url: item, zone: "general" };
        }
        if (!item || typeof item !== "object") {
          return null;
        }
        const url = typeof item.url === "string" ? item.url : "";
        if (!url) return null;
        return {
          url,
          zone: item.zone === "detail" ? "detail" : "general"
        };
      })
      .filter(Boolean);
    if (!imageItems.length) {
      next.status = "failed";
      next.message = "未提取到图片";
      appendLog({ level: 4, message: `小红书提取失败: ${next.url} (未提取到图片)` });
      showToast("未提取到图片，请确认页面是否加载完成", "error");
      renderXhsTaskList();
      return processNextXhsTask();
    }

    next.status = "downloading";
    next.total = imageItems.length;
    renderXhsTaskList();

    const downloadResult = await window.appApi.xhsDownload({
      taskId: next.id,
      title: next.title,
      imageUrls: imageItems,
      outputDir: xhsState.outputDir,
      sourceUrl: next.url
    });

    if (downloadResult?.ok) {
      next.status = "done";
      next.current = downloadResult.total || imageItems.length;
      next.total = downloadResult.total || imageItems.length;
      next.success = downloadResult.success || 0;
      next.failed = downloadResult.failed || 0;
      next.skipped = downloadResult.skipped || 0;
      next.message = downloadResult.folderPath || "";
      const folderPath = downloadResult.folderPath;
      showToast(`下载成功! 共下载 ${next.success} 张图片`, 'success', 5000, {
        actionText: '打开文件夹',
        actionCallback: () => {
          if (window.appApi?.openPath && folderPath) {
            window.appApi.openPath(folderPath);
          }
        }
      });
    } else if (downloadResult?.cancelled) {
      next.status = "cancelled";
    } else {
      next.status = "failed";
      next.message = downloadResult?.error?.message || downloadResult?.error || "下载失败";
      appendLog({ level: 4, message: `小红书下载失败: ${next.url} (${next.message})` });
      showToast(next.message || "下载失败", "error");
    }
  } catch (error) {
    next.status = "failed";
    next.message = error.message || "未知错误";
    setXhsWebviewStatus("出错");
    appendLog({ level: 4, message: `小红书处理异常: ${next.url} (${next.message})` });
    showToast(next.message || "处理异常", "error");
  }

  renderXhsTaskList();
  if (xhsState.running) {
    processNextXhsTask();
  }
}

async function handleXhsStart() {
  if (window.licenseManager) {
    const allowed = await window.licenseManager.checkAccess("xhs");
    if (!allowed) return;
  }
  if (!xhsLinks) return;
  if (!xhsState.outputDir) {
    showToast("请先选择输出目录", "error");
    if (xhsSelectOutputBtn) {
      xhsSelectOutputBtn.classList.add("btn-highlight-error");
      setTimeout(() => xhsSelectOutputBtn.classList.remove("btn-highlight-error"), 2000);
    }
    return;
  }
  const urls = parseXhsLinks(xhsLinks.value || "");
  if (urls.length === 0) {
    showToast("请输入有效的商品链接", "error");
    return;
  }

  xhsState.tasks = buildXhsTasks(urls);
  xhsState.running = true;
  setXhsStatus("运行中...");
  if (xhsStartBtn) xhsStartBtn.disabled = true;
  if (xhsStopBtn) xhsStopBtn.disabled = false;
  renderXhsTaskList();
  processNextXhsTask();
}

async function handleXhsStop() {
  xhsState.running = false;
  if (window.appApi) {
    await window.appApi.xhsCancel();
  }
  setXhsStatus("已停止");
  if (xhsStartBtn) xhsStartBtn.disabled = false;
  if (xhsStopBtn) xhsStopBtn.disabled = true;
  setXhsWebviewStatus("待机");
}

function updateSelectionUI() {
  filesCount.textContent = String(selectionState.files.length);
  foldersCount.textContent = String(selectionState.folders.length);
  outputStatus.textContent = formatOutputPath(selectionState.outputFolder);
  outputStatus.title = selectionState.outputFolder || "未设置";
  if (selectedFiles) {
    selectedFiles.textContent = summarizePaths(selectionState.files);
  }
  if (selectedFolder) {
    selectedFolder.textContent = summarizePaths(selectionState.folders);
  }
  if (selectedOutput) {
    selectedOutput.textContent = selectionState.outputFolder || "无";
  }
  renderFolderConfigList();
}

function normalizeUploadCount(value) {
  const count = Number(value);
  return Number.isInteger(count) && count > 0 ? count : 1;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getLocalPathName(filePath) {
  const normalized = String(filePath || "").replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || normalized || "未命名";
}

function normalizePathKey(filePath) {
  return String(filePath || "")
    .trim()
    .replace(/\//g, "\\")
    .replace(/\\+$/g, "")
    .toLowerCase();
}

function getNoteBatch() {
  if (!uploadState.noteBatch) {
    uploadState.noteBatch = {
      entryFolders: [],
      groups: [],
      skippedGroups: [],
      dedupedCount: 0,
      rootImageCount: 0,
      ignoredParentImageCount: 0,
      lastScannedAt: 0,
      scanning: false,
      nextEntryId: 1,
      scanRequestId: 0
    };
  }
  return uploadState.noteBatch;
}

function resetNoteScanResult(batch = getNoteBatch()) {
  batch.groups = [];
  batch.skippedGroups = [];
  batch.dedupedCount = 0;
  batch.rootImageCount = 0;
  batch.ignoredParentImageCount = 0;
  batch.lastScannedAt = 0;
}

function invalidateNoteScan(batch = getNoteBatch()) {
  batch.scanRequestId = (Number(batch.scanRequestId) || 0) + 1;
  batch.scanning = false;
}

function getActiveNoteGroups() {
  const batch = getNoteBatch();
  return (batch.groups || []).filter((group) => !group.removed);
}

function getNoteStartRow() {
  const value = Number(startRow?.value);
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function recalculateNoteRows() {
  const start = getNoteStartRow();
  let offset = 0;
  (getNoteBatch().groups || []).forEach((group) => {
    if (group.removed) {
      group.rowNumber = null;
      return;
    }
    group.rowNumber = start + offset;
    offset += 1;
  });
}

function getNoteImageTotal(groups = getActiveNoteGroups()) {
  return groups.reduce((sum, group) => {
    const images = Array.isArray(group.images) ? group.images : [];
    return sum + images.length;
  }, 0);
}

function updateNoteRowRange() {
  if (!noteRowRange) return;
  if (uploadState.mode !== UPLOAD_MODE_NOTE) {
    noteRowRange.style.display = "none";
    return;
  }
  const groups = getActiveNoteGroups();
  noteRowRange.style.display = "inline-flex";
  if (!groups.length) {
    noteRowRange.textContent = "写入范围：待扫描";
    return;
  }
  const start = getNoteStartRow();
  const end = start + groups.length - 1;
  noteRowRange.textContent = `写入范围：第 ${start} 行 到 第 ${end} 行`;
}

function setUploadMode(mode) {
  uploadState.mode = mode === UPLOAD_MODE_NOTE ? UPLOAD_MODE_NOTE : UPLOAD_MODE_MODULE;
  renderUploadMode();
}

function renderUploadMode() {
  const isNoteMode = uploadState.mode === UPLOAD_MODE_NOTE;
  if (uploadModeModuleTab) {
    uploadModeModuleTab.classList.toggle("active", !isNoteMode);
    uploadModeModuleTab.setAttribute("aria-selected", isNoteMode ? "false" : "true");
    uploadModeModuleTab.disabled = uploadState.uploading;
  }
  if (uploadModeNoteTab) {
    uploadModeNoteTab.classList.toggle("active", isNoteMode);
    uploadModeNoteTab.setAttribute("aria-selected", isNoteMode ? "true" : "false");
    uploadModeNoteTab.disabled = uploadState.uploading;
  }
  if (uploadModulePanel) uploadModulePanel.style.display = isNoteMode ? "none" : "block";
  if (uploadNotePanel) uploadNotePanel.style.display = isNoteMode ? "block" : "none";
  if (uploadModuleEndRowGroup) uploadModuleEndRowGroup.style.display = isNoteMode ? "none" : "inline-flex";
  if (uploadBtn) uploadBtn.disabled = uploadState.uploading;
  if (cancelUploadBtn) cancelUploadBtn.disabled = !uploadState.uploading;
  if (addFolderConfigBtn) addFolderConfigBtn.disabled = uploadState.uploading;
  [feishuToken, toggleFeishuToken, feishuLink, feishuField, startRow, endRow].forEach((element) => {
    if (element) element.disabled = uploadState.uploading;
  });
  updateNoteRowRange();
  renderFolderConfigList();
  renderNoteBatch();
}

function createEntryFolder(folderPath) {
  const batch = getNoteBatch();
  return {
    id: batch.nextEntryId++,
    path: folderPath,
    name: getLocalPathName(folderPath),
    order: batch.entryFolders.length,
    status: "pending",
    error: ""
  };
}

function normalizeEntryOrders() {
  getNoteBatch().entryFolders.forEach((entry, index) => {
    entry.order = index;
  });
}

function addNoteEntryPaths(paths, { replace = false } = {}) {
  const batch = getNoteBatch();
  const incoming = (Array.isArray(paths) ? paths : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  if (!incoming.length) return { added: 0, duplicate: 0 };

  if (replace) {
    batch.entryFolders = [];
    invalidateNoteScan(batch);
    resetNoteScanResult(batch);
  }

  const existing = new Set(batch.entryFolders.map((entry) => normalizePathKey(entry.path)));
  let added = 0;
  let duplicate = 0;
  incoming.forEach((folderPath) => {
    const key = normalizePathKey(folderPath);
    if (!key || existing.has(key)) {
      duplicate += 1;
      return;
    }
    existing.add(key);
    batch.entryFolders.push(createEntryFolder(folderPath));
    added += 1;
  });
  normalizeEntryOrders();
  renderNoteBatch();
  if (duplicate > 0) {
    showToast(`已忽略 ${duplicate} 个重复入口`, "info");
  }
  return { added, duplicate };
}

async function handleSelectNoteParentFolder() {
  if (uploadState.uploading) return;
  if (!window.appApi) return;
  const result = await window.appApi.openImageFolder();
  if (!result || result.canceled) return;
  const selectedPath = result.filePaths?.[0] || "";
  if (!selectedPath) return;
  const { added } = addNoteEntryPaths([selectedPath], { replace: true });
  if (added > 0) {
    await scanNoteFolders();
  }
}

async function handleAddNoteEntryFolders() {
  if (uploadState.uploading) return;
  if (!window.appApi) return;
  const opener = typeof window.appApi.openImageFolders === "function"
    ? window.appApi.openImageFolders
    : window.appApi.openImageFolder;
  const result = await opener();
  if (!result || result.canceled) return;
  const paths = result.filePaths || result.folders || [];
  const { added } = addNoteEntryPaths(paths, { replace: false });
  if (added > 0) {
    await scanNoteFolders();
  }
}

function removeNoteEntry(id) {
  if (uploadState.uploading) return;
  const batch = getNoteBatch();
  batch.entryFolders = batch.entryFolders.filter((entry) => entry.id !== id);
  normalizeEntryOrders();
  if (!batch.entryFolders.length) {
    invalidateNoteScan(batch);
    resetNoteScanResult(batch);
    renderNoteBatch();
    return;
  }
  renderNoteBatch();
  scanNoteFolders();
}

async function scanNoteFolders() {
  const batch = getNoteBatch();
  if (!window.appApi || typeof window.appApi.scanFeishuNoteFolders !== "function") {
    invalidateNoteScan(batch);
    resetNoteScanResult(batch);
    renderNoteBatch();
    showToast("笔记扫描接口不可用", "error");
    return;
  }
  const entryFolders = batch.entryFolders.map((entry) => entry.path).filter(Boolean);
  if (!entryFolders.length) {
    invalidateNoteScan(batch);
    resetNoteScanResult(batch);
    renderNoteBatch();
    return;
  }
  const requestId = (Number(batch.scanRequestId) || 0) + 1;
  batch.scanRequestId = requestId;
  batch.scanning = true;
  renderNoteBatch();
  try {
    const result = await window.appApi.scanFeishuNoteFolders({ entryFolders });
    if (batch.scanRequestId !== requestId) return;
    if (!result || !result.ok) {
      const message = result?.error || "笔记文件夹扫描失败";
      resetNoteScanResult(batch);
      showToast(message, "error", 5000);
      appendLog({ level: 4, message });
      return;
    }
    batch.groups = (result.groups || []).map((group, index) => ({
      ...group,
      id: `note-${Date.now()}-${index}`,
      removed: false,
      removedAt: 0
    }));
    batch.skippedGroups = result.skippedGroups || [];
    batch.dedupedCount = Number(result.dedupedCount) || 0;
    batch.rootImageCount = Number(result.rootImageCount) || 0;
    batch.ignoredParentImageCount = Number(result.ignoredParentImageCount ?? result.rootImageCount) || 0;
    batch.lastScannedAt = Date.now();
    recalculateNoteRows();
    appendLog({
      level: 1,
      message: `飞书笔记扫描完成：${batch.entryFolders.length} 个入口，${getActiveNoteGroups().length} 篇笔记，共 ${getNoteImageTotal()} 张`
    });
  } catch (error) {
    if (batch.scanRequestId !== requestId) return;
    const message = error?.message || "笔记文件夹扫描失败";
    resetNoteScanResult(batch);
    showToast(message, "error", 5000);
    appendLog({ level: 4, message });
  } finally {
    if (batch.scanRequestId === requestId) {
      batch.scanning = false;
      renderNoteBatch();
    }
  }
}

function removeNoteGroup(groupId) {
  if (uploadState.uploading) return;
  const group = getNoteBatch().groups.find((item) => item.id === groupId);
  if (!group) return;
  group.removed = true;
  group.removedAt = Date.now();
  recalculateNoteRows();
  renderNoteBatch();
}

function renderNoteBatch() {
  recalculateNoteRows();
  const batch = getNoteBatch();
  const busy = batch.scanning || uploadState.uploading;
  if (selectNoteParentBtn) selectNoteParentBtn.disabled = busy;
  if (addNoteEntryBtn) addNoteEntryBtn.disabled = busy;
  if (rescanNoteBtn) rescanNoteBtn.disabled = busy || batch.entryFolders.length === 0;
  renderNoteEntries();
  renderNoteGroups();
  renderSkippedNotes();
  renderNoteSummary();
  updateNoteRowRange();
}

function renderNoteEntries() {
  if (!noteEntryList) return;
  const batch = getNoteBatch();
  const items = noteEntryList.querySelectorAll(".note-entry-item");
  items.forEach((item) => item.remove());
  if (noteEntryEmpty) {
    noteEntryEmpty.style.display = batch.entryFolders.length === 0 ? "flex" : "none";
  }
  batch.entryFolders.forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = "note-entry-item";
    row.dataset.entryId = String(entry.id);
    row.innerHTML = `
      <div class="note-entry-main">
        <span class="note-entry-index">${index + 1}</span>
        <span class="note-entry-name" title="${escapeHtml(entry.path)}">${escapeHtml(entry.path)}</span>
      </div>
      <div class="note-entry-actions">
        <button type="button" class="note-entry-remove" ${uploadState.uploading ? "disabled" : ""}>移除</button>
      </div>
    `;
    row.querySelector(".note-entry-remove")?.addEventListener("click", () => removeNoteEntry(entry.id));
    noteEntryList.appendChild(row);
  });
}

function renderNoteGroups() {
  if (!noteGroupList) return;
  const items = noteGroupList.querySelectorAll(".note-group-item");
  items.forEach((item) => item.remove());
  const groups = getActiveNoteGroups();
  if (noteGroupEmpty) {
    noteGroupEmpty.style.display = groups.length === 0 ? "flex" : "none";
  }
  groups.forEach((group, index) => {
    const row = document.createElement("div");
    row.className = "note-group-item";
    row.dataset.groupId = group.id;
    row.innerHTML = `
      <span class="note-group-index">${index + 1}</span>
      <span class="note-group-name" title="${escapeHtml(group.folderPath)}">${escapeHtml(group.displayName || group.name || group.folderPath)}</span>
      <span class="note-group-count">${Array.isArray(group.images) ? group.images.length : 0} 张</span>
      <span class="note-group-row">第 ${group.rowNumber || "-"} 行</span>
      <button type="button" class="note-group-remove" ${uploadState.uploading ? "disabled" : ""}>删除</button>
    `;
    row.querySelector(".note-group-remove")?.addEventListener("click", () => removeNoteGroup(group.id));
    noteGroupList.appendChild(row);
  });
}

function renderSkippedNotes() {
  if (!noteSkippedSection || !noteSkippedList) return;
  const skipped = getNoteBatch().skippedGroups || [];
  noteSkippedSection.style.display = skipped.length > 0 ? "block" : "none";
  noteSkippedList.textContent = "";
  skipped.forEach((group) => {
    const row = document.createElement("div");
    row.className = "note-skipped-item";
    row.innerHTML = `
      <span class="note-skipped-name" title="${escapeHtml(group.folderPath)}">${escapeHtml(group.displayName || group.name || group.folderPath)}</span>
      <span class="note-skipped-reason">${escapeHtml(group.reason || "已跳过")}</span>
    `;
    noteSkippedList.appendChild(row);
  });
}

function renderNoteSummary() {
  if (!noteScanSummary) return;
  const batch = getNoteBatch();
  if (batch.scanning) {
    noteScanSummary.textContent = "正在扫描笔记文件夹...";
    return;
  }
  if (!batch.entryFolders.length) {
    noteScanSummary.textContent = "选择入口后将自动扫描最下层子文件夹作为笔记。";
    return;
  }
  const groups = getActiveNoteGroups();
  const imageTotal = getNoteImageTotal(groups);
  if (!batch.lastScannedAt && groups.length === 0) {
    noteScanSummary.textContent = "入口顺序决定飞书写入顺序；选择入口后将自动扫描。";
    return;
  }
  const skippedCount = (batch.skippedGroups || []).length;
  const dedupedCount = Number(batch.dedupedCount) || 0;
  const ignoredParentImageCount = Number(batch.ignoredParentImageCount ?? batch.rootImageCount) || 0;
  const start = getNoteStartRow();
  const end = groups.length ? start + groups.length - 1 : start;
  const rangeText = groups.length ? `写入第 ${start} 行至第 ${end} 行` : "暂无写入行";
  noteScanSummary.textContent = `有效笔记 ${groups.length} 篇，图片 ${imageTotal} 张，跳过 ${skippedCount} 个，去重 ${dedupedCount} 个，非笔记层忽略图片 ${ignoredParentImageCount} 张；${rangeText}`;
}

async function addFolderConfig() {
  if (uploadState.uploading) return;
  if (!window.appApi) return;
  const result = await window.appApi.openImageFolder();
  if (!result || result.canceled) return;
  const selectedPath = result.filePaths?.[0] || "";
  if (!selectedPath) return;

  const folder = {
    id: uploadState.nextFolderId++,
    path: selectedPath,
    mode: "sequential",
    count: 1
  };
  uploadState.folders.push(folder);
  renderFolderConfigList();
}

function removeFolderConfig(id) {
  if (uploadState.uploading) return;
  uploadState.folders = uploadState.folders.filter((item) => item.id !== id);
  renderFolderConfigList();
}

function renderFolderConfigList() {
  if (!folderConfigList) return;

  const items = folderConfigList.querySelectorAll(".folder-config-item");
  items.forEach((item) => item.remove());

  if (folderConfigEmpty) {
    folderConfigEmpty.style.display = uploadState.folders.length === 0 ? "flex" : "none";
  }

  uploadState.folders.forEach((folder, index) => {
    const element = createFolderConfigElement(folder, index);
    folderConfigList.appendChild(element);
  });
}

function createFolderConfigElement(folder, index) {
  const container = document.createElement("div");
  container.className = "folder-config-item";
  container.dataset.folderId = String(folder.id);

  const pathDisplay = folder.path
    ? (folder.path.length > 35 ? `...${folder.path.slice(-32)}` : folder.path)
    : "未选择";
  const pathTitle = folder.path || "未选择";
  const safePathDisplay = escapeHtml(pathDisplay);
  const safePathTitle = escapeHtml(pathTitle);
  const radioName = `folderMode_${folder.id}`;

  container.innerHTML = `
    <div class="folder-config-header">
      <span class="folder-config-index">文件夹 ${index + 1}</span>
      <button class="folder-config-remove" type="button" title="移除" ${uploadState.uploading ? "disabled" : ""}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
             stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
    <div class="folder-config-body">
      <div class="folder-config-row">
        <button class="folder-config-select-btn" type="button" ${uploadState.uploading ? "disabled" : ""}>选择文件夹</button>
        <span class="folder-config-path" title="${safePathTitle}">${safePathDisplay}</span>
      </div>
      <div class="folder-config-row">
        <label class="folder-config-mode-label">
          <input type="radio" name="${radioName}" value="sequential" ${folder.mode === "sequential" ? "checked" : ""} ${uploadState.uploading ? "disabled" : ""} />
          <span>顺序上传</span>
        </label>
        <label class="folder-config-mode-label">
          <input type="radio" name="${radioName}" value="random" ${folder.mode === "random" ? "checked" : ""} ${uploadState.uploading ? "disabled" : ""} />
          <span>随机上传</span>
        </label>
        <label class="field-label">每行</label>
        <input class="folder-config-count" type="number" min="1" value="${normalizeUploadCount(folder.count)}" ${uploadState.uploading ? "disabled" : ""} />
        <label class="field-label">张</label>
      </div>
    </div>
  `;

  const removeBtn = container.querySelector(".folder-config-remove");
  if (removeBtn) {
    removeBtn.addEventListener("click", () => removeFolderConfig(folder.id));
  }

  const selectBtn = container.querySelector(".folder-config-select-btn");
  if (selectBtn) {
    selectBtn.addEventListener("click", async () => {
      if (!window.appApi) return;
      const result = await window.appApi.openImageFolder();
      if (!result || result.canceled) return;
      const selectedPath = result.filePaths?.[0] || "";
      if (selectedPath) {
        folder.path = selectedPath;
        renderFolderConfigList();
      }
    });
  }

  const radios = container.querySelectorAll(`input[name="${radioName}"]`);
  radios.forEach((radio) => {
    radio.addEventListener("change", (event) => {
      folder.mode = event.target.value === "random" ? "random" : "sequential";
    });
  });

  const countInput = container.querySelector(".folder-config-count");
  if (countInput) {
    countInput.addEventListener("change", (event) => {
      folder.count = normalizeUploadCount(event.target.value);
      event.target.value = String(folder.count);
    });
  }

  return container;
}

function clearResults() {
  if (scanCount) {
    scanCount.textContent = "0";
  }
  scanList.textContent = "";
  selectionState.lastScanItems = [];
  if (scanResultsSection) {
    scanResultsSection.classList.add("is-hidden");
  }
}

// 导出所有运行日志
async function exportAllLogs() {
  if (!window.appApi || !logBody) return;

  // 获取所有日志条目
  const logLines = logBody.querySelectorAll('.log-line');

  if (logLines.length === 0) {
    appendLog({ level: 3, message: "暂无可导出的日志记录。" });
    return;
  }

  // 格式化为TXT格式
  const exportTime = new Date().toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const levelNames = {
    0: '调试',
    1: '信息',
    2: '警告',
    3: '通知',
    4: '错误'
  };

  let content = `运行日志导出时间：${exportTime}\n`;
  content += `总日志数：${logLines.length}\n`;
  content += `${'='.repeat(100)}\n\n`;

  logLines.forEach((line, index) => {
    const level = line.dataset.level || '1';
    const levelName = levelNames[level] || '未知';
    const timeEl = line.querySelector('.log-time');
    const messageEl = line.querySelector('.log-message');

    const time = timeEl ? timeEl.textContent : '';
    const message = messageEl ? messageEl.textContent : '';

    content += `[${index + 1}] [${levelName}] ${time}\n`;
    content += `${message}\n`;
    content += `${'-'.repeat(100)}\n\n`;
  });

  const payload = {
    defaultPath: 'run-log.txt',
    content: content
  };

  const result = await window.appApi.saveTextFile(payload);
  if (result?.ok) {
    appendLog({ level: 1, message: `已保存运行日志：${result.filePath}` });
  } else if (!result?.cancelled) {
    appendLog({ level: 4, message: result?.error || "保存失败。" });
  }
}

// 导出错误记录（保留此函数以备将来使用）
async function exportErrorsFile(fileName, errors) {
  if (!window.appApi) return;
  if (!errors || errors.length === 0) {
    appendLog({ level: 3, message: "暂无可导出的错误记录。" });
    return;
  }

  // 格式化为TXT格式
  const exportTime = new Date().toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  let content = `错误日志导出时间：${exportTime}\n`;
  content += `总错误数：${errors.length}\n`;
  content += `${'='.repeat(80)}\n\n`;

  errors.forEach((error, index) => {
    content += `[${index + 1}] ${error.source || '未知来源'}\n`;
    if (error.file) {
      content += `文件：${error.file}\n`;
    }
    if (error.path) {
      content += `路径：${error.path}\n`;
    }
    content += `错误：${error.message || '无描述'}\n`;
    content += `${'-'.repeat(80)}\n\n`;
  });

  const payload = {
    defaultPath: fileName,
    content: content
  };
  const result = await window.appApi.saveTextFile(payload);
  if (result?.ok) {
    appendLog({ level: 1, message: `已保存错误日志：${result.filePath}` });
  } else if (!result?.cancelled) {
    appendLog({ level: 4, message: result?.error || "保存失败。" });
  }
}

async function handleSelectFiles() {
  if (!window.appApi) return;
  const result = await window.appApi.openFiles();
  if (!result || result.canceled) return;
  selectionState.files = mergeUniquePaths(selectionState.files, result.filePaths || []);
  updateSelectionUI();
  await autoScanIfNeeded();
}

async function handleSelectFolder() {
  if (!window.appApi) return;
  const result = await window.appApi.openFolder();
  if (!result || result.canceled) return;
  selectionState.folders = mergeUniquePaths(selectionState.folders, result.filePaths || []);
  updateSelectionUI();
  await autoScanIfNeeded();
}

async function handleSelectOutput() {
  if (!window.appApi) return;
  const result = await window.appApi.openOutputFolder();
  if (!result || result.canceled) return;
  selectionState.outputFolder = result.filePaths?.[0] || "";
  updateSelectionUI();
}
function renderScanList(items) {
  scanList.textContent = "";

  if (items.length === 0) {
    // 显示空状态
    if (scanResultsSection) scanResultsSection.classList.add('is-hidden');
    if (exportEmptyState) exportEmptyState.style.display = 'flex';
    return;
  }

  // 隐藏空状态,显示结果
  if (exportEmptyState) exportEmptyState.style.display = 'none';
  if (scanResultsSection) scanResultsSection.classList.remove('is-hidden');

  const maxItems = 50;
  const displayItems = items.slice(0, maxItems);
  displayItems.forEach((item) => {
    const line = document.createElement("div");
    line.className = "scan-item";

    // 图标
    const icon = document.createElement('span');
    icon.className = 'scan-item-icon';
    icon.innerHTML = getFileIcon(item.fileName);

    // 文字
    const text = document.createElement('span');
    text.className = 'scan-item-text';
    const relDir = item.relativeDir ? `${item.relativeDir}\\` : "";
    text.textContent = `${relDir}${item.fileName}`;
    text.title = text.textContent; // 完整路径tooltip

    // 删除按钮
    const removeBtn = document.createElement('button');
    removeBtn.className = 'scan-item-remove';
    removeBtn.type = 'button';
    removeBtn.title = '移除此文件';
    removeBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = selectionState.lastScanItems.indexOf(item);
      if (idx > -1) {
        selectionState.lastScanItems.splice(idx, 1);
      }
      if (scanCount) scanCount.textContent = String(selectionState.lastScanItems.length);
      renderScanList(selectionState.lastScanItems);
    });

    line.appendChild(icon);
    line.appendChild(text);
    line.appendChild(removeBtn);
    scanList.appendChild(line);
  });

  if (items.length > maxItems) {
    const more = document.createElement("div");
    more.className = "scan-item";
    more.innerHTML = `<span class="scan-item-icon">...</span><span class="scan-item-text">还有 ${items.length - maxItems} 项</span>`;
    scanList.appendChild(more);
  }
}

function mergeUniquePaths(current, incoming) {
  const merged = Array.isArray(current) ? [...current] : [];
  const seen = new Set(merged.map((value) => String(value).toLowerCase()));
  incoming.forEach((value) => {
    const text = String(value);
    const key = text.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(text);
    }
  });
  return merged;
}

async function handleScan() {
  if (!window.appApi) return;
  clearResults();
  const payload = {
    files: selectionState.files,
    folders: selectionState.folders
  };
  const result = await window.appApi.scanDocuments(payload);
  if (!result) return;
  const items = result.items || [];
  const errors = result.errors || [];
  selectionState.lastScanItems = items;
  if (scanCount) {
    scanCount.textContent = String(items.length);
  }
  renderScanList(items);
  if (scanResultsSection) {
    scanResultsSection.classList.remove("is-hidden");
  }
  if (errors.length) {
    errors.forEach((error) => {
      appendLog({
        level: 4,
        message: `扫描失败: ${error.path} (${error.message})`
      });
    });
  }
}

async function autoScanIfNeeded() {
  if (!selectionState.files.length && !selectionState.folders.length) return;
  await handleScan();
}

function buildSkippedSuffix(result) {
  if (!result?.skippedFiles || result.skippedFiles <= 0) return '';
  const skippedItems = Array.isArray(result.skippedItems) ? result.skippedItems : [];
  const pageLimitSkipped = skippedItems.filter((item) => Number(item?.requiredPages) > 0).length;
  const lockSkipped = skippedItems.filter((item) => item?.reason === "office_temp_lock").length;
  if (pageLimitSkipped > 0 || lockSkipped > 0) {
    const parts = [];
    if (pageLimitSkipped > 0) parts.push(`页数不足 ${pageLimitSkipped}`);
    if (lockSkipped > 0) parts.push(`临时锁文件 ${lockSkipped}`);
    return `；跳过 ${result.skippedFiles} 个文件（${parts.join('，')}）`;
  }
  return `；跳过 ${result.skippedFiles} 个文件`;
}

function uniqueTextList(items = []) {
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

function getPrimaryCapability(report = {}) {
  if (report?.capability && typeof report.capability === "object") {
    return report.capability;
  }
  const capabilities = Array.isArray(report?.capabilities) ? report.capabilities : [];
  if (capabilities.length === 0) return {};
  const engine = normalizeExportEngine(report?.engine);
  const expectedCapability = engine === EXPORT_ENGINE_OFFICE ? "office-com" : "libreoffice";
  return capabilities.find((item) => item?.capability === expectedCapability) || capabilities[0] || {};
}

function getHealthReportPlatform(report = {}) {
  const capability = getPrimaryCapability(report);
  const explicit = String(report?.platform || capability?.platform || report?.runtime?.platform || "").trim().toLowerCase();
  if (explicit) return explicit;
  if (typeof navigator !== "undefined") {
    const platformText = String(navigator.platform || navigator.userAgent || "").toLowerCase();
    if (platformText.includes("mac")) return "darwin";
    if (platformText.includes("win")) return "win32";
  }
  return "";
}

function getHealthReportErrorCode(report = {}) {
  const capability = getPrimaryCapability(report);
  return String(report?.errorCode || capability?.errorCode || report?.runtime?.errorCode || "").trim();
}

function isDarwinHealthReport(report = {}) {
  return getHealthReportPlatform(report) === "darwin";
}

function isOfficeComUnsupported(report = {}) {
  const capability = getPrimaryCapability(report);
  return getHealthReportErrorCode(report) === "PLATFORM_UNSUPPORTED"
    || (capability?.capability === "office-com" && capability?.ok === false && getHealthReportPlatform(report) !== "win32");
}

function isWindowsLibreOfficeRepairText(value) {
  return /C:\\|VC\+\+|Redistributable|Full 安装包|内置运行时不可用|默认安装目录|0xC0000135/i.test(String(value || ""));
}

function translateCapabilityActionText(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text === "Switch to LibreOffice export") return "切回 LibreOffice 导出。";
  if (text === "Install LibreOffice for macOS") return "安装 macOS 版 LibreOffice。";
  if (/^Install LibreOffice for macOS:/i.test(text)) return "使用 Homebrew 安装：brew install --cask libreoffice。";
  if (/^Set LIBREOFFICE_PATH/i.test(text)) return "如果安装在自定义位置，请设置 LIBREOFFICE_PATH 指向 soffice 可执行文件。";
  if (/Node 兜底预检/i.test(text)) return "";
  if (/PowerShell/i.test(text) || /^Runtime:/i.test(text)) return "";
  return text;
}

const PLATFORM_CAPABILITY_LABELS = {
  libreoffice: "LibreOffice 导出",
  "office-com": "Office 高保真导出",
  "pdf-render": "PDF 渲染",
  font: "字体渲染",
  packaging: "打包配置"
};

const PLATFORM_SOURCE_LABELS = {
  embedded: "内置运行时",
  env: "环境变量",
  homebrew: "Homebrew",
  local_bundle: "内置资源",
  local_vendor: "本地 vendor",
  node_modules: "Node 依赖",
  path: "PATH",
  program_files: "Program Files",
  program_files_x86: "Program Files (x86)",
  registry: "注册表",
  system_app: "系统应用",
  system_fallback: "系统回退"
};

function formatPlatformLabel(value) {
  const platform = String(value || "").trim().toLowerCase();
  if (platform === "darwin") return "macOS";
  if (platform === "win32") return "Windows";
  if (platform === "linux") return "Linux";
  return platform || "unknown";
}

function formatCapabilityLabel(value) {
  const key = String(value || "").trim().toLowerCase();
  return PLATFORM_CAPABILITY_LABELS[key] || value || "未知能力";
}

function formatCapabilitySource(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const key = raw.toLowerCase();
  return PLATFORM_SOURCE_LABELS[key] || raw;
}

function getCapabilityStatusMeta(capability = {}) {
  if (capability?.ok) {
    return { key: "ok", label: "可用" };
  }
  if (String(capability?.errorCode || "").trim().toUpperCase() === "PLATFORM_UNSUPPORTED") {
    return { key: "unsupported", label: "不支持" };
  }
  return { key: "fail", label: "异常" };
}

function renderCapabilityEmpty(message, className = "capability-empty") {
  if (!platformCapabilityList) return;
  platformCapabilityList.textContent = "";
  const empty = document.createElement("div");
  empty.className = className;
  empty.textContent = message;
  platformCapabilityList.appendChild(empty);
}

function setPlatformCapabilitiesLoading(loading) {
  platformCapabilitiesLoading = Boolean(loading);
  if (platformCapabilityRefreshBtn) {
    platformCapabilityRefreshBtn.disabled = platformCapabilitiesLoading;
    platformCapabilityRefreshBtn.textContent = platformCapabilitiesLoading ? "检测中" : "刷新";
  }
  if (platformCapabilityStatus) {
    platformCapabilityStatus.textContent = platformCapabilitiesLoading ? "检测中" : platformCapabilityStatus.textContent;
  }
}

function appendCapabilityMeta(container, label, value) {
  const text = String(value || "").trim();
  if (!text) return;
  const row = document.createElement("div");
  row.className = "capability-meta-row";

  const labelEl = document.createElement("span");
  labelEl.className = "capability-meta-label";
  labelEl.textContent = `${label}：`;

  const valueEl = document.createElement("span");
  valueEl.className = "capability-meta-value";
  valueEl.textContent = text;
  valueEl.title = text;

  row.appendChild(labelEl);
  row.appendChild(valueEl);
  container.appendChild(row);
}

function renderCapabilityDetailList(container, title, items, className) {
  const list = uniqueTextList(items)
    .map((item) => translateCapabilityActionText(item) || String(item || "").trim())
    .filter(Boolean);
  if (list.length === 0) return;

  const block = document.createElement("div");
  block.className = `capability-detail-list ${className || ""}`.trim();

  const titleEl = document.createElement("span");
  titleEl.className = "capability-detail-title";
  titleEl.textContent = title;
  block.appendChild(titleEl);

  list.slice(0, 3).forEach((item) => {
    const value = document.createElement("span");
    value.className = "capability-detail-item";
    value.textContent = item;
    block.appendChild(value);
  });

  container.appendChild(block);
}

function renderPlatformCapabilityItem(capability = {}) {
  const status = getCapabilityStatusMeta(capability);
  const item = document.createElement("div");
  item.className = `capability-item capability-item-${status.key}`;

  const header = document.createElement("div");
  header.className = "capability-item-header";

  const title = document.createElement("div");
  title.className = "capability-name";
  title.textContent = formatCapabilityLabel(capability.capability);

  const badge = document.createElement("span");
  badge.className = `capability-badge capability-badge-${status.key}`;
  badge.textContent = status.label;

  header.appendChild(title);
  header.appendChild(badge);
  item.appendChild(header);

  const meta = document.createElement("div");
  meta.className = "capability-meta";
  appendCapabilityMeta(meta, "平台", formatPlatformLabel(capability.platform));
  appendCapabilityMeta(meta, "来源", formatCapabilitySource(capability.source));
  appendCapabilityMeta(meta, "版本", capability.version);
  appendCapabilityMeta(meta, "路径", capability.path);
  appendCapabilityMeta(meta, "错误码", capability.errorCode);
  item.appendChild(meta);

  const message = String(capability.message || "").trim();
  if (message) {
    const messageEl = document.createElement("p");
    messageEl.className = "capability-message";
    messageEl.textContent = message;
    item.appendChild(messageEl);
  }

  renderCapabilityDetailList(item, "提醒", capability.warnings, "capability-warning-list");
  renderCapabilityDetailList(item, "动作", capability.actions, "capability-action-list");

  return item;
}

function renderPlatformCapabilities(report = {}) {
  platformCapabilitiesLoaded = true;
  const capabilities = Array.isArray(report?.capabilities) ? report.capabilities : [];
  if (platformCapabilityStatus) {
    platformCapabilityStatus.textContent = formatPlatformLabel(report?.platform || capabilities[0]?.platform);
  }
  if (platformCapabilitySummary) {
    const okCount = capabilities.filter((item) => item?.ok).length;
    const unsupportedCount = capabilities.filter((item) =>
      String(item?.errorCode || "").trim().toUpperCase() === "PLATFORM_UNSUPPORTED"
    ).length;
    const failCount = Math.max(0, capabilities.length - okCount - unsupportedCount);
    platformCapabilitySummary.textContent = capabilities.length
      ? `共 ${capabilities.length} 项能力：可用 ${okCount} 项，不支持 ${unsupportedCount} 项，异常 ${failCount} 项。`
      : "未返回平台能力。";
  }
  if (!platformCapabilityList) return;
  platformCapabilityList.textContent = "";
  if (capabilities.length === 0) {
    renderCapabilityEmpty("未返回平台能力。");
    return;
  }
  capabilities.forEach((capability) => {
    platformCapabilityList.appendChild(renderPlatformCapabilityItem(capability));
  });
}

function renderPlatformCapabilityError(message) {
  platformCapabilitiesLoaded = true;
  if (platformCapabilityStatus) {
    platformCapabilityStatus.textContent = "检测失败";
  }
  if (platformCapabilitySummary) {
    platformCapabilitySummary.textContent = message;
  }
  renderCapabilityEmpty(message, "capability-empty capability-empty-error");
}

async function loadPlatformCapabilities(options = {}) {
  if (!platformCapabilityList) return;
  if (platformCapabilitiesLoading) return;
  if (!window.appApi?.getCapabilities) {
    renderPlatformCapabilityError("当前版本未暴露平台能力接口。");
    return;
  }

  setPlatformCapabilitiesLoading(true);
  renderCapabilityEmpty("正在检测平台能力...");
  try {
    const response = await window.appApi.getCapabilities({
      refreshRuntime: Boolean(options.refreshRuntime)
    });
    if (response?.ok && response.result) {
      renderPlatformCapabilities(response.result);
      if (options.notify) {
        window.showToast("平台能力已刷新", "success");
      }
      appendLog({ level: 1, message: "平台能力诊断已刷新。" });
      return;
    }
    const message = response?.error?.message || response?.error || "平台能力检测返回异常。";
    renderPlatformCapabilityError(message);
    if (options.notify) {
      window.showToast("平台能力检测失败", "error");
    }
  } catch (error) {
    const message = error?.message || String(error);
    renderPlatformCapabilityError(message);
    if (options.notify) {
      window.showToast("平台能力检测失败", "error");
    }
  } finally {
    setPlatformCapabilitiesLoading(false);
  }
}

function ensurePlatformCapabilitiesLoaded() {
  if (!platformCapabilitiesLoaded) {
    loadPlatformCapabilities().catch(() => null);
  }
}

function buildLibreOfficeSuggestionList(report = {}) {
  const runtime = report?.runtime && typeof report.runtime === "object" ? report.runtime : {};
  const capability = getPrimaryCapability(report);
  const rawList = uniqueTextList([
    ...(Array.isArray(report?.suggestions) ? report.suggestions : []),
    ...(Array.isArray(report?.actions) ? report.actions : []),
    ...(Array.isArray(capability?.actions) ? capability.actions : [])
  ].map((item) => translateCapabilityActionText(item)));
  if (isDarwinHealthReport(report)) {
    const filtered = rawList.filter((item) => !isWindowsLibreOfficeRepairText(item));
    if (!runtime.ok) {
      return uniqueTextList([
        "安装 macOS 版 LibreOffice：可使用 Homebrew 命令 brew install --cask libreoffice，或从 LibreOffice 官网下载安装。",
        "如果 LibreOffice 安装在自定义位置，请设置 LIBREOFFICE_PATH 指向 soffice 可执行文件。",
        "安装或配置完成后点击“重新检测”。",
        ...filtered
      ]);
    }
    return filtered;
  }
  return rawList;
}

function renderLibreOfficeSuggestions(report = {}) {
  if (!libreofficeModalSuggestions) return;
  libreofficeModalSuggestions.textContent = "";
  const list = buildLibreOfficeSuggestionList(report);
  if (list.length === 0) {
    const empty = document.createElement("div");
    empty.className = "libreoffice-suggestion-item";
    empty.textContent = "建议：先点击“重新检测”；若仍失败，可使用“下载 LibreOffice”进行备用修复。";
    libreofficeModalSuggestions.appendChild(empty);
    return;
  }
  list.slice(0, 5).forEach((item) => {
    const row = document.createElement("div");
    row.className = "libreoffice-suggestion-item";
    row.textContent = String(item || "").trim() || "请检查 LibreOffice 环境";
    libreofficeModalSuggestions.appendChild(row);
  });
}

function getLibreOfficeDownloadUrl(report) {
  const actions = Array.isArray(report?.actions) ? report.actions : [];
  const suggestions = Array.isArray(report?.suggestions) ? report.suggestions : [];
  const combined = [...actions, ...suggestions].map((item) => String(item || ""));
  for (const item of combined) {
    const direct = item.trim();
    if (/^https?:\/\//i.test(direct)) {
      return direct;
    }
    const embedded = item.match(/https?:\/\/\S+/i);
    if (embedded && embedded[0]) {
      return embedded[0];
    }
  }
  return "https://www.libreoffice.org/download/download-libreoffice/";
}

function buildLibreOfficeDiagnosticText(report = {}) {
  const runtime = report?.runtime && typeof report.runtime === "object" ? report.runtime : {};
  const capability = getPrimaryCapability(report);
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const warnings = Array.isArray(report?.warnings) ? report.warnings : [];
  const suggestions = Array.isArray(report?.suggestions) ? report.suggestions : [];
  const actions = Array.isArray(report?.actions) ? report.actions : [];
  const lines = [];
  lines.push(`time=${new Date().toISOString()}`);
  lines.push(`platform=${getHealthReportPlatform(report) || "unknown"}`);
  lines.push(`errorCode=${getHealthReportErrorCode(report) || "none"}`);
  lines.push(`capability=${capability?.capability || "libreoffice"}`);
  lines.push(`score=${Number(report?.score) || 0}/100`);
  lines.push(`block=${report?.blockExport ? "true" : "false"}`);
  lines.push(`runtime.mode=${runtime.mode || "auto"}`);
  lines.push(`runtime.source=${runtime.source || "missing"}`);
  lines.push(`runtime.path=${runtime.path || "missing"}`);
  lines.push(`runtime.version=${runtime.version || "unknown"}`);
  lines.push(`runtime.checkedCandidates=${Array.isArray(runtime.checkedCandidates) ? runtime.checkedCandidates.length : 0}`);
  if (checks.length > 0) {
    lines.push("checks:");
    checks.slice(0, 6).forEach((item) => {
      const name = String(item?.name || "unknown");
      const ok = item?.ok ? "ok" : "fail";
      const detail = String(item?.detail || "").trim();
      lines.push(`- ${name}=${ok}${detail ? ` (${detail})` : ""}`);
    });
  }
  if (warnings.length > 0) {
    lines.push("warnings:");
    warnings.slice(0, 6).forEach((item) => lines.push(`- ${String(item)}`));
  }
  if (suggestions.length > 0) {
    lines.push("suggestions:");
    suggestions.slice(0, 6).forEach((item) => lines.push(`- ${String(item)}`));
  }
  if (actions.length > 0) {
    lines.push("actions:");
    actions.slice(0, 4).forEach((item) => lines.push(`- ${String(item)}`));
  }
  return lines.join("\n");
}

async function copyTextToClipboard(text) {
  const content = String(text || "").trim();
  if (!content) return false;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(content);
      return true;
    }
  } catch (error) {
    // Fallback to execCommand.
  }
  try {
    const textArea = document.createElement("textarea");
    textArea.value = content;
    textArea.setAttribute("readonly", "readonly");
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    textArea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textArea);
    return Boolean(copied);
  } catch (error) {
    return false;
  }
}

function openLibreOfficeModal(report = {}) {
  if (!libreofficeModal) return Promise.resolve("cancel");

  const scoreValue = Number(report?.score) || 0;
  const block = Boolean(report?.blockExport);
  const runtime = report?.runtime && typeof report.runtime === "object" ? report.runtime : {};
  const capability = getPrimaryCapability(report);
  const isDarwin = isDarwinHealthReport(report);
  const errorCode = getHealthReportErrorCode(report);
  const hasDllCrash = Array.isArray(report?.warnings)
    && report.warnings.some((warning) => String(warning || "").includes("exit_3221225781"));
  if (libreofficeModalMessage) {
    if (!runtime.ok) {
      if (isDarwin) {
        if (errorCode === "PLATFORM_UNSUPPORTED") {
          libreofficeModalMessage.textContent = capability?.message || "macOS 不使用 Windows 内置 LibreOffice runtime，请安装 macOS LibreOffice 或设置 LIBREOFFICE_PATH。";
        } else {
          libreofficeModalMessage.textContent = capability?.message || "未检测到 macOS LibreOffice。请安装 LibreOffice.app，或设置 LIBREOFFICE_PATH 指向 soffice 可执行文件。";
        }
      } else if (hasDllCrash) {
        libreofficeModalMessage.textContent = "系统缺少 VC++ 运行时（0xC0000135），LibreOffice 启动失败。请安装 VC++ Redistributable 后重试。";
      } else {
        libreofficeModalMessage.textContent = "未检测到可用 LibreOffice 运行时。请安装系统 LibreOffice 到默认路径 C:\\Program Files\\LibreOffice\\ ，安装完成后重启软件并点击“重新检测”。";
      }
    } else if (block) {
      if (isDarwin && runtime.source && runtime.source !== "embedded" && runtime.source !== "local_vendor") {
        libreofficeModalMessage.textContent = "已检测到 macOS LibreOffice，但环境检查仍有风险。建议查看诊断信息，处理后点击“重新检测”。";
      } else {
        libreofficeModalMessage.textContent = "当前导出被阻止：运行时已检测到，但环境检查未通过。建议先修复后重试。";
      }
    } else {
      libreofficeModalMessage.textContent = isDarwin
        ? "检测到 LibreOffice 环境风险，建议确认系统 LibreOffice 状态后再导出。"
        : "检测到 LibreOffice 环境风险，建议修复后再导出。";
    }
  }
  if (libreofficeModalScore) {
    libreofficeModalScore.textContent = `${scoreValue}/100`;
  }
  renderLibreOfficeSuggestions(report);
  latestLibreOfficeDiagnosticsText = buildLibreOfficeDiagnosticText(report);
  if (libreofficeModalDiagnostics) {
    libreofficeModalDiagnostics.textContent = latestLibreOfficeDiagnosticsText;
  }
  libreofficeModal.classList.add("show");

  const downloadUrl = getLibreOfficeDownloadUrl(report);
  return new Promise((resolve) => {
    const cleanup = () => {
      libreofficeModal.classList.remove("show");
      if (libreofficeRecheckBtn) libreofficeRecheckBtn.removeEventListener("click", onRecheck);
      if (libreofficeCancelBtn) libreofficeCancelBtn.removeEventListener("click", onCancel);
      if (libreofficeModalClose) libreofficeModalClose.removeEventListener("click", onCancel);
      if (libreofficeDownloadBtn) libreofficeDownloadBtn.removeEventListener("click", onDownload);
      if (libreofficeCopyDiagBtn) libreofficeCopyDiagBtn.removeEventListener("click", onCopyDiag);
      libreofficeModal.removeEventListener("click", onBackdropCancel);
    };
    const onRecheck = () => {
      cleanup();
      resolve("recheck");
    };
    const onCancel = () => {
      cleanup();
      resolve("cancel");
    };
    const onDownload = async () => {
      const opener = window.licenseAPI?.openExternal;
      if (typeof opener === "function") {
        const openResp = await opener(downloadUrl);
        if (openResp?.ok === false) {
          appendLog({ level: 2, message: `打开下载链接失败: ${openResp.error || "unknown"}` });
          window.showToast("无法自动打开链接，请手动复制官网地址下载", "warning");
        }
        return;
      }
      if (window.appApi?.openPath) {
        const openResp = await window.appApi.openPath(downloadUrl);
        if (openResp?.ok === false) {
          appendLog({ level: 2, message: `打开下载链接失败: ${openResp.error || "unknown"}` });
          window.showToast("无法自动打开链接，请手动复制官网地址下载", "warning");
        }
      }
    };
    const onCopyDiag = async () => {
      const ok = await copyTextToClipboard(latestLibreOfficeDiagnosticsText);
      if (ok) {
        window.showToast("诊断信息已复制", "success");
        appendLog({ level: 1, message: "LibreOffice 诊断信息已复制到剪贴板。" });
      } else {
        window.showToast("复制失败，请手动复制诊断内容", "warning");
      }
    };
    const onBackdropCancel = (event) => {
      if (event.target === libreofficeModal) {
        onCancel();
      }
    };

    if (libreofficeRecheckBtn) libreofficeRecheckBtn.addEventListener("click", onRecheck);
    if (libreofficeCancelBtn) libreofficeCancelBtn.addEventListener("click", onCancel);
    if (libreofficeModalClose) libreofficeModalClose.addEventListener("click", onCancel);
    if (libreofficeDownloadBtn) libreofficeDownloadBtn.addEventListener("click", onDownload);
    if (libreofficeCopyDiagBtn) libreofficeCopyDiagBtn.addEventListener("click", onCopyDiag);
    libreofficeModal.addEventListener("click", onBackdropCancel);
  });
}

function getOfficeAppLabel(appName) {
  if (appName === "word") return "Word";
  if (appName === "powerpoint") return "PowerPoint";
  return appName || "Office";
}

function formatOfficeAppLabelList(appNames = []) {
  const labels = (Array.isArray(appNames) ? appNames : [])
    .map((name) => getOfficeAppLabel(name))
    .filter(Boolean);
  return labels.length ? labels.join("、") : "Word/PowerPoint";
}

function translateOfficeDiagnosticMessage(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const [code, ...rest] = raw.split(":");
  const label = rest.join(":") || "Office";
  const messages = {
    office_binary_found_com_unavailable: `检测到 Microsoft ${label} 安装痕迹，但 COM 自动化不可用；请先手动打开 ${label} 完成激活/初始化，或执行 Office 快速修复。`,
    office_install_or_repair: `请安装或修复 Microsoft ${label}，并手动打开一次完成首次初始化。`,
    office_app_missing_optional: `未检测到 Microsoft ${label}，如果本批次需要该类型文件会阻止 Office 模式导出。`,
    office_registry_missing_activation_ok: `Microsoft ${label} 注册表嗅探未命中，但 COM 激活成功，可继续使用。`,
    office_process_pressure: `当前 ${label} 进程较多，可能增加 COM 转换卡顿风险。`,
    office_addins_pressure: `${label} 插件较多，可能增加导出阻塞风险。`,
    office_disable_unneeded_addins: `如 Office 模式频繁卡住，建议临时禁用不必要的 ${label} COM 插件。`,
    office_cache_missing: "未检测到 Office 用户缓存目录，可能是当前账号从未启动过 Office。",
    office_first_run_required: "建议先手动打开 Word 或 PowerPoint，完成登录、激活和隐私弹窗后再使用 Office 模式。",
    office_required_apps_empty_light_check: "未指定本批次必需应用，仅执行轻量检测。",
    office_required_apps_ok: "Microsoft Office 必需组件预检通过。"
  };
  return messages[code] || raw;
}

function renderOfficeEngineApps(report = {}, requiredApps = []) {
  if (!officeEngineApps) return;
  officeEngineApps.textContent = "";
  if (isOfficeComUnsupported(report)) {
    const row = document.createElement("div");
    row.className = "office-engine-app-row";
    const name = document.createElement("div");
    name.className = "office-engine-app-name";
    name.textContent = "Microsoft Office COM";
    const status = document.createElement("div");
    status.className = "office-engine-app-status fail";
    status.textContent = "不可用";
    const detail = document.createElement("div");
    detail.className = "office-engine-app-detail";
    detail.textContent = report?.message || getPrimaryCapability(report)?.message || "当前平台不支持 Windows Office COM 高保真导出。";
    row.appendChild(name);
    row.appendChild(status);
    row.appendChild(detail);
    officeEngineApps.appendChild(row);
    return;
  }
  const apps = report?.apps && typeof report.apps === "object" ? report.apps : {};
  const order = ["word", "powerpoint"];
  const requiredLookup = new Set(requiredApps || []);
  order.forEach((appName) => {
    const info = apps[appName] || {};
    const required = Boolean(info.required) || requiredLookup.has(appName);
    const ok = Boolean(info.ok);
    const row = document.createElement("div");
    row.className = "office-engine-app-row";

    const name = document.createElement("div");
    name.className = "office-engine-app-name";
    name.textContent = `${getOfficeAppLabel(appName)}${required ? "（本次需要）" : ""}`;

    const status = document.createElement("div");
    status.className = `office-engine-app-status ${ok ? "ok" : "fail"}`;
    status.textContent = ok ? "可用" : "不可用";

    const detail = document.createElement("div");
    detail.className = "office-engine-app-detail";
    detail.textContent = info.localServer32
      || info.defaultBinary
      || info.clsid
      || info.activationDetail
      || info.activationError
      || (ok ? "COM 可用" : "未检测到 COM 注册");

    row.appendChild(name);
    row.appendChild(status);
    row.appendChild(detail);
    officeEngineApps.appendChild(row);
  });
}

function renderOfficeSuggestions(report = {}) {
  if (!officeEngineSuggestions) return;
  officeEngineSuggestions.textContent = "";
  const suggestions = Array.isArray(report?.suggestions) ? report.suggestions : [];
  const warnings = Array.isArray(report?.warnings) ? report.warnings : [];
  const capability = getPrimaryCapability(report);
  const capabilityActions = Array.isArray(capability?.actions)
    ? capability.actions.map((item) => translateCapabilityActionText(item)).filter(Boolean)
    : [];
  const list = uniqueTextList(isOfficeComUnsupported(report)
    ? [
      report?.message || capability?.message || "当前平台不支持 Windows Office COM 高保真导出。",
      "请切回 LibreOffice 导出；macOS 第一版通过系统 LibreOffice 完成 Word / PPT 转 PDF。",
      ...capabilityActions
    ]
    : [...suggestions, ...warnings]);
  if (list.length === 0) {
    const empty = document.createElement("div");
    empty.className = "libreoffice-suggestion-item";
    empty.textContent = "建议：如首次使用 Office 模式，请先手动打开 Word/PowerPoint，完成登录、激活和隐私弹窗。";
    officeEngineSuggestions.appendChild(empty);
    return;
  }
  list.slice(0, 6).forEach((item) => {
    const row = document.createElement("div");
    row.className = "libreoffice-suggestion-item";
    row.textContent = translateOfficeDiagnosticMessage(item);
    officeEngineSuggestions.appendChild(row);
  });
}

function buildOfficeDiagnosticText(report = {}) {
  const capability = getPrimaryCapability(report);
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const warnings = Array.isArray(report?.warnings) ? report.warnings : [];
  const suggestions = Array.isArray(report?.suggestions) ? report.suggestions : [];
  const apps = report?.apps && typeof report.apps === "object" ? report.apps : {};
  const requiredApps = Array.isArray(report?.requiredApps) ? report.requiredApps : [];
  const lines = [];
  lines.push(`time=${new Date().toISOString()}`);
  lines.push(`engine=office`);
  lines.push(`platform=${getHealthReportPlatform(report) || "unknown"}`);
  lines.push(`errorCode=${getHealthReportErrorCode(report) || "none"}`);
  lines.push(`capability=${capability?.capability || "office-com"}`);
  lines.push(`score=${Number(report?.score) || 0}/100`);
  lines.push(`block=${report?.blockExport ? "true" : "false"}`);
  lines.push(`requiredApps=${requiredApps.join(",") || "none"}`);
  ["word", "powerpoint"].forEach((appName) => {
    const info = apps[appName] || {};
    lines.push(`${appName}.required=${info.required ? "true" : "false"}`);
    lines.push(`${appName}.ok=${info.ok ? "true" : "false"}`);
    lines.push(`${appName}.resolvedProgId=${info.resolvedProgId || ""}`);
    lines.push(`${appName}.progIdPath=${info.progIdPath || ""}`);
    lines.push(`${appName}.progIdView=${info.progIdView || ""}`);
    lines.push(`${appName}.clsid=${info.clsid || ""}`);
    lines.push(`${appName}.server=${info.localServer32 || ""}`);
    lines.push(`${appName}.serverView=${info.localServerView || ""}`);
    lines.push(`${appName}.defaultBinary=${info.defaultBinary || ""}`);
    if (Array.isArray(info.binaryCandidates) && info.binaryCandidates.length > 0) {
      lines.push(`${appName}.binaryCandidates=${info.binaryCandidates.slice(0, 5).join(" | ")}`);
    }
    lines.push(`${appName}.activationOk=${info.activationOk ? "true" : "false"}`);
    lines.push(`${appName}.activationError=${info.activationError || ""}`);
    lines.push(`${appName}.activationErrorCode=${info.activationErrorCode || ""}`);
  });
  if (checks.length > 0) {
    lines.push("checks:");
    checks.slice(0, 8).forEach((item) => {
      const name = String(item?.name || "unknown");
      const ok = item?.ok ? "ok" : "fail";
      const detail = String(item?.detail || "").trim();
      lines.push(`- ${name}=${ok}${detail ? ` (${detail})` : ""}`);
    });
  }
  if (warnings.length > 0) {
    lines.push("warnings:");
    warnings.slice(0, 6).forEach((item) => lines.push(`- ${translateOfficeDiagnosticMessage(item)}`));
  }
  if (suggestions.length > 0) {
    lines.push("suggestions:");
    suggestions.slice(0, 6).forEach((item) => lines.push(`- ${translateOfficeDiagnosticMessage(item)}`));
  }
  return lines.join("\n");
}

async function checkOfficeEngineForModal(requiredApps = computeRequiredOfficeApps(selectionState.lastScanItems)) {
  if (!window.appApi?.exportHealthCheck) {
    return {
      engine: EXPORT_ENGINE_OFFICE,
      blockExport: false,
      score: 0,
      requiredApps,
      apps: {},
      warnings: ["当前版本未暴露 Office 检测接口，开始导出时会由主进程兜底。"],
      suggestions: [],
      checks: []
    };
  }
  try {
    const resp = await window.appApi.exportHealthCheck({
      engine: EXPORT_ENGINE_OFFICE,
      requiredApps,
      timeoutMs: 20000,
      light: true
    });
    if (resp?.ok && resp.result) {
      return resp.result;
    }
    return {
      engine: EXPORT_ENGINE_OFFICE,
      blockExport: requiredApps.length > 0,
      score: 0,
      requiredApps,
      apps: {},
      warnings: [resp?.error?.message || resp?.error || "Office 检测返回异常"],
      suggestions: ["请确认本机已安装 Microsoft Office，并手动打开一次 Word/PowerPoint。"],
      checks: []
    };
  } catch (error) {
    return {
      engine: EXPORT_ENGINE_OFFICE,
      blockExport: requiredApps.length > 0,
      score: 0,
      requiredApps,
      apps: {},
      warnings: [error?.message || String(error)],
      suggestions: ["请确认本机已安装 Microsoft Office，并手动打开一次 Word/PowerPoint。"],
      checks: []
    };
  }
}

function openOfficeEngineModal(report = {}, context = {}) {
  if (!officeEngineModal) return Promise.resolve("cancel");
  const strict = Boolean(context.strict);
  const requiredApps = Array.isArray(context.requiredApps)
    ? context.requiredApps
    : (Array.isArray(report?.requiredApps) ? report.requiredApps : []);
  const block = Boolean(report?.blockExport);
  const unsupported = isOfficeComUnsupported(report);
  const disableContinue = (strict && block) || unsupported;
  if (officeEngineModalMessage) {
    if (unsupported && isDarwinHealthReport(report)) {
      officeEngineModalMessage.textContent = "macOS 版本暂不支持 Windows Office COM 高保真导出。请切回 LibreOffice，使用系统 LibreOffice 完成 Word / PPT 转 PDF。";
    } else if (unsupported) {
      officeEngineModalMessage.textContent = report?.message || "当前平台不支持 Office 高保真导出，请切回 LibreOffice。";
    } else if (strict && block) {
      officeEngineModalMessage.textContent = `Office 高保真导出预检未通过。本批次需要的 ${formatOfficeAppLabelList(requiredApps)} 不可用，请安装或修复 Microsoft Office，或切回 LibreOffice 后重试。`;
    } else {
      officeEngineModalMessage.textContent = "该模式会调用本机 Microsoft Office 转 PDF，排版更接近 Office 打开效果；导出可能更慢，并可能受激活、登录弹窗、受保护视图或插件影响。";
    }
  }
  renderOfficeEngineApps(report, requiredApps);
  renderOfficeSuggestions(report);
  latestOfficeDiagnosticsText = buildOfficeDiagnosticText({
    ...report,
    requiredApps
  });
  if (officeEngineDiagnostics) {
    officeEngineDiagnostics.textContent = latestOfficeDiagnosticsText;
  }
  if (officeEngineContinueBtn) {
    officeEngineContinueBtn.disabled = disableContinue;
    officeEngineContinueBtn.textContent = disableContinue ? "Office 不可用" : "继续使用 Office";
  }
  officeEngineModal.classList.add("show");

  return new Promise((resolve) => {
    const cleanup = () => {
      officeEngineModal.classList.remove("show");
      if (officeEngineRecheckBtn) officeEngineRecheckBtn.removeEventListener("click", onRecheck);
      if (officeEngineBackBtn) officeEngineBackBtn.removeEventListener("click", onBack);
      if (officeEngineContinueBtn) officeEngineContinueBtn.removeEventListener("click", onContinue);
      if (officeEngineCopyDiagBtn) officeEngineCopyDiagBtn.removeEventListener("click", onCopyDiag);
      if (officeEngineModalClose) officeEngineModalClose.removeEventListener("click", onClose);
      officeEngineModal.removeEventListener("click", onBackdropClose);
    };
    const onRecheck = () => {
      cleanup();
      resolve("recheck");
    };
    const onBack = () => {
      cleanup();
      resolve("libreoffice");
    };
    const onContinue = () => {
      if (disableContinue) return;
      cleanup();
      resolve("continue");
    };
    const onCopyDiag = async () => {
      const ok = await copyTextToClipboard(latestOfficeDiagnosticsText);
      if (ok) {
        window.showToast("Office 诊断信息已复制", "success");
        appendLog({ level: 1, message: "Office 诊断信息已复制到剪贴板。" });
      } else {
        window.showToast("复制失败，请手动复制诊断内容", "warning");
      }
    };
    const onClose = () => {
      cleanup();
      resolve(strict ? "cancel" : "libreoffice");
    };
    const onBackdropClose = (event) => {
      if (event.target === officeEngineModal) {
        onClose();
      }
    };

    if (officeEngineRecheckBtn) officeEngineRecheckBtn.addEventListener("click", onRecheck);
    if (officeEngineBackBtn) officeEngineBackBtn.addEventListener("click", onBack);
    if (officeEngineContinueBtn) officeEngineContinueBtn.addEventListener("click", onContinue);
    if (officeEngineCopyDiagBtn) officeEngineCopyDiagBtn.addEventListener("click", onCopyDiag);
    if (officeEngineModalClose) officeEngineModalClose.addEventListener("click", onClose);
    officeEngineModal.addEventListener("click", onBackdropClose);
  });
}

async function ensureExportEngineReadyBeforeConvert(engine, items = []) {
  const normalizedEngine = normalizeExportEngine(engine);
  const requiredApps = computeRequiredOfficeApps(items);
  if (requiredApps.length === 0) {
    appendLog({ level: 1, message: "导出预检：本批次仅包含 PDF，跳过 LibreOffice / Office 环境预检。" });
    return true;
  }

  if (normalizedEngine === EXPORT_ENGINE_OFFICE) {
    while (true) {
      const report = await checkOfficeEngineForModal(requiredApps);
      appendLog({
        level: report.blockExport ? 2 : 1,
        message: `Office预检：score=${report.score || 0}/100 block=${report.blockExport ? "true" : "false"} required=${requiredApps.join(",")} platform=${getHealthReportPlatform(report) || "unknown"} errorCode=${getHealthReportErrorCode(report) || "none"}`
      });
      if (!report.blockExport) return true;
      const action = await openOfficeEngineModal(report, { strict: true, requiredApps });
      if (action === "recheck") continue;
      if (action === "libreoffice") {
        setSelectedExportEngine(EXPORT_ENGINE_LIBREOFFICE);
        return ensureExportEngineReadyBeforeConvert(EXPORT_ENGINE_LIBREOFFICE, items);
      }
      return false;
    }
  }

  if (!window.appApi?.exportHealthCheck && !window.appApi?.officeHealthCheck) {
    return true;
  }
  while (true) {
    let checkResp = null;
    try {
      const checker = window.appApi.exportHealthCheck || window.appApi.officeHealthCheck;
      checkResp = await checker({
        engine: EXPORT_ENGINE_LIBREOFFICE,
        timeoutMs: 20000,
        refreshRuntime: true
      });
    } catch (error) {
      appendLog({ level: 2, message: `LibreOffice 预检调用失败: ${error?.message || error}` });
      return true;
    }
    if (!checkResp?.ok || !checkResp?.result) {
      appendLog({ level: 2, message: "LibreOffice 预检返回异常，继续执行导出并由主进程兜底。" });
      return true;
    }
    const report = checkResp.result;
    const runtime = report?.runtime || {};
    appendLog({
      level: report.blockExport ? 2 : 1,
      message: `LibreOffice预检：score=${report.score || 0}/100 block=${report.blockExport ? "true" : "false"} source=${runtime.source || "missing"}`
    });
    if (!report.blockExport) {
      return true;
    }
    const action = await openLibreOfficeModal(report);
    if (action === "cancel") {
      return false;
    }
  }
}

async function handleConvert() {
  if (window.licenseManager) {
    const allowed = await window.licenseManager.checkAccess("export");
    if (!allowed) return;
  }
  if (!window.appApi) return;

  // 前置条件检查
  if (!selectionState.outputFolder) {
    showToast('请先选择输出目录', 'error');
    selectOutputBtn.classList.add('btn-highlight-error');
    setTimeout(() => selectOutputBtn.classList.remove('btn-highlight-error'), 2000);
    appendLog({ level: 4, message: "请先选择输出目录。" });
    return;
  }

  if (selectionState.lastScanItems.length === 0) {
    showToast('未扫描到可导出的文件,请检查选择', 'error');
    appendLog({ level: 4, message: "未扫描到可导出的文件，请检查选择。" });
    return;
  }

  convertErrors = [];
  resetConvertProgressTracker(selectionState.lastScanItems.length);
  if (convertProgress) {
    convertProgress.textContent = `0/${selectionState.lastScanItems.length}`;
  }
  if (convertStatus) {
    convertStatus.classList.remove("is-hidden");
    convertStatus.textContent = "PDF 渲染";
  }

  const pageLimitText = pageLimitInput?.value?.trim();
  let pageLimit = null;
  if (pageLimitText) {
    const parsedLimit = Number(pageLimitText);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
      showToast('导出页数必须是大于0的整数', 'error');
      appendLog({ level: 4, message: "导出页数必须是大于0的整数。" });
      return;
    }
    pageLimit = parsedLimit;
  }

  const useSubfolder = useSubfolderCheckbox?.checked ?? false;
  let exportEngine = getSelectedExportEngine();

  const exportEngineReady = await ensureExportEngineReadyBeforeConvert(exportEngine, selectionState.lastScanItems);
  if (!exportEngineReady) {
    if (convertStatus) {
      convertStatus.textContent = "已取消";
    }
    appendLog({ level: 2, message: `导出已取消：${exportEngine === EXPORT_ENGINE_OFFICE ? "Office" : "LibreOffice"} 预检未通过。` });
    return;
  }
  exportEngine = getSelectedExportEngine();

  // 初始化进度条
  updateConvertProgress(0, selectionState.lastScanItems.length, '开始导出...');

  const payload = {
    items: selectionState.lastScanItems,
    outputRoot: selectionState.outputFolder,
    exportEngine,
    scale: parseFloat(scaleSelect.value || "1"),
    pageLimit,
    useSubfolder
  };

  const result = await window.appApi.convertDocuments(payload);

  if (!result) {
    if (convertStatus) {
      convertStatus.textContent = "失败";
    }
    if (convertProgressBar) convertProgressBar.classList.add('error');
    showToast('导出失败', 'error');
    return;
  }

  if (result.cancelled) {
    if (convertStatus) {
      convertStatus.textContent = "已取消";
    }
    const total = convertProgressTracker.total || selectionState.lastScanItems.length;
    const completed = Math.min(convertProgressTracker.completed, total);
    if (convertProgress) {
      convertProgress.textContent = `${completed}/${total}`;
    }
    updateConvertProgress(completed, total, '已取消');
    showToast('导出已取消', 'warning');
    appendLog({ level: 3, message: "导出已取消。" });
    hideConvertProgress();
    return;
  }

  if (result.ok && (result.convertedFiles || 0) === 0 && (result.skippedFiles || 0) > 0) {
    if (convertStatus) {
      convertStatus.textContent = "完成";
    }
    if (convertProgressBar) convertProgressBar.classList.add('complete');
    const skippedItems = Array.isArray(result.skippedItems) ? result.skippedItems : [];
    const pageLimitSkipped = skippedItems.filter((item) => Number(item?.requiredPages) > 0).length;
    const lockSkipped = skippedItems.filter((item) => item?.reason === "office_temp_lock").length;
    if (pageLimitSkipped > 0) {
      const requiredPages = skippedItems.find((item) => Number(item?.requiredPages) > 0)?.requiredPages
        || pageLimitInput?.value?.trim()
        || '';
      showToast(
        `所有文件被跳过，未生成任何图片（页数不足 ${pageLimitSkipped}，设定前 ${requiredPages} 页）`,
        'warning',
        7000
      );
    } else if (lockSkipped > 0) {
      showToast(
        `所有文件被跳过：检测到 Office 临时锁文件（${lockSkipped} 个）`,
        'warning',
        7000
      );
    } else {
      showToast(
        `所有文件被跳过，未生成任何图片`,
        'warning',
        7000
      );
    }
  } else if (!result.ok) {
    if (convertStatus) {
      convertStatus.textContent = `完成但有错误：文件 ${result.convertedFiles || 0} 个，页数 ${result.convertedPages || 0}，错误 ${result.errors?.length || 0} 个`;
    }
    if (convertProgressBar) convertProgressBar.classList.add('error');
    const skippedSuffix = buildSkippedSuffix(result);
    const firstError = Array.isArray(result.errors) && result.errors.length > 0 ? result.errors[0] : null;
    const firstErrorSuffix = firstError?.message ? `；首个错误: ${firstError.message}` : '';
    showToast(
      `导出失败，有 ${result.errors?.length || 0} 个错误${skippedSuffix}${firstErrorSuffix}`,
      'error',
      skippedSuffix ? 7000 : 5000
    );
    appendLog({ level: 4, message: firstError?.message || result.error || "导出出现错误。" });
  } else {
    if (convertProgressBar) convertProgressBar.classList.add('complete');
    if (convertStatus) {
      convertStatus.textContent = `导出完成：文件 ${result.convertedFiles || 0} 个，页数 ${result.convertedPages || 0}`;
    }
    const outputFolder = selectionState.outputFolder;
    const useSubfolderMode = useSubfolderCheckbox?.checked ?? false;
    const subfolders = Array.isArray(result.outputFolders) ? result.outputFolders : [];
    const openTarget = useSubfolderMode && subfolders.length === 1
      ? subfolders[0]
      : outputFolder;
    const skippedSuffix = buildSkippedSuffix(result);
    showToast(`导出成功! 共处理 ${result.convertedFiles || 0} 个文件，生成 ${result.convertedPages || 0} 张图片${skippedSuffix}`, 'success', skippedSuffix ? 7000 : 5000, {
      actionText: '打开文件夹',
      actionCallback: () => {
        if (window.appApi?.openPath && openTarget) {
          window.appApi.openPath(openTarget);
        }
      }
    });
  }

  if (Array.isArray(result.errors)) {
    convertErrors = result.errors;
  }
  if (result?.diagnostics?.exportEngine) {
    const engineDiag = result.diagnostics.exportEngine;
    appendLog({
      level: 1,
      message: `导出引擎：requested=${engineDiag.requested || "libreoffice"} effective=${engineDiag.effective || engineDiag.requested || "libreoffice"} requiredApps=${Array.isArray(engineDiag.requiredApps) && engineDiag.requiredApps.length ? engineDiag.requiredApps.join(",") : "none"} precheckSkipped=${engineDiag.precheckSkipped ? "true" : "false"}${engineDiag.officeSerial ? " officeSerial=true" : ""}`
    });
  }
  if (result?.diagnostics?.office) {
    const office = result.diagnostics.office;
    appendLog({
      level: office.blockExport ? 3 : 1,
      message: `Office预检：score=${office.score || 0}/100 block=${office.blockExport ? "true" : "false"} required=${Array.isArray(office.requiredApps) && office.requiredApps.length ? office.requiredApps.join(",") : "none"} platform=${getHealthReportPlatform(office) || "unknown"} errorCode=${getHealthReportErrorCode(office) || "none"}`
    });
  }
  if (result?.diagnostics?.ppt) {
    const ppt = result.diagnostics.ppt;
    const openModeStats = ppt.openModeStats || {};
    const errorCodeStats = ppt.errorCodeStats || {};
    const topOpenMode = Object.entries(openModeStats).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
    const topErrorCode = Object.entries(errorCodeStats).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
    const durationAvgMs = Number(ppt?.duration?.avgMs) || 0;
    const durationMaxMs = Number(ppt?.duration?.maxMs) || 0;
    const cacheMode = String(ppt.cacheMode || "off");
    const queue = ppt.queue || {};
    const queueSummary = `队列 small=${Number(queue.small) || 0} large=${Number(queue.large) || 0}（fail ${Number(queue.smallFailed) || 0}/${Number(queue.largeFailed) || 0}）`;
    const speedMode = String(ppt.speedMode || "safe");
    const speedForcedSafe = Boolean(ppt.speedForcedSafe);
    const speedRollbackReason = String(ppt.speedRollbackReason || "");
    appendLog({
      level: 1,
      message: `PPT诊断：总计 ${ppt.total || 0}，修复 ${ppt.repaired || 0}，重试 ${ppt.retried || 0}，降级级别 ${ppt.degradeLevel || 0}，并发 ${ppt.currentConcurrency || ppt.officeConcurrency || 1}，平均耗时 ${durationAvgMs}ms，最大耗时 ${durationMaxMs}ms，主Open模式 ${topOpenMode ? `${topOpenMode[0]}(${topOpenMode[1]})` : "unknown"}，主错误码 ${topErrorCode ? `${topErrorCode[0]}(${topErrorCode[1]})` : "none"}，缓存模式 ${cacheMode}，${queueSummary}，速度模式 ${speedMode}${speedForcedSafe ? `（已回退: ${speedRollbackReason || "unknown"}）` : ""}`
    });
    if (Array.isArray(ppt.degradeTransitions) && ppt.degradeTransitions.length > 0) {
      const transitionSummary = ppt.degradeTransitions
        .map((item) => `${item.from}->${item.to}:${item.reason}`)
        .join(" | ");
      appendLog({ level: 2, message: `PPT降级轨迹：${transitionSummary}` });
    }
  }
  if (result?.diagnostics?.precheck) {
    const precheck = result.diagnostics.precheck;
    const finalReport = precheck.after || precheck.before || null;
    if (finalReport) {
      const runtime = finalReport.runtime || {};
      const precheckEngine = precheck.engine === EXPORT_ENGINE_OFFICE ? "Office" : "LibreOffice";
      appendLog({
        level: finalReport.blockExport ? 3 : 1,
        message: `${precheckEngine}预检：mode=${precheck.mode || "unknown"} score=${finalReport.score || 0}/100 block=${finalReport.blockExport ? "true" : "false"} platform=${getHealthReportPlatform(finalReport) || "unknown"} errorCode=${getHealthReportErrorCode(finalReport) || "none"}${precheck.engine === EXPORT_ENGINE_OFFICE ? "" : ` source=${runtime.source || "missing"}`}`
      });
    }
  }
  if (result?.diagnostics?.loRuntime && result.diagnostics.loRuntime.source !== "skipped") {
    const runtime = result.diagnostics.loRuntime;
    appendLog({
      level: runtime.ok ? 1 : 2,
      message: `运行时诊断：mode=${runtime.mode || "auto"} source=${runtime.source || "missing"} version=${runtime.version || "unknown"}`
    });
  }

  appendLog({
    level: 1,
    message: `导出完成：文件 ${result.convertedFiles || 0} 个，页数 ${result.convertedPages || 0}`
      + ((result.skippedFiles || 0) > 0 ? `，跳过 ${result.skippedFiles} 个（页数不足）` : '')
  });

  hideConvertProgress();
}

async function handleCancelConvert() {
  if (!window.appApi) return;
  const result = await window.appApi.cancelConvert();
  if (result?.ok) {
    appendLog({ level: 3, message: "已发送取消请求。" });
  }
}

async function handleUpload() {
  if (uploadState.uploading) {
    showToast('正在上传，请勿重复点击', 'warning');
    return;
  }
  if (window.licenseManager) {
    const allowed = await window.licenseManager.checkAccess("upload");
    if (!allowed) return;
  }
  if (!window.appApi) return;

  // 表单验证
  const tokenValid = validateField(feishuToken, feishuTokenError, { required: true });
  const linkValid = validateField(feishuLink, feishuLinkError, {
    required: true,
    pattern: /^https:\/\/.+/,
    patternMessage: '请输入有效的URL'
  });
  const fieldValid = validateField(feishuField, feishuFieldError, { required: true });

  if (!tokenValid || !linkValid || !fieldValid) {
    showToast('请填写完整的配置信息', 'error');
    return;
  }

  const start = Number(startRow?.value);
  if (!Number.isInteger(start) || start <= 0) {
    showToast('行范围不合法', 'error');
    appendLog({ level: 4, message: "行范围不合法。" });
    return;
  }

  uploadErrors = [];
  let totalImages = 0;
  let payload = null;

  if (uploadState.mode === UPLOAD_MODE_NOTE) {
    const batch = getNoteBatch();
    const groups = getActiveNoteGroups();
    if (batch.entryFolders.length === 0) {
      showToast('请先选择父文件夹或添加子文件夹', 'error');
      appendLog({ level: 4, message: "未配置任何笔记入口文件夹。" });
      return;
    }
    if (batch.scanning) {
      showToast('正在扫描笔记文件夹，请稍后', 'warning');
      return;
    }
    if (groups.length === 0) {
      showToast('未扫描到可上传笔记', 'error');
      appendLog({ level: 4, message: "未扫描到可上传笔记。" });
      return;
    }
    totalImages = getNoteImageTotal(groups);
    if (totalImages <= 0) {
      showToast('未扫描到可上传图片', 'error');
      appendLog({ level: 4, message: "未扫描到可上传图片。" });
      return;
    }
    payload = {
      uploadMode: UPLOAD_MODE_NOTE,
      token: feishuToken?.value?.trim(),
      link: feishuLink?.value?.trim(),
      fieldName: feishuField?.value?.trim(),
      startRow: start,
      noteGroups: groups.map((group) => ({
        name: group.name,
        displayName: group.displayName || group.name,
        folderPath: group.folderPath,
        sourceEntryFolder: group.sourceEntryFolder,
        images: (group.images || []).map((image) => ({
          name: image.name,
          path: image.path
        }))
      }))
    };
  } else {
    const end = Number(endRow?.value);
    if (!Number.isInteger(end) || end < start) {
      showToast('行范围不合法', 'error');
      appendLog({ level: 4, message: "行范围不合法。" });
      return;
    }

    if (uploadState.folders.length === 0) {
      showToast('请至少添加一个图片文件夹', 'error');
      appendLog({ level: 4, message: "未配置任何图片文件夹。" });
      if (addFolderConfigBtn) {
        addFolderConfigBtn.classList.add('btn-highlight-error');
        setTimeout(() => addFolderConfigBtn.classList.remove('btn-highlight-error'), 2000);
      }
      return;
    }

    const emptyFolder = uploadState.folders.find((folder) => !folder.path);
    if (emptyFolder) {
      showToast('存在未选择路径的文件夹配置', 'error');
      appendLog({ level: 4, message: "存在未选择路径的文件夹配置。" });
      return;
    }

    const rowCount = end - start + 1;
    totalImages = rowCount * uploadState.folders.reduce((sum, folder) => {
      const count = normalizeUploadCount(folder.count);
      return sum + count;
    }, 0);
    payload = {
      uploadMode: UPLOAD_MODE_MODULE,
      token: feishuToken?.value?.trim(),
      link: feishuLink?.value?.trim(),
      fieldName: feishuField?.value?.trim(),
      startRow: start,
      endRow: end,
      folders: uploadState.folders.map((folder) => ({
        path: folder.path,
        mode: folder.mode === "random" ? "random" : "sequential",
        count: normalizeUploadCount(folder.count)
      }))
    };
  }

  uploadState.uploading = true;
  renderUploadMode();
  if (uploadProgress) {
    uploadProgress.textContent = `0/${totalImages}`;
  }
  uploadStatus.textContent = "上传中...";

  // 初始化进度条
  updateUploadProgress(0, totalImages, '开始上传...');

  try {
    let result;
    try {
      result = await window.appApi.uploadImages(payload);
    } catch (error) {
      result = { ok: false, error: error?.message || String(error || "上传调用失败") };
    }

    if (!result || !result.ok) {
      if (result?.cancelled) {
        uploadStatus.textContent = "已取消";
        updateUploadProgress(0, totalImages, '已取消');
        showToast('上传已取消', 'warning');
        appendLog({ level: 3, message: "上传已取消。" });
        hideUploadProgress();
        return;
      }

      uploadStatus.textContent = "失败";
      if (uploadProgressBar) uploadProgressBar.classList.add('error');

      // 使用错误翻译
      const errorInfo = getFeishuErrorInfo(result?.error);
      const friendlyMessage = translateFeishuError(result?.error);
      const rawMessage = errorInfo.message;
      const messageToShow = (friendlyMessage === FEISHU_ERROR_MESSAGES.default && rawMessage)
        ? rawMessage
        : friendlyMessage;
      const errorSuffix = errorInfo.code ? ` (错误码: ${errorInfo.code})` : '';

      uploadErrors = [{ message: messageToShow }];
      showToast(messageToShow, 'error', 5000);
      appendLog({ level: 4, message: `上传失败: ${messageToShow}` });
      if (rawMessage && rawMessage !== messageToShow) {
        appendLog({ level: 4, message: `上传失败详情: ${rawMessage}${errorSuffix}` });
      }
      hideUploadProgress();
      return;
    }

    const uploadedCount = Number(result.uploaded) || 0;
    const failedCount = Number(result.failed) || 0;
    const finishedCount = Math.min(totalImages, uploadedCount + failedCount);
    if (uploadProgress) {
      uploadProgress.textContent = `${finishedCount}/${totalImages}`;
    }
    uploadStatus.textContent = failedCount > 0
      ? `已上传 ${uploadedCount}，失败 ${failedCount}`
      : `已上传 ${uploadedCount}`;
    updateUploadProgress(finishedCount, totalImages, failedCount > 0 ? '上传完成，存在失败' : '上传完成');
    if (uploadProgressBar) {
      uploadProgressBar.classList.add(failedCount > 0 && uploadedCount === 0 ? 'error' : 'complete');
    }
    const modeLabel = uploadState.mode === UPLOAD_MODE_NOTE ? "按笔记上传" : "上传";
    if (failedCount > 0) {
      showToast(`${modeLabel}完成，成功 ${uploadedCount} 张，失败 ${failedCount} 张`, 'warning', 7000);
      appendLog({ level: 3, message: `${modeLabel}完成：成功 ${uploadedCount} 张，失败 ${failedCount} 张` });
    } else {
      showToast(`${modeLabel}成功! 共上传 ${uploadedCount} 张图片`, 'success', 5000);
      appendLog({ level: 1, message: `${modeLabel}成功：${uploadedCount} 张` });
    }
    hideUploadProgress();
  } finally {
    uploadState.uploading = false;
    renderUploadMode();
  }
}

async function handleCancelUpload() {
  if (!window.appApi) return;
  const result = await window.appApi.cancelUpload();
  if (result?.ok) {
    appendLog({ level: 3, message: "已发送取消请求。" });
  }
}

async function handleExportErrors() {
  // 导出所有运行日志
  await exportAllLogs();
}

selectFilesBtn.addEventListener("click", handleSelectFiles);
selectFolderBtn.addEventListener("click", handleSelectFolder);
selectOutputBtn.addEventListener("click", handleSelectOutput);
convertBtn.addEventListener("click", handleConvert);
if (cancelConvertBtn) {
  cancelConvertBtn.addEventListener("click", handleCancelConvert);
}
if (addFolderConfigBtn) {
  addFolderConfigBtn.addEventListener("click", addFolderConfig);
}
if (uploadModeModuleTab) {
  uploadModeModuleTab.addEventListener("click", () => setUploadMode(UPLOAD_MODE_MODULE));
}
if (uploadModeNoteTab) {
  uploadModeNoteTab.addEventListener("click", () => setUploadMode(UPLOAD_MODE_NOTE));
}
if (selectNoteParentBtn) {
  selectNoteParentBtn.addEventListener("click", handleSelectNoteParentFolder);
}
if (addNoteEntryBtn) {
  addNoteEntryBtn.addEventListener("click", handleAddNoteEntryFolders);
}
if (rescanNoteBtn) {
  rescanNoteBtn.addEventListener("click", scanNoteFolders);
}
if (startRow) {
  startRow.addEventListener("input", () => {
    recalculateNoteRows();
    renderNoteBatch();
  });
}
if (uploadBtn) {
  uploadBtn.addEventListener("click", handleUpload);
}
if (cancelUploadBtn) {
  cancelUploadBtn.addEventListener("click", handleCancelUpload);
}
if (exportErrorsBtn) {
  exportErrorsBtn.addEventListener("click", handleExportErrors);
}
if (toggleFeishuToken) {
  toggleFeishuToken.addEventListener("click", () => {
    const shouldShow = feishuToken?.type === "password";
    setTokenVisibility(shouldShow);
  });
}
if (xhsSelectOutputBtn) {
  xhsSelectOutputBtn.addEventListener("click", handleXhsSelectOutput);
}
if (xhsStartBtn) {
  xhsStartBtn.addEventListener("click", handleXhsStart);
}
if (xhsStopBtn) {
  xhsStopBtn.addEventListener("click", handleXhsStop);
}
if (platformCapabilityRefreshBtn) {
  platformCapabilityRefreshBtn.addEventListener("click", () => {
    loadPlatformCapabilities({ refreshRuntime: true, notify: true }).catch(() => null);
  });
}

// Tab切换逻辑
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    // 重置动画状态
    tabContents.forEach((content) => {
      content.classList.remove("fade-up");
    });

    const tabName = btn.dataset.tab || "export";
    setActiveTab(tabName);
    const content = document.querySelector(`.tab-content[data-tab="${tabName}"]`);
    if (content) {
      // Force reflow to restart animation.
      void content.offsetWidth;
      content.classList.add("fade-up");
    }
  });
});
clearSelectionBtn.addEventListener("click", () => {
  selectionState.files = [];
  selectionState.folders = [];
  selectionState.outputFolder = "";
  uploadState.folders = [];
  uploadState.nextFolderId = 1;
  uploadState.uploading = false;
  uploadState.mode = UPLOAD_MODE_MODULE;
  uploadState.noteBatch = {
    entryFolders: [],
    groups: [],
    skippedGroups: [],
    dedupedCount: 0,
    rootImageCount: 0,
    ignoredParentImageCount: 0,
    lastScannedAt: 0,
    scanning: false,
    nextEntryId: 1,
    scanRequestId: 0
  };
  convertErrors = [];
  uploadErrors = [];
  resetConvertProgressTracker(0);
  updateSelectionUI();
  renderUploadMode();
  clearResults();
  if (convertStatus) {
    convertStatus.textContent = "待命";
    convertStatus.classList.add("is-hidden");
  }
  if (convertProgress) convertProgress.textContent = "0/0";
  if (uploadStatus) {
    uploadStatus.textContent = "待命";
  }
  if (uploadProgress) uploadProgress.textContent = "0/0";
});

updateSelectionUI();
renderUploadMode();
// syncUploadCount(); // 已移除自动同步功能
bindFeishuStorage();
bindExportStorage();
setTokenVisibility(false);
renderXhsTaskList();
setXhsStatus("待命");
if (xhsStopBtn) xhsStopBtn.disabled = true;

async function initializePersistentUiState() {
  await loadSettingsFromMain();
  const initialTab = readStorage(storageKeys.activeTab) || "export";
  setActiveTab(initialTab);
  restoreFeishuInputs();
  restoreExportSettings();
  restoreXhsOutputFolder();
  updateXhsOutputUI();
}

initializePersistentUiState().catch(() => {
  setActiveTab("export");
  restoreFeishuInputs();
  restoreExportSettings();
  restoreXhsOutputFolder();
  updateXhsOutputUI();
});

// 日志筛选功能
if (logLevelFilter) {
  logLevelFilter.addEventListener('change', () => {
    const filterLevel = logLevelFilter.value;
    document.querySelectorAll('.log-line').forEach(line => {
      if (filterLevel === 'all') {
        line.style.display = 'flex';
      } else {
        line.style.display = line.dataset.level === filterLevel ? 'flex' : 'none';
      }
    });
  });
}

if (window.appApi && typeof window.appApi.onConvertProgress === "function") {
  window.appApi.onConvertProgress((data) => {
    if (!data) return;
    if (convertStatus) {
      convertStatus.classList.remove("is-hidden");
    }
    if (data.status && convertStatus) {
      convertStatus.textContent = data.status;
    }
    if (data.phase === "start") {
      resetConvertProgressTracker(data.totalFiles || 0);
      updateConvertProgressByCompleted(data, "开始导出...");
      return;
    }
    if (data.phase === "file-start") {
      updateConvertProgressByCompleted(data, `${data.fileName}`);
    }
    if (data.phase === "page") {
      const total = data.totalPages || "?";
      updateConvertProgressByCompleted(data, `${data.fileName} - 第 ${data.pageNumber}/${total} 页`);
    }
    if (data.phase === "file-done") {
      updateConvertProgressByCompleted(data, `完成: ${data.fileName}`);
    }
    if (data.phase === "file-error" && data.fileName) {
      const codeSuffix = data.errorCode ? ` (${data.errorCode})` : "";
      convertErrors.push({
        file: data.fileName,
        message: `${data.error || data.message || "导出失败"}${codeSuffix}`,
        errorCode: data.errorCode || ""
      });
      updateConvertProgressByCompleted(data, `失败: ${data.fileName}`);
    }
    if (data.phase === "file-skipped" && data.fileName) {
      const reasonLabel = data.reason === "office_temp_lock"
        ? "Office临时锁文件"
        : "页数不足";
      updateConvertProgressByCompleted(data, `跳过(${reasonLabel}): ${data.fileName}`);
    }
    if (data.phase === "done") {
      const total = Number(data.totalFiles) || 0;
      if (total > 0) {
        convertProgressTracker.total = total;
        convertProgressTracker.completed = total;
      }
      updateConvertProgressByCompleted(data, "导出完成!");
      if (convertProgressBar) convertProgressBar.classList.add('complete');
    }
    if (data.phase === "cancelled") {
      updateConvertProgressByCompleted(data, "已取消");
    }
  });
}

if (window.appApi && typeof window.appApi.onUploadProgress === "function") {
  window.appApi.onUploadProgress((data) => {
    if (!data) return;
    if (data.phase === "start" && uploadProgress) {
      uploadProgress.textContent = `0/${data.total || 0}`;
      updateUploadProgress(0, data.total || 0, '开始上传...');
      return;
    }
    if (data.phase === "file-start") {
      if (uploadProgress) uploadProgress.textContent = `${data.currentIndex}/${data.total}`;
      const prefix = data.noteName ? `${data.noteName} / ` : "";
      const suffix = data.rowNumber ? `（第 ${data.rowNumber} 行）` : "";
      updateUploadProgress(data.currentIndex, data.total, `${prefix}${data.fileName}${suffix}`);
    }
    if (data.phase === "file-error" && data.fileName) {
      uploadErrors.push({ file: data.fileName, message: data.error });
    }
    if (data.phase === "done" && uploadProgress) {
      uploadProgress.textContent = `${data.total}/${data.total}`;
      updateUploadProgress(data.total, data.total, '上传完成!');
      if (uploadProgressBar) uploadProgressBar.classList.add('complete');
    }
    if (data.phase === "cancelled") {
      updateUploadProgress(0, 0, '已取消');
    }
  });
}

if (window.appApi && typeof window.appApi.onXhsProgress === "function") {
  window.appApi.onXhsProgress((data) => {
    if (!data) return;
    const task = xhsState.tasks.find((item) => item.id === data.taskId);
    if (!task) return;
    if (data.phase === "start") {
      task.total = data.total || task.total;
      task.current = 0;
      task.success = 0;
      task.failed = 0;
      task.skipped = 0;
    }
    if (data.phase === "progress") {
      task.current = data.current || task.current;
      task.total = data.total || task.total;
      task.success = data.success ?? task.success;
      task.failed = data.failed ?? task.failed;
      task.skipped = data.skipped ?? task.skipped;
    }
    if (data.phase === "done") {
      task.current = data.total || task.total;
      task.total = data.total || task.total;
      task.success = data.success ?? task.success;
      task.failed = data.failed ?? task.failed;
      task.skipped = data.skipped ?? task.skipped;
      task.message = data.folderPath || task.message;
    }
    if (data.phase === "cancelled") {
      task.status = "cancelled";
    }
    renderXhsTaskList();
  });
}

// ==================== 自定义下拉选择器组件 ====================

const activeCustomDropdowns = new Set();

// 点击外部关闭所有下拉框
document.addEventListener('click', (e) => {
  activeCustomDropdowns.forEach(dropdown => {
    if (!dropdown.container.contains(e.target)) {
      dropdown.close();
    }
  });
});

// ESC键关闭下拉框
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    activeCustomDropdowns.forEach(dropdown => dropdown.close());
  }
});

/**
 * 将原生select转换为自定义下拉组件
 * @param {HTMLSelectElement} selectEl 原生select元素
 * @param {Object} options 配置项
 * @param {Function} options.onChange 值变化回调
 * @param {Function} options.renderOption 自定义渲染选项
 * @returns {Object} 下拉组件实例
 */
function createGlobalCustomSelect(selectEl, options = {}) {
  if (!selectEl || selectEl.tagName !== 'SELECT') {
    console.warn('createGlobalCustomSelect: invalid select element');
    return null;
  }

  const { onChange, renderOption } = options;

  // 隐藏原生select
  selectEl.style.display = 'none';

  // 创建自定义下拉容器
  const container = document.createElement('div');
  container.className = 'custom-select';

  // 创建触发按钮
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'custom-select-trigger';

  // 创建下拉面板
  const dropdown = document.createElement('div');
  dropdown.className = 'custom-select-dropdown';

  container.appendChild(trigger);
  container.appendChild(dropdown);

  // 插入到原生select后面
  selectEl.parentNode.insertBefore(container, selectEl.nextSibling);

  let isOpen = false;
  let currentValue = selectEl.value;
  let optionsList = [];

  // 更新选项列表
  function updateOptions() {
    optionsList = Array.from(selectEl.options).map(opt => ({
      value: opt.value,
      label: opt.textContent,
      disabled: opt.disabled
    }));
    renderDropdown();
  }

  // 渲染下拉内容
  function renderDropdown() {
    dropdown.innerHTML = '';

    optionsList.forEach(opt => {
      const item = document.createElement('div');
      item.className = 'custom-select-option';
      if (opt.value === currentValue) {
        item.classList.add('selected');
      }
      if (opt.disabled) {
        item.classList.add('disabled');
      }

      if (typeof renderOption === 'function') {
        item.innerHTML = renderOption(opt);
      } else {
        item.textContent = opt.label;
      }

      item.dataset.value = opt.value;

      if (!opt.disabled) {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          setValue(opt.value);
          close();
        });
      }

      dropdown.appendChild(item);
    });
  }

  // 更新触发按钮显示
  function updateTrigger() {
    const selected = optionsList.find(opt => opt.value === currentValue);
    if (typeof renderOption === 'function' && selected) {
      trigger.innerHTML = renderOption(selected) + '<span class="custom-select-arrow"></span>';
    } else {
      trigger.innerHTML = `<span class="custom-select-text">${selected?.label || ''}</span><span class="custom-select-arrow"></span>`;
    }
  }

  // 打开下拉框
  function open() {
    if (isOpen || container.classList.contains('disabled')) return;
    isOpen = true;
    container.classList.add('open');
    activeCustomDropdowns.add(instance);

    // 滚动到选中项
    requestAnimationFrame(() => {
      const selectedItem = dropdown.querySelector('.selected');
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  // 关闭下拉框
  function close() {
    if (!isOpen) return;
    isOpen = false;
    container.classList.remove('open');
    activeCustomDropdowns.delete(instance);
  }

  // 切换下拉框
  function toggle() {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }

  // 设置值
  function setValue(value, silent = false) {
    if (value === currentValue) return;
    currentValue = value;
    selectEl.value = value;
    updateTrigger();
    renderDropdown();

    if (!silent) {
      // 触发原生change事件
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      if (typeof onChange === 'function') {
        onChange(value);
      }
    }
  }

  // 获取值
  function getValue() {
    return currentValue;
  }

  // 设置禁用状态
  function setDisabled(disabled) {
    container.classList.toggle('disabled', disabled);
    trigger.disabled = disabled;
  }

  // 刷新选项（当原生select的options变化时调用）
  function refresh() {
    currentValue = selectEl.value;
    updateOptions();
    updateTrigger();
  }

  // 销毁组件
  function destroy() {
    close();
    container.remove();
    selectEl.style.display = '';
    activeCustomDropdowns.delete(instance);
  }

  // 绑定事件
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    toggle();
  });

  // 监听原生select的变化
  const observer = new MutationObserver(() => {
    refresh();
  });
  observer.observe(selectEl, { childList: true, subtree: true });

  // 初始化
  updateOptions();
  updateTrigger();
  setDisabled(selectEl.disabled);

  const instance = {
    container,
    trigger,
    dropdown,
    open,
    close,
    toggle,
    setValue,
    getValue,
    setDisabled,
    refresh,
    destroy
  };

  return instance;
}

function initGlobalCustomSelects() {
  // 导出引擎下拉框
  if (exportEngineSelect && !globalSelectInstances.has(exportEngineSelect)) {
    const instance = createGlobalCustomSelect(exportEngineSelect);
    if (instance) globalSelectInstances.set(exportEngineSelect, instance);
  }

  // 混合模式下拉框
  const blendModeSelect = document.getElementById('blendMode');
  if (blendModeSelect && !globalSelectInstances.has(blendModeSelect)) {
    const instance = createGlobalCustomSelect(blendModeSelect);
    if (instance) globalSelectInstances.set(blendModeSelect, instance);
  }

  // 导出倍率下拉框
  if (scaleSelect && !globalSelectInstances.has(scaleSelect)) {
    const instance = createGlobalCustomSelect(scaleSelect);
    if (instance) globalSelectInstances.set(scaleSelect, instance);
  }

  // 日志级别筛选下拉框
  if (logLevelFilter && !globalSelectInstances.has(logLevelFilter)) {
    const instance = createGlobalCustomSelect(logLevelFilter);
    if (instance) globalSelectInstances.set(logLevelFilter, instance);
  }
}

// 页面加载完成后初始化
initGlobalCustomSelects();

async function updateAppTitle() {
  if (!window.appApi?.getMeta) return;
  try {
    const meta = await window.appApi.getMeta();
    if (meta?.displayName) {
      document.title = meta.displayName;
    }
  } catch (error) {
    // 忽略标题更新错误
  }
}

updateAppTitle();

if (window.licenseManager && typeof window.licenseManager.init === "function") {
  window.licenseManager.init();
}
