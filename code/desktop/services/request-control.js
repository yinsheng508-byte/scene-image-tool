const DEFAULT_REQUEST_TIMEOUT_MS = 60000;

function createCancelledError(message = "cancelled") {
  const error = new Error(message);
  error.name = "AbortError";
  error.code = "TASK_CANCELLED";
  error.cancelled = true;
  return error;
}

function createTimeoutError(timeoutMs, code = "REQUEST_TIMEOUT", message = "") {
  const error = new Error(message || `Request timed out after ${timeoutMs}ms`);
  error.code = code;
  error.timeout = true;
  error.timeoutMs = timeoutMs;
  return error;
}

function isAbortError(error) {
  if (!error) return false;
  if (error.cancelled === true) return true;
  if (error.name === "AbortError") return true;
  if (error.code === "ABORT_ERR" || error.code === "TASK_CANCELLED") return true;
  if (error.cause && error.cause !== error) {
    return isAbortError(error.cause);
  }
  return false;
}

function createRequestTracker() {
  const controllers = new Set();

  function track(controller) {
    controllers.add(controller);
    controller.signal.addEventListener(
      "abort",
      () => {
        controllers.delete(controller);
      },
      { once: true }
    );
    return controller;
  }

  function createController() {
    return track(new AbortController());
  }

  function release(controller) {
    controllers.delete(controller);
  }

  function abortAll(reason = createCancelledError()) {
    const activeControllers = Array.from(controllers);
    activeControllers.forEach((controller) => {
      if (!controller.signal.aborted) {
        controller.abort(reason);
      }
    });
    controllers.clear();
    return activeControllers.length;
  }

  function getActiveCount() {
    return controllers.size;
  }

  return {
    createController,
    release,
    abortAll,
    getActiveCount
  };
}

async function fetchWithRequestTracking(url, options = {}, control = {}) {
  const tracker = control.tracker || null;
  const timeoutMs = Number.isFinite(Number(control.timeoutMs))
    ? Math.max(0, Math.floor(Number(control.timeoutMs)))
    : DEFAULT_REQUEST_TIMEOUT_MS;
  const timeoutCode = control.timeoutCode || "REQUEST_TIMEOUT";
  const timeoutMessage = control.timeoutMessage || "";
  const controller = tracker?.createController
    ? tracker.createController()
    : new AbortController();
  let timeoutId = null;
  let timeoutError = null;
  let removeExternalAbort = null;

  const externalSignal = options.signal;
  if (externalSignal) {
    const abortFromExternalSignal = () => {
      if (!controller.signal.aborted) {
        controller.abort(externalSignal.reason || createCancelledError());
      }
    };
    if (externalSignal.aborted) {
      abortFromExternalSignal();
    } else {
      externalSignal.addEventListener("abort", abortFromExternalSignal, { once: true });
      removeExternalAbort = () => externalSignal.removeEventListener("abort", abortFromExternalSignal);
    }
  }

  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      timeoutError = createTimeoutError(timeoutMs, timeoutCode, timeoutMessage);
      if (!controller.signal.aborted) {
        controller.abort(timeoutError);
      }
    }, timeoutMs);
  }

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    if (typeof control.consume === "function") {
      return await control.consume(response);
    }
    return response;
  } catch (error) {
    if (timeoutError) {
      timeoutError.cause = error;
      throw timeoutError;
    }
    if (controller.signal.aborted || isAbortError(error)) {
      const cancelled = createCancelledError();
      cancelled.cause = error;
      throw cancelled;
    }
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (removeExternalAbort) {
      removeExternalAbort();
    }
    if (tracker?.release) {
      tracker.release(controller);
    }
  }
}

module.exports = {
  DEFAULT_REQUEST_TIMEOUT_MS,
  createCancelledError,
  createRequestTracker,
  createTimeoutError,
  fetchWithRequestTracking,
  isAbortError
};
