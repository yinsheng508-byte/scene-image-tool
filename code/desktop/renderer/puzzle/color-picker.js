const pickerRegistry = new Map();
let sharedPickr = null;
let sharedPopover = null;
let activeContext = null;
let lastSaveAt = 0;
let eyeDropperButton = null;
let eyeDropperActive = false;

function ensurePopover() {
  if (sharedPopover) return sharedPopover;
  const popover = document.createElement("div");
  popover.className = "puzzle-color-popover";
  popover.style.position = "fixed";
  popover.style.left = "0px";
  popover.style.top = "0px";
  popover.style.transform = "translate(0px, 0px)";
  popover.style.zIndex = "9999";
  popover.style.display = "none";
  document.body.appendChild(popover);
  sharedPopover = popover;
  return popover;
}

function updateTriggerColor(el, color) {
  if (!el || !color) return;
  el.dataset.color = color;
  el.style.background = color;
  el.style.setProperty("--picker-color", color);
}

function resolveColor(pickr, candidate) {
  if (candidate) return candidate;
  if (pickr && typeof pickr.getColor === "function") return pickr.getColor();
  if (pickr && typeof pickr.getSelectedColor === "function") return pickr.getSelectedColor();
  return null;
}

function hidePopover() {
  if (!sharedPopover) return;
  sharedPopover.style.display = "none";
  window.removeEventListener("resize", handleReposition);
  window.removeEventListener("scroll", handleReposition, true);
  document.removeEventListener("mousedown", handleOutsideClick, true);
  activeContext = null;
  document.dispatchEvent(new CustomEvent("puzzle-color-picker:hide"));
}

function isEyeDropperAvailable() {
  return typeof window !== "undefined" && typeof window.EyeDropper === "function";
}

function updateEyeDropperButtonState() {
  if (!eyeDropperButton) return;
  const available = isEyeDropperAvailable();
  const label = available ? "吸色" : "当前环境不支持吸色";
  eyeDropperButton.disabled = !available;
  eyeDropperButton.title = label;
  eyeDropperButton.setAttribute("aria-label", label);
  eyeDropperButton.classList.toggle("is-disabled", !available);
}

async function handleEyeDropperClick(event) {
  event.preventDefault();
  event.stopPropagation();
  if (!activeContext || eyeDropperActive || !isEyeDropperAvailable()) return;

  eyeDropperActive = true;
  eyeDropperButton?.classList.add("is-picking");
  try {
    const result = await new window.EyeDropper().open();
    const pickedColor = result?.sRGBHex;
    if (!pickedColor) return;

    const pickr = ensurePickr();
    pickr.setColor(pickedColor, true);
    handleSave(pickr.getColor());
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.warn("EyeDropper failed", error);
    }
  } finally {
    eyeDropperActive = false;
    eyeDropperButton?.classList.remove("is-picking");
  }
}

