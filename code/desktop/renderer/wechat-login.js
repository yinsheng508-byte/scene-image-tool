(function () {
  const modal = document.getElementById("wechatLoginModal");
  const codeInput = document.getElementById("wechatLoginCode");
  const submitBtn = document.getElementById("wechatLoginSubmit");
  const retryBtn = document.getElementById("wechatLoginRetry");
  const errorEl = document.getElementById("wechatLoginError");

  if (!modal || !codeInput || !submitBtn || !errorEl) return;

  let isSubmitting = false;
  let isCheckingStatus = false;

  function setError(message) {
    if (message) {
      errorEl.textContent = message;
      errorEl.classList.add("show");
    } else {
      errorEl.textContent = "";
      errorEl.classList.remove("show");
    }
  }

  function showModal() {
    modal.classList.add("show");
  }

  function hideModal() {
    modal.classList.remove("show");
  }

  function sanitizeCode(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 6);
  }

  function isForceUpdateBlocking() {
    const forceOverlay = document.getElementById("forceUpdateOverlay");
    if (forceOverlay) return true;
    const updateModal = document.getElementById("updateModal");
    return !!(
      updateModal &&
      updateModal.classList.contains("show") &&
      updateModal.classList.contains("force-mode")
    );
  }

  function shouldRequireWechatLogin(status) {
    if (!status || typeof status !== "object") return true;
    if (status.required === false) return false;
    return !status.verified;
  }

  function syncForceUpdatePriority() {
    if (!modal.classList.contains("show")) return;
    if (isForceUpdateBlocking()) {
      hideModal();
    }
  }

  function setCheckingStatus(nextChecking) {
    isCheckingStatus = nextChecking;
    if (!retryBtn) return;
    retryBtn.disabled = nextChecking || isSubmitting;
    retryBtn.textContent = nextChecking ? "检查中..." : "重试检查";
  }

  function showGateWithError(message) {
    if (isForceUpdateBlocking()) return false;
    showModal();
    if (message) {
      setError(message);
    }
    codeInput.focus();
    return true;
  }

  async function refreshGateStatus(options = {}) {
    const { preserveError = false } = options;
    if (isCheckingStatus) return false;

    if (!preserveError) {
      setError("");
    }

    if (!window.appApi?.getWechatLoginStatus) {
      return showGateWithError("登录状态检查不可用，请重启后重试");
    }

    setCheckingStatus(true);
    try {
      const status = await window.appApi.getWechatLoginStatus();
      if (!shouldRequireWechatLogin(status)) {
        hideModal();
        setError("");
        return true;
      }

      const reasonMessage =
        status?.reason === "device_mismatch"
          ? "检测到新设备，请扫码验证后进入"
          : status?.reason === "version_changed"
            ? "检测到新版本，请重新扫码验证后进入"
          : "";
      return showGateWithError(reasonMessage);
    } catch (error) {
      return showGateWithError("登录状态检查失败，请检查网络后重试");
    } finally {
      setCheckingStatus(false);
    }
  }

  async function ensureVerified(options = {}) {
    const { focus = true, preserveError = true } = options;
    const passed = await refreshGateStatus({ preserveError });
    if (!passed && focus && !isForceUpdateBlocking()) {
      codeInput.focus();
    }
    return passed;
  }

  async function initWechatLoginGate() {
    await refreshGateStatus();
  }

  async function handleSubmit() {
    if (isSubmitting) return;
    if (!window.appApi?.wechatLogin) {
      setError("登录接口不可用，请重试");
      return;
    }
    const code = sanitizeCode(codeInput.value);
    codeInput.value = code;
    if (!/^\d{6}$/.test(code)) {
      setError("请输入6位数字验证码");
      return;
    }
    setError("");
    isSubmitting = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "验证中...";
    if (retryBtn) {
      retryBtn.disabled = true;
    }
    try {
      const result = await window.appApi.wechatLogin(code);
      if (result?.ok) {
        await ensureVerified({ preserveError: true });
      } else {
        setError(result?.message || "登录失败，请重试");
      }
    } catch (error) {
      setError("网络异常，请稍后重试");
    }
    submitBtn.disabled = false;
    submitBtn.textContent = "登录并进入";
    isSubmitting = false;
    if (retryBtn) {
      retryBtn.disabled = isCheckingStatus;
    }
  }

  codeInput.addEventListener("input", (event) => {
    const nextValue = sanitizeCode(event.target.value);
    event.target.value = nextValue;
    if (nextValue.length < 6) {
      setError("");
    }
  });

  codeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSubmit();
    }
  });

  submitBtn.addEventListener("click", handleSubmit);
  if (retryBtn) {
    retryBtn.addEventListener("click", () => {
      refreshGateStatus();
    });
  }

  window.wechatLoginGate = {
    ensureVerified,
    refresh: refreshGateStatus
  };

  window.addEventListener("wechat-login:require", () => {
    ensureVerified();
  });

  const updateModal = document.getElementById("updateModal");
  if (typeof MutationObserver === "function") {
    if (updateModal) {
      const updateObserver = new MutationObserver(syncForceUpdatePriority);
      updateObserver.observe(updateModal, {
        attributes: true,
        attributeFilter: ["class"]
      });
    }
    const bodyObserver = new MutationObserver(syncForceUpdatePriority);
    bodyObserver.observe(document.body, {
      childList: true,
      subtree: false
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWechatLoginGate);
  } else {
    initWechatLoginGate();
  }
})();
