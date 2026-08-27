import { computeImageRect } from "../../shared/puzzle-render-spec.mjs";

const SCALE_MIN = 0.5;
const SCALE_MAX = 3;
const OFFSET_MIN = -50;
const OFFSET_MAX = 50;
const DEFAULT_HINT = "建议填入相近宽高比图片，效果更佳";
const DISABLE_HINT = "缩放较小，无法调整偏移";
const DEFAULT_BORDER_COLOR = "#1f6f5c";

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function normalizeCrop(crop) {
  if (!crop) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }
  return {
    scale: clamp(crop.scale ?? 1, SCALE_MIN, SCALE_MAX),
    offsetX: clamp(crop.offsetX ?? 0, OFFSET_MIN, OFFSET_MAX),
    offsetY: clamp(crop.offsetY ?? 0, OFFSET_MIN, OFFSET_MAX)
  };
}

function toFileUrl(path) {
  if (!path) return "";
  if (path.startsWith("data:") || path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  if (path.startsWith("file://")) return path;
  return `file:///${path.replace(/\\/g, "/")}`;
}

function loadImage(path) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = toFileUrl(path);
  });
}

function clipRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  ctx.clip();
}

function strokeRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  ctx.stroke();
}

export function createCropEditor(elements = {}) {
  const modal = elements.cropModal;
  const canvas = elements.cropCanvas;
  const empty = elements.cropEmpty;
  const uploadBtn = elements.cropUploadBtn;
  const replaceBtn = elements.cropReplaceBtn;
  const resetBtn = elements.cropResetBtn;
  const confirmBtn = elements.cropConfirmBtn;
  const cancelBtn = elements.cropCancelBtn;
  const scaleLabel = elements.cropScaleLabel;
  const offsetXLabel = elements.cropOffsetXLabel;
  const offsetYLabel = elements.cropOffsetYLabel;
  const scaleInput = elements.cropScaleInput;
  const offsetXInput = elements.cropOffsetXInput;
  const offsetYInput = elements.cropOffsetYInput;
  const hintEl = elements.cropHint;

  if (!modal || !canvas) {
    return {
      open: () => {},
      close: () => {}
    };
  }

  const ctx = canvas.getContext("2d");
  const titleEl = modal.querySelector(".puzzle-crop-title");

  let isOpen = false;
  let currentSlot = null;
  let currentImage = null;
  let cropDraft = normalizeCrop(null);
  let onConfirm = null;
  let dragState = null;
  let layout = null;
  let loadToken = 0;
  let renderScheduled = false;
  let editingField = null;
  let lastCanOffset = true;

  function showToast(message) {
    if (window.showToast) {
      window.showToast(message, "info", 1600);
    }
  }

  function formatFixed(value, digits = 2) {
    if (!Number.isFinite(value)) return (0).toFixed(digits);
    return Number(value).toFixed(digits);
  }

  function parseNumericInput(raw) {
    if (raw === null || raw === undefined) return NaN;
    const cleaned = String(raw).trim().replace(/,/g, "").replace(/[^\d.+-]/g, "");
    if (!cleaned || cleaned === "-" || cleaned === "+" || cleaned === "." || cleaned === "-." || cleaned === "+.") {
      return NaN;
    }
    const value = Number(cleaned);
    return Number.isFinite(value) ? value : NaN;
  }

  function getValueItem(field) {
    if (!modal) return null;
    return modal.querySelector(`.crop-value-item[data-field="${field}"]`);
  }

  function isEditing(field) {
    return editingField === field;
  }

  function setEditing(field, enabled) {
    const item = getValueItem(field);
    if (!item) return;
    item.classList.toggle("is-editing", enabled);
  }

  function stopEditing({ commit = true } = {}) {
    if (!editingField) return;
    const field = editingField;
    if (commit) {
      applyInputValue(field);
    } else {
      syncInputsFromDraft();
    }
    setEditing(field, false);
    editingField = null;
  }

  function beginEditing(field) {
    if (!isOpen) return;
    if ((field === "offsetX" || field === "offsetY") && currentImage && !lastCanOffset) {
      return;
    }
    if (editingField && editingField !== field) {
      stopEditing({ commit: true });
    }
    editingField = field;
    setEditing(field, true);
    const input = field === "scale" ? scaleInput : field === "offsetX" ? offsetXInput : offsetYInput;
    if (!input) return;
    const safeCrop = normalizeCrop(cropDraft);
    if (field === "scale") {
      input.value = formatFixed(safeCrop.scale);
    } else if (field === "offsetX") {
      input.value = formatFixed(safeCrop.offsetX);
    } else if (field === "offsetY") {
      input.value = formatFixed(safeCrop.offsetY);
    }
    input.focus();
    input.select();
  }

  function applyInputValue(field) {
    const input = field === "scale" ? scaleInput : field === "offsetX" ? offsetXInput : offsetYInput;
    if (!input) return;
    const value = parseNumericInput(input.value);
    if (!Number.isFinite(value)) {
      showToast("请输入有效数字");
      syncInputsFromDraft();
      return;
    }
    if (field === "scale") {
      cropDraft.scale = clamp(value, SCALE_MIN, SCALE_MAX);
    } else if (field === "offsetX") {
      cropDraft.offsetX = clamp(value, OFFSET_MIN, OFFSET_MAX);
    } else if (field === "offsetY") {
      cropDraft.offsetY = clamp(value, OFFSET_MIN, OFFSET_MAX);
    }
    scheduleRender();
  }

  function syncInputsFromDraft() {
    const safeCrop = normalizeCrop(cropDraft);
    if (scaleInput && !isEditing("scale")) {
      scaleInput.value = formatFixed(safeCrop.scale);
    }
    if (offsetXInput && !isEditing("offsetX")) {
      offsetXInput.value = formatFixed(safeCrop.offsetX);
    }
    if (offsetYInput && !isEditing("offsetY")) {
      offsetYInput.value = formatFixed(safeCrop.offsetY);
    }
  }

  function scheduleRender() {
    if (!isOpen) return;
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(() => {
      renderScheduled = false;
      render();
    });
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.max(1, Math.round(rect.width * dpr));
    const targetH = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width: rect.width, height: rect.height };
  }

  function computeLayout() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const slotW = Math.max(1, Number(currentSlot?.w) || 1);
    const slotH = Math.max(1, Number(currentSlot?.h) || 1);
    const padding = 28;
    const availableW = Math.max(1, width - padding * 2);
    const availableH = Math.max(1, height - padding * 2);
    const scale = Math.max(0.01, Math.min(availableW / slotW, availableH / slotH));
    const displayW = slotW * scale;
    const displayH = slotH * scale;
    const slotX = (width - displayW) / 2;
    const slotY = (height - displayH) / 2;
    const radius = Math.max(
      0,
      Math.min((currentSlot?.style?.borderRadius || 0) * scale, displayW / 2, displayH / 2)
    );
    return { width, height, slotX, slotY, slotW: displayW, slotH: displayH, radius, scale };
  }

  function getImageMetrics(image, layoutInfo, crop) {
    const safeW = Math.max(1, image?.width || 1);
    const safeH = Math.max(1, image?.height || 1);
    const baseScale = Math.min(layoutInfo.slotW / safeW, layoutInfo.slotH / safeH);
    const baseW = safeW * baseScale;
    const baseH = safeH * baseScale;
    const scale = clamp(crop?.scale ?? 1, SCALE_MIN, SCALE_MAX);
    const finalW = baseW * scale;
    const finalH = baseH * scale;
    return {
      finalW,
      finalH,
      canOffset: finalW > layoutInfo.slotW || finalH > layoutInfo.slotH
    };
  }

  function updateLabels(canOffset) {
    const safeCrop = normalizeCrop(cropDraft);
    const allowOffset = currentImage ? canOffset : true;
    const displayOffsetX = allowOffset ? safeCrop.offsetX : 0;
    const displayOffsetY = allowOffset ? safeCrop.offsetY : 0;
    if (scaleLabel) {
      scaleLabel.textContent = formatFixed(safeCrop.scale);
    }
    if (offsetXLabel) {
      offsetXLabel.textContent = formatFixed(displayOffsetX);
    }
    if (offsetYLabel) {
      offsetYLabel.textContent = formatFixed(displayOffsetY);
    }
    if (hintEl) {
      if (!currentImage) {
        hintEl.textContent = "";
      } else {
        hintEl.textContent = canOffset ? DEFAULT_HINT : DISABLE_HINT;
      }
    }
    if (offsetXInput) {
      offsetXInput.disabled = currentImage ? !canOffset : false;
      const item = getValueItem("offsetX");
      if (item) item.classList.toggle("is-disabled", currentImage ? !canOffset : false);
    }
    if (offsetYInput) {
      offsetYInput.disabled = currentImage ? !canOffset : false;
      const item = getValueItem("offsetY");
      if (item) item.classList.toggle("is-disabled", currentImage ? !canOffset : false);
    }
    lastCanOffset = !!canOffset;
    if (currentImage && !canOffset && (editingField === "offsetX" || editingField === "offsetY")) {
      stopEditing({ commit: true });
    }
    syncInputsFromDraft();
  }

  function updateUiState() {
    if (empty) {
      empty.style.display = currentImage ? "none" : "flex";
    }
    if (replaceBtn) {
      replaceBtn.disabled = !currentImage;
    }
    if (resetBtn) {
      resetBtn.disabled = !currentImage;
    }
  }

  function render() {
    if (!isOpen || !currentSlot) return;
    const { width, height } = resizeCanvas();
    layout = computeLayout();
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#f3f4f6";
    ctx.fillRect(0, 0, width, height);

    let canOffset = false;
    let imageRect = null;
    if (currentImage) {
      const metrics = getImageMetrics(currentImage, layout, cropDraft);
      canOffset = metrics.canOffset;
      imageRect = computeImageRect(
        currentImage.width,
        currentImage.height,
        layout.slotW,
        layout.slotH,
        cropDraft
      );
      const drawX = layout.slotX + imageRect.x;
      const drawY = layout.slotY + imageRect.y;
      const drawW = imageRect.w;
      const drawH = imageRect.h;
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.drawImage(currentImage, drawX, drawY, drawW, drawH);
      ctx.restore();
      ctx.save();
      clipRoundedRect(ctx, layout.slotX, layout.slotY, layout.slotW, layout.slotH, layout.radius);
      ctx.drawImage(currentImage, drawX, drawY, drawW, drawH);
      ctx.restore();
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "rgba(15, 23, 42, 0.25)";
      ctx.lineWidth = 1;
      ctx.strokeRect(drawX, drawY, drawW, drawH);
      ctx.restore();
    }

    const baseBorderWidth = currentSlot.style?.borderWidth || 0;
    const borderWidth = Math.max(1, baseBorderWidth * layout.scale);
    const borderColor = baseBorderWidth > 0 && currentSlot.style?.borderColor
      ? currentSlot.style.borderColor
      : DEFAULT_BORDER_COLOR;
    ctx.save();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = borderWidth;
    strokeRoundedRect(ctx, layout.slotX, layout.slotY, layout.slotW, layout.slotH, layout.radius);
    ctx.restore();

    if (dragState && !canOffset) {
      dragState = null;
    }
    canvas.style.cursor = currentImage && canOffset ? (dragState ? "grabbing" : "grab") : "default";
    updateLabels(canOffset);
    updateUiState();
  }

  async function loadImageFromPath(path, { resetCrop, showResetToast } = {}) {
    if (!path) {
      currentImage = null;
      updateUiState();
      scheduleRender();
      return;
    }
    const token = (loadToken += 1);
    const img = await loadImage(path);
    if (token !== loadToken) return;
    if (!img) {
      currentImage = null;
      updateUiState();
      scheduleRender();
      showToast("图片加载失败，请重新上传");
      return;
    }
    currentImage = img;
    if (resetCrop) {
      cropDraft = normalizeCrop(null);
      if (showResetToast) {
        showToast("已重置裁剪参数");
      }
    }
    updateUiState();
    scheduleRender();
  }

  async function handleSelectImage({ resetCrop, showResetToast } = {}) {
    if (!window.appApi?.openImageFile) {
      showToast("图片上传接口不可用");
      return;
    }
    const result = await window.appApi.openImageFile();
    if (!result || result.canceled) return;
    const filePath = result.filePaths?.[0];
    if (!filePath) return;
    await loadImageFromPath(filePath, { resetCrop, showResetToast });
  }

  function handleResetCrop() {
    if (!currentImage) return;
    cropDraft = normalizeCrop(null);
    scheduleRender();
    showToast("已重置裁剪参数");
  }

  function handleConfirm() {
    if (!isOpen) return;
    stopEditing({ commit: true });
    if (onConfirm) {
      onConfirm(normalizeCrop(cropDraft));
    }
    close();
  }

  function handleCancel() {
    close();
  }

  function handleMouseDown(event) {
    if (!isOpen || !currentImage || !layout) return;
    if (event.button !== 0) return;
    const metrics = getImageMetrics(currentImage, layout, cropDraft);
    if (!metrics.canOffset) return;
    dragState = {
      startX: event.clientX,
      startY: event.clientY,
      baseOffsetX: cropDraft.offsetX || 0,
      baseOffsetY: cropDraft.offsetY || 0
    };
    canvas.style.cursor = "grabbing";
    event.preventDefault();
  }

  function handleMouseMove(event) {
    if (!dragState || !layout) return;
    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    const nextOffsetX = dragState.baseOffsetX + (dx / layout.slotW) * 100;
    const nextOffsetY = dragState.baseOffsetY + (dy / layout.slotH) * 100;
    cropDraft.offsetX = clamp(nextOffsetX, OFFSET_MIN, OFFSET_MAX);
    cropDraft.offsetY = clamp(nextOffsetY, OFFSET_MIN, OFFSET_MAX);
    scheduleRender();
    event.preventDefault();
  }

  function handleMouseUp() {
    if (!dragState) return;
    dragState = null;
    scheduleRender();
  }

  function handleWheel(event) {
    if (!isOpen || !currentImage) return;
    event.preventDefault();
    const delta = event.deltaY || 0;
    if (!delta) return;
    const step = delta > 0 ? -0.06 : 0.06;
    const nextScale = clamp((cropDraft.scale ?? 1) + step, SCALE_MIN, SCALE_MAX);
    cropDraft.scale = Math.round(nextScale * 100) / 100;
    scheduleRender();
  }

  function handleKeyDown(event) {
    if (!isOpen) return;
    if (editingField) return;
    if (event.key === "Escape") {
      close();
    } else if (event.key === "Enter") {
      handleConfirm();
    }
  }

  function open({ slot, imagePath, crop, onConfirm: confirmHandler, slotIndex }) {
    currentSlot = slot || null;
    cropDraft = normalizeCrop(crop);
    editingField = null;
    onConfirm = typeof confirmHandler === "function" ? confirmHandler : null;
    dragState = null;
    isOpen = true;
    if (titleEl) {
      titleEl.textContent = slotIndex ? `裁剪设置 - 坑位 ${slotIndex}` : "裁剪设置";
    }
    modal.classList.add("show");
    if (imagePath) {
      loadImageFromPath(imagePath, { resetCrop: false });
    } else {
      currentImage = null;
      updateUiState();
      scheduleRender();
    }
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    dragState = null;
    stopEditing({ commit: false });
    modal.classList.remove("show");
  }

  canvas.addEventListener("mousedown", handleMouseDown);
  canvas.addEventListener("mouseup", handleMouseUp);
  canvas.addEventListener("mouseleave", handleMouseUp);
  canvas.addEventListener("wheel", handleWheel, { passive: false });
  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("mouseup", handleMouseUp);
  window.addEventListener("keydown", handleKeyDown);

  if (uploadBtn) {
    uploadBtn.addEventListener("click", () => handleSelectImage({ resetCrop: true }));
  }
  if (replaceBtn) {
    replaceBtn.addEventListener("click", () => handleSelectImage({ resetCrop: true, showResetToast: true }));
  }
  if (resetBtn) {
    resetBtn.addEventListener("click", handleResetCrop);
  }
  if (confirmBtn) {
    confirmBtn.addEventListener("click", handleConfirm);
  }
  if (cancelBtn) {
    cancelBtn.addEventListener("click", handleCancel);
  }
  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        close();
      }
    });
  }

  const scaleItem = getValueItem("scale");
  const offsetXItem = getValueItem("offsetX");
  const offsetYItem = getValueItem("offsetY");
  if (scaleItem) {
    scaleItem.addEventListener("dblclick", (event) => {
      event.preventDefault();
      beginEditing("scale");
    });
  }
  if (offsetXItem) {
    offsetXItem.addEventListener("dblclick", (event) => {
      event.preventDefault();
      beginEditing("offsetX");
    });
  }
  if (offsetYItem) {
    offsetYItem.addEventListener("dblclick", (event) => {
      event.preventDefault();
      beginEditing("offsetY");
    });
  }

  function bindInput(input, field) {
    if (!input) return;
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        stopEditing({ commit: true });
      } else if (event.key === "Escape") {
        event.preventDefault();
        stopEditing({ commit: false });
      }
    });
    input.addEventListener("blur", () => {
      if (isEditing(field)) {
        stopEditing({ commit: true });
      }
    });
  }

  bindInput(scaleInput, "scale");
  bindInput(offsetXInput, "offsetX");
  bindInput(offsetYInput, "offsetY");

  return { open, close };
}