function ensureEyeDropperButton(root) {
  if (eyeDropperButton) {
    updateEyeDropperButtonState();
    return eyeDropperButton;
  }
  const app = root?.app;
  if (!app) return null;

  const toolbar = document.createElement("div");
  toolbar.className = "puzzle-color-popover-toolbar";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "puzzle-color-eyedropper-btn";
  button.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M14 4l6 6"></path>
      <path d="M17 2l5 5-12.5 12.5-6 1.5 1.5-6L17 2z"></path>
      <path d="M6 18l-2 2"></path>
    </svg>
  `;
  button.addEventListener("click", handleEyeDropperClick);

  toolbar.appendChild(button);
  app.insertBefore(toolbar, app.firstChild);
  eyeDropperButton = button;
  updateEyeDropperButtonState();
  return button;
}

function handleOutsideClick(event) {
  if (!sharedPopover || sharedPopover.style.display === "none") return;
  if (sharedPopover.contains(event.target)) return;
  if (activeContext?.anchorEl && activeContext.anchorEl.contains(event.target)) return;
  hidePopover();
}

function handleReposition() {
  if (!sharedPopover || sharedPopover.style.display === "none") return;
  if (!activeContext?.anchorEl) return;
  positionPopover(activeContext.anchorEl);
}

function positionPopover(anchor) {
  if (!sharedPopover || !anchor?.getBoundingClientRect) return;
  const rect = anchor.getBoundingClientRect();
  const app = sharedPickr?.getRoot?.()?.app;

  if (sharedPopover.parentElement !== document.body) {
    document.body.appendChild(sharedPopover);
  }

  const gap = 8;
  const popWidth = sharedPopover.offsetWidth || app?.offsetWidth || 240;
  const popHeight = sharedPopover.offsetHeight || app?.offsetHeight || 320;

  let left = rect.right + gap;
  if (left + popWidth > window.innerWidth - gap) {
    left = rect.left - popWidth - gap;
  }
  left = Math.max(gap, Math.min(left, window.innerWidth - popWidth - gap));

  let top = rect.top;
  if (top + popHeight > window.innerHeight - gap) {
    top = Math.max(gap, window.innerHeight - popHeight - gap);
  }
  top = Math.max(gap, top);

  sharedPopover.style.left = "0px";
  sharedPopover.style.top = "0px";
  sharedPopover.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

function ensurePickr() {
  if (sharedPickr) return sharedPickr;
  const popover = ensurePopover();
  const placeholder = document.createElement("button");
  placeholder.type = "button";
  placeholder.style.display = "none";
  popover.appendChild(placeholder);

  sharedPickr = Pickr.create({
    el: placeholder,
    theme: "monolith",
    default: "#ffffff",
    inline: true,
    showAlways: true,
    autoReposition: false,
    adjustableNumbers: true,
    swatches: [
      "#ffffff", "#000000", "#f8fafc", "#f1f5f9", "#e2e8f0",
      "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
      "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
      "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
      "#ec4899", "#f43f5e"
    ],
    components: {
      preview: false,
      opacity: true,
      hue: true,
      interaction: {
        hex: true,
        rgba: false,
        input: true,
        save: true
      }
    },
    i18n: {
      "ui:dialog": "颜色选择器",
      "btn:toggle": "切换颜色选择器",
      "btn:swatch": "颜色样本",
      "btn:last-color": "使用上一个颜色",
      "btn:save": "确定",
      "btn:cancel": "取消",
      "btn:clear": "清除",
      "aria:btn:save": "保存并关闭",
      "aria:btn:cancel": "取消并关闭",
      "aria:btn:clear": "清除选中的颜色",
      "aria:input": "颜色输入框",
      "aria:palette": "颜色选择区域",
      "aria:hue": "色相选择滑块",
      "aria:opacity": "透明度选择滑块"
    }
  });

  const root = sharedPickr.getRoot?.();
  if (root?.button) {
    root.button.style.display = "none";
  }
  ensureEyeDropperButton(root);

  sharedPickr.on("change", (color) => {
    if (!activeContext) return;
    if (typeof activeContext.onChange === "function" && color) {
      const hexColor = color.toHEXA().toString();
      activeContext.onChange(hexColor, color);
    }
  });

  sharedPickr.on("save", (color) => {
    const now = Date.now();
    lastSaveAt = now;
    handleSave(color);
  });

  return sharedPickr;
}

function handleSave(color) {
  const pickr = ensurePickr();
  const resolved = resolveColor(pickr, color);
  if (!activeContext || !resolved) {
    hidePopover();
    return;
  }
  const hexColor = resolved.toHEXA().toString();
  activeContext.currentColor = hexColor;
  updateTriggerColor(activeContext.anchorEl, hexColor);
  if (typeof activeContext.onSave === "function") {
    activeContext.onSave(hexColor, resolved);
  }
  hidePopover();
}

function openPicker(entry) {
  if (!entry || entry.disabled) return;
  const pickr = ensurePickr();
  activeContext = entry;

  const color = entry.currentColor || entry.defaultColor || entry.anchorEl?.dataset?.color || "#ffffff";
  updateTriggerColor(entry.anchorEl, color);
  pickr.setColor(color, true);
  updateEyeDropperButtonState();

  const popover = ensurePopover();
  popover.style.display = "block";
  positionPopover(entry.anchorEl);
  window.addEventListener("resize", handleReposition);
  window.addEventListener("scroll", handleReposition, true);
  document.addEventListener("mousedown", handleOutsideClick, true);
  requestAnimationFrame(() => positionPopover(entry.anchorEl));
}

function getEntry(el) {
  const element = typeof el === "string" ? document.querySelector(el) : el;
  if (!element) return null;
  return pickerRegistry.get(element) || null;
}

export function createColorPicker(options) {
  const { el, default: defaultColor = "#ffffff", onChange, onSave } = options || {};
  const element = typeof el === "string" ? document.querySelector(el) : el;
  if (!element) {
    console.warn("ColorPicker: element not found", el);
    return null;
  }

  if (pickerRegistry.has(element)) {
    const existing = pickerRegistry.get(element);
    if (existing?._clickHandler) {
      element.removeEventListener("click", existing._clickHandler);
    }
  }

  const entry = {
    anchorEl: element,
    defaultColor,
    currentColor: defaultColor,
    onChange,
    onSave,
    disabled: false,
    _clickHandler: null
  };

  updateTriggerColor(element, defaultColor);

  const handler = (event) => {
    if (entry.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    if (activeContext?.anchorEl === element && sharedPopover?.style.display !== "none") {
      hidePopover();
      return;
    }
    openPicker(entry);
  };

  element.addEventListener("click", handler);
  entry._clickHandler = handler;
  pickerRegistry.set(element, entry);

  return {
    setColor: (color) => {
      if (!color) return;
      entry.currentColor = color;
      updateTriggerColor(element, color);
      if (activeContext?.anchorEl === element) {
        ensurePickr().setColor(color, true);
      }
    },
    disable: () => {
      entry.disabled = true;
      element.classList.add("is-disabled");
    },
    enable: () => {
      entry.disabled = false;
      element.classList.remove("is-disabled");
    }
  };
}

export function getColorPicker(el) {
  return getEntry(el);
}

export function setPickrColor(el, color) {
  const entry = getEntry(el);
  if (entry && color) {
    entry.currentColor = color;
    updateTriggerColor(entry.anchorEl, color);
    if (activeContext?.anchorEl === entry.anchorEl) {
      ensurePickr().setColor(color, true);
    }
  }
}

export function destroyColorPicker(el) {
  const entry = getEntry(el);
  if (!entry) return;
  if (entry._clickHandler) {
    entry.anchorEl.removeEventListener("click", entry._clickHandler);
  }
  pickerRegistry.delete(entry.anchorEl);
}

export function setPickrDisabled(el, disabled) {
  const entry = getEntry(el);
  if (!entry) return;
  if (disabled) {
    entry.disabled = true;
    entry.anchorEl.classList.add("is-disabled");
  } else {
    entry.disabled = false;
    entry.anchorEl.classList.remove("is-disabled");
  }
}
