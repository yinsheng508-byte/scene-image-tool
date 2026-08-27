(function () {
  const VERIFY_INTERVAL = 7 * 24 * 60 * 60 * 1000;
  const FREE_LIMIT = 5;
  const TUTORIAL_GUIDE_URL = "https://o7nsrridj4.feishu.cn/wiki/GXEswLjOki0UXfk3xRfceSDyn3f?from=from_copylink";

  const licenseKeyInput = document.getElementById("licenseKeyInput");
  const toggleLicenseKey = document.getElementById("toggleLicenseKey");
  const verifyLicenseBtn = document.getElementById("verifyLicenseBtn");
  const clearLicenseBtn = document.getElementById("clearLicenseBtn");
  const licenseStatusDot = document.getElementById("licenseStatusDot");
  const licenseStatusText = document.getElementById("licenseStatusText");
  const licenseExpireText = document.getElementById("licenseExpireText");
  const licenseLastVerify = document.getElementById("licenseLastVerify");
  const licenseNextCheck = document.getElementById("licenseNextCheck");
  const currentVersionText = document.getElementById("currentVersionText");
  const checkUpdateBtn = document.getElementById("checkUpdateBtn");
  const tutorialBtn = document.getElementById("tutorialBtn");

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const pad = (num) => String(num).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  class LicenseManager {
    constructor() {
      this.config = null;
      this.isVerified = false;
      this.recheckTimer = null;
      this.currentVersion = "";
      this.isCheckingUpdate = false;
    }

    async init() {
      await this.loadConfig();
      if (window.licenseUI?.bind) {
        window.licenseUI.bind(this);
      }
      if (window.licenseAPI?.getVersion) {
        try {
          this.currentVersion = await window.licenseAPI.getVersion();
        } catch (error) {
          this.currentVersion = "";
        }
      }

      let updateCheckOk = false;
      if (this.config?.license?.key && window.licenseAPI?.checkUpdate) {
        const result = await this.checkUpdateOnLaunch();
        updateCheckOk = !!result?.ok;
      }

      if (!updateCheckOk && this.config?.update?.forceRequired) {
        const cachedUpdate = {
          has_update: true,
          latest_version: this.config.update.latestVersion,
          min_version: this.config.update.minVersion,
          download_url: this.config.update.downloadUrl,
          update_log: this.config.update.updateLog,
          force_update: this.config.update.forceUpdate
        };
        const policy = window.licenseUI?.resolveUpdatePolicy?.(cachedUpdate, this.currentVersion);
        if (policy?.isForce) {
          this.showUpdateModal(cachedUpdate, { bypassSkip: true, isForceMode: true });
          this.disableMainUI();
        } else {
          this.config.update.forceRequired = false;
          this.config.update.forceReason = "";
          await this.saveConfig();
          this.enableMainUI();
        }
      }

      if (this.config?.license?.key && this.config?.license?.verifyResult?.success) {
        this.isVerified = true;
        if (this.needsRevalidation()) {
          await this.verify(this.config.license.key, true);
        }
      }
      this.updateSettingsUI();
      this.scheduleRecheck();
      this.bindSettingsEvents();
    }

    ensureDefaults() {
      if (!this.config || typeof this.config !== "object") {
        this.config = {};
      }
      if (!this.config.freeUsage || typeof this.config.freeUsage !== "object") {
        this.config.freeUsage = {
          export: FREE_LIMIT,
          compose: FREE_LIMIT,
          puzzle: FREE_LIMIT,
          upload: FREE_LIMIT,
          xhs: FREE_LIMIT
        };
      } else {
        this.config.freeUsage = {
          export: FREE_LIMIT,
          compose: FREE_LIMIT,
          puzzle: FREE_LIMIT,
          upload: FREE_LIMIT,
          xhs: FREE_LIMIT,
          ...this.config.freeUsage
        };
      }
      const defaultUpdate = {
        skippedVersion: null,
        lastCheckTime: null,
        latestVersion: "",
        minVersion: "",
        forceUpdate: false,
        downloadUrl: "",
        updateLog: "",
        forceRequired: false,
        forceReason: ""
      };
      if (!this.config.update || typeof this.config.update !== "object") {
        this.config.update = { ...defaultUpdate };
      } else {
        this.config.update = { ...defaultUpdate, ...this.config.update };
      }
      if (!this.config.license || typeof this.config.license !== "object") {
        this.config.license = {};
      }
    }

    async loadConfig() {
      if (!window.licenseAPI?.getConfig) {
        this.config = {};
        return this.config;
      }
      this.config = await window.licenseAPI.getConfig();
      this.ensureDefaults();
      return this.config;
    }

    async saveConfig() {
      if (!window.licenseAPI?.saveConfig) return false;
      return window.licenseAPI.saveConfig(this.config);
    }

    needsRevalidation() {
      const lastVerify = this.config?.license?.lastVerifyTime;
      if (!lastVerify) return true;
      const lastTime = new Date(lastVerify).getTime();
      return Date.now() - lastTime > VERIFY_INTERVAL;
    }

    async verify(key, silent = false) {
      if (!window.licenseAPI?.verify) return { success: false, message: "验证接口不可用" };
      const result = await window.licenseAPI.verify(key);
      await this.loadConfig();
      this.isVerified = !!this.config?.license?.verifyResult?.success;
      await this.handleUpdateResponse(result?.update);
      if (!silent && window.showToast) {
        if (result?.success) {
          window.showToast("授权验证成功", "success");
        } else {
          window.showToast(result?.message || "授权验证失败", "error");
        }
      }
      this.updateSettingsUI();
      this.scheduleRecheck();
      return result;
    }

    async checkUpdateOnLaunch() {
      if (!window.licenseAPI?.checkUpdate) {
        return { ok: false, message: "检查更新接口不可用" };
      }
      try {
        const response = await window.licenseAPI.checkUpdate();
        await this.loadConfig();
        this.isVerified = !!this.config?.license?.verifyResult?.success;
        this.updateSettingsUI();
        if (response?.ok) {
          await this.handleUpdateResponse(response?.update, { bypassSkip: true });
          return { ok: true };
        }
        return { ok: false, message: response?.message || "检查更新失败" };
      } catch (error) {
        return { ok: false, message: error?.message || "检查更新失败" };
      }
    }

    async handleUpdateResponse(updateInfo, options = {}) {
      const { bypassSkip = false } = options;
      if (!updateInfo) {
        return false;
      }
      if (!updateInfo.has_update) {
        if (this.config?.update) {
          this.config.update.forceRequired = false;
          this.config.update.forceReason = "";
          this.config.update.latestVersion = "";
          this.config.update.minVersion = "";
          this.config.update.downloadUrl = "";
          this.config.update.updateLog = "";
          this.config.update.forceUpdate = false;
          await this.saveConfig();
          this.enableMainUI();
        }
        return false;
      }

      const policy =
        window.licenseUI?.resolveUpdatePolicy?.(updateInfo, this.currentVersion) || { isForce: false };

      this.config.update = this.config.update || {};
      Object.assign(this.config.update, {
        lastCheckTime: new Date().toISOString(),
        latestVersion: updateInfo.latest_version || "",
        minVersion: updateInfo.min_version || "",
        forceUpdate: !!updateInfo.force_update,
        downloadUrl: updateInfo.download_url || "",
        updateLog: updateInfo.update_log || "",
        forceRequired: policy.isForce,
        forceReason: policy.reason || ""
      });

      if (policy.isForce) {
        this.config.update.skippedVersion = null;
      } else if (
        this.config.update.skippedVersion &&
        this.config.update.skippedVersion !== updateInfo.latest_version
      ) {
        this.config.update.skippedVersion = null;
      }

      await this.saveConfig();

      const skipped = this.config.update.skippedVersion;
      if (!policy.isForce && !bypassSkip && skipped && skipped === updateInfo.latest_version) {
        this.enableMainUI();
        return false;
      }

      this.showUpdateModal(updateInfo, { bypassSkip, isForceMode: policy.isForce });
      if (policy.isForce) {
        this.disableMainUI();
      } else {
        this.enableMainUI();
      }

      return policy.isForce;
    }

    async checkUpdate() {
      if (this.isCheckingUpdate) return;
      this.isCheckingUpdate = true;
      const resetButton = () => {
        this.isCheckingUpdate = false;
        if (checkUpdateBtn) {
          checkUpdateBtn.disabled = false;
          checkUpdateBtn.textContent = "检查更新";
        }
      };
      if (checkUpdateBtn) {
        checkUpdateBtn.disabled = true;
        checkUpdateBtn.textContent = "检查中...";
      }
      if (!window.licenseAPI?.checkUpdate) {
        if (window.showToast) {
          window.showToast("检查更新接口不可用", "error");
        }
        resetButton();
        return;
      }
      try {
        const response = await window.licenseAPI.checkUpdate();
        await this.loadConfig();
        this.isVerified = !!this.config?.license?.verifyResult?.success;
        this.updateSettingsUI();
        if (!response?.ok) {
          if (window.showToast) {
            window.showToast(response?.message || "检查更新失败", "error");
          }
          return;
        }
        await this.handleUpdateResponse(response?.update, { bypassSkip: true });
        if (response?.update && response.update.has_update === false && window.showToast) {
          window.showToast("已是最新版本", "success");
        }
      } catch (error) {
        if (window.showToast) {
          window.showToast(`检查更新失败: ${error?.message || "未知错误"}`, "error");
        }
      } finally {
        resetButton();
      }
    }

    async ensureWechatGate() {
      if (window.wechatLoginGate?.ensureVerified) {
        return window.wechatLoginGate.ensureVerified({
          focus: true,
          preserveError: true
        });
      }

      if (!window.appApi?.getWechatLoginStatus) {
        if (window.showToast) {
          window.showToast("登录状态检查不可用，请重启后重试", "error");
        }
        return false;
      }

      let status = null;
      try {
        status = await window.appApi.getWechatLoginStatus();
      } catch (error) {
        window.dispatchEvent(new Event("wechat-login:require"));
        if (window.showToast) {
          window.showToast("登录状态检查失败，请稍后重试", "error");
        }
        return false;
      }

      const required = status?.required !== false;
      if (!required || status?.verified) {
        return true;
      }

      window.dispatchEvent(new Event("wechat-login:require"));
      if (window.showToast) {
        const message =
          status?.reason === "device_mismatch"
            ? "检测到新设备，请先完成微信扫码登录"
            : status?.reason === "version_changed"
              ? "检测到新版本，请先完成微信扫码登录"
            : "请先完成微信扫码登录";
        window.showToast(message, "warning");
      }
      return false;
    }

    async checkAccess(moduleId) {
      await this.loadConfig();
      this.isVerified = !!this.config?.license?.verifyResult?.success;

      if (this.config?.update?.forceRequired) {
        const cachedUpdate = {
          has_update: true,
          latest_version: this.config.update.latestVersion,
          min_version: this.config.update.minVersion,
          download_url: this.config.update.downloadUrl,
          update_log: this.config.update.updateLog,
          force_update: this.config.update.forceUpdate
        };
        const policy = window.licenseUI?.resolveUpdatePolicy?.(cachedUpdate, this.currentVersion);
        if (policy?.isForce) {
          this.showUpdateModal(cachedUpdate, { bypassSkip: true, isForceMode: true });
          this.disableMainUI();
          return false;
        }
        this.config.update.forceRequired = false;
        this.config.update.forceReason = "";
        await this.saveConfig();
        this.enableMainUI();
      }

      const wechatVerified = await this.ensureWechatGate();
      if (!wechatVerified) return false;

      if (this.isVerified) return true;

      const freeCount = this.config.freeUsage?.[moduleId] ?? 0;
      if (freeCount > 0) {
        this.config.freeUsage[moduleId] = freeCount - 1;
        await this.saveConfig();
        const remaining = freeCount - 1;
        if (window.showToast) {
          if (remaining > 0) {
            window.showToast(`试用中，该功能剩余 ${remaining} 次免费使用`, "warning");
          } else {
            window.showToast("这是该功能最后一次免费试用", "warning");
          }
        }
        this.updateSettingsUI();
        return true;
      }

      this.showLicenseModal();
      return false;
    }

    showLicenseModal(message) {
      const presetKey = this.config?.license?.key || "";
      window.licenseUI?.showLicenseModal(message, presetKey);
    }

    showUpdateModal(updateInfo, options = {}) {
      if (!updateInfo) return;
      const { bypassSkip = false, isForceMode = false } = options;
      const skipped = this.config?.update?.skippedVersion;
      if (!isForceMode && !bypassSkip && skipped && updateInfo.latest_version === skipped) return;
      window.licenseUI?.showUpdateModal(updateInfo, this.currentVersion, (version) => {
        if (!version) return;
        this.config.update = this.config.update || {};
        this.config.update.skippedVersion = version;
        this.saveConfig();
      }, isForceMode);
    }

    disableMainUI() {
      if (document.getElementById("forceUpdateOverlay")) return;
      const overlay = document.createElement("div");
      overlay.id = "forceUpdateOverlay";
      overlay.style.cssText = [
        "position: fixed",
        "top: 0",
        "left: 0",
        "width: 100%",
        "height: 100%",
        "background: rgba(0, 0, 0, 0.6)",
        "z-index: 9998",
        "pointer-events: all",
        "display: flex",
        "align-items: center",
        "justify-content: center"
      ].join(";");
      overlay.innerHTML = `
        <div style="
          background: white;
          padding: 30px;
          border-radius: 12px;
          text-align: center;
          max-width: 420px;
        ">
          <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
          <h2 style="margin: 0 0 10px; color: #333;">版本过旧</h2>
          <p style="margin: 0; color: #666;">当前版本已停止服务，请更新后继续使用</p>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    enableMainUI() {
      const overlay = document.getElementById("forceUpdateOverlay");
      if (overlay) overlay.remove();
    }

    scheduleRecheck() {
      if (this.recheckTimer) {
        clearTimeout(this.recheckTimer);
        this.recheckTimer = null;
      }
      const lastVerify = this.config?.license?.lastVerifyTime;
      const key = this.config?.license?.key;
      if (!lastVerify || !key) return;
      const nextTime = new Date(lastVerify).getTime() + VERIFY_INTERVAL;
      const delay = Math.max(1000, nextTime - Date.now());
      this.recheckTimer = setTimeout(() => {
        this.verify(key, true);
      }, delay);
    }

    updateSettingsUI() {
      if (currentVersionText) {
        currentVersionText.textContent = this.currentVersion ? `v${this.currentVersion}` : "-";
      }
      if (licenseKeyInput && this.config?.license?.key) {
        licenseKeyInput.value = this.config.license.key;
      }

      const expireAt = this.config?.license?.expireAt;
      if (licenseExpireText) {
        licenseExpireText.textContent = expireAt ? `有效期至 ${expireAt}` : "";
      }
      if (licenseLastVerify) {
        licenseLastVerify.textContent = formatDate(this.config?.license?.lastVerifyTime);
      }
      if (licenseNextCheck) {
        if (this.config?.license?.lastVerifyTime) {
          const nextTime = new Date(this.config.license.lastVerifyTime).getTime() + VERIFY_INTERVAL;
          licenseNextCheck.textContent = formatDate(new Date(nextTime).toISOString());
        } else {
          licenseNextCheck.textContent = "-";
        }
      }

      const totalFree = Object.values(this.config?.freeUsage || {}).reduce((sum, num) => {
        const val = Number(num);
        return sum + (Number.isFinite(val) ? val : 0);
      }, 0);

      let statusLabel = "未激活";
      let statusClass = "is-inactive";
      if (this.isVerified) {
        statusLabel = "已激活";
        statusClass = "is-active";
      } else if (totalFree > 0) {
        statusLabel = "试用中";
        statusClass = "is-trial";
      }
      if (licenseStatusText) {
        licenseStatusText.textContent = statusLabel;
      }
      if (licenseStatusDot) {
        licenseStatusDot.classList.remove("is-active", "is-trial", "is-inactive");
        licenseStatusDot.classList.add(statusClass);
      }
    }

    bindSettingsEvents() {
      if (toggleLicenseKey && licenseKeyInput) {
        toggleLicenseKey.addEventListener("click", () => {
          const isHidden = licenseKeyInput.type === "password";
          licenseKeyInput.type = isHidden ? "text" : "password";
          toggleLicenseKey.textContent = isHidden ? "隐藏" : "显示";
        });
      }
      if (verifyLicenseBtn && licenseKeyInput) {
        verifyLicenseBtn.addEventListener("click", async () => {
          const key = licenseKeyInput.value.trim();
          if (!key) {
            if (window.showToast) window.showToast("请输入授权密钥", "warning");
            return;
          }
          await this.verify(key);
        });
      }
      if (clearLicenseBtn) {
        clearLicenseBtn.addEventListener("click", async () => {
          this.config.license = null;
          this.isVerified = false;
          this.config.freeUsage = {
            export: FREE_LIMIT,
            compose: FREE_LIMIT,
            puzzle: FREE_LIMIT,
            upload: FREE_LIMIT,
            xhs: FREE_LIMIT
          };
          if (licenseKeyInput) {
            licenseKeyInput.value = "";
          }
          await this.saveConfig();
          this.updateSettingsUI();
        });
      }
      if (checkUpdateBtn) {
        checkUpdateBtn.addEventListener("click", async () => {
          await this.checkUpdate();
        });
      }
      if (tutorialBtn) {
        tutorialBtn.addEventListener("click", async () => {
          try {
            if (!window.licenseAPI?.openExternal) {
              throw new Error("openExternal unavailable");
            }
            const result = await window.licenseAPI.openExternal(TUTORIAL_GUIDE_URL);
            if (result && result.ok === false) {
              throw new Error(result.error || "openExternal failed");
            }
          } catch (error) {
            if (window.showToast) {
              window.showToast("打开教程失败，请手动复制链接", "error");
            }
          }
        });
      }
      const communityBtn = document.getElementById("communityBtn");
      const communityModal = document.getElementById("communityModal");
      const communityModalClose = document.getElementById("communityModalClose");
      if (communityBtn && communityModal) {
        communityBtn.addEventListener("click", () => {
          communityModal.classList.add("show");
        });
        communityModalClose.addEventListener("click", () => {
          communityModal.classList.remove("show");
        });
        communityModal.addEventListener("click", (e) => {
          if (e.target === communityModal) communityModal.classList.remove("show");
        });
      }
    }
  }

  window.licenseManager = new LicenseManager();
})();
