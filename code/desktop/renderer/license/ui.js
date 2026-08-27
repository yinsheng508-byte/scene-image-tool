(function () {
  const licenseModal = document.getElementById("licenseModal");
  const licenseModalKey = document.getElementById("licenseModalKey");
  const licenseModalError = document.getElementById("licenseModalError");
  const licenseModalCancel = document.getElementById("licenseModalCancel");
  const licenseModalVerify = document.getElementById("licenseModalVerify");
  const licenseModalClose = document.getElementById("licenseModalClose");

  const updateModal = document.getElementById("updateModal");
  const updateCurrentVersion = document.getElementById("updateCurrentVersion");
  const updateLatestVersion = document.getElementById("updateLatestVersion");
  const updateLogText = document.getElementById("updateLogText");
  const updateSkipCheckbox = document.getElementById("updateSkipCheckbox");
  const updateLaterBtn = document.getElementById("updateLaterBtn");
  const updateNowBtn = document.getElementById("updateNowBtn");

  let activeManager = null;
  let activeUpdateInfo = null;
  let onSkipUpdate = null;
  let isForceUpdateMode = false;

  function normalizeDownloadUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== "string") return null;
    const trimmed = rawUrl.trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    if (lower.startsWith("file:")) return null;
    if (/^[a-zA-Z]:\\/.test(trimmed) || trimmed.startsWith("\\\\")) return null;
    if (trimmed.startsWith("//")) return `https:${trimmed}`;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(trimmed)) return `https://${trimmed}`;
    return null;
  }

  function compareVersions(v1, v2) {
    if (!v1 || !v2) return 0;
    const clean1 = String(v1).replace(/^v/i, "");
    const clean2 = String(v2).replace(/^v/i, "");
    const parts1 = clean1.split(".").map((part) => parseInt(part, 10) || 0);
    const parts2 = clean2.split(".").map((part) => parseInt(part, 10) || 0);
    const maxLen = Math.max(parts1.length, parts2.length);
    for (let i = 0; i < maxLen; i += 1) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 < p2) return -1;
      if (p1 > p2) return 1;
    }
    return 0;
  }

  function resolveUpdatePolicy(updateInfo, currentVersion) {
    const result = {
      isForce: false,
      reason: "",
      hasUpdate: false,
      latestVersion: "",
      minVersion: "",
      downloadUrl: "",
      updateLog: ""
    };
    if (!updateInfo) return result;
    result.hasUpdate = !!updateInfo.has_update;
    result.latestVersion = updateInfo.latest_version || "";
    result.minVersion = updateInfo.min_version || "";
    result.downloadUrl = updateInfo.download_url || "";
    result.updateLog = updateInfo.update_log || "";
    if (!result.hasUpdate) return result;
    if (updateInfo.force_update === true) {
      result.isForce = true;
      result.reason = "force_update";
      return result;
    }
    if (updateInfo.min_version && currentVersion) {
      const cmp = compareVersions(currentVersion, updateInfo.min_version);
      if (cmp < 0) {
        result.isForce = true;
        result.reason = "min_version";
        return result;
      }
    }
    return result;
  }

  function setLicenseError(message) {
    if (!licenseModalError) return;
    if (message) {
      licenseModalError.textContent = message;
      licenseModalError.classList.add("show");
    } else {
      licenseModalError.textContent = "";
      licenseModalError.classList.remove("show");
    }
  }

  function showLicenseModal(message, presetKey) {
    if (!licenseModal) return;
    if (licenseModalKey && presetKey && !licenseModalKey.value) {
      licenseModalKey.value = presetKey;
    }
    setLicenseError(message || "");
    licenseModal.classList.add("show");
  }

  function hideLicenseModal() {
    if (!licenseModal) return;
    licenseModal.classList.remove("show");
    setLicenseError("");
  }

  function showUpdateModal(updateInfo, currentVersion, skipHandler, isForceMode = false) {
    if (!updateModal || !updateInfo) return;
    activeUpdateInfo = updateInfo;
    onSkipUpdate = skipHandler;
    isForceUpdateMode = isForceMode;
    if (isForceMode) {
      updateModal.classList.add("force-mode");
    } else {
      updateModal.classList.remove("force-mode");
    }

    const minVersionTip = document.getElementById("minVersionTip");
    const minVersionText = document.getElementById("minVersionText");
    if (minVersionTip) {
      const policy = resolveUpdatePolicy(updateInfo, currentVersion);
      if (policy?.isForce && policy?.reason === "min_version" && updateInfo.min_version) {
        minVersionTip.style.display = "block";
        if (minVersionText) {
          minVersionText.textContent = `v${updateInfo.min_version}`;
        }
      } else {
        minVersionTip.style.display = "none";
      }
    }

    if (updateCurrentVersion) {
      updateCurrentVersion.textContent = currentVersion ? `v${currentVersion}` : "-";
    }
    if (updateLatestVersion) {
      updateLatestVersion.textContent = updateInfo.latest_version ? `v${updateInfo.latest_version}` : "-";
    }
    if (updateLogText) {
      updateLogText.textContent = updateInfo.update_log || "暂无更新说明";
    }
    if (updateSkipCheckbox) {
      updateSkipCheckbox.checked = false;
    }
    const downloadUrlFallback = document.getElementById("downloadUrlFallback");
    const downloadUrlText = document.getElementById("downloadUrlText");
    if (downloadUrlFallback) {
      downloadUrlFallback.style.display = "none";
    }
    if (downloadUrlText) {
      downloadUrlText.value = "";
    }
    updateModal.classList.add("show");
  }

  function hideUpdateModal() {
    if (!updateModal) return;
    updateModal.classList.remove("show");
  }

  function bind(manager) {
    activeManager = manager;
    if (licenseModalVerify) {
      licenseModalVerify.addEventListener("click", async () => {
        const key = licenseModalKey?.value?.trim();
        if (!key) {
          setLicenseError("请输入授权密钥");
          return;
        }
        setLicenseError("");
        const result = await activeManager.verify(key);
        if (result?.success) {
          hideLicenseModal();
        } else {
          setLicenseError(result?.message || "验证失败，请重试");
        }
      });
    }
    if (licenseModalCancel) {
      licenseModalCancel.addEventListener("click", hideLicenseModal);
    }
    if (licenseModalClose) {
      licenseModalClose.addEventListener("click", hideLicenseModal);
    }
    if (licenseModal) {
      licenseModal.addEventListener("click", (event) => {
        if (event.target === licenseModal) {
          hideLicenseModal();
        }
      });
    }

    const updateCloseBtn = document.getElementById("updateCloseBtn");
    const copyUrlBtn = document.getElementById("copyUrlBtn");

    if (updateCloseBtn) {
      updateCloseBtn.addEventListener("click", () => {
        if (isForceUpdateMode) {
          if (window.showToast) {
            window.showToast("当前版本必须更新才能继续使用", "warning");
          }
          return;
        }
        hideUpdateModal();
      });
    }

    if (updateLaterBtn) {
      updateLaterBtn.addEventListener("click", () => {
        if (isForceUpdateMode) {
          if (window.showToast) {
            window.showToast("当前版本必须更新才能继续使用", "warning");
          }
          return;
        }
        if (updateSkipCheckbox?.checked && activeUpdateInfo && onSkipUpdate) {
          onSkipUpdate(activeUpdateInfo.latest_version);
        }
        hideUpdateModal();
      });
    }

    if (updateNowBtn) {
      updateNowBtn.addEventListener("click", async () => {
        const normalizedUrl = normalizeDownloadUrl(activeUpdateInfo?.download_url);
        if (!normalizedUrl) {
          showDownloadUrlFallback(activeUpdateInfo?.download_url);
          return;
        }
        if (window.licenseAPI?.openExternal) {
          const result = await window.licenseAPI.openExternal(normalizedUrl);
          if (result && result.ok === false) {
            showDownloadUrlFallback(normalizedUrl);
            return;
          }
        }
        if (!isForceUpdateMode) {
          if (updateSkipCheckbox?.checked && activeUpdateInfo && onSkipUpdate) {
            onSkipUpdate(activeUpdateInfo.latest_version);
          }
          hideUpdateModal();
        }
      });
    }

    if (copyUrlBtn) {
      copyUrlBtn.addEventListener("click", () => {
        const urlInput = document.getElementById("downloadUrlText");
        if (!urlInput) return;
        const text = urlInput.value || "";
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(text).then(() => {
            if (window.showToast) {
              window.showToast("链接已复制到剪贴板", "success");
            }
          });
        } else {
          urlInput.select();
          document.execCommand("copy");
          if (window.showToast) {
            window.showToast("链接已复制到剪贴板", "success");
          }
        }
      });
    }

    if (updateModal) {
      updateModal.addEventListener("click", (event) => {
        if (event.target !== updateModal) return;
        if (isForceUpdateMode) {
          if (window.showToast) {
            window.showToast("当前版本必须更新才能继续使用", "warning");
          }
          return;
        }
        hideUpdateModal();
      });
    }

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (!updateModal?.classList.contains("show")) return;
      if (isForceUpdateMode) {
        event.preventDefault();
        if (window.showToast) {
          window.showToast("当前版本必须更新才能继续使用", "warning");
        }
        return;
      }
      hideUpdateModal();
    });
  }

  function showDownloadUrlFallback(url) {
    const fallbackEl = document.getElementById("downloadUrlFallback");
    const urlInput = document.getElementById("downloadUrlText");
    if (!fallbackEl || !urlInput) return;
    urlInput.value = url || "链接无效，请联系客服获取";
    fallbackEl.style.display = "block";
    if (!url && window.showToast) {
      window.showToast("下载链接无效，请联系客服", "error");
    } else if (window.showToast) {
      window.showToast("无法自动打开链接，请手动复制", "warning");
    }
  }

  window.licenseUI = {
    bind,
    showLicenseModal,
    hideLicenseModal,
    showUpdateModal,
    hideUpdateModal,
    compareVersions,
    resolveUpdatePolicy
  };
})();
