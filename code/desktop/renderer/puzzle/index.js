import {
  AppState,
  createDefaultMultiFolderConfig,
  createDefaultSlot,
  createDefaultText,
  createDefaultImage,
  createPuzzle,
  DEFAULT_CANVAS_SIZE,
  MAX_PUZZLES,
  MULTI_FOLDER_SUBMODE_PER_PUZZLE,
  MULTI_FOLDER_SUBMODE_SUBFOLDER
} from "./state.js";
import { getPuzzleElements } from "./ui-bindings.js";
import { buildTaskQueue, calculateEstimateCount } from "./generation-engine.js";
import { loadTemplates, saveTemplates, buildTemplate, applyTemplate, duplicateTemplate, serializeState } from "./template-manager.js";
import { createCanvasEditor } from "./canvas-editor.js";
import { drawSlots, drawHandles, getHandleAtPoint as getSlotHandleAtPoint, isPointInSlot, HANDLE_SIZE } from "./slot-renderer.js";
import { drawPreview } from "./preview-mode.js";
import { SHADOW_PIPELINE_VERSION } from "../../shared/puzzle-render-spec.mjs";
import { drawText, drawTextSelection, getTextLayout, TEXT_HANDLE_SIZE, TEXT_ROTATE_HANDLE_OFFSET } from "./text-renderer.js";
import { createTextEditor } from "./text-editor.js";
import { createImageEditor } from "./image-editor.js";
import { createSelectionController } from "./selection-controller.js";
import { ensureFontLoaded, getFontFamilies, loadSystemFonts } from "./font-loader.js";
import { createColorPicker } from "./color-picker.js";
import { createCustomSelect } from "./custom-select.js";
import { createCropEditor } from "./crop-editor.js";

const elements = getPuzzleElements();
const ctx = elements.canvas.getContext("2d");

// 颜色选择器实例
let bgColorPicker = null;
let slotBorderColorPicker = null;
let textColorPicker = null;
let textStrokeColorPicker = null;
let textShadowColorPicker = null;

// 自定义下拉选择器实例
let templateSelectInstance = null;
let scaleSelectInstance = null;
let textFontSelectInstance = null;
let textWeightSelectInstance = null;
let templateModalMode = "create";

const backgroundCache = new Map();
const imageCache = new Map();
const clipboardSlots = [];
const clipboardTexts = [];
const clipboardImages = [];
const SAME_PAGE_PASTE_OFFSET = 20;
let localClipboardSourceSignature = null;
let pasteShortcutRunning = false;
let lastCanvasPointerWorld = null;
let templates = [];
let templateWorkingSets = {};
let renderScheduled = false;
let previewRenderToken = 0;
let previewRenderRunning = false;
let previewRenderPending = false;
let editor = null;
let textEditor = null;
let imageEditor = null;
let selectionController = null;
let textEditInput = null;
let textFontFamilies = [];
let selectionOverlay = null;
let previewView = null;
let editZoomLevel = 1;
let exportPreviewCache = new WeakMap();
let exportPreviewErrorShown = false;
let lastFontCheckSignature = "";
let cropEditor = null;
let tempMultiFolderDraft = null;
let pendingTextEditExitAfterColorPickerHide = false;
let activePropertyDraft = null;
let propertyDraftCaptureBound = false;

const STORAGE_KEY = "puzzle:lastState";
const NO_TEMPLATE_STATE_KEY = "__NO_TEMPLATE__";
const EDIT_ZOOM_MIN = 0.2;
const EDIT_ZOOM_MAX = 3;
const EDIT_ZOOM_STEP = 0.1;
const ZOOM_EPSILON = 0.0001;
const PUZZLE_STAGE_PADDING = 32;
const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".bmp",
  ".gif",
  ".tif",
  ".tiff",
  ".svg",
  ".ico",
  ".jfif",
  ".pjpeg",
  ".pjp",
  ".avif",
  ".apng"
]);
const PUZZLE_CANVAS_MAX_DIMENSION = 8192;
const PUZZLE_CANVAS_MAX_PIXELS = 30 * 1000 * 1000;

let slotMenuVisible = false;
let contextMenuTarget = "slot";

const undoStack = [];
const redoStack = [];
const MAX_UNDO = 50;
let isRestoring = false;

const TEMPLATE_AUTOSAVE_INTERVAL_MS = 10000;
let templateAutoSaveTimer = null;
let templateAutoSaveDirty = false;
let templateAutoSaveSaving = false;
let templateAutoSavePending = false;
let templateAutoSavePromise = null;
let templateAutoSaveLastSignature = "";

function logPuzzle(message) {
  if (!message) return;
  console.log(`拼图模块: ${message}`);
}

function getFileNameFromPath(filePath) {
  if (!filePath) return "";
  const parts = String(filePath).split(/[\\/]/g);
  return parts[parts.length - 1] || filePath;
}

const IMAGE_NAME_SORT_LOCALE = "zh-CN";
const IMAGE_NAME_SORT_OPTIONS = {
  numeric: true,
  sensitivity: "base"
};

function compareImageNameNatural(left, right) {
  return String(left || "").localeCompare(
    String(right || ""),
    IMAGE_NAME_SORT_LOCALE,
    IMAGE_NAME_SORT_OPTIONS
  );
}

function clampPuzzleCanvasSize(width, height) {
  const sourceW = Math.max(1, Math.round(Number(width) || 1));
  const sourceH = Math.max(1, Math.round(Number(height) || 1));
  let nextW = sourceW;
  let nextH = sourceH;
  let adjusted = false;
  let reason = "";

  if (nextW > PUZZLE_CANVAS_MAX_DIMENSION || nextH > PUZZLE_CANVAS_MAX_DIMENSION) {
    const ratio = Math.min(PUZZLE_CANVAS_MAX_DIMENSION / nextW, PUZZLE_CANVAS_MAX_DIMENSION / nextH);
    nextW = Math.max(1, Math.round(nextW * ratio));
    nextH = Math.max(1, Math.round(nextH * ratio));
    adjusted = true;
    reason = "dimension";
  }

  const pixels = nextW * nextH;
  if (pixels > PUZZLE_CANVAS_MAX_PIXELS) {
    const ratio = Math.sqrt(PUZZLE_CANVAS_MAX_PIXELS / pixels);
    nextW = Math.max(1, Math.round(nextW * ratio));
    nextH = Math.max(1, Math.round(nextH * ratio));
    adjusted = true;
    reason = reason ? `${reason}+pixels` : "pixels";
  }

  return {
    w: nextW,
    h: nextH,
    adjusted,
    reason,
    sourceW,
    sourceH
  };
}

function compareImageListItemNatural(a, b) {
  const byName = compareImageNameNatural(a?.name, b?.name);
  if (byName !== 0) return byName;
  // Keep duplicate names stable by falling back to path.
  return compareImageNameNatural(a?.path, b?.path);
}

function isImagePath(filePath) {
  if (!filePath) return false;
  const name = getFileNameFromPath(filePath);
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex < 0) return false;
  const ext = name.slice(dotIndex).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

function normalizeCrop(crop) {
  if (!crop) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }
  return {
    scale: Number.isFinite(crop.scale) ? crop.scale : 1,
    offsetX: Number.isFinite(crop.offsetX) ? crop.offsetX : 0,
    offsetY: Number.isFinite(crop.offsetY) ? crop.offsetY : 0
  };
}

function formatCropSummary(crop) {
  if (!crop) return "";
  const scale = Number.isFinite(crop.scale) ? crop.scale : 1;
  const offsetX = Number.isFinite(crop.offsetX) ? crop.offsetX : 0;
  const offsetY = Number.isFinite(crop.offsetY) ? crop.offsetY : 0;
  return `${scale.toFixed(2)}x, ${offsetX.toFixed(2)}%, ${offsetY.toFixed(2)}%`;
}

function getDefaultTemplateName() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `模板_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function getCurrentPuzzle() {
  return AppState.puzzles[AppState.currentPuzzleIndex];
}

function getCurrentPuzzleSourceMeta(puzzle = getCurrentPuzzle()) {
  return {
    sourcePuzzleId: puzzle?.id || "",
    sourcePuzzleIndex: AppState.currentPuzzleIndex
  };
}

function isUniquePuzzleId(puzzleId) {
  if (!puzzleId) return false;
  return AppState.puzzles.filter((puzzle) => puzzle?.id === puzzleId).length === 1;
}

function getPasteOffsetForClipboard(items) {
  const source = Array.isArray(items) ? items.find(Boolean) : null;
  if (!source) return 0;
  const puzzle = getCurrentPuzzle();
  if (source.sourcePuzzleId) {
    if (source.sourcePuzzleId !== puzzle?.id) return 0;
    if (isUniquePuzzleId(source.sourcePuzzleId)) return SAME_PAGE_PASTE_OFFSET;
    if (Number.isFinite(source.sourcePuzzleIndex)) {
      return source.sourcePuzzleIndex === AppState.currentPuzzleIndex ? SAME_PAGE_PASTE_OFFSET : 0;
    }
    return SAME_PAGE_PASTE_OFFSET;
  }
  if (Number.isFinite(source.sourcePuzzleIndex)) {
    return source.sourcePuzzleIndex === AppState.currentPuzzleIndex ? SAME_PAGE_PASTE_OFFSET : 0;
  }
  return SAME_PAGE_PASTE_OFFSET;
}

function hasLocalClipboardItems() {
  return !!(clipboardSlots.length || clipboardTexts.length || clipboardImages.length);
}

function clearLocalClipboardItems() {
  clipboardSlots.length = 0;
  clipboardTexts.length = 0;
  clipboardImages.length = 0;
  localClipboardSourceSignature = null;
}

function getRenderableClipboardSignature(summary) {
  if (!summary?.ok) return "";
  if (!summary.hasImage && !summary.hasText) return "";
  return summary.signature || "";
}

async function getSystemClipboardSummary() {
  if (!window.appApi?.getClipboardSummary) return null;
  try {
    return await window.appApi.getClipboardSummary();
  } catch (error) {
    logPuzzle(`剪贴板摘要读取失败: ${error?.message || error}`);
    return null;
  }
}

function rememberLocalClipboardSource() {
  localClipboardSourceSignature = null;
  void getSystemClipboardSummary().then((summary) => {
    if (!hasLocalClipboardItems()) return;
    localClipboardSourceSignature = summary?.ok ? (summary.signature || "") : null;
  });
}

function shouldPasteSystemClipboard(summary, hasLocalClipboard) {
  const signature = getRenderableClipboardSignature(summary);
  if (!signature) return false;
  if (!hasLocalClipboard) return true;
  if (localClipboardSourceSignature === null) return false;
  return signature !== localClipboardSourceSignature;
}

function isWorldPointInsidePuzzleCanvas(point, puzzle = getCurrentPuzzle()) {
  if (!point || !puzzle?.canvasSize) return false;
  return (
    point.x >= 0 &&
    point.y >= 0 &&
    point.x <= puzzle.canvasSize.w &&
    point.y <= puzzle.canvasSize.h
  );
}

function updateLastCanvasPointer(event) {
  if (AppState.mode !== "edit" || !editor || !elements.canvas) {
    lastCanvasPointerWorld = null;
    return;
  }
  const puzzle = getCurrentPuzzle();
  if (!puzzle) {
    lastCanvasPointerWorld = null;
    return;
  }
  const rect = elements.canvas.getBoundingClientRect();
  const screenPoint = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
  const worldPoint = editor.toWorld(screenPoint);
  lastCanvasPointerWorld = isWorldPointInsidePuzzleCanvas(worldPoint, puzzle)
    ? worldPoint
    : null;
}

function clearLastCanvasPointer() {
  lastCanvasPointerWorld = null;
}

function getClipboardPastePosition(puzzle, width, height) {
  const safeWidth = Math.max(1, Math.round(Number(width) || 1));
  const safeHeight = Math.max(1, Math.round(Number(height) || 1));
  const maxX = Math.max(0, Math.round((puzzle?.canvasSize?.w || 1) - safeWidth));
  const maxY = Math.max(0, Math.round((puzzle?.canvasSize?.h || 1) - safeHeight));
  const anchor = isWorldPointInsidePuzzleCanvas(lastCanvasPointerWorld, puzzle)
    ? lastCanvasPointerWorld
    : {
      x: (puzzle?.canvasSize?.w || safeWidth) / 2,
      y: (puzzle?.canvasSize?.h || safeHeight) / 2
    };
  return {
    x: clamp(Math.round(anchor.x - safeWidth / 2), 0, maxX),
    y: clamp(Math.round(anchor.y - safeHeight / 2), 0, maxY)
  };
}

function getSelectionSnapshotForType(type, puzzle = getCurrentPuzzle()) {
  if (!puzzle) return [];
  if (type === "slot") {
    const valid = new Set((puzzle.slots || []).map((slot) => slot.id));
    const result = [];
    AppState.selectedSlotIds.forEach((id) => {
      if (!valid.has(id) || result.includes(id)) return;
      result.push(id);
    });
    return result;
  }
  if (type === "text") {
    const valid = new Set((puzzle.texts || []).map((text) => text.id));
    const result = [];
    AppState.selectedTextIds.forEach((id) => {
      if (!valid.has(id) || result.includes(id)) return;
      result.push(id);
    });
    return result;
  }
  if (type === "image") {
    const valid = new Set((puzzle.images || []).map((image) => image.id));
    const result = [];
    AppState.selectedImageIds.forEach((id) => {
      if (!valid.has(id) || result.includes(id)) return;
      result.push(id);
    });
    return result;
  }
  return [];
}

function resolveTargetIdsByType(type, targetIds, puzzle = getCurrentPuzzle()) {
  const fallback = getSelectionSnapshotForType(type, puzzle);
  if (!Array.isArray(targetIds)) return fallback;
  const valid = new Set(
    type === "slot"
      ? (puzzle?.slots || []).map((slot) => slot.id)
      : type === "text"
        ? (puzzle?.texts || []).map((text) => text.id)
        : type === "image"
          ? (puzzle?.images || []).map((image) => image.id)
          : []
  );
  const result = [];
  targetIds.forEach((id) => {
    if (!valid.has(id) || result.includes(id)) return;
    result.push(id);
  });
  return result;
}

function commitPropertyDraft(draft, reason = "manual") {
  if (!draft || !draft.input || !draft.dirty) return false;
  const rawValue = draft.input.value;
  const value = draft.parseValue(rawValue, draft);
  const applied = draft.applyValue(value, {
    reason,
    rawValue,
    targetIds: draft.targetIds,
    input: draft.input
  });
  draft.initialRaw = draft.input.value;
  draft.dirty = false;
  return !!applied;
}

function commitActivePropertyDraft(reason = "manual", clearActive = false) {
  if (!activePropertyDraft) return false;
  const applied = commitPropertyDraft(activePropertyDraft, reason);
  if (clearActive) {
    activePropertyDraft = null;
  }
  return applied;
}

function handlePropertyDraftPointerDown(event) {
  if (!activePropertyDraft) return;
  const input = activePropertyDraft.input;
  if (!input || !input.isConnected) {
    activePropertyDraft = null;
    return;
  }
  const target = event.target;
  if (!target) return;
  if (target === input) return;
  if (typeof input.contains === "function" && input.contains(target)) return;
  commitActivePropertyDraft("pointerdown", true);
}

function ensurePropertyDraftCaptureListener() {
  if (propertyDraftCaptureBound) return;
  document.addEventListener("pointerdown", handlePropertyDraftPointerDown, true);
  propertyDraftCaptureBound = true;
}

function bindNumberPropertyDraft(options = {}) {
  const {
    input,
    targetType,
    parseValue = (raw) => Number(raw),
    applyValue
  } = options;
  if (!input || typeof applyValue !== "function") return;
  const draft = {
    input,
    targetType,
    parseValue,
    applyValue,
    targetIds: [],
    initialRaw: "",
    dirty: false
  };
  input.addEventListener("focus", () => {
    if (activePropertyDraft && activePropertyDraft !== draft) {
      commitPropertyDraft(activePropertyDraft, "focus-switch");
      activePropertyDraft = null;
    }
    draft.targetIds = getSelectionSnapshotForType(targetType);
    draft.initialRaw = input.value;
    draft.dirty = false;
    activePropertyDraft = draft;
  });
  input.addEventListener("input", () => {
    if (activePropertyDraft !== draft) return;
    draft.dirty = input.value !== draft.initialRaw;
  });
  input.addEventListener("change", () => {
    if (activePropertyDraft !== draft) return;
    commitPropertyDraft(draft, "change");
  });
  input.addEventListener("blur", () => {
    setTimeout(() => {
      if (activePropertyDraft !== draft) return;
      commitPropertyDraft(draft, "blur");
      activePropertyDraft = null;
    }, 0);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (activePropertyDraft === draft) {
        commitPropertyDraft(draft, "enter");
      }
      input.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (activePropertyDraft === draft) {
        input.value = draft.initialRaw;
        draft.dirty = false;
      }
      input.blur();
    }
  });
}

function hasLiveTextEditInput() {
  return !!(textEditInput && textEditInput.isConnected);
}

function isTextEditSessionActive() {
  return !!AppState.editingTextId && hasLiveTextEditInput();
}

function reconcileTextEditState() {
  if (AppState.editingTextId) {
    const puzzle = getCurrentPuzzle();
    const hasTargetText = !!(puzzle && (puzzle.texts || []).some((item) => item.id === AppState.editingTextId));
    if (!hasTargetText) {
      AppState.editingTextId = null;
    }
  }
  if (AppState.editingTextId && !hasLiveTextEditInput()) {
    AppState.editingTextId = null;
  }
  if (!AppState.editingTextId && hasLiveTextEditInput()) {
    closeTextEditor();
  }
  return isTextEditSessionActive();
}

function isTextEditFocusContext(target) {
  if (!target || typeof target.closest !== "function") return false;
  if (target === textEditInput) return true;
  if (textEditInput && textEditInput.contains(target)) return true;
  if (elements.textPanel && elements.textPanel.contains(target)) return true;
  if (elements.propertiesPanel && elements.propertiesPanel.contains(target)) return true;
  const colorPopover = document.querySelector(".puzzle-color-popover");
  if (colorPopover && colorPopover.contains(target)) return true;
  return false;
}

function isColorPickerPopoverOpen() {
  const colorPopover = document.querySelector(".puzzle-color-popover");
  if (!colorPopover) return false;
  return window.getComputedStyle(colorPopover).display !== "none";
}

function queueTextEditExitAfterColorPickerHide() {
  if (pendingTextEditExitAfterColorPickerHide) return;
  pendingTextEditExitAfterColorPickerHide = true;
  const onClose = () => {
    pendingTextEditExitAfterColorPickerHide = false;
    if (!reconcileTextEditState()) return;
    if (document.hidden || !document.hasFocus()) return;
    if (isTextEditFocusContext(document.activeElement)) return;
    exitTextEditMode();
    updatePropertiesPanel();
    scheduleRender();
  };
  document.addEventListener("puzzle-color-picker:hide", onClose, { once: true });
}

function restoreTextEditorFocusIfNeeded() {
  if (!reconcileTextEditState()) return;
  if (document.hidden || !document.hasFocus() || !textEditInput) return;
  const active = document.activeElement;
  const isNeutralFocus = !active || active === document.body || active === document.documentElement;
  if (!isNeutralFocus) return;
  textEditInput.focus({ preventScroll: true });
}

function handleWindowFocus() {
  restoreTextEditorFocusIfNeeded();
}

function handleWindowBlur() {
  reconcileTextEditState();
}

function handleVisibilityChange() {
  if (document.hidden) {
    reconcileTextEditState();
    void flushTemplateAutoSave("visibility-hidden");
    return;
  }
  restoreTextEditorFocusIfNeeded();
}

function clearSelections() {
  AppState.selectedSlotIds = [];
  AppState.selectedTextIds = [];
  AppState.selectedImageIds = [];
  setSelectionOverlay(null);
  exitTextEditMode();
}

function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    render();
  });
}

function cancelPreviewRender() {
  previewRenderToken += 1;
  previewRenderPending = false;
}

function queuePreviewRender() {
  previewRenderPending = true;
  if (previewRenderRunning) {
    // Invalidate current in-flight preview so latest request can take over.
    previewRenderToken += 1;
    return;
  }
  previewRenderRunning = true;
  void (async () => {
    while (previewRenderPending && AppState.mode === "preview") {
      previewRenderPending = false;
      const token = ++previewRenderToken;
      await renderPreviewMode(token);
    }
  })()
    .catch((error) => {
      console.error("拼图预览渲染失败", error);
    })
    .finally(() => {
      previewRenderRunning = false;
      if (previewRenderPending && AppState.mode === "preview") {
        queuePreviewRender();
      }
    });
}

function setSelectionOverlay(next) {
  selectionOverlay = next;
  updateStageSelectionOverlay(next?.stageOverlay || null);
  scheduleRender();
}

function formatStageSelectionPoint(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return `${x.toFixed(1)} ${y.toFixed(1)}`;
}

function buildStageSelectionPath(overlay) {
  if (!overlay) return "";
  if (overlay.type === "rect" && overlay.rect) {
    const x = Number(overlay.rect.x);
    const y = Number(overlay.rect.y);
    const w = Number(overlay.rect.w);
    const h = Number(overlay.rect.h);
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return "";
    return `M ${x.toFixed(1)} ${y.toFixed(1)} H ${(x + w).toFixed(1)} V ${(y + h).toFixed(1)} H ${x.toFixed(1)} Z`;
  }
  if (overlay.type === "lasso" && Array.isArray(overlay.points) && overlay.points.length >= 2) {
    const points = overlay.points
      .map(formatStageSelectionPoint)
      .filter(Boolean);
    if (points.length < 2) return "";
    return `M ${points[0]} L ${points.slice(1).join(" L ")} Z`;
  }
  return "";
}

function updateStageSelectionOverlay(overlay) {
  const overlayEl = elements.stageSelectionOverlay;
  const pathEl = elements.stageSelectionPath;
  if (!overlayEl || !pathEl) return;
  const content = getStageContentElement();
  const overlayWidth = content?.offsetWidth || content?.clientWidth;
  const overlayHeight = content?.offsetHeight || content?.clientHeight;
  if (Number.isFinite(overlayWidth) && Number.isFinite(overlayHeight) && overlayWidth > 0 && overlayHeight > 0) {
    overlayEl.setAttribute("viewBox", `0 0 ${overlayWidth.toFixed(1)} ${overlayHeight.toFixed(1)}`);
  }
  const path = buildStageSelectionPath(overlay);
  if (!path) {
    overlayEl.classList.remove("show", "is-text");
    pathEl.removeAttribute("d");
    return;
  }
  overlayEl.classList.toggle("is-text", overlay.target === "text");
  overlayEl.classList.add("show");
  pathEl.setAttribute("d", path);
}

function drawSelectionOverlay(ctx, overlay) {
  if (!overlay || overlay.stageOverlay) return;
  const isText = overlay.target === "text";
  const stroke = isText ? "#f97316" : "#3b82f6";
  const fill = isText ? "rgba(249, 115, 22, 0.12)" : "rgba(59, 130, 246, 0.12)";
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  if (overlay.type === "rect" && overlay.rect) {
    const { x, y, w, h } = overlay.rect;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  } else if (overlay.type === "lasso" && Array.isArray(overlay.points)) {
    const points = overlay.points;
    if (points.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

function getFitScale(canvasWidth, canvasHeight, contentWidth, contentHeight) {
  if (!Number.isFinite(canvasWidth) || !Number.isFinite(canvasHeight)) return null;
  if (!Number.isFinite(contentWidth) || !Number.isFinite(contentHeight)) return null;
  if (canvasWidth <= 0 || canvasHeight <= 0 || contentWidth <= 0 || contentHeight <= 0) {
    return null;
  }
  return Math.min(canvasWidth / contentWidth, canvasHeight / contentHeight);
}

function getStageElement() {
  return elements.stage || elements.canvasWrapper?.parentElement || elements.canvasWrapper;
}

function getStageViewportElement() {
  return elements.stageScroll || getStageElement();
}

function getStageContentElement() {
  return elements.stageContent || getStageViewportElement();
}

function getStageRect() {
  const stage = getStageViewportElement();
  if (!stage?.getBoundingClientRect) return null;
  const rect = stage.getBoundingClientRect();
  const width = stage.clientWidth || rect.width;
  const height = stage.clientHeight || rect.height;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;
  return { ...rect, width, height };
}

function normalizeCanvasSize(size) {
  if (!size) return null;
  const w = Math.max(1, Math.round(Number(size?.w) || 1));
  const h = Math.max(1, Math.round(Number(size?.h) || 1));
  return { w, h };
}

function getActiveCanvasSize() {
  if (AppState.mode === "preview") {
    const task = AppState.taskQueue?.[AppState.previewIndex];
    return task?.canvasSize ? normalizeCanvasSize(task.canvasSize) : null;
  }
  const puzzle = getCurrentPuzzle();
  return puzzle?.canvasSize ? normalizeCanvasSize(puzzle.canvasSize) : null;
}

function getStageAvailableSize() {
  const rect = getStageRect();
  if (!rect) return null;
  const padding = Math.min(
    PUZZLE_STAGE_PADDING,
    Math.max(0, Math.floor(Math.min(rect.width, rect.height) / 6))
  );
  return {
    width: Math.max(1, rect.width - padding * 2),
    height: Math.max(1, rect.height - padding * 2),
    stageWidth: rect.width,
    stageHeight: rect.height,
    padding
  };
}

function getStageScrollSnapshot() {
  const viewport = getStageViewportElement();
  if (!viewport) return null;
  const scrollWidth = Math.max(1, viewport.scrollWidth || viewport.clientWidth || 1);
  const scrollHeight = Math.max(1, viewport.scrollHeight || viewport.clientHeight || 1);
  const clientWidth = Math.max(1, viewport.clientWidth || 1);
  const clientHeight = Math.max(1, viewport.clientHeight || 1);
  const maxScrollLeft = Math.max(0, scrollWidth - clientWidth);
  const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
  return {
    centerRatioX: clamp((viewport.scrollLeft + clientWidth / 2) / scrollWidth, 0, 1),
    centerRatioY: clamp((viewport.scrollTop + clientHeight / 2) / scrollHeight, 0, 1),
    atLeft: viewport.scrollLeft <= 1,
    atTop: viewport.scrollTop <= 1,
    atRight: maxScrollLeft > 0 && viewport.scrollLeft >= maxScrollLeft - 1,
    atBottom: maxScrollTop > 0 && viewport.scrollTop >= maxScrollTop - 1
  };
}

function syncStageScrollAfterLayout(layout, snapshot = null) {
  const viewport = getStageViewportElement();
  if (!viewport) return;
  if (!layout?.scrollable) {
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
    return;
  }
  const ratioX = Number.isFinite(snapshot?.centerRatioX) ? snapshot.centerRatioX : 0.5;
  const ratioY = Number.isFinite(snapshot?.centerRatioY) ? snapshot.centerRatioY : 0.5;
  const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
  const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  if (maxScrollLeft <= 0) {
    viewport.scrollLeft = 0;
  } else if (snapshot?.atLeft) {
    viewport.scrollLeft = 0;
  } else if (snapshot?.atRight) {
    viewport.scrollLeft = maxScrollLeft;
  } else {
    viewport.scrollLeft = clamp(viewport.scrollWidth * ratioX - viewport.clientWidth / 2, 0, maxScrollLeft);
  }
  if (maxScrollTop <= 0) {
    viewport.scrollTop = 0;
  } else if (snapshot?.atTop) {
    viewport.scrollTop = 0;
  } else if (snapshot?.atBottom) {
    viewport.scrollTop = maxScrollTop;
  } else {
    viewport.scrollTop = clamp(viewport.scrollHeight * ratioY - viewport.clientHeight / 2, 0, maxScrollTop);
  }
}

function getStageFitScale(canvasSize = getActiveCanvasSize()) {
  const size = normalizeCanvasSize(canvasSize);
  if (!size) return null;
  const available = getStageAvailableSize();
  if (!available) return null;
  return getFitScale(available.width, available.height, size.w, size.h);
}

function getPreviewBaseScale(task) {
  if (!task?.canvasSize) return null;
  return getStageFitScale(task.canvasSize);
}

function getPreviewZoomRatio(task) {
  const current = Number(previewView?.zoomRatio);
  if (Number.isFinite(current) && current > 0) {
    return normalizeEditorZoom(current);
  }
  const baseScale = getPreviewBaseScale(task);
  const currentScale = Number(previewView?.scale);
  if (baseScale && Number.isFinite(currentScale) && currentScale > 0) {
    return normalizeEditorZoom(currentScale / baseScale);
  }
  return 1;
}

function layoutCanvasInStage(options = {}) {
  if (!elements.canvasWrapper) return null;
  const canvasSize = normalizeCanvasSize(options.canvasSize || getActiveCanvasSize());
  if (!canvasSize) return null;
  const available = getStageAvailableSize();
  if (!available) return null;
  const fitScale = getFitScale(available.width, available.height, canvasSize.w, canvasSize.h);
  if (!fitScale) return null;
  const zoomRatio = normalizeEditorZoom(options.zoomRatio ?? (
    AppState.mode === "preview"
      ? getPreviewZoomRatio(AppState.taskQueue?.[AppState.previewIndex])
      : editZoomLevel
  ));
  const scale = Math.max(0.0001, fitScale * zoomRatio);
  const width = Math.max(1, Math.round(canvasSize.w * scale));
  const height = Math.max(1, Math.round(canvasSize.h * scale));
  const zoomed = zoomRatio > 1 + ZOOM_EPSILON;
  const scrollableX = zoomed && width + available.padding * 2 > available.stageWidth;
  const scrollableY = zoomed && height + available.padding * 2 > available.stageHeight;
  const scrollable = scrollableX || scrollableY;
  const contentWidth = scrollableX ? width + available.padding * 2 : available.stageWidth;
  const contentHeight = scrollableY ? height + available.padding * 2 : available.stageHeight;
  const left = scrollableX ? available.padding : Math.round((contentWidth - width) / 2);
  const top = scrollableY ? available.padding : Math.round((contentHeight - height) / 2);
  const content = getStageContentElement();
  if (content) {
    const contentStyles = {
      width: `${Math.round(contentWidth)}px`,
      height: `${Math.round(contentHeight)}px`,
      minWidth: "100%",
      minHeight: "100%"
    };
    Object.entries(contentStyles).forEach(([key, value]) => {
      if (content.style[key] !== value) {
        content.style[key] = value;
      }
    });
  }
  const viewport = getStageViewportElement();
  if (viewport?.classList) {
    viewport.classList.toggle("is-scrollable", scrollable);
  }
  const styles = {
    width: `${width}px`,
    height: `${height}px`,
    left: `${left}px`,
    top: `${top}px`,
    minHeight: "0px",
    marginLeft: "0px",
    marginRight: "0px"
  };
  let changed = false;
  Object.entries(styles).forEach(([key, value]) => {
    if (elements.canvasWrapper.style[key] !== value) {
      elements.canvasWrapper.style[key] = value;
      changed = true;
    }
  });
  return {
    changed,
    canvasSize,
    fitScale,
    zoomRatio,
    scale,
    width,
    height,
    left,
    top,
    scrollable,
    contentWidth,
    contentHeight
  };
}

function applyCanvasBackingSize(layout) {
  if (!layout || !elements.canvas) return false;
  const nextWidth = Math.max(1, Math.floor(layout.width));
  const nextHeight = Math.max(1, Math.floor(layout.height));
  let changed = false;
  if (elements.canvas.width !== nextWidth) {
    elements.canvas.width = nextWidth;
    changed = true;
  }
  if (elements.canvas.height !== nextHeight) {
    elements.canvas.height = nextHeight;
    changed = true;
  }
  return changed;
}

function centerEditorView(layout = null) {
  if (!editor) return null;
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return null;
  const resolvedLayout = layout || layoutCanvasInStage({
    canvasSize: puzzle.canvasSize,
    zoomRatio: editZoomLevel
  });
  if (!resolvedLayout) return null;
  editor.setView({
    scale: resolvedLayout.scale,
    offsetX: 0,
    offsetY: 0
  });
  return resolvedLayout;
}

function centerPreviewView(layout = null) {
  const task = AppState.taskQueue?.[AppState.previewIndex];
  if (!task) return null;
  const resolvedLayout = layout || layoutCanvasInStage({
    canvasSize: task.canvasSize,
    zoomRatio: getPreviewZoomRatio(task)
  });
  if (!resolvedLayout) return null;
  previewView = {
    scale: resolvedLayout.scale,
    offsetX: 0,
    offsetY: 0,
    zoomRatio: resolvedLayout.zoomRatio
  };
  return previewView;
}

function ensurePreviewView(task) {
  if (!task) return null;
  const zoomRatio = getPreviewZoomRatio(task);
  const layout = layoutCanvasInStage({ canvasSize: task.canvasSize, zoomRatio });
  if (!layout) {
    if (previewView && Number.isFinite(previewView.scale)) {
      return previewView;
    }
    return null;
  }
  applyCanvasBackingSize(layout);
  if (
    previewView
    && Number.isFinite(previewView.scale)
    && Math.abs(previewView.scale - layout.scale) <= ZOOM_EPSILON
    && Math.abs((previewView.zoomRatio || 1) - layout.zoomRatio) <= ZOOM_EPSILON
  ) {
    return previewView;
  }
  return centerPreviewView(layout);
}

function resetPreviewView() {
  previewView = null;
}

function normalizePreviewMode(mode) {
  if (typeof mode === "string") {
    const normalized = mode.trim().toLowerCase();
    if (
      normalized === "export"
      || normalized === "precise"
      || normalized === "accurate"
    ) {
      return "export";
    }
  }
  return "fast";
}

function getPreviewModeLabel(mode) {
  return normalizePreviewMode(mode) === "export" ? "精确预览" : "快速预览";
}

function resetExportPreviewCache() {
  exportPreviewCache = new WeakMap();
  exportPreviewErrorShown = false;
}

function getFontCheckSignature(fontCheck) {
  if (!fontCheck || typeof fontCheck !== "object") return "";
  return [
    Number(fontCheck.checked) || 0,
    Number(fontCheck.replaced) || 0,
    Number(fontCheck.fallbackToSans) || 0,
    Number(fontCheck.warningCount) || 0
  ].join("|");
}

function reportFontCheckDiagnostics(source, fontCheck) {
  if (!fontCheck || typeof fontCheck !== "object") return;
  const signature = `${source}:${getFontCheckSignature(fontCheck)}`;
  if (signature && signature === lastFontCheckSignature) return;
  lastFontCheckSignature = signature;
  const checked = Number(fontCheck.checked) || 0;
  const replaced = Number(fontCheck.replaced) || 0;
  const fallbackToSans = Number(fontCheck.fallbackToSans) || 0;
  logPuzzle(`[${source}] 字体检查: checked=${checked} replaced=${replaced} sansFallback=${fallbackToSans}`);
  if (replaced > 0) {
    const detail = Array.isArray(fontCheck.replacementDetails)
      ? fontCheck.replacementDetails.slice(0, 3).join(" | ")
      : "";
    setStatus(
      `字体替换提示：${replaced}/${checked} 组样式回退${detail ? `（${detail}）` : ""}`
    );
  }
}

function updatePreviewScaleMeta(task) {
  if (!elements.previewScaleMeta) return;
  if (AppState.mode !== "preview") {
    elements.previewScaleMeta.textContent = "";
    return;
  }
  const targetTask = task || AppState.taskQueue?.[AppState.previewIndex];
  if (!targetTask) {
    elements.previewScaleMeta.textContent = "";
    return;
  }
  const baseScale = getPreviewBaseScale(targetTask);
  const view = ensurePreviewView(targetTask);
  const modeLabel = getPreviewModeLabel(AppState.previewMode);
  if (!baseScale || !view) {
    elements.previewScaleMeta.textContent = modeLabel;
    return;
  }
  const viewScale = Number(view.scale) || 0;
  elements.previewScaleMeta.textContent =
    `${modeLabel} · 视图${viewScale.toFixed(3)} · 基准${baseScale.toFixed(3)}`;
}

async function loadImageFromBase64(base64) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `data:image/png;base64,${base64}`;
  });
}

async function getExportPreviewRender(task, shouldAbort = null) {
  if (!task) return null;
  if (normalizePreviewMode(AppState.previewMode) === "export") {
    // use export-pipeline preview branch
  } else {
    return null;
  }
  if (!window.appApi?.renderPuzzleExportPreview) return null;
  const isAborted = typeof shouldAbort === "function" ? shouldAbort : () => false;
  const outputScale = Number(AppState.outputScale) || 1;
  const shadowPipelineVersion = SHADOW_PIPELINE_VERSION;
  const cached = exportPreviewCache.get(task);
  const cacheMatched =
    cached &&
    cached.outputScale === outputScale &&
    cached.shadowPipelineVersion === shadowPipelineVersion;
  if (cacheMatched && cached.image) {
    return cached;
  }
  if (cacheMatched && cached.promise) {
    return cached.promise;
  }
  const promise = (async () => {
    const result = await window.appApi.renderPuzzleExportPreview({
      task,
      outputScale,
      shadowPipelineVersion
    });
    if (isAborted()) return null;
    if (!result?.ok || !result.imageBase64) {
      if (!exportPreviewErrorShown) {
        exportPreviewErrorShown = true;
        const reason = result?.error || "导出同源预览生成失败";
        setStatus(`精确预览不可用：${reason}`);
        logPuzzle(`精确预览失败: ${reason}`);
      }
      return null;
    }
    const image = await loadImageFromBase64(result.imageBase64);
    if (!image) {
      if (!exportPreviewErrorShown) {
        exportPreviewErrorShown = true;
        setStatus("精确预览解码失败");
        logPuzzle("精确预览解码失败");
      }
      return null;
    }
    if (result.fontCheck) {
      reportFontCheckDiagnostics("精确预览", result.fontCheck);
    }
    const entry = {
      outputScale,
      shadowPipelineVersion,
      image,
      width: Number(result.width) || image.width || 0,
      height: Number(result.height) || image.height || 0,
      fontCheck: result.fontCheck || null
    };
    exportPreviewCache.set(task, entry);
    return entry;
  })();
  exportPreviewCache.set(task, {
    outputScale,
    shadowPipelineVersion,
    promise
  });
  const resolved = await promise;
  if (!resolved) {
    exportPreviewCache.delete(task);
  }
  return resolved;
}

function renderExportPreviewImage(ctx, task, image, view = null) {
  if (!task || !image) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();

  let scale = view?.scale;
  let offsetX = view?.offsetX;
  let offsetY = view?.offsetY;
  if (!scale || !Number.isFinite(scale)) {
    scale = Math.min(ctx.canvas.width / task.canvasSize.w, ctx.canvas.height / task.canvasSize.h);
  }
  if (!Number.isFinite(offsetX) || !Number.isFinite(offsetY)) {
    offsetX = (ctx.canvas.width - task.canvasSize.w * scale) / 2;
    offsetY = (ctx.canvas.height - task.canvasSize.h * scale) / 2;
  }

  ctx.save();
  try {
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    ctx.drawImage(image, 0, 0, task.canvasSize.w, task.canvasSize.h);
  } finally {
    ctx.restore();
  }
}

function updatePreviewZoomLabel() {
  if (!elements.zoomLabel) return;
  const task = AppState.taskQueue?.[AppState.previewIndex];
  const baseScale = getPreviewBaseScale(task);
  if (!baseScale) {
    elements.zoomLabel.textContent = "100%";
    updatePreviewScaleMeta(task);
    updateZoomButtonState();
    return;
  }
  const view = ensurePreviewView(task);
  if (!view) {
    elements.zoomLabel.textContent = "100%";
    updatePreviewScaleMeta(task);
    updateZoomButtonState();
    return;
  }
  const ratio = view.scale / baseScale;
  elements.zoomLabel.textContent = `${Math.round(ratio * 100)}%`;
  updatePreviewScaleMeta(task);
  updateZoomButtonState();
}

function setPreviewScaleAt(scale, anchor) {
  setPreviewScaleCentered(scale);
}

function setPreviewScaleCentered(scale) {
  const task = AppState.taskQueue?.[AppState.previewIndex];
  const baseScale = getPreviewBaseScale(task);
  if (!task || !baseScale) return;
  const scrollSnapshot = getStageScrollSnapshot();
  const zoomRatio = normalizeEditorZoom(scale / baseScale);
  const layout = layoutCanvasInStage({
    canvasSize: task.canvasSize,
    zoomRatio
  });
  if (!layout) return;
  applyCanvasBackingSize(layout);
  centerPreviewView(layout);
  syncStageScrollAfterLayout(layout, scrollSnapshot);
}

function getSlotGroupBounds(puzzle) {
  const selected = puzzle.slots.filter((slot) => AppState.selectedSlotIds.includes(slot.id));
  if (selected.length < 2) return null;
  const minX = Math.min(...selected.map((slot) => slot.x));
  const minY = Math.min(...selected.map((slot) => slot.y));
  const maxX = Math.max(...selected.map((slot) => slot.x + slot.w));
  const maxY = Math.max(...selected.map((slot) => slot.y + slot.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function getTextGroupBounds(puzzle) {
  const selected = (puzzle.texts || []).filter((text) => AppState.selectedTextIds.includes(text.id));
  if (selected.length < 2) return null;
  const bounds = selected.map((text) => {
    const layout = getTextLayout(ctx, text);
    const width = layout.width;
    const height = layout.height;
    const rotation = (Number(text.rotation) || 0) * (Math.PI / 180);
    const center = {
      x: (text.x || 0) + width / 2,
      y: (text.y || 0) + height / 2
    };
    const corners = [
      { x: text.x, y: text.y },
      { x: text.x + width, y: text.y },
      { x: text.x + width, y: text.y + height },
      { x: text.x, y: text.y + height }
    ].map((point) => rotatePoint(point, center, rotation));
    const xs = corners.map((point) => point.x);
    const ys = corners.map((point) => point.y);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys)
    };
  });
  const minX = Math.min(...bounds.map((item) => item.minX));
  const minY = Math.min(...bounds.map((item) => item.minY));
  const maxX = Math.max(...bounds.map((item) => item.maxX));
  const maxY = Math.max(...bounds.map((item) => item.maxY));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function getImageCorners(image) {
  const width = Math.max(1, Number(image.width) || 1);
  const height = Math.max(1, Number(image.height) || 1);
  const rotation = (Number(image.rotation) || 0) * (Math.PI / 180);
  const center = {
    x: (image.x || 0) + width / 2,
    y: (image.y || 0) + height / 2
  };
  const corners = [
    { x: image.x, y: image.y },
    { x: image.x + width, y: image.y },
    { x: image.x + width, y: image.y + height },
    { x: image.x, y: image.y + height }
  ].map((point) => rotatePoint(point, center, rotation));
  return corners;
}

function getImageGroupBounds(puzzle) {
  const selected = (puzzle.images || []).filter((image) => AppState.selectedImageIds.includes(image.id));
  if (selected.length < 2) return null;
  const bounds = selected.map((image) => {
    const corners = getImageCorners(image);
    const xs = corners.map((point) => point.x);
    const ys = corners.map((point) => point.y);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys)
    };
  });
  const minX = Math.min(...bounds.map((item) => item.minX));
  const minY = Math.min(...bounds.map((item) => item.minY));
  const maxX = Math.max(...bounds.map((item) => item.maxX));
  const maxY = Math.max(...bounds.map((item) => item.maxY));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function drawGroupHandles(ctx, bounds, color, handleSize) {
  if (!bounds) return;
  const { x, y, w, h } = bounds;
  const half = handleSize / 2;
  const handles = [
    { key: "nw", x, y },
    { key: "ne", x: x + w, y },
    { key: "se", x: x + w, y: y + h },
    { key: "sw", x, y: y + h }
  ];
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = color;
  handles.forEach((handle) => {
    ctx.beginPath();
    ctx.rect(handle.x - half, handle.y - half, handleSize, handleSize);
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
}

function getStageSelectionSnapshot() {
  return {
    slotIds: [...AppState.selectedSlotIds],
    textIds: [...AppState.selectedTextIds],
    imageIds: [...AppState.selectedImageIds]
  };
}

function getStageSelectionTarget(snapshot = getStageSelectionSnapshot()) {
  const groups = [
    ["slot", snapshot.slotIds],
    ["text", snapshot.textIds],
    ["image", snapshot.imageIds]
  ].filter(([, ids]) => Array.isArray(ids) && ids.length > 0);
  return groups.length === 1 ? groups[0][0] : "mixed";
}

function uniqueIds(ids) {
  return Array.from(new Set((Array.isArray(ids) ? ids : []).filter(Boolean)));
}

function mergeSelectionIds(baseIds, selectedIds, append) {
  if (!append) return uniqueIds(selectedIds);
  return uniqueIds([...(baseIds || []), ...(selectedIds || [])]);
}

function rectFromPoints(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);
  return { x, y, w, h };
}

function rectsIntersect(a, b) {
  return (
    a.x <= b.x + b.w &&
    a.x + a.w >= b.x &&
    a.y <= b.y + b.h &&
    a.y + a.h >= b.y
  );
}

function isPointInRect(point, rect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.w &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.h
  );
}

function isPointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 0.00001) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function isPointOnSegment(point, a, b) {
  const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y);
  if (Math.abs(cross) > 0.00001) return false;
  const dot = (point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y);
  if (dot < 0) return false;
  const squaredLength = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  return dot <= squaredLength;
}

function getSegmentOrientation(a, b, c) {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) <= 0.00001) return 0;
  return value > 0 ? 1 : 2;
}

function segmentsIntersect(a, b, c, d) {
  const o1 = getSegmentOrientation(a, b, c);
  const o2 = getSegmentOrientation(a, b, d);
  const o3 = getSegmentOrientation(c, d, a);
  const o4 = getSegmentOrientation(c, d, b);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && isPointOnSegment(c, a, b)) return true;
  if (o2 === 0 && isPointOnSegment(d, a, b)) return true;
  if (o3 === 0 && isPointOnSegment(a, c, d)) return true;
  if (o4 === 0 && isPointOnSegment(b, c, d)) return true;
  return false;
}

function polygonEdges(points) {
  if (!Array.isArray(points) || points.length < 2) return [];
  return points.map((point, index) => ({
    a: point,
    b: points[(index + 1) % points.length]
  }));
}

function polygonsIntersect(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 3 || b.length < 3) return false;
  if (a.some((point) => isPointInPolygon(point, b))) return true;
  if (b.some((point) => isPointInPolygon(point, a))) return true;
  const aEdges = polygonEdges(a);
  const bEdges = polygonEdges(b);
  return aEdges.some((edgeA) =>
    bEdges.some((edgeB) => segmentsIntersect(edgeA.a, edgeA.b, edgeB.a, edgeB.b))
  );
}

function getBoundsFromPoints(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys)
  };
}

function selectionHitsBounds(selection, bounds) {
  if (!selection || !bounds) return false;
  if (selection.type === "rect") {
    return rectsIntersect(selection.rect, bounds);
  }
  const points = Array.isArray(selection.points) ? selection.points : [];
  if (points.length < 3) return false;
  const corners = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.w, y: bounds.y },
    { x: bounds.x + bounds.w, y: bounds.y + bounds.h },
    { x: bounds.x, y: bounds.y + bounds.h }
  ];
  return polygonsIntersect(corners, points);
}

function selectionHitsRotatedElement(selection, corners, center) {
  if (!selection || !Array.isArray(corners) || !corners.length) return false;
  const bounds = getBoundsFromPoints(corners);
  if (selection.type === "rect") {
    return rectsIntersect(selection.rect, bounds) ||
      corners.some((point) => isPointInRect(point, selection.rect)) ||
      isPointInRect(center, selection.rect);
  }
  const points = Array.isArray(selection.points) ? selection.points : [];
  if (points.length < 3) return false;
  return polygonsIntersect(corners, points) ||
    isPointInPolygon(center, points);
}

function getTextCorners(text, layout) {
  const width = layout.width;
  const height = layout.height;
  const rotation = (Number(text.rotation) || 0) * (Math.PI / 180);
  const center = {
    x: (text.x || 0) + width / 2,
    y: (text.y || 0) + height / 2
  };
  const corners = [
    { x: text.x, y: text.y },
    { x: text.x + width, y: text.y },
    { x: text.x + width, y: text.y + height },
    { x: text.x, y: text.y + height }
  ].map((point) => rotatePoint(point, center, rotation));
  return { corners, center };
}

function selectSlotsInArea(puzzle, selection) {
  if (!puzzle || !selection) return [];
  return getSlotsSortedByZOrder(puzzle)
    .filter((slot) => selectionHitsBounds(selection, { x: slot.x, y: slot.y, w: slot.w, h: slot.h }))
    .map((slot) => slot.id);
}

function selectTextsInArea(puzzle, selection) {
  if (!puzzle || !selection) return [];
  return (puzzle.texts || [])
    .filter((text) => {
      const layout = getTextLayout(ctx, text);
      const { corners, center } = getTextCorners(text, layout);
      return selectionHitsRotatedElement(selection, corners, center);
    })
    .map((text) => text.id);
}

function selectImagesInArea(puzzle, selection) {
  if (!puzzle || !selection) return [];
  return (puzzle.images || [])
    .filter((image) => {
      const corners = getImageCorners(image);
      const width = Math.max(1, Number(image.width) || 1);
      const height = Math.max(1, Number(image.height) || 1);
      const center = {
        x: (image.x || 0) + width / 2,
        y: (image.y || 0) + height / 2
      };
      return selectionHitsRotatedElement(selection, corners, center);
    })
    .map((image) => image.id);
}

function applyStageSelection(nextSelection) {
  AppState.selectedSlotIds = uniqueIds(nextSelection?.slotIds);
  AppState.selectedTextIds = uniqueIds(nextSelection?.textIds);
  AppState.selectedImageIds = uniqueIds(nextSelection?.imageIds);
  exitTextEditMode();
  updatePropertiesPanel();
  scheduleRender();
}

function commitStageSelection(event) {
  const base = event?.baseSelection || getStageSelectionSnapshot();
  if (event?.clearOnly) {
    if (!event.append) {
      applyStageSelection({ slotIds: [], textIds: [], imageIds: [] });
    }
    return;
  }
  const puzzle = getCurrentPuzzle();
  if (!puzzle || !event?.selection) return;
  const target = event.target || "mixed";
  const selected = {
    slotIds: target === "slot" || target === "mixed" ? selectSlotsInArea(puzzle, event.selection) : [],
    textIds: target === "text" || target === "mixed" ? selectTextsInArea(puzzle, event.selection) : [],
    imageIds: target === "image" || target === "mixed" ? selectImagesInArea(puzzle, event.selection) : []
  };
  applyStageSelection({
    slotIds: mergeSelectionIds(base.slotIds, selected.slotIds, event.append),
    textIds: mergeSelectionIds(base.textIds, selected.textIds, event.append),
    imageIds: mergeSelectionIds(base.imageIds, selected.imageIds, event.append)
  });
}

function isPointNearHandle(point, handle, size) {
  return Math.abs(point.x - handle.x) <= size && Math.abs(point.y - handle.y) <= size;
}

function isPointOnBoundsCornerHandle(point, bounds, size) {
  if (!bounds) return false;
  const handles = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.w, y: bounds.y },
    { x: bounds.x + bounds.w, y: bounds.y + bounds.h },
    { x: bounds.x, y: bounds.y + bounds.h }
  ];
  return handles.some((handle) => isPointNearHandle(point, handle, size));
}

function isPointOnLocalElementHandle(localPoint) {
  const width = Math.max(1, Number(localPoint?.width) || 1);
  const height = Math.max(1, Number(localPoint?.height) || 1);
  const half = TEXT_HANDLE_SIZE / 2;
  const handles = [
    { x: 0, y: 0 },
    { x: width / 2, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height / 2 },
    { x: width, y: height },
    { x: width / 2, y: height },
    { x: 0, y: height },
    { x: 0, y: height / 2 }
  ];
  if (handles.some((handle) =>
    Math.abs(localPoint.x - handle.x) <= half &&
    Math.abs(localPoint.y - handle.y) <= half
  )) {
    return true;
  }
  const rotateX = width / 2;
  const rotateY = -TEXT_ROTATE_HANDLE_OFFSET;
  return Math.hypot(localPoint.x - rotateX, localPoint.y - rotateY) <= TEXT_HANDLE_SIZE;
}

function isPointOnSelectedControl(worldPoint) {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return false;
  if (AppState.selectedSlotIds.length === 1) {
    const slot = puzzle.slots.find((item) => item.id === AppState.selectedSlotIds[0]);
    if (slot && getSlotHandleAtPoint(worldPoint, slot)) return true;
  } else if (AppState.selectedSlotIds.length > 1) {
    if (isPointOnBoundsCornerHandle(worldPoint, getSlotGroupBounds(puzzle), HANDLE_SIZE)) return true;
  }

  if (AppState.selectedTextIds.length === 1) {
    const text = (puzzle.texts || []).find((item) => item.id === AppState.selectedTextIds[0]);
    if (text) {
      const layout = getTextLayout(ctx, text);
      if (isPointOnLocalElementHandle(toLocalTextPoint(worldPoint, text, layout))) return true;
    }
  } else if (AppState.selectedTextIds.length > 1) {
    if (isPointOnBoundsCornerHandle(worldPoint, getTextGroupBounds(puzzle), TEXT_HANDLE_SIZE)) return true;
  }

  if (AppState.selectedImageIds.length === 1) {
    const image = (puzzle.images || []).find((item) => item.id === AppState.selectedImageIds[0]);
    if (image && isPointOnLocalElementHandle(toLocalImagePoint(worldPoint, image))) return true;
  } else if (AppState.selectedImageIds.length > 1) {
    if (isPointOnBoundsCornerHandle(worldPoint, getImageGroupBounds(puzzle), TEXT_HANDLE_SIZE)) return true;
  }

  return false;
}

function shouldIgnoreStageSelectionEvent(event) {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  return !!target.closest(
    "button,input,select,textarea,.puzzle-slot-menu,.puzzle-preview-bar,.puzzle-preview-zoom,.puzzle-preview-meta,.puzzle-text-edit"
  );
}

function shouldDeferStageSelectionToEditor({ worldPoint }) {
  if (isPointOnSelectedControl(worldPoint)) return true;
  if (getElementAtWorldPoint(worldPoint)) return true;
  return !!getSlotAtWorldPoint(worldPoint);
}

function saveStateToStorage() {
  try {
    saveWorkingSetForTemplate(AppState.currentTemplate);
    const payload = {
      puzzles: AppState.puzzles,
      currentPuzzleIndex: AppState.currentPuzzleIndex,
      images: AppState.images,
      generationMode: AppState.generationMode,
      singleFirstPuzzleOnce: AppState.singleFirstPuzzleOnce === true,
      folderBindings: AppState.folderBindings,
      multiFolderConfig: cloneMultiFolderConfig(AppState.multiFolderConfig),
      outputDir: AppState.outputDir,
      outputScale: AppState.outputScale,
      previewMode: AppState.previewMode,
      outputByPuzzleFolder: AppState.outputByPuzzleFolder,
      shareSameFolderCycleInMultiFolder: AppState.shareSameFolderCycleInMultiFolder,
      currentTemplate: AppState.currentTemplate,
      templateWorkingSets
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    markTemplateDirty();
  } catch (error) {
    // ignore storage errors
  }
}

function cloneSlots(slots) {
  return slots.map((slot) => ({
    id: slot.id,
    x: slot.x,
    y: slot.y,
    w: slot.w,
    h: slot.h,
    layerIndex: slot.layerIndex,
    zOrder: slot.zOrder,
    fillOrder: slot.fillOrder,
    style: {
      borderRadius: slot.style?.borderRadius ?? 0,
      borderWidth: slot.style?.borderWidth ?? 0,
      borderColor: slot.style?.borderColor || "#ffffff",
      shadow: slot.style?.shadow ?? false,
      lockAspect: slot.style?.lockAspect ?? false
    },
    crop: slot.crop ? { ...slot.crop } : null
  }));
}

function cloneTexts(texts) {
  return texts.map((text) => ({
    id: text.id,
    type: text.type,
    content: text.content,
    x: text.x,
    y: text.y,
    width: text.width,
    rotation: text.rotation,
    createdAt: text.createdAt,
    zOrder: text.zOrder,
    style: { ...text.style }
  }));
}

function cloneImages(images) {
  return images.map((image) => ({
    id: image.id,
    type: image.type,
    imagePath: image.imagePath,
    x: image.x,
    y: image.y,
    width: image.width,
    height: image.height,
    rotation: image.rotation,
    aspectRatio: image.aspectRatio,
    createdAt: image.createdAt,
    zOrder: image.zOrder
  }));
}

function buildSnapshot(puzzle) {
  return {
    puzzleId: puzzle.id,
    slots: cloneSlots(puzzle.slots),
    texts: cloneTexts(puzzle.texts || []),
    images: cloneImages(puzzle.images || []),
    selectedSlotIds: [...AppState.selectedSlotIds],
    selectedTextIds: [...AppState.selectedTextIds],
    selectedImageIds: [...AppState.selectedImageIds]
  };
}

function pushUndoState() {
  if (isRestoring) return;
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return;
  const snapshot = buildSnapshot(puzzle);
  undoStack.push(snapshot);
  if (undoStack.length > MAX_UNDO) {
    undoStack.shift();
  }
  redoStack.length = 0;
}

function clearUndoStack() {
  undoStack.length = 0;
  redoStack.length = 0;
}

function loadStateFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.templateWorkingSets && typeof data.templateWorkingSets === "object") {
      templateWorkingSets = {};
      Object.keys(data.templateWorkingSets).forEach((key) => {
        const normalized = normalizeTemplateWorkingSet(data.templateWorkingSets[key]);
        if (!normalized) return;
        templateWorkingSets[key] = normalized;
      });
    } else {
      templateWorkingSets = {};
    }
    if (Array.isArray(data.puzzles) && data.puzzles.length) {
      AppState.puzzles = data.puzzles;
    }
    if (Number.isInteger(data.currentPuzzleIndex)) {
      AppState.currentPuzzleIndex = Math.min(
        AppState.puzzles.length - 1,
        Math.max(0, data.currentPuzzleIndex)
      );
    }
    if (Array.isArray(data.images)) {
      AppState.images = data.images;
    }
    if (data.generationMode) {
      AppState.generationMode = data.generationMode;
    }
    if (typeof data.singleFirstPuzzleOnce === "boolean") {
      AppState.singleFirstPuzzleOnce = data.singleFirstPuzzleOnce;
    }
    if (data.folderBindings && typeof data.folderBindings === "object") {
      AppState.folderBindings = data.folderBindings;
    }
    if (data.multiFolderConfig && typeof data.multiFolderConfig === "object") {
      AppState.multiFolderConfig = data.multiFolderConfig;
    }
    if (typeof data.outputDir === "string") {
      AppState.outputDir = data.outputDir;
    }
    if (typeof data.outputScale === "number" && Number.isFinite(data.outputScale)) {
      AppState.outputScale = data.outputScale;
    }
    if (typeof data.previewMode === "string") {
      AppState.previewMode = normalizePreviewMode(data.previewMode);
    }
    if (typeof data.outputByPuzzleFolder === "boolean") {
      AppState.outputByPuzzleFolder = data.outputByPuzzleFolder;
    }
    if (typeof data.shareSameFolderCycleInMultiFolder === "boolean") {
      AppState.shareSameFolderCycleInMultiFolder = data.shareSameFolderCycleInMultiFolder;
    }
    if (data.currentTemplate) {
      AppState.currentTemplate = data.currentTemplate;
    }
    AppState.generationMode = normalizeGenerationMode(AppState.generationMode);
    AppState.singleFirstPuzzleOnce = normalizeSingleFirstPuzzleOnce(AppState.singleFirstPuzzleOnce);
    AppState.shareSameFolderCycleInMultiFolder = normalizeShareSameFolderCycleInMultiFolder(
      AppState.shareSameFolderCycleInMultiFolder
    );
    AppState.previewMode = normalizePreviewMode(AppState.previewMode);
    AppState.puzzles = AppState.puzzles.map((puzzle, index) => ({
      id: puzzle.id || `puzzle-${Date.now()}-${index}`,
      name: puzzle.name || `拼图${index + 1}`,
      backgroundMode: puzzle.backgroundMode || "image",
      backgroundPath: puzzle.backgroundPath || null,
      backgroundColor: typeof puzzle.backgroundColor === "string" && puzzle.backgroundColor.trim()
        ? puzzle.backgroundColor
        : "#ffffff",
      canvasSize: puzzle.canvasSize || { ...DEFAULT_CANVAS_SIZE },
      slots: Array.isArray(puzzle.slots)
        ? puzzle.slots.map((slot, slotIndex) => ({
          id: slot.id || `slot-${Date.now()}-${index}`,
          x: slot.x ?? 0,
          y: slot.y ?? 0,
          w: slot.w ?? 200,
          h: slot.h ?? 200,
          layerIndex: Number.isFinite(Number(slot.layerIndex))
            ? Number(slot.layerIndex)
            : slotIndex + 1,
          zOrder: Number.isFinite(Number(slot.zOrder))
            ? Number(slot.zOrder)
            : slotIndex,
          fillOrder: Number.isFinite(Number(slot.fillOrder))
            ? Number(slot.fillOrder)
            : slotIndex,
          style: {
            borderRadius: slot.style?.borderRadius ?? 0,
            borderWidth: slot.style?.borderWidth ?? 0,
            borderColor: slot.style?.borderColor || "#ffffff",
            shadow: slot.style?.shadow ?? false,
            lockAspect: slot.style?.lockAspect ?? false
          },
          crop: slot.crop
            ? {
              scale: slot.crop.scale ?? 1,
              offsetX: slot.crop.offsetX ?? 0,
              offsetY: slot.crop.offsetY ?? 0
            }
            : null
        }))
        : [],
      texts: Array.isArray(puzzle.texts)
        ? puzzle.texts.map((text, textIndex) => ({
          id: text.id || `text-${Date.now()}-${index}`,
          type: text.type || "text",
          content: text.content ?? "",
          x: text.x ?? 0,
          y: text.y ?? 0,
          width: text.width ?? 200,
          rotation: text.rotation ?? 0,
          createdAt: text.createdAt ?? Date.now() + textIndex,
          zOrder: Number.isFinite(Number(text.zOrder))
            ? Number(text.zOrder)
            : (Number.isFinite(Number(text.createdAt)) ? Number(text.createdAt) : Date.now() + textIndex),
          style: {
            fontFamily: text.style?.fontFamily || "SourceHanSansCN",
            fontSize: text.style?.fontSize ?? 32,
            fontWeight: text.style?.fontWeight ?? 400,
            fontStyle: text.style?.fontStyle || "normal",
            color: text.style?.color || "#000000",
            textAlign: text.style?.textAlign || "left",
            letterSpacing: text.style?.letterSpacing ?? 0,
            lineHeight: text.style?.lineHeight ?? 1.4,
            strokeWidth: text.style?.strokeWidth ?? 0,
            strokeColor: text.style?.strokeColor || "#000000",
            shadowColor: text.style?.shadowColor || "#000000",
            shadowBlur: text.style?.shadowBlur ?? 0,
            shadowOffsetX: text.style?.shadowOffsetX ?? 0,
            shadowOffsetY: text.style?.shadowOffsetY ?? 0
          }
        }))
        : [],
      images: Array.isArray(puzzle.images)
        ? puzzle.images.map((image, imageIndex) => ({
          id: image.id || `image-${Date.now()}-${index}`,
          type: image.type || "image",
          imagePath: image.imagePath || "",
          x: image.x ?? 0,
          y: image.y ?? 0,
          width: image.width ?? 200,
          height: image.height ?? 200,
          rotation: image.rotation ?? 0,
          aspectRatio: image.aspectRatio ?? (image.width && image.height ? image.width / image.height : 1),
          createdAt: image.createdAt ?? Date.now() + imageIndex,
          zOrder: Number.isFinite(Number(image.zOrder))
            ? Number(image.zOrder)
            : (Number.isFinite(Number(image.createdAt)) ? Number(image.createdAt) : Date.now() + imageIndex)
        }))
        : []
    }));
    AppState.images = normalizeImageList(AppState.images);
    AppState.folderBindings = normalizeFolderBindings(AppState.folderBindings, AppState.puzzles);
    AppState.multiFolderConfig = normalizeMultiFolderConfig(
      AppState.multiFolderConfig,
      AppState.puzzles,
      {
        folderBindings: AppState.folderBindings,
        outputByPuzzleFolder: AppState.outputByPuzzleFolder,
        shareSameFolderCycle: AppState.shareSameFolderCycleInMultiFolder
      }
    );
    syncLegacyPerPuzzleStateFromConfig();
    if (!restoreWorkingSetForTemplate(AppState.currentTemplate)) {
      saveWorkingSetForTemplate(AppState.currentTemplate);
    }
  } catch (error) {
    // ignore
  }
}

function formatPath(pathValue) {
  if (!pathValue) return "未设置";
  const normalized = String(pathValue).replace(/\//g, "\\");
  if (normalized.length <= 42) return normalized;
  const parts = normalized.split("\\").filter(Boolean);
  if (parts.length <= 2) return normalized;
  const lastParts = parts.slice(-2).join("\\");
  if (/^[A-Za-z]:$/.test(parts[0])) {
    return `${parts[0]}\\...\\${lastParts}`;
  }
  return `...\\${lastParts}`;
}

function cloneFolderBindings(bindings) {
  if (!bindings || typeof bindings !== "object") return {};
  try {
    return JSON.parse(JSON.stringify(bindings));
  } catch (error) {
    return {};
  }
}

function normalizeGenerationMode(mode) {
  return mode === "multi-folder" ? "multi-folder" : "single";
}

function normalizeSingleFirstPuzzleOnce(value) {
  return value === true;
}

function normalizeShareSameFolderCycleInMultiFolder(value) {
  return value !== false;
}

function normalizeImageList(images) {
  if (!Array.isArray(images)) return [];
  return images
    .map((item, index) => {
      const path = typeof item?.path === "string" ? item.path : "";
      if (!path) return null;
      const name = typeof item?.name === "string" && item.name.trim()
        ? item.name
        : getFileNameFromPath(path);
      const id = typeof item?.id === "string" && item.id.trim()
        ? item.id
        : `img-${Date.now()}-${index}`;
      return { id, name, path };
    })
    .filter(Boolean);
}

function normalizeFolderBindings(bindings, puzzles = AppState.puzzles) {
  const cloned = cloneFolderBindings(bindings);
  const hasValidation = Array.isArray(puzzles) && puzzles.length > 0;
  const validIds = hasValidation
    ? new Set(puzzles.map((puzzle) => puzzle.id))
    : null;
  Object.keys(cloned).forEach((key) => {
    if (hasValidation && !validIds.has(key)) {
      delete cloned[key];
      return;
    }
    const binding = cloned[key];
    if (!binding || typeof binding !== "object") {
      delete cloned[key];
      return;
    }
    const folder = typeof binding.folder === "string" ? binding.folder : "";
    const images = normalizeImageList(binding.images);
    cloned[key] = {
      ...(folder ? { folder } : {}),
      images
    };
  });
  return cloned;
}

function cloneMultiFolderConfig(config) {
  try {
    return JSON.parse(JSON.stringify(config || createDefaultMultiFolderConfig()));
  } catch (error) {
    return createDefaultMultiFolderConfig();
  }
}

function normalizeMultiFolderSubMode(subMode) {
  return subMode === MULTI_FOLDER_SUBMODE_PER_PUZZLE
    ? MULTI_FOLDER_SUBMODE_PER_PUZZLE
    : MULTI_FOLDER_SUBMODE_SUBFOLDER;
}

function normalizeSubfolderBatchGroups(groups) {
  return (Array.isArray(groups) ? groups : [])
    .map((group, index) => {
      const folderPath = typeof group?.folderPath === "string" ? group.folderPath : "";
      const name = typeof group?.name === "string" && group.name.trim()
        ? group.name.trim()
        : getFileNameFromPath(folderPath) || `子文件夹${index + 1}`;
      const images = normalizeImageList(group?.images);
      return {
        key: typeof group?.key === "string" && group.key.trim()
          ? group.key.trim()
          : (folderPath || name),
        name,
        folderPath,
        images,
        imageCount: images.length
      };
    })
    .filter((group) => group.name || group.folderPath);
}

function normalizeSubfolderBatchState(state) {
  const groups = normalizeSubfolderBatchGroups(state?.groups);
  return {
    parentFolder: typeof state?.parentFolder === "string" ? state.parentFolder : "",
    parentFolderAccessible: state?.parentFolderAccessible !== false,
    groups,
    outputByInputSubfolder: typeof state?.outputByInputSubfolder === "boolean"
      ? state.outputByInputSubfolder
      : true,
    lastScannedAt: Number.isFinite(state?.lastScannedAt) ? Number(state.lastScannedAt) : 0
  };
}

function normalizePerPuzzleMultiFolderState(config, puzzles = AppState.puzzles, legacyState = null) {
  const legacy = legacyState || {};
  const folderBindings = normalizeFolderBindings(
    config?.folderBindings ?? legacy.folderBindings,
    puzzles
  );
  return {
    folderBindings,
    outputByPuzzleFolder: typeof config?.outputByPuzzleFolder === "boolean"
      ? config.outputByPuzzleFolder
      : (typeof legacy.outputByPuzzleFolder === "boolean" ? legacy.outputByPuzzleFolder : true),
    shareSameFolderCycle: normalizeShareSameFolderCycleInMultiFolder(
      typeof config?.shareSameFolderCycle === "boolean"
        ? config.shareSameFolderCycle
        : legacy.shareSameFolderCycle
    )
  };
}

function normalizeMultiFolderConfig(
  config,
  puzzles = AppState.puzzles,
  legacyState = null
) {
  const defaults = createDefaultMultiFolderConfig();
  const legacyBindings = legacyState?.folderBindings;
  const hasLegacyPerPuzzleBindings = !!(
    legacyBindings
    && typeof legacyBindings === "object"
    && Object.keys(legacyBindings).length
  );
  const fallbackSubMode = hasLegacyPerPuzzleBindings
    ? MULTI_FOLDER_SUBMODE_PER_PUZZLE
    : defaults.subMode;
  return {
    subMode: normalizeMultiFolderSubMode(config?.subMode || fallbackSubMode),
    perPuzzle: normalizePerPuzzleMultiFolderState(
      config?.perPuzzle,
      puzzles,
      legacyState
    ),
    subfolderBatch: normalizeSubfolderBatchState(config?.subfolderBatch || defaults.subfolderBatch)
  };
}

function syncLegacyPerPuzzleStateFromConfig() {
  AppState.folderBindings = normalizeFolderBindings(
    AppState.multiFolderConfig?.perPuzzle?.folderBindings,
    AppState.puzzles
  );
  AppState.outputByPuzzleFolder = AppState.multiFolderConfig?.perPuzzle?.outputByPuzzleFolder !== false;
  AppState.shareSameFolderCycleInMultiFolder = normalizeShareSameFolderCycleInMultiFolder(
    AppState.multiFolderConfig?.perPuzzle?.shareSameFolderCycle
  );
}

function getActiveMultiFolderSubMode(config = AppState.multiFolderConfig) {
  return normalizeMultiFolderSubMode(config?.subMode);
}

function isSubfolderBatchMode(config = AppState.multiFolderConfig) {
  return getActiveMultiFolderSubMode(config) === MULTI_FOLDER_SUBMODE_SUBFOLDER;
}

function getActiveOutputBySubfolder(config = AppState.multiFolderConfig) {
  if (isSubfolderBatchMode(config)) {
    return config?.subfolderBatch?.outputByInputSubfolder !== false;
  }
  return config?.perPuzzle?.outputByPuzzleFolder !== false;
}

function getTemplateStateKey(template = AppState.currentTemplate) {
  const id = typeof template?.id === "string" ? template.id.trim() : "";
  return id || NO_TEMPLATE_STATE_KEY;
}

function normalizeTemplateWorkingSet(workingSet) {
  if (!workingSet || typeof workingSet !== "object") return null;
  const multiFolderConfig = normalizeMultiFolderConfig(
    workingSet.multiFolderConfig,
    null,
    {
      folderBindings: workingSet.folderBindings,
      outputByPuzzleFolder: workingSet.outputByPuzzleFolder,
      shareSameFolderCycle: workingSet.shareSameFolderCycleInMultiFolder
    }
  );
  return {
    images: normalizeImageList(workingSet.images),
    folderBindings: cloneFolderBindings(multiFolderConfig.perPuzzle.folderBindings),
    multiFolderConfig,
    generationMode: normalizeGenerationMode(workingSet.generationMode),
    singleFirstPuzzleOnce: normalizeSingleFirstPuzzleOnce(workingSet.singleFirstPuzzleOnce),
    outputByPuzzleFolder: multiFolderConfig.perPuzzle.outputByPuzzleFolder,
    shareSameFolderCycleInMultiFolder: normalizeShareSameFolderCycleInMultiFolder(
      multiFolderConfig.perPuzzle.shareSameFolderCycle
    ),
    updatedAt: Number.isFinite(workingSet.updatedAt) ? workingSet.updatedAt : Date.now()
  };
}

function buildCurrentTemplateWorkingSet() {
  const multiFolderConfig = normalizeMultiFolderConfig(
    AppState.multiFolderConfig,
    AppState.puzzles,
    {
      folderBindings: AppState.folderBindings,
      outputByPuzzleFolder: AppState.outputByPuzzleFolder,
      shareSameFolderCycle: AppState.shareSameFolderCycleInMultiFolder
    }
  );
  return {
    images: normalizeImageList(AppState.images),
    folderBindings: cloneFolderBindings(multiFolderConfig.perPuzzle.folderBindings),
    multiFolderConfig: cloneMultiFolderConfig(multiFolderConfig),
    generationMode: normalizeGenerationMode(AppState.generationMode),
    singleFirstPuzzleOnce: normalizeSingleFirstPuzzleOnce(AppState.singleFirstPuzzleOnce),
    outputByPuzzleFolder: multiFolderConfig.perPuzzle.outputByPuzzleFolder !== false,
    shareSameFolderCycleInMultiFolder: normalizeShareSameFolderCycleInMultiFolder(
      multiFolderConfig.perPuzzle.shareSameFolderCycle
    ),
    updatedAt: Date.now()
  };
}

function saveWorkingSetForTemplate(template = AppState.currentTemplate) {
  const key = getTemplateStateKey(template);
  templateWorkingSets[key] = buildCurrentTemplateWorkingSet();
}

function restoreWorkingSetForTemplate(template = AppState.currentTemplate) {
  const key = getTemplateStateKey(template);
  const normalized = normalizeTemplateWorkingSet(templateWorkingSets[key]);
  if (!normalized) return false;
  AppState.images = normalized.images;
  AppState.multiFolderConfig = normalizeMultiFolderConfig(
    normalized.multiFolderConfig,
    AppState.puzzles,
    {
      folderBindings: normalized.folderBindings,
      outputByPuzzleFolder: normalized.outputByPuzzleFolder,
      shareSameFolderCycle: normalized.shareSameFolderCycleInMultiFolder
    }
  );
  syncLegacyPerPuzzleStateFromConfig();
  AppState.generationMode = normalized.generationMode;
  AppState.singleFirstPuzzleOnce = normalizeSingleFirstPuzzleOnce(normalized.singleFirstPuzzleOnce);
  templateWorkingSets[key] = {
    ...normalized,
    folderBindings: cloneFolderBindings(normalized.folderBindings),
    multiFolderConfig: cloneMultiFolderConfig(AppState.multiFolderConfig)
  };
  return true;
}

function pruneTemplateWorkingSets() {
  const validKeys = new Set([NO_TEMPLATE_STATE_KEY]);
  templates.forEach((template) => {
    if (template?.id) {
      validKeys.add(template.id);
    }
  });
  if (AppState.currentTemplate?.id) {
    validKeys.add(AppState.currentTemplate.id);
  }
  Object.keys(templateWorkingSets).forEach((key) => {
    if (!validKeys.has(key)) {
      delete templateWorkingSets[key];
    }
  });
}

function setStatus(text) {
  if (elements.statusText) {
    elements.statusText.textContent = text || "";
  }
}

function buildTemplateSignature(payload, templateName = "") {
  if (!payload?.id) return "";
  const normalized = {
    id: payload.id,
    name: typeof templateName === "string" ? templateName : "",
    generationMode: payload.generationMode === "multi-folder" ? "multi-folder" : "single",
    singleFirstPuzzleOnce: normalizeSingleFirstPuzzleOnce(payload.singleFirstPuzzleOnce),
    puzzles: Array.isArray(payload.puzzles) ? payload.puzzles : []
  };
  try {
    return JSON.stringify(normalized);
  } catch (error) {
    return "";
  }
}

function getCurrentTemplateSignature() {
  if (!AppState.currentTemplate?.id) return "";
  const payload = serializeState(AppState);
  if (!payload?.id) return "";
  const templateName = AppState.currentTemplate?.name || payload.name || "";
  return buildTemplateSignature(payload, templateName);
}

function syncTemplateAutoSaveBaseline(signature) {
  if (!AppState.currentTemplate?.id) {
    templateAutoSaveLastSignature = "";
    templateAutoSaveDirty = false;
    templateAutoSavePending = false;
    return;
  }
  const baseline = typeof signature === "string" ? signature : getCurrentTemplateSignature();
  templateAutoSaveLastSignature = baseline || "";
  const currentSignature = getCurrentTemplateSignature();
  const hasUnsavedChanges = Boolean(
    templateAutoSaveLastSignature &&
    currentSignature &&
    currentSignature !== templateAutoSaveLastSignature
  );
  templateAutoSaveDirty = hasUnsavedChanges;
  templateAutoSavePending = hasUnsavedChanges && templateAutoSaveSaving;
}

function markTemplateDirty() {
  if (!AppState.currentTemplate?.id) {
    templateAutoSaveLastSignature = "";
    templateAutoSaveDirty = false;
    templateAutoSavePending = false;
    return;
  }
  const signature = getCurrentTemplateSignature();
  if (!signature) return;
  if (signature !== templateAutoSaveLastSignature) {
    templateAutoSaveDirty = true;
    if (templateAutoSaveSaving) {
      templateAutoSavePending = true;
    }
  }
}

function startTemplateAutoSaveTimer() {
  if (templateAutoSaveTimer) return;
  templateAutoSaveTimer = window.setInterval(() => {
    void runTemplateAutoSave("interval");
  }, TEMPLATE_AUTOSAVE_INTERVAL_MS);
}

function stopTemplateAutoSaveTimer() {
  if (!templateAutoSaveTimer) return;
  window.clearInterval(templateAutoSaveTimer);
  templateAutoSaveTimer = null;
}

async function runTemplateAutoSave(trigger = "interval") {
  if (!AppState.currentTemplate?.id) {
    templateAutoSaveDirty = false;
    templateAutoSavePending = false;
    return { ok: true, skipped: true };
  }
  if (!templateAutoSaveDirty) {
    return { ok: true, skipped: true };
  }
  if (templateAutoSaveSaving && templateAutoSavePromise) {
    templateAutoSavePending = true;
    return templateAutoSavePromise;
  }

  templateAutoSaveSaving = true;
  templateAutoSavePromise = (async () => {
    let lastResult = { ok: true, skipped: true };
    while (templateAutoSaveDirty && AppState.currentTemplate?.id) {
      templateAutoSavePending = false;
      lastResult = await saveCurrentTemplate({
        source: "auto",
        showSuccessToast: false,
        showErrorToast: false,
        skipOpenModal: true
      });
      if (!lastResult?.ok) {
        const message = lastResult?.error || "模板自动保存失败";
        setStatus(`${message}（10秒后自动重试）`);
        logPuzzle(`模板自动保存失败(${trigger}): ${message}`);
        return lastResult;
      }
      if (!templateAutoSavePending && !templateAutoSaveDirty) {
        break;
      }
    }
    return lastResult;
  })();

  try {
    return await templateAutoSavePromise;
  } finally {
    templateAutoSaveSaving = false;
    templateAutoSavePromise = null;
  }
}

async function flushTemplateAutoSave(reason = "flush") {
  if (!AppState.currentTemplate?.id) {
    return { ok: true, skipped: true };
  }
  if (templateAutoSaveSaving && templateAutoSavePromise) {
    templateAutoSavePending = true;
    const inFlightResult = await templateAutoSavePromise;
    if (!inFlightResult?.ok) {
      return inFlightResult;
    }
  }
  if (!templateAutoSaveDirty) {
    return { ok: true, skipped: true };
  }
  return runTemplateAutoSave(reason);
}

function getGenerateStageLabel(stage) {
  const mapping = {
    background_decode: "背景解码",
    slot_decode: "坑位图片处理",
    element_decode: "图片元素处理",
    canvas_limit: "画布尺寸检查",
    composite: "图层合成",
    output_write: "文件写入",
    generate: "导出流程"
  };
  return mapping[stage] || "导出流程";
}

function formatGenerateFailureItem(item, index = 0) {
  if (!item || typeof item !== "object") {
    return `${index + 1}. 未知失败项`;
  }
  const stageLabel = getGenerateStageLabel(item.stage);
  const fileLabel = item.file ? ` 文件=${item.file}` : "";
  const puzzleLabel = item.puzzleName ? ` 拼图=${item.puzzleName}` : "";
  const errorText = item.error || item.message || "未知错误";
  return `${index + 1}. [${stageLabel}]${puzzleLabel}${fileLabel} ${errorText}`;
}

function buildGenerateFailureSummary(failedItems, limit = 12) {
  const list = Array.isArray(failedItems) ? failedItems : [];
  if (!list.length) return "";
  const maxCount = Math.max(1, Number(limit) || 12);
  const lines = list.slice(0, maxCount).map((item, index) => formatGenerateFailureItem(item, index));
  if (list.length > maxCount) {
    lines.push(`... 其余 ${list.length - maxCount} 条失败项省略`);
  }
  return lines.join("\n");
}

async function copyTextToClipboard(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (error) {
      // fallback below
    }
  }
  try {
    const el = document.createElement("textarea");
    el.value = value;
    el.setAttribute("readonly", "true");
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(el);
    return !!copied;
  } catch (error) {
    return false;
  }
}

function resolveGenerateErrorMessage(result) {
  if (!result || typeof result !== "object") {
    return "生成失败";
  }
  if (result.detail && typeof result.detail === "object") {
    const detailMessage = result.detail.error || result.detail.message;
    if (detailMessage) return detailMessage;
    const stageLabel = getGenerateStageLabel(result.detail.stage);
    if (result.detail.file) {
      return `${stageLabel}失败（文件: ${result.detail.file}）`;
    }
    return `${stageLabel}失败`;
  }
  return result.error || "生成失败";
}

function showTemplateToast(message, type = "success", duration = 2000) {
  setStatus(message);
  if (window.showToast) {
    window.showToast(message, type, duration);
  }
}

let previewToastShown = false;
function showPreviewToast() {
  if (previewToastShown) return;
  previewToastShown = true;
  if (window.showToast) {
    window.showToast("预览模式已锁定编辑，退出后可继续编辑", "info", 2000);
  }
  setTimeout(() => {
    previewToastShown = false;
  }, 2000);
}

function setPreviewState(isPreview) {
  if (isPreview) {
    setSelectionOverlay(null);
    resetPreviewView();
    resetExportPreviewCache();
    updatePreviewZoomLabel();
  } else {
    resetPreviewView();
  }
  const controls = [
    elements.uploadBgBtn,
    elements.transparentToggle,
    elements.colorToggle,
    elements.colorInput,
    elements.canvasWInput,
    elements.canvasHInput,
    elements.applyCanvasSizeBtn,
    elements.addSlotBtn,
    elements.addImageSlotBtn,
    elements.addTextBtn,
    elements.addImageElementBtn,
    elements.clearSlotsBtn,
    elements.clearTextBtn,
    elements.clearImageElementBtn,
    elements.importImagesBtn,
    elements.assignFoldersBtn,
    elements.folderSubModeBatchBtn,
    elements.folderSubModePerPuzzleBtn,
    elements.selectOutputBtn,
    elements.scaleSelect,
    elements.addTabBtn,
    elements.saveTemplateBtn,
    elements.deleteTemplateBtn,
    elements.templateSelect,
    elements.templateMenuBtn,
    elements.slotWInput,
    elements.slotHInput,
    elements.slotRadiusInput,
    elements.slotBorderWidthInput,
    elements.slotBorderColorInput,
    elements.slotShadowInput,
    elements.cropBtn,
    elements.cropClearBtn,
    elements.copySlotBtn,
    elements.deleteSlotBtn,
    elements.alignLeftBtn,
    elements.alignRightBtn,
    elements.alignTopBtn,
    elements.alignBottomBtn,
    elements.alignHCenterBtn,
    elements.alignVCenterBtn,
    elements.distributeHBtn,
    elements.distributeVBtn,
    elements.scaleDownBtn,
    elements.scaleUpBtn,
    elements.textFontSelect,
    elements.textWeightSelect,
    elements.textSizeInput,
    elements.textBoldBtn,
    elements.textItalicBtn,
    elements.textColorInput,
    elements.textAlignLeftBtn,
    elements.textAlignCenterBtn,
    elements.textAlignRightBtn,
    elements.textLetterSpacingInput,
    elements.textLineHeightInput,
    elements.textScaleDownBtn,
    elements.textScaleUpBtn,
    elements.copyTextBtn,
    elements.deleteTextBtn,
    elements.generateBtn
  ];

  controls.forEach((control) => {
    if (!control) return;
    control.disabled = !!isPreview;
  });

  if (isPreview) {
    exitTextEditMode();
    closeTemplateDropdown();
  }

  elements.generationRadios.forEach((radio) => {
    radio.disabled = !!isPreview;
  });

  if (elements.previewMask) {
    elements.previewMask.classList.remove("show");
  }
  if (elements.imageList) {
    elements.imageList.classList.toggle("is-disabled", !!isPreview);
  }
  if (elements.previewZoom) {
    elements.previewZoom.classList.toggle("show", true);
  }
  if (elements.previewMeta) {
    elements.previewMeta.classList.toggle("show", !!isPreview);
  }
  if (elements.zoomFitBtn) {
    elements.zoomFitBtn.style.display = isPreview ? "" : "none";
  }
  if (elements.zoomPixelBtn) {
    elements.zoomPixelBtn.style.display = isPreview ? "" : "none";
  }
  if (!isPreview && elements.previewScaleMeta) {
    elements.previewScaleMeta.textContent = "";
  }
  if (elements.canvasWrapper) {
    elements.canvasWrapper.classList.toggle("is-preview", !!isPreview);
  }
  if (elements.templateModal) {
    elements.templateModal.classList.remove("show");
  }
  if (elements.templateLibraryModal) {
    elements.templateLibraryModal.classList.remove("show");
  }
  hideSlotMenu();
  if (isPreview && elements.propertiesPanel) {
    elements.propertiesPanel.style.display = "none";
  }
  if (isPreview && elements.textPanel) {
    elements.textPanel.style.display = "none";
  }

  if (isPreview) {
    setStatus(`预览模式，编辑已锁定（${getPreviewModeLabel(AppState.previewMode)}）`);
    if (elements.previewBtn) {
      elements.previewBtn.textContent = "退出预览";
    }
  } else {
    setStatus("待命");
    if (elements.previewBtn) {
      elements.previewBtn.textContent = "预览";
    }
    syncCanvasInputs();
    updatePropertiesPanel();
  }
  resizeCanvas();
}

function updateOutputPath() {
  if (!elements.outputPath) return;
  const pathText = elements.outputPath.querySelector(".puzzle-path-text");
  const displayPath = formatPath(AppState.outputDir);
  if (pathText) {
    pathText.textContent = displayPath;
  } else {
    elements.outputPath.textContent = displayPath;
  }
  elements.outputPath.title = AppState.outputDir || "未设置";
}

function updateEstimateCount() {
  if (!elements.estimateCount) return;
  updateGenerationAvailability();
  const count = calculateEstimateCount(
    AppState.puzzles,
    AppState.images,
    AppState.generationMode,
    AppState.folderBindings,
    getGenerationQueueOptions(),
    AppState.multiFolderConfig
  );
  elements.estimateCount.textContent = String(count);
}

function getGenerationQueueOptions() {
  const subfolderBatch = AppState.multiFolderConfig?.subfolderBatch || {};
  return {
    singleFirstPuzzleOnce:
      (AppState.generationMode === "single"
        || (AppState.generationMode === "multi-folder" && isSubfolderBatchMode()))
      && AppState.singleFirstPuzzleOnce === true,
    shareSameFolderCycleInMultiFolder:
      AppState.generationMode === "multi-folder"
        ? normalizeShareSameFolderCycleInMultiFolder(AppState.shareSameFolderCycleInMultiFolder)
        : true,
    multiFolderSubMode: getActiveMultiFolderSubMode(),
    outputBySubfolder:
      AppState.generationMode === "multi-folder"
        ? subfolderBatch.outputByInputSubfolder !== false
        : true
  };
}

function updateGenerationAvailability() {
  const wrap = elements.singleCoverOptionWrap;
  const item = elements.singleCoverOptionItem;
  const checkbox = elements.singleCoverOptionCheckbox;
  if (!wrap || !item || !checkbox) return;

  const shouldShow = AppState.generationMode === "single"
    || (AppState.generationMode === "multi-folder" && isSubfolderBatchMode());
  wrap.style.display = shouldShow ? "" : "none";
  checkbox.disabled = false;
  checkbox.checked = normalizeSingleFirstPuzzleOnce(AppState.singleFirstPuzzleOnce);
  item.classList.remove("is-disabled");
}

function updateImageList() {
  if (!elements.imageList) return;
  elements.imageList.textContent = "";
  const isMultiFolder = AppState.generationMode === "multi-folder";
  elements.imageList.classList.toggle("is-grouped", isMultiFolder);

  if (!isMultiFolder) {
    elements.imageCount.textContent = String(AppState.images.length);
    updateEstimateCount();

    AppState.images.forEach((image) => {
      const item = document.createElement("div");
      item.className = "puzzle-image-item";
      item.draggable = true;
      item.dataset.id = image.id;

      const handle = document.createElement("span");
      handle.className = "puzzle-image-handle";
      handle.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>`;

      const name = document.createElement("span");
      name.textContent = image.name;
      name.title = image.path;

      const removeBtn = document.createElement("button");
      removeBtn.className = "puzzle-image-remove";
      removeBtn.type = "button";
      removeBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
      removeBtn.addEventListener("click", () => {
        AppState.images = AppState.images.filter((item) => item.id !== image.id);
        updateImageList();
        saveStateToStorage();
        scheduleRender();
      });

      item.addEventListener("dragstart", () => {
        item.classList.add("dragging");
        item.dataset.dragging = "true";
      });
      item.addEventListener("dragend", () => {
        item.classList.remove("dragging");
        item.dataset.dragging = "false";
      });

      item.appendChild(handle);
      item.appendChild(name);
      item.appendChild(removeBtn);
      elements.imageList.appendChild(item);
    });
    return;
  }

  if (isSubfolderBatchMode()) {
    const groups = AppState.multiFolderConfig?.subfolderBatch?.groups || [];
    const totalCount = groups.reduce((sum, group) => sum + (group?.images?.length || 0), 0);
    elements.imageCount.textContent = String(totalCount);
    updateEstimateCount();

    groups.forEach((group) => {
      const images = Array.isArray(group?.images) ? group.images : [];
      const wrapper = document.createElement("div");
      wrapper.className = "puzzle-image-group";

      const header = document.createElement("div");
      header.className = "puzzle-image-group-header";

      const title = document.createElement("span");
      title.className = "puzzle-image-group-title";
      title.textContent = group?.name || "未命名子文件夹";

      const meta = document.createElement("span");
      meta.className = "puzzle-image-group-meta";
      meta.textContent = `${images.length}张`;
      meta.title = group?.folderPath || "";

      header.appendChild(title);
      header.appendChild(meta);
      wrapper.appendChild(header);

      const list = document.createElement("div");
      list.className = "puzzle-image-group-list";
      if (images.length) {
        images.forEach((image) => {
          const item = document.createElement("div");
          item.className = "puzzle-image-group-item";
          item.textContent = image.name || getFileNameFromPath(image.path);
          item.title = image.path;
          list.appendChild(item);
        });
      } else {
        const empty = document.createElement("div");
        empty.className = "puzzle-image-group-empty";
        empty.textContent = "文件夹为空";
        list.appendChild(empty);
      }

      wrapper.appendChild(list);
      elements.imageList.appendChild(wrapper);
    });
    return;
  }

  const bindings = AppState.folderBindings || {};
  const totalCount = Object.values(bindings).reduce((sum, binding) => {
    return sum + (binding?.images?.length || 0);
  }, 0);
  elements.imageCount.textContent = String(totalCount);
  updateEstimateCount();

  AppState.puzzles.forEach((puzzle) => {
    const binding = bindings[puzzle.id];
    const images = Array.isArray(binding?.images) ? binding.images : [];

    const group = document.createElement("div");
    group.className = "puzzle-image-group";

    const header = document.createElement("div");
    header.className = "puzzle-image-group-header";

    const title = document.createElement("span");
    title.className = "puzzle-image-group-title";
    title.textContent = puzzle.name;

    const meta = document.createElement("span");
    meta.className = "puzzle-image-group-meta";
    if (!binding?.folder) {
      meta.textContent = "未选择文件夹";
    } else {
      meta.textContent = `${formatPath(binding.folder)} (${images.length}张)`;
      meta.title = binding.folder;
    }

    header.appendChild(title);
    header.appendChild(meta);
    group.appendChild(header);

    const list = document.createElement("div");
    list.className = "puzzle-image-group-list";

    if (images.length) {
      images.forEach((image) => {
        const item = document.createElement("div");
        item.className = "puzzle-image-group-item";
        item.textContent = image.name || getFileNameFromPath(image.path);
        item.title = image.path;
        list.appendChild(item);
      });
    } else {
      const empty = document.createElement("div");
      empty.className = "puzzle-image-group-empty";
      empty.textContent = binding?.folder ? "文件夹为空" : "未选择文件夹";
      list.appendChild(empty);
    }

    group.appendChild(list);
    elements.imageList.appendChild(group);
  });
}

function handleImageReorder(event) {
  event.preventDefault();
  if (AppState.generationMode === "multi-folder") return;
  if (event.type !== "drop") return;
  const dragging = elements.imageList.querySelector("[data-dragging='true']");
  const target = event.target.closest(".puzzle-image-item");
  if (!dragging || !target || dragging === target) return;
  const draggingId = dragging.dataset.id;
  const targetId = target.dataset.id;
  const fromIndex = AppState.images.findIndex((item) => item.id === draggingId);
  const toIndex = AppState.images.findIndex((item) => item.id === targetId);
  if (fromIndex === -1 || toIndex === -1) return;
  const [moved] = AppState.images.splice(fromIndex, 1);
  AppState.images.splice(toIndex, 0, moved);
  updateImageList();
  saveStateToStorage();
}

function renderTabBar() {
  if (!elements.tabBar) return;
  elements.tabBar.textContent = "";
  AppState.puzzles.forEach((puzzle, index) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `puzzle-tab${index === AppState.currentPuzzleIndex ? " active" : ""}`;
    tab.textContent = puzzle.name;
    tab.addEventListener("click", () => {
      AppState.currentPuzzleIndex = index;
      clearSelections();
      updatePropertiesPanel();
      renderTabBar();
      syncCanvasInputs();
      if (editor) {
        setEditorZoomCentered(editZoomLevel);
      }
      scheduleRender();
      saveStateToStorage();
    });

    const close = document.createElement("span");
    close.className = "puzzle-tab-close";
    close.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    close.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (AppState.puzzles.length <= 1) return;
      if (!await showConfirmModal(`确定删除${puzzle.name}吗？`, "删除拼图")) return;
      if (AppState.folderBindings && AppState.folderBindings[puzzle.id]) {
        delete AppState.folderBindings[puzzle.id];
      }
      if (AppState.multiFolderConfig?.perPuzzle?.folderBindings?.[puzzle.id]) {
        delete AppState.multiFolderConfig.perPuzzle.folderBindings[puzzle.id];
      }
      AppState.puzzles.splice(index, 1);
      AppState.multiFolderConfig = normalizeMultiFolderConfig(AppState.multiFolderConfig, AppState.puzzles);
      syncLegacyPerPuzzleStateFromConfig();
      if (AppState.currentPuzzleIndex >= AppState.puzzles.length) {
        AppState.currentPuzzleIndex = AppState.puzzles.length - 1;
      }
      clearSelections();
      renderTabBar();
      syncCanvasInputs();
      updateImageList();
      scheduleRender();
      saveStateToStorage();
    });
    tab.appendChild(close);
    elements.tabBar.appendChild(tab);
  });
}

function updateTemplateSelect() {
  if (!elements.templateSelect) return;
  elements.templateSelect.textContent = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "模板：空模板";
  elements.templateSelect.appendChild(placeholder);

  templates.forEach((template) => {
    const option = document.createElement("option");
    option.value = template.id;
    option.textContent = template.name;
    elements.templateSelect.appendChild(option);
  });

  if (AppState.currentTemplate?.id) {
    elements.templateSelect.value = AppState.currentTemplate.id;
  }
  // 刷新自定义下拉框
  if (templateSelectInstance) {
    templateSelectInstance.refresh();
  }
  updateTemplateActionState();
}

function updateTemplateActionState() {
  if (!elements.templateMenuBtn) return;
  const hasTemplate = Boolean(AppState.currentTemplate?.id)
    && templates.some((item) => item.id === AppState.currentTemplate.id);
  const hasMigrateEntry = Boolean(elements.migrateTemplateLibraryItem);
  const hasAvailableAction = hasTemplate || hasMigrateEntry;
  elements.templateMenuBtn.disabled = !hasAvailableAction;
  const label = hasAvailableAction ? "更多模板操作" : "未选择模板";
  elements.templateMenuBtn.title = label;
  elements.templateMenuBtn.setAttribute("aria-label", label);
  if (elements.renameTemplateItem) {
    elements.renameTemplateItem.disabled = !hasTemplate;
  }
  if (elements.duplicateTemplateItem) {
    elements.duplicateTemplateItem.disabled = !hasTemplate;
  }
  if (!hasAvailableAction) {
    closeTemplateDropdown();
  }
}

function openTemplateDropdown() {
  if (!elements.templateMenuWrap || !elements.templateMenuBtn || !elements.templateDropdown) return;
  if (elements.templateMenuBtn.disabled) return;
  elements.templateMenuWrap.classList.add("open");
  elements.templateDropdown.classList.add("show");
  elements.templateMenuBtn.setAttribute("aria-expanded", "true");
  elements.templateDropdown.setAttribute("aria-hidden", "false");
}

function closeTemplateDropdown() {
  if (!elements.templateMenuWrap || !elements.templateMenuBtn || !elements.templateDropdown) return;
  elements.templateMenuWrap.classList.remove("open");
  elements.templateDropdown.classList.remove("show");
  elements.templateMenuBtn.setAttribute("aria-expanded", "false");
  elements.templateDropdown.setAttribute("aria-hidden", "true");
}

function toggleTemplateDropdown() {
  if (!elements.templateMenuBtn || !elements.templateDropdown) return;
  if (elements.templateMenuBtn.disabled) return;
  if (elements.templateDropdown.classList.contains("show")) {
    closeTemplateDropdown();
    return;
  }
  openTemplateDropdown();
}

function syncGenerationModeUI() {
  elements.generationRadios.forEach((radio) => {
    const isChecked = radio.value === AppState.generationMode;
    radio.checked = isChecked;
    const label = radio.closest(".puzzle-radio-item");
    if (label) {
      label.classList.toggle("checked", isChecked);
    }
  });
  const isMultiFolder = AppState.generationMode === "multi-folder";
  if (elements.importImagesBtn) {
    elements.importImagesBtn.style.display = isMultiFolder ? "none" : "";
  }
  if (elements.assignFoldersBtn) {
    elements.assignFoldersBtn.style.display = isMultiFolder ? "" : "none";
  }
  if (elements.singleCoverOptionCheckbox) {
    elements.singleCoverOptionCheckbox.checked = normalizeSingleFirstPuzzleOnce(AppState.singleFirstPuzzleOnce);
  }
  updateImageList();
}

function syncCanvasInputs() {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return;
  const isTransparent = puzzle.backgroundMode === "transparent";
  const isColor = puzzle.backgroundMode === "color";
  elements.transparentToggle.checked = isTransparent;
  if (elements.colorToggle) {
    elements.colorToggle.checked = isColor;
  }
  if (bgColorPicker) {
    bgColorPicker.setColor(puzzle.backgroundColor || "#ffffff");
  }
  elements.canvasWInput.value = puzzle.canvasSize.w;
  elements.canvasHInput.value = puzzle.canvasSize.h;
  elements.canvasWrapper.classList.toggle("is-transparent", isTransparent);
  updateCanvasAspect();
}

async function initTextFontOptions() {
  if (!elements.textFontSelect || !elements.textWeightSelect) return;
  const previousFamily = elements.textFontSelect.value;
  const previousWeight = Number(elements.textWeightSelect.value) || 0;
  const builtinFonts = getFontFamilies();
  const systemFonts = await loadSystemFonts();
  const safeSystemFonts = Array.isArray(systemFonts) ? systemFonts : [];
  textFontFamilies = [...builtinFonts, ...safeSystemFonts];
  elements.textFontSelect.textContent = "";
  const appendGroup = (label, fonts) => {
    if (!Array.isArray(fonts) || fonts.length === 0) return;
    const group = document.createElement("optgroup");
    group.label = label;
    fonts.forEach((font) => {
      const option = document.createElement("option");
      option.value = font.family;
      option.textContent = font.displayName || font.family;
      option.title = font.family;
      group.appendChild(option);
    });
    elements.textFontSelect.appendChild(group);
  };
  appendGroup("内置字体", builtinFonts);
  appendGroup("系统字体", safeSystemFonts);
  if (textFontFamilies.length) {
    const resolvedPreviousFamily = resolveKnownFontFamily(previousFamily);
    const nextFamily = textFontFamilies.some((font) => font.family === resolvedPreviousFamily)
      ? resolvedPreviousFamily
      : textFontFamilies[0].family;
    const weights = getFontWeightsForFamily(nextFamily);
    const nextWeight = weights.includes(previousWeight) ? previousWeight : weights[0];
    elements.textFontSelect.value = nextFamily;
    syncTextWeightOptions(nextFamily, nextWeight);
  } else {
    elements.textWeightSelect.textContent = "";
    if (textWeightSelectInstance) {
      textWeightSelectInstance.refresh();
    }
  }
  if (textFontSelectInstance) {
    textFontSelectInstance.refresh();
  }
}

function resolveKnownFontFamily(family) {
  const raw = String(family || "").trim();
  if (!raw) return "";
  const exact = textFontFamilies.find((item) => item.family === raw);
  if (exact) return exact.family;
  const byDisplay = textFontFamilies.find((item) => item.displayName === raw);
  if (byDisplay) return byDisplay.family;
  return raw;
}

function getFontWeightsForFamily(family) {
  const resolvedFamily = resolveKnownFontFamily(family);
  const font = textFontFamilies.find((item) => item.family === resolvedFamily);
  return font?.weights?.length ? font.weights : [400];
}

function getNormalWeight(family) {
  const weights = getFontWeightsForFamily(family);
  if (weights.includes(400)) return 400;
  return Math.min(...weights);
}

function getBoldWeight(family) {
  const weights = getFontWeightsForFamily(family);
  if (weights.includes(700)) return 700;
  return Math.max(...weights);
}

function preloadTextFonts(texts) {
  if (!Array.isArray(texts) || !texts.length) return;
  texts.forEach((text) => {
    const style = text?.style || {};
    ensureFontLoaded(style.fontFamily, style.fontWeight, style.fontStyle).then(() => {
      scheduleRender();
    });
  });
}

function syncTextWeightOptions(family, selectedWeight) {
  if (!elements.textWeightSelect) return;
  const resolvedFamily = resolveKnownFontFamily(family);
  const font = textFontFamilies.find((item) => item.family === resolvedFamily);
  const weights = font?.weights?.length ? font.weights : [400];
  elements.textWeightSelect.textContent = "";
  weights.forEach((weight) => {
    const option = document.createElement("option");
    option.value = String(weight);
    option.textContent = String(weight);
    elements.textWeightSelect.appendChild(option);
  });
  const numericSelectedWeight = Number(selectedWeight);
  if (numericSelectedWeight && weights.includes(numericSelectedWeight)) {
    elements.textWeightSelect.value = String(numericSelectedWeight);
  } else {
    elements.textWeightSelect.value = String(weights[0] || 400);
  }
  // 刷新自定义下拉框
  if (textWeightSelectInstance) {
    textWeightSelectInstance.refresh();
  }
}

function syncScaleSelect() {
  if (!elements.scaleSelect) return;
  const value = Number(AppState.outputScale) || 1;
  elements.scaleSelect.value = String(value);
}

function updateCanvasAspect() {
  const puzzle = getCurrentPuzzle();
  if (!puzzle || !elements.canvasWrapper) return;
  const w = Math.max(1, puzzle.canvasSize.w || DEFAULT_CANVAS_SIZE.w);
  const h = Math.max(1, puzzle.canvasSize.h || DEFAULT_CANVAS_SIZE.h);
  elements.canvasWrapper.style.setProperty("--puzzle-aspect", `${w} / ${h}`);
}

function setBackgroundMode(mode) {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return;
  puzzle.backgroundMode = mode;
  if (elements.transparentToggle) {
    elements.transparentToggle.checked = mode === "transparent";
  }
  if (elements.colorToggle) {
    elements.colorToggle.checked = mode === "color";
  }
  if (elements.colorInput) {
    elements.colorInput.disabled = false;
  }
  if (elements.canvasWrapper) {
    elements.canvasWrapper.classList.toggle("is-transparent", mode === "transparent");
  }
  if (mode === "transparent") {
    applyCanvasSize();
  }
  updateEstimateCount();
  saveStateToStorage();
  scheduleRender();
}

function updateEmptyHint() {
  const puzzle = getCurrentPuzzle();
  if (!puzzle || !elements.emptyHint) return;
  const needsBg = puzzle.backgroundMode === "image" && !puzzle.backgroundPath;
  elements.emptyHint.style.display = needsBg ? "flex" : "none";
}

function normalizePreviewBackgrounds() {
  const updatedNames = [];
  AppState.puzzles.forEach((puzzle) => {
    if (!puzzle || puzzle.backgroundMode !== "image" || puzzle.backgroundPath) return;
    puzzle.backgroundMode = "color";
    puzzle.backgroundColor =
      typeof puzzle.backgroundColor === "string" && puzzle.backgroundColor.trim()
        ? puzzle.backgroundColor
        : "#ffffff";
    updatedNames.push(puzzle.name || `拼图${updatedNames.length + 1}`);
  });
  return updatedNames;
}

function getSelectedSlot() {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return null;
  if (AppState.selectedSlotIds.length !== 1) return null;
  return puzzle.slots.find((slot) => slot.id === AppState.selectedSlotIds[0]) || null;
}

function getPreviewImagePathForSlot(slotId) {
  if (AppState.mode !== "preview") return null;
  const task = AppState.taskQueue?.[AppState.previewIndex];
  if (!task || !Array.isArray(task.slots)) return null;
  const match = task.slots.find((slot) => slot.id === slotId);
  return match?.imagePath || null;
}

function handleCropEdit() {
  const slot = getSelectedSlot();
  if (!slot || !cropEditor) return;
  const puzzle = getCurrentPuzzle();
  const slotIndex = puzzle ? puzzle.slots.findIndex((item) => item.id === slot.id) : -1;
  const slotLabel = Number.isFinite(Number(slot.layerIndex))
    ? Number(slot.layerIndex)
    : (slotIndex >= 0 ? slotIndex + 1 : null);
  const imagePath = getPreviewImagePathForSlot(slot.id);
  cropEditor.open({
    slot,
    imagePath,
    crop: slot.crop,
    slotIndex: slotLabel,
    onConfirm: (nextCrop) => {
      pushUndoState();
      slot.crop = nextCrop;
      saveStateToStorage();
      updatePropertiesPanel();
      scheduleRender();
    }
  });
}

function handleCropClear() {
  const slot = getSelectedSlot();
  if (!slot || !slot.crop) return;
  pushUndoState();
  slot.crop = null;
  saveStateToStorage();
  updatePropertiesPanel();
  scheduleRender();
}

function updatePropertiesPanel() {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return;
  const selectedSlots = puzzle.slots.filter((slot) => AppState.selectedSlotIds.includes(slot.id));
  const selectedTexts = (puzzle.texts || []).filter((text) => AppState.selectedTextIds.includes(text.id));
  const selectedImages = (puzzle.images || []).filter((image) => AppState.selectedImageIds.includes(image.id));
  const hasSlots = selectedSlots.length > 0;
  const hasTexts = selectedTexts.length > 0;
  const hasImages = selectedImages.length > 0;
  const activeGroups = [hasSlots, hasTexts, hasImages].filter(Boolean).length;
  const isMixed = activeGroups > 1;
  const singleSlot = selectedSlots.length === 1 ? selectedSlots[0] : null;
  const multiSlot = selectedSlots.length > 1 && !hasTexts && !hasImages;

  if (elements.propertiesPanel) {
    elements.propertiesPanel.style.display = hasSlots && !hasTexts && !hasImages ? "flex" : "none";
  }

  if (elements.alignRow) {
    elements.alignRow.style.display = multiSlot ? "flex" : "none";
  }

  elements.slotWInput.disabled = !singleSlot;
  elements.slotHInput.disabled = !singleSlot;
  if (elements.slotLockInput) {
    elements.slotLockInput.disabled = !singleSlot;
  }

  if (singleSlot) {
    elements.slotWInput.value = Math.round(singleSlot.w);
    elements.slotHInput.value = Math.round(singleSlot.h);
    elements.slotRadiusInput.value = singleSlot.style.borderRadius || 0;
    elements.slotRadiusInput.placeholder = "";
    elements.slotRadiusInput.classList.remove("is-mixed");
    elements.slotBorderWidthInput.value = singleSlot.style.borderWidth || 0;
    elements.slotBorderWidthInput.placeholder = "";
    elements.slotBorderWidthInput.classList.remove("is-mixed");
    if (slotBorderColorPicker) {
      slotBorderColorPicker.setColor(singleSlot.style.borderColor || "#ffffff");
    }
    if (elements.slotBorderColorInput) {
      elements.slotBorderColorInput.classList.remove("is-mixed");
      elements.slotBorderColorInput.title = "边框颜色";
    }
    elements.slotShadowInput.checked = !!singleSlot.style.shadow;
    elements.slotShadowInput.indeterminate = false;
    if (elements.slotLockInput) {
      elements.slotLockInput.checked = !!singleSlot.style.lockAspect;
    }
  } else if (multiSlot) {
    elements.slotWInput.value = "";
    elements.slotHInput.value = "";
    if (elements.slotLockInput) {
      elements.slotLockInput.checked = false;
    }
    const radiusValues = selectedSlots.map((slot) => Number(slot.style?.borderRadius) || 0);
    const borderWidthValues = selectedSlots.map((slot) => Number(slot.style?.borderWidth) || 0);
    const shadowValues = selectedSlots.map((slot) => !!slot.style?.shadow);
    const borderColors = selectedSlots.map((slot) => (slot.style?.borderColor || "#ffffff").toLowerCase());
    const radiusMixed = radiusValues.some((value) => value !== radiusValues[0]);
    const borderWidthMixed = borderWidthValues.some((value) => value !== borderWidthValues[0]);
    const shadowMixed = shadowValues.some((value) => value !== shadowValues[0]);
    const borderColorMixed = borderColors.some((value) => value !== borderColors[0]);
    elements.slotRadiusInput.value = radiusMixed ? "" : String(radiusValues[0] ?? 0);
    elements.slotRadiusInput.placeholder = radiusMixed ? "混合" : "";
    elements.slotRadiusInput.classList.toggle("is-mixed", radiusMixed);
    elements.slotBorderWidthInput.value = borderWidthMixed ? "" : String(borderWidthValues[0] ?? 0);
    elements.slotBorderWidthInput.placeholder = borderWidthMixed ? "混合" : "";
    elements.slotBorderWidthInput.classList.toggle("is-mixed", borderWidthMixed);
    elements.slotShadowInput.indeterminate = shadowMixed;
    elements.slotShadowInput.checked = shadowMixed ? false : !!shadowValues[0];
    if (slotBorderColorPicker) {
      slotBorderColorPicker.setColor(borderColors[0] || "#ffffff");
    }
    if (elements.slotBorderColorInput) {
      elements.slotBorderColorInput.classList.toggle("is-mixed", borderColorMixed);
      elements.slotBorderColorInput.title = borderColorMixed ? "边框颜色（混合）" : "边框颜色";
    }
  } else {
    elements.slotWInput.value = "";
    elements.slotHInput.value = "";
    elements.slotRadiusInput.value = "";
    elements.slotRadiusInput.placeholder = "";
    elements.slotRadiusInput.classList.remove("is-mixed");
    elements.slotBorderWidthInput.value = "";
    elements.slotBorderWidthInput.placeholder = "";
    elements.slotBorderWidthInput.classList.remove("is-mixed");
    elements.slotShadowInput.checked = false;
    elements.slotShadowInput.indeterminate = false;
    if (elements.slotBorderColorInput) {
      elements.slotBorderColorInput.classList.remove("is-mixed");
      elements.slotBorderColorInput.title = "边框颜色";
    }
    if (elements.slotLockInput) {
      elements.slotLockInput.checked = false;
    }
  }
  if (elements.cropBtn) {
    elements.cropBtn.disabled = !singleSlot;
  }
  if (elements.cropStatus && elements.cropSummary && elements.cropClearBtn) {
    if (singleSlot && singleSlot.crop) {
      elements.cropStatus.style.display = "flex";
      elements.cropSummary.textContent = formatCropSummary(singleSlot.crop);
      elements.cropClearBtn.disabled = false;
    } else {
      elements.cropStatus.style.display = "none";
      elements.cropSummary.textContent = "";
      elements.cropClearBtn.disabled = true;
    }
  }
  if (slotBorderColorPicker) {
    if (selectedSlots.length === 0) {
      slotBorderColorPicker.disable();
    } else {
      slotBorderColorPicker.enable();
    }
  }

  const alignButtons = [
    elements.alignLeftBtn,
    elements.alignRightBtn,
    elements.alignTopBtn,
    elements.alignBottomBtn,
    elements.alignHCenterBtn,
    elements.alignVCenterBtn,
    elements.distributeHBtn,
    elements.distributeVBtn,
    elements.scaleDownBtn,
    elements.scaleUpBtn
  ];
  alignButtons.forEach((btn) => {
    if (!btn) return;
    btn.disabled = !multiSlot;
  });

  updateTextPanel(selectedTexts, isMixed);
}

function updateTextPanel(selectedTexts, isMixed) {
  if (!elements.textPanel) return;
  if (isMixed || selectedTexts.length === 0) {
    elements.textPanel.style.display = "none";
    if (textColorPicker) {
      textColorPicker.disable();
    }
    if (textStrokeColorPicker) {
      textStrokeColorPicker.disable();
    }
    if (textShadowColorPicker) {
      textShadowColorPicker.disable();
    }
    return;
  }
  const text = selectedTexts[0];
  elements.textPanel.style.display = "flex";
  const style = text.style || {};
  if (elements.textFontSelect) {
    const panelFamily = resolveKnownFontFamily(style.fontFamily || "SourceHanSansCN");
    elements.textFontSelect.value = panelFamily;
    syncTextWeightOptions(panelFamily, style.fontWeight || 400);
  }
  if (elements.textWeightSelect) {
    elements.textWeightSelect.value = String(style.fontWeight || 400);
  }
  if (elements.textSizeInput) {
    elements.textSizeInput.value = String(style.fontSize || 32);
  }
  updateTextStyleButtons(style);
  if (textColorPicker) {
    textColorPicker.setColor(style.color || "#000000");
    textColorPicker.enable();
  }
  if (textStrokeColorPicker) {
    textStrokeColorPicker.setColor(style.strokeColor || "#000000");
    textStrokeColorPicker.enable();
  }
  if (textShadowColorPicker) {
    textShadowColorPicker.setColor(style.shadowColor || "#000000");
    textShadowColorPicker.enable();
  }
  updateTextAlignButtons(style.textAlign || "left");
  if (elements.textLetterSpacingInput) {
    elements.textLetterSpacingInput.value = String(style.letterSpacing ?? 0);
  }
  if (elements.textLineHeightInput) {
    elements.textLineHeightInput.value = String(style.lineHeight ?? 1.4);
  }
  if (elements.textStrokeWidthInput) {
    elements.textStrokeWidthInput.value = String(style.strokeWidth ?? 0);
  }
  if (elements.textShadowBlurInput) {
    elements.textShadowBlurInput.value = String(style.shadowBlur ?? 0);
  }
  if (elements.textShadowOffsetXInput) {
    elements.textShadowOffsetXInput.value = String(style.shadowOffsetX ?? 0);
  }
  if (elements.textShadowOffsetYInput) {
    elements.textShadowOffsetYInput.value = String(style.shadowOffsetY ?? 0);
  }
}

function updateTextAlignButtons(value) {
  const align = value || "left";
  const buttons = [
    { el: elements.textAlignLeftBtn, value: "left" },
    { el: elements.textAlignCenterBtn, value: "center" },
    { el: elements.textAlignRightBtn, value: "right" }
  ];
  buttons.forEach((btn) => {
    if (!btn.el) return;
    btn.el.classList.toggle("active", btn.value === align);
  });
}

function updateTextStyleButtons(style) {
  const weight = Number(style?.fontWeight) || 400;
  const isBold = weight >= 600;
  if (elements.textBoldBtn) {
    elements.textBoldBtn.classList.toggle("active", isBold);
  }
  if (elements.textItalicBtn) {
    elements.textItalicBtn.classList.toggle("active", style?.fontStyle === "italic");
  }
}

function updatePreviewBar() {
  if (!elements.previewBar) return;
  if (AppState.mode === "preview") {
    elements.previewBar.classList.add("show");
  } else {
    elements.previewBar.classList.remove("show");
  }
}

function applySnapshot(puzzle, snapshot) {
  puzzle.slots = cloneSlots(snapshot.slots || []);
  puzzle.texts = cloneTexts(snapshot.texts || []);
  puzzle.images = cloneImages(snapshot.images || []);
  AppState.selectedSlotIds = (snapshot.selectedSlotIds || []).filter((id) =>
    puzzle.slots.some((slot) => slot.id === id)
  );
  AppState.selectedTextIds = (snapshot.selectedTextIds || []).filter((id) =>
    puzzle.texts.some((text) => text.id === id)
  );
  AppState.selectedImageIds = (snapshot.selectedImageIds || []).filter((id) =>
    puzzle.images.some((image) => image.id === id)
  );
  exitTextEditMode();
}

function undoChange() {
  if (AppState.mode !== "edit") return;
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return;
  let snapshotIndex = -1;
  for (let i = undoStack.length - 1; i >= 0; i -= 1) {
    if (undoStack[i].puzzleId === puzzle.id) {
      snapshotIndex = i;
      break;
    }
  }
  if (snapshotIndex === -1) {
    setStatus("没有可撤销的操作");
    return;
  }
  const snapshot = undoStack.splice(snapshotIndex, 1)[0];
  const currentSnapshot = buildSnapshot(puzzle);
  redoStack.push(currentSnapshot);
  if (redoStack.length > MAX_UNDO) {
    redoStack.shift();
  }
  isRestoring = true;
  applySnapshot(puzzle, snapshot);
  isRestoring = false;
  updatePropertiesPanel();
  updateEstimateCount();
  saveStateToStorage();
  scheduleRender();
  setStatus("已撤销");
}

function redoChange() {
  if (AppState.mode !== "edit") return;
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return;
  let snapshotIndex = -1;
  for (let i = redoStack.length - 1; i >= 0; i -= 1) {
    if (redoStack[i].puzzleId === puzzle.id) {
      snapshotIndex = i;
      break;
    }
  }
  if (snapshotIndex === -1) {
    setStatus("没有可重做的操作");
    return;
  }
  const snapshot = redoStack.splice(snapshotIndex, 1)[0];
  const currentSnapshot = buildSnapshot(puzzle);
  undoStack.push(currentSnapshot);
  if (undoStack.length > MAX_UNDO) {
    undoStack.shift();
  }
  isRestoring = true;
  applySnapshot(puzzle, snapshot);
  isRestoring = false;
  updatePropertiesPanel();
  updateEstimateCount();
  saveStateToStorage();
  scheduleRender();
  setStatus("已重做");
}

function hideSlotMenu() {
  if (!elements.slotMenu) return;
  elements.slotMenu.classList.remove("show");
  slotMenuVisible = false;
}

function getCreatedAtValue(item) {
  const zOrder = Number(item?.zOrder);
  if (Number.isFinite(zOrder)) return zOrder;
  const createdAt = Number(item?.createdAt);
  return Number.isFinite(createdAt) ? createdAt : 0;
}

function compareByCreatedAt(a, b) {
  const layerDiff = getCreatedAtValue(a) - getCreatedAtValue(b);
  if (layerDiff !== 0) return layerDiff;
  return String(a?.id || "").localeCompare(String(b?.id || ""), "zh-CN");
}

function getSlotLayerValue(slot, field, fallback = 0) {
  const value = Number(slot?.[field]);
  return Number.isFinite(value) ? value : fallback;
}

function getSlotZOrderValue(slot) {
  return getSlotLayerValue(slot, "zOrder", 0);
}

function compareSlotsByZOrder(a, b) {
  const diff = getSlotZOrderValue(a) - getSlotZOrderValue(b);
  if (diff !== 0) return diff;
  return String(a?.id || "").localeCompare(String(b?.id || ""), "zh-CN");
}

function getSlotsSortedByZOrder(puzzle) {
  const slots = Array.isArray(puzzle?.slots) ? [...puzzle.slots] : [];
  slots.sort(compareSlotsByZOrder);
  return slots;
}

function normalizeElementCreatedAt(puzzle, orderedElements = null) {
  if (!puzzle) return;
  const elementsToNormalize = Array.isArray(orderedElements) && orderedElements.length
    ? orderedElements
    : [
      ...(puzzle.texts || []),
      ...(puzzle.images || [])
    ].sort(compareByCreatedAt);
  if (!elementsToNormalize.length) return;
  const seed = Date.now() - elementsToNormalize.length;
  elementsToNormalize.forEach((item, index) => {
    const nextOrder = seed + index;
    item.zOrder = nextOrder;
    item.createdAt = nextOrder;
  });
}

function normalizeSlotZOrder(puzzle, orderedSlots = null) {
  if (!puzzle || !Array.isArray(puzzle.slots)) return;
  const slots = Array.isArray(orderedSlots) && orderedSlots.length
    ? orderedSlots
    : getSlotsSortedByZOrder(puzzle);
  slots.forEach((slot, index) => {
    slot.zOrder = index;
  });
}

function getNextSlotLayerValue(puzzle, field, seed = 0) {
  if (!puzzle || !Array.isArray(puzzle.slots) || !puzzle.slots.length) {
    return seed + 1;
  }
  const maxValue = puzzle.slots.reduce((max, slot) => {
    const value = Number(slot?.[field]);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, seed);
  return maxValue + 1;
}

function assignNewSlotLayerFields(puzzle, slot) {
  if (!puzzle || !slot) return;
  slot.layerIndex = getNextSlotLayerValue(puzzle, "layerIndex", 0);
  slot.zOrder = getNextSlotLayerValue(puzzle, "zOrder", -1);
  slot.fillOrder = getNextSlotLayerValue(puzzle, "fillOrder", -1);
}

function getNextElementZOrder(puzzle) {
  const elements = [
    ...(puzzle?.texts || []),
    ...(puzzle?.images || [])
  ];
  if (!elements.length) return Date.now();
  const maxOrder = elements.reduce((max, item) => Math.max(max, getCreatedAtValue(item)), 0);
  return maxOrder + 1;
}

function assignNewElementLayerFields(puzzle, item) {
  if (!puzzle || !item) return;
  const next = getNextElementZOrder(puzzle);
  item.zOrder = next;
  item.createdAt = next;
}

function bringSelectedSlotsToFront(puzzle) {
  if (!puzzle || !Array.isArray(puzzle.slots) || !AppState.selectedSlotIds.length) return false;
  const selectedSet = new Set(AppState.selectedSlotIds);
  const ordered = getSlotsSortedByZOrder(puzzle);
  const selected = ordered.filter((slot) => selectedSet.has(slot.id));
  if (!selected.length) return false;
  const rest = ordered.filter((slot) => !selectedSet.has(slot.id));
  normalizeSlotZOrder(puzzle, [...rest, ...selected]);
  return true;
}

function sendSelectedSlotsToBack(puzzle) {
  if (!puzzle || !Array.isArray(puzzle.slots) || !AppState.selectedSlotIds.length) return false;
  const selectedSet = new Set(AppState.selectedSlotIds);
  const ordered = getSlotsSortedByZOrder(puzzle);
  const selected = ordered.filter((slot) => selectedSet.has(slot.id));
  if (!selected.length) return false;
  const rest = ordered.filter((slot) => !selectedSet.has(slot.id));
  normalizeSlotZOrder(puzzle, [...selected, ...rest]);
  return true;
}

function reorderSelectedElements(puzzle, targetType, toFront) {
  if (!puzzle) return false;
  const selectedIds = targetType === "text" ? AppState.selectedTextIds : AppState.selectedImageIds;
  if (!selectedIds.length) return false;
  const selectedSet = new Set(selectedIds);
  const mixedElements = [
    ...(puzzle.texts || []).map((item) => ({ type: "text", item })),
    ...(puzzle.images || []).map((item) => ({ type: "image", item }))
  ].sort((a, b) => compareByCreatedAt(a.item, b.item));
  if (!mixedElements.length) return false;
  const selected = [];
  const rest = [];
  mixedElements.forEach((entry) => {
    if (entry.type === targetType && selectedSet.has(entry.item.id)) {
      selected.push(entry.item);
    } else {
      rest.push(entry.item);
    }
  });
  if (!selected.length) return false;
  const nextOrder = toFront ? [...rest, ...selected] : [...selected, ...rest];
  normalizeElementCreatedAt(puzzle, nextOrder);
  return true;
}

function moveCurrentSelectionLayer(toFront) {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return false;
  if (contextMenuTarget === "text") {
    return reorderSelectedElements(puzzle, "text", toFront);
  }
  if (contextMenuTarget === "image") {
    return reorderSelectedElements(puzzle, "image", toFront);
  }
  return toFront ? bringSelectedSlotsToFront(puzzle) : sendSelectedSlotsToBack(puzzle);
}

function updateSlotMenuLabels() {
  if (!elements.slotMenuCopy || !elements.slotMenuDelete) return;
  if (contextMenuTarget === "text") {
    elements.slotMenuCopy.textContent = "复制文字";
    elements.slotMenuDelete.textContent = "删除文字";
  } else if (contextMenuTarget === "image") {
    elements.slotMenuCopy.textContent = "复制图片";
    elements.slotMenuDelete.textContent = "删除图片";
  } else {
    elements.slotMenuCopy.textContent = "复制坑位";
    elements.slotMenuDelete.textContent = "删除坑位";
  }
  const hasSelection = contextMenuTarget === "text"
    ? AppState.selectedTextIds.length > 0
    : contextMenuTarget === "image"
      ? AppState.selectedImageIds.length > 0
      : AppState.selectedSlotIds.length > 0;
  if (elements.slotMenuBringToFront) {
    elements.slotMenuBringToFront.textContent = "移至顶层";
    elements.slotMenuBringToFront.disabled = !hasSelection;
  }
  if (elements.slotMenuSendToBack) {
    elements.slotMenuSendToBack.textContent = "移至底层";
    elements.slotMenuSendToBack.disabled = !hasSelection;
  }
}

function showSlotMenu(x, y) {
  if (!elements.slotMenu) return;
  const container = getStageElement() || elements.canvasWrapper;
  if (!container?.getBoundingClientRect) return;
  const containerRect = container.getBoundingClientRect();
  updateSlotMenuLabels();
  elements.slotMenu.classList.add("show");
  slotMenuVisible = true;
  elements.slotMenu.style.left = `${x}px`;
  elements.slotMenu.style.top = `${y}px`;
  const menuRect = elements.slotMenu.getBoundingClientRect();
  let nextX = x;
  let nextY = y;
  if (containerRect.width && menuRect.width) {
    nextX = Math.min(nextX, containerRect.width - menuRect.width - 8);
    nextX = Math.max(8, nextX);
  }
  if (containerRect.height && menuRect.height) {
    nextY = Math.min(nextY, containerRect.height - menuRect.height - 8);
    nextY = Math.max(8, nextY);
  }
  elements.slotMenu.style.left = `${nextX}px`;
  elements.slotMenu.style.top = `${nextY}px`;
}

function getSlotAtWorldPoint(point) {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return null;
  const sortedSlots = getSlotsSortedByZOrder(puzzle);
  for (let i = sortedSlots.length - 1; i >= 0; i -= 1) {
    const slot = sortedSlots[i];
    if (isPointInSlot(point, slot)) {
      return slot;
    }
  }
  return null;
}

function rotatePoint(point, center, angleRad) {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos
  };
}

function toLocalTextPoint(worldPoint, textItem, layout) {
  const width = layout.width;
  const height = layout.height;
  const rotation = (Number(textItem.rotation) || 0) * (Math.PI / 180);
  const center = {
    x: (textItem.x || 0) + width / 2,
    y: (textItem.y || 0) + height / 2
  };
  const unrotated = rotatePoint(worldPoint, center, -rotation);
  return {
    x: unrotated.x - (center.x - width / 2),
    y: unrotated.y - (center.y - height / 2),
    width,
    height
  };
}

function isPointInText(worldPoint, textItem, layout) {
  const local = toLocalTextPoint(worldPoint, textItem, layout);
  return local.x >= 0 && local.x <= local.width && local.y >= 0 && local.y <= local.height;
}

function toLocalImagePoint(worldPoint, imageItem) {
  const width = Math.max(1, Number(imageItem.width) || 1);
  const height = Math.max(1, Number(imageItem.height) || 1);
  const rotation = (Number(imageItem.rotation) || 0) * (Math.PI / 180);
  const center = {
    x: (imageItem.x || 0) + width / 2,
    y: (imageItem.y || 0) + height / 2
  };
  const unrotated = rotatePoint(worldPoint, center, -rotation);
  return {
    x: unrotated.x - (center.x - width / 2),
    y: unrotated.y - (center.y - height / 2),
    width,
    height
  };
}

function isPointInImage(worldPoint, imageItem) {
  const local = toLocalImagePoint(worldPoint, imageItem);
  return local.x >= 0 && local.x <= local.width && local.y >= 0 && local.y <= local.height;
}

function getTextAtWorldPoint(point) {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return null;
  const texts = Array.isArray(puzzle.texts) ? [...puzzle.texts] : [];
  texts.sort(compareByCreatedAt);
  for (let i = texts.length - 1; i >= 0; i -= 1) {
    const text = texts[i];
    const layout = getTextLayout(ctx, text);
    if (isPointInText(point, text, layout)) {
      return text;
    }
  }
  return null;
}

function getImageAtWorldPoint(point) {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return null;
  const images = Array.isArray(puzzle.images) ? [...puzzle.images] : [];
  images.sort(compareByCreatedAt);
  for (let i = images.length - 1; i >= 0; i -= 1) {
    const image = images[i];
    if (isPointInImage(point, image)) {
      return image;
    }
  }
  return null;
}

function getElementAtWorldPoint(point) {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return null;
  const elementsToCheck = [
    ...(puzzle.texts || []).map((item) => ({
      type: "text",
      item,
      createdAt: item.createdAt || 0
    })),
    ...(puzzle.images || []).map((item) => ({
      type: "image",
      item,
      createdAt: item.createdAt || 0
    }))
  ].sort((a, b) => compareByCreatedAt(a.item, b.item));
  for (let i = elementsToCheck.length - 1; i >= 0; i -= 1) {
    const element = elementsToCheck[i];
    if (element.type === "text") {
      const layout = getTextLayout(ctx, element.item);
      if (isPointInText(point, element.item, layout)) {
        return { type: "text", item: element.item };
      }
    } else if (element.type === "image") {
      if (isPointInImage(point, element.item)) {
        return { type: "image", item: element.item };
      }
    }
  }
  return null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getEditorBaseScale() {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return null;
  return getStageFitScale(puzzle.canvasSize);
}

function normalizeEditorZoom(value) {
  return clamp(value, EDIT_ZOOM_MIN, EDIT_ZOOM_MAX);
}

function applyEditorContainerZoom(zoomValue = editZoomLevel) {
  if (!elements.canvasWrapper) return false;
  const zoom = normalizeEditorZoom(zoomValue);
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return false;
  const layout = layoutCanvasInStage({
    canvasSize: puzzle.canvasSize,
    zoomRatio: zoom
  });
  return !!layout?.changed;
}

function getCurrentZoomRatio() {
  if (AppState.mode === "preview") {
    const task = AppState.taskQueue?.[AppState.previewIndex];
    const baseScale = getPreviewBaseScale(task);
    const view = ensurePreviewView(task);
    if (!baseScale || !view?.scale) return null;
    return view.scale / baseScale;
  }
  return editZoomLevel;
}

function updateZoomButtonState() {
  if (elements.zoomOutBtn) {
    elements.zoomOutBtn.disabled = false;
  }
  if (elements.zoomInBtn) {
    elements.zoomInBtn.disabled = false;
  }
  const ratio = getCurrentZoomRatio();
  if (!Number.isFinite(ratio)) return;
  const atMin = ratio <= EDIT_ZOOM_MIN + ZOOM_EPSILON;
  const atMax = ratio >= EDIT_ZOOM_MAX - ZOOM_EPSILON;
  if (elements.zoomOutBtn) {
    elements.zoomOutBtn.disabled = atMin;
  }
  if (elements.zoomInBtn) {
    elements.zoomInBtn.disabled = atMax;
  }
}

function updateEditorZoomLabel() {
  if (!elements.zoomLabel || !editor) return;
  if (AppState.mode === "preview") {
    updatePreviewZoomLabel();
    return;
  }
  elements.zoomLabel.textContent = `${Math.round(editZoomLevel * 100)}%`;
  updateZoomButtonState();
}

function updateCanvasWrapperHeight() {
  if (AppState.mode !== "edit") return;
  applyEditorContainerZoom(editZoomLevel);
}

function setEditorZoomCentered(nextZoom) {
  if (!editor || !elements.canvas) return;
  const zoom = normalizeEditorZoom(nextZoom);
  editZoomLevel = zoom;
  resizeCanvas();
}

function handleEditorZoomIn() {
  if (AppState.mode !== "edit") return;
  const currentZoom = getCurrentZoomRatio() || 1;
  setEditorZoomCentered(currentZoom + EDIT_ZOOM_STEP);
}

function handleEditorZoomOut() {
  if (AppState.mode !== "edit") return;
  const currentZoom = getCurrentZoomRatio() || 1;
  setEditorZoomCentered(currentZoom - EDIT_ZOOM_STEP);
}

function getWheelZoomFactor(deltaY) {
  const value = Number(deltaY);
  if (!Number.isFinite(value) || value === 0) return null;
  return value > 0 ? 0.9 : 1.1;
}

function applyEditorWheelZoom(deltaY) {
  if (AppState.mode !== "edit") return false;
  const factor = getWheelZoomFactor(deltaY);
  if (!factor) return false;
  const currentZoom = getCurrentZoomRatio() || 1;
  const nextZoom = clamp(
    currentZoom * factor,
    EDIT_ZOOM_MIN,
    EDIT_ZOOM_MAX
  );
  if (Math.abs(nextZoom - currentZoom) <= ZOOM_EPSILON) return false;
  setEditorZoomCentered(nextZoom);
  return true;
}

function handlePreviewZoomIn() {
  if (AppState.mode !== "preview") return;
  const task = AppState.taskQueue?.[AppState.previewIndex];
  const baseScale = getPreviewBaseScale(task);
  if (!baseScale) return;
  const view = ensurePreviewView(task);
  const currentZoom = view.scale / baseScale;
  const nextZoom = clamp(currentZoom + EDIT_ZOOM_STEP, EDIT_ZOOM_MIN, EDIT_ZOOM_MAX);
  setPreviewScaleCentered(baseScale * nextZoom);
  updatePreviewZoomLabel();
  scheduleRender();
}

function handlePreviewZoomOut() {
  if (AppState.mode !== "preview") return;
  const task = AppState.taskQueue?.[AppState.previewIndex];
  const baseScale = getPreviewBaseScale(task);
  if (!baseScale) return;
  const view = ensurePreviewView(task);
  const currentZoom = view.scale / baseScale;
  const nextZoom = clamp(currentZoom - EDIT_ZOOM_STEP, EDIT_ZOOM_MIN, EDIT_ZOOM_MAX);
  setPreviewScaleCentered(baseScale * nextZoom);
  updatePreviewZoomLabel();
  scheduleRender();
}

function handlePreviewZoomFit() {
  if (AppState.mode !== "preview") return;
  const task = AppState.taskQueue?.[AppState.previewIndex];
  const baseScale = getPreviewBaseScale(task);
  if (!baseScale) return;
  setPreviewScaleCentered(baseScale);
  updatePreviewZoomLabel();
  scheduleRender();
}

function handlePreviewZoomPixel() {
  if (AppState.mode !== "preview") return;
  const task = AppState.taskQueue?.[AppState.previewIndex];
  const baseScale = getPreviewBaseScale(task);
  if (!baseScale) return;
  const nextZoom = clamp(1 / baseScale, EDIT_ZOOM_MIN, EDIT_ZOOM_MAX);
  setPreviewScaleCentered(baseScale * nextZoom);
  updatePreviewZoomLabel();
  scheduleRender();
}

function applyPreviewWheelZoom(deltaY) {
  if (AppState.mode !== "preview") return false;
  const task = AppState.taskQueue?.[AppState.previewIndex];
  const baseScale = getPreviewBaseScale(task);
  if (!baseScale || !elements.canvas) return false;
  const view = ensurePreviewView(task);
  if (!view) return false;
  const factor = getWheelZoomFactor(deltaY);
  if (!factor) return false;
  const currentZoom = view.scale / baseScale;
  const nextZoom = clamp(
    currentZoom * factor,
    EDIT_ZOOM_MIN,
    EDIT_ZOOM_MAX
  );
  if (Math.abs(nextZoom - currentZoom) <= ZOOM_EPSILON) return false;
  setPreviewScaleCentered(baseScale * nextZoom);
  updatePreviewZoomLabel();
  scheduleRender();
  return true;
}

function applyActiveWheelZoom(deltaY) {
  if (AppState.mode === "preview") {
    return applyPreviewWheelZoom(deltaY);
  }
  return applyEditorWheelZoom(deltaY);
}

function handlePreviewWheel(event) {
  if (AppState.mode !== "preview") return;
  if (!event.ctrlKey) return;
  event.preventDefault();
  applyPreviewWheelZoom(event.deltaY);
}

function shouldIgnoreStageWheelEvent(event) {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  return !!target.closest(
    "button,input,select,textarea,.puzzle-slot-menu,.puzzle-preview-bar,.puzzle-preview-zoom,.puzzle-preview-meta,.puzzle-text-edit"
  );
}

function handleStageWheelZoom(event) {
  if (event.defaultPrevented) return;
  if (!event.ctrlKey) return;
  if (shouldIgnoreStageWheelEvent(event)) return;
  event.preventDefault();
  applyActiveWheelZoom(event.deltaY);
}

function handleZoomIn() {
  if (AppState.mode === "preview") {
    handlePreviewZoomIn();
  } else {
    handleEditorZoomIn();
  }
}

function handleZoomOut() {
  if (AppState.mode === "preview") {
    handlePreviewZoomOut();
  } else {
    handleEditorZoomOut();
  }
}

async function resolveImagePath(pathValue) {
  if (!pathValue) return null;
  if (pathValue.startsWith("file://")) return pathValue;
  if (/^[A-Za-z]:[\\/]/.test(pathValue) || pathValue.startsWith("\\\\")) {
    return pathValue;
  }
  if (window.appApi?.loadPuzzleBackground) {
    const result = await window.appApi.loadPuzzleBackground(pathValue);
    if (result?.ok && result.absolutePath) {
      return result.absolutePath;
    }
  }
  return pathValue;
}

function loadImage(path) {
  if (!path) return Promise.resolve(null);
  if (imageCache.has(path)) {
    return imageCache.get(path);
  }
  const promise = resolveImagePath(path).then((resolved) => {
    if (!resolved) return null;
    if (imageCache.has(resolved) && typeof imageCache.get(resolved)?.then !== "function") {
      const cached = imageCache.get(resolved);
      imageCache.set(path, cached);
      return cached;
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = toFileUrl(resolved);
    }).then((img) => {
      if (img) {
        imageCache.set(resolved, img);
        imageCache.set(path, img);
      }
      return img;
    });
  });
  imageCache.set(path, promise);
  return promise;
}

function drawImageElement(ctx, imageItem) {
  if (!imageItem?.imagePath) return;
  if (!imageCache.has(imageItem.imagePath)) {
    loadImage(imageItem.imagePath).then(() => scheduleRender());
  }
  const cached = imageCache.get(imageItem.imagePath);
  if (cached && typeof cached.then === "function") {
    cached.then((img) => {
      if (!img) return;
      const width = Math.max(1, Number(imageItem.width) || img.width || 1);
      const height = Math.max(1, Number(imageItem.height) || img.height || 1);
      const rotation = (Number(imageItem.rotation) || 0) * (Math.PI / 180);
      const centerX = (imageItem.x || 0) + width / 2;
      const centerY = (imageItem.y || 0) + height / 2;
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(rotation);
      ctx.drawImage(img, -width / 2, -height / 2, width, height);
      ctx.restore();
      scheduleRender();
    });
    return;
  }
  if (!cached) return;
  const width = Math.max(1, Number(imageItem.width) || cached.width || 1);
  const height = Math.max(1, Number(imageItem.height) || cached.height || 1);
  const rotation = (Number(imageItem.rotation) || 0) * (Math.PI / 180);
  const centerX = (imageItem.x || 0) + width / 2;
  const centerY = (imageItem.y || 0) + height / 2;
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(rotation);
  ctx.drawImage(cached, -width / 2, -height / 2, width, height);
  ctx.restore();
}

function toFileUrl(path) {
  if (!path) return "";
  if (path.startsWith("file://")) return path;
  return `file:///${path.replace(/\\/g, "/")}`;
}

async function loadBackgroundImage(puzzle) {
  if (!puzzle?.backgroundPath) return null;
  if (backgroundCache.has(puzzle.backgroundPath)) {
    return backgroundCache.get(puzzle.backgroundPath);
  }
  if (!window.appApi?.loadPuzzleBackground) return null;
  const result = await window.appApi.loadPuzzleBackground(puzzle.backgroundPath);
  if (!result?.ok || !result.absolutePath) return null;
  const promise = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = toFileUrl(result.absolutePath);
  }).then((img) => {
    if (img) {
      backgroundCache.set(puzzle.backgroundPath, img);
    }
    return img;
  });
  backgroundCache.set(puzzle.backgroundPath, promise);
  return promise;
}

function closeTextEditor() {
  if (textEditInput && textEditInput.parentNode) {
    textEditInput.parentNode.removeChild(textEditInput);
  }
  textEditInput = null;
}

function exitTextEditMode() {
  pendingTextEditExitAfterColorPickerHide = false;
  AppState.editingTextId = null;
  closeTextEditor();
}

function updateTextEditorPosition() {
  if (!textEditInput || !editor) return;
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return;
  const text = puzzle.texts.find((item) => item.id === AppState.editingTextId);
  if (!text) return;
  const layout = getTextLayout(ctx, text);
  const style = text.style || {};
  const center = {
    x: text.x + layout.width / 2,
    y: text.y + layout.height / 2
  };
  const screenCenter = editor.toScreen(center);
  const scaledWidth = layout.width * editor.view.scale;
  const scaledHeight = layout.height * editor.view.scale;
  textEditInput.style.width = `${Math.max(10, scaledWidth)}px`;
  textEditInput.style.height = `${Math.max(10, scaledHeight)}px`;
  textEditInput.style.left = `${screenCenter.x - scaledWidth / 2}px`;
  textEditInput.style.top = `${screenCenter.y - scaledHeight / 2}px`;
  textEditInput.style.fontFamily = `"${style.fontFamily || "SourceHanSansCN"}"`;
  textEditInput.style.fontSize = `${(style.fontSize || 32) * editor.view.scale}px`;
  textEditInput.style.fontWeight = style.fontWeight || 400;
  textEditInput.style.fontStyle = style.fontStyle || "normal";
  textEditInput.style.color = style.color || "#000000";
  textEditInput.style.letterSpacing = `${(style.letterSpacing || 0) * editor.view.scale}px`;
  textEditInput.style.lineHeight = String(style.lineHeight || 1.4);
  textEditInput.style.textAlign = style.textAlign || "left";
  textEditInput.style.transform = `rotate(${text.rotation || 0}deg)`;
}

function openTextEditor(textItem) {
  if (!elements.canvasWrapper || !editor) return;
  pendingTextEditExitAfterColorPickerHide = false;
  closeTextEditor();
  AppState.selectedTextIds = [textItem.id];
  AppState.selectedSlotIds = [];
  AppState.selectedImageIds = [];
  AppState.editingTextId = textItem.id;
  pushUndoState();
  const layout = getTextLayout(ctx, textItem);
  const style = textItem.style || {};
  ensureFontLoaded(style.fontFamily, style.fontWeight, style.fontStyle).then(() => scheduleRender());
  const center = {
    x: textItem.x + layout.width / 2,
    y: textItem.y + layout.height / 2
  };
  const screenCenter = editor.toScreen(center);
  const scaledWidth = layout.width * editor.view.scale;
  const scaledHeight = layout.height * editor.view.scale;

  const input = document.createElement("textarea");
  input.className = "puzzle-text-edit";
  input.value = textItem.content || "";
  input.style.width = `${Math.max(10, scaledWidth)}px`;
  input.style.height = `${Math.max(10, scaledHeight)}px`;
  input.style.left = `${screenCenter.x - scaledWidth / 2}px`;
  input.style.top = `${screenCenter.y - scaledHeight / 2}px`;
  input.style.fontFamily = `"${style.fontFamily || "SourceHanSansCN"}"`;
  input.style.fontSize = `${(style.fontSize || 32) * editor.view.scale}px`;
  input.style.fontWeight = style.fontWeight || 400;
  input.style.fontStyle = style.fontStyle || "normal";
  input.style.color = style.color || "#000000";
  input.style.letterSpacing = `${(style.letterSpacing || 0) * editor.view.scale}px`;
  input.style.lineHeight = String(style.lineHeight || 1.4);
  input.style.textAlign = style.textAlign || "left";
  input.style.transform = `rotate(${textItem.rotation || 0}deg)`;
  input.style.transformOrigin = "center";

  // 阻止鼠标事件冒泡到 canvas，防止拖选文字时触发 canvas 的 mousedown 导致编辑框关闭
  input.addEventListener("mousedown", (event) => { event.stopPropagation(); });
  input.addEventListener("mousemove", (event) => { event.stopPropagation(); });
  input.addEventListener("mouseup", (event) => { event.stopPropagation(); });
  input.addEventListener("dblclick", (event) => { event.stopPropagation(); });

  input.addEventListener("input", () => {
    textItem.content = input.value;
    updateTextEditorPosition();
    saveStateToStorage();
    scheduleRender();
  });
  input.addEventListener("paste", () => {
    setTimeout(() => {
      textItem.content = input.value;
      updateTextEditorPosition();
      saveStateToStorage();
      scheduleRender();
    }, 0);
  });
  input.addEventListener("blur", () => {
    setTimeout(() => {
      if (!reconcileTextEditState()) return;
      if (document.hidden || !document.hasFocus()) return;
      if (isTextEditFocusContext(document.activeElement)) return;
      if (isColorPickerPopoverOpen()) {
        queueTextEditExitAfterColorPickerHide();
        return;
      }
      exitTextEditMode();
      updatePropertiesPanel();
      scheduleRender();
    }, 0);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      input.blur();
    }
  });

  elements.canvasWrapper.appendChild(input);
  textEditInput = input;
  input.focus();
  input.select();
}

function renderEditor(puzzle) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (!puzzle) return;
  const view = editor.view;
  ctx.save();
  ctx.translate(view.offsetX, view.offsetY);
  ctx.scale(view.scale, view.scale);

  if (puzzle.backgroundMode !== "transparent") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, puzzle.canvasSize.w, puzzle.canvasSize.h);
  }

  if (puzzle.backgroundMode === "color") {
    ctx.fillStyle = puzzle.backgroundColor || "#ffffff";
    ctx.fillRect(0, 0, puzzle.canvasSize.w, puzzle.canvasSize.h);
  }

  if (puzzle.backgroundMode === "image" && puzzle.backgroundPath) {
    if (!backgroundCache.has(puzzle.backgroundPath)) {
      loadBackgroundImage(puzzle).then(() => scheduleRender());
    }
    const cached = backgroundCache.get(puzzle.backgroundPath);
    if (cached && typeof cached.then === "function") {
      cached.then((image) => {
        if (image) {
          ctx.drawImage(image, 0, 0, puzzle.canvasSize.w, puzzle.canvasSize.h);
          scheduleRender();
        }
      });
    } else if (cached) {
      ctx.drawImage(cached, 0, 0, puzzle.canvasSize.w, puzzle.canvasSize.h);
    }
  }

  ctx.save();
  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, puzzle.canvasSize.w, puzzle.canvasSize.h);
  ctx.restore();

  const slotsToDraw = getSlotsSortedByZOrder(puzzle);
  drawSlots(ctx, slotsToDraw, AppState.selectedSlotIds);
  const elementsToDraw = [];
  if (puzzle.texts && puzzle.texts.length) {
    puzzle.texts.forEach((text) => {
      elementsToDraw.push({
        type: "text",
        item: text,
        createdAt: text.createdAt || 0
      });
    });
  }
  if (puzzle.images && puzzle.images.length) {
    puzzle.images.forEach((image) => {
      elementsToDraw.push({
        type: "image",
        item: image,
        createdAt: image.createdAt || 0
      });
    });
  }
  if (elementsToDraw.length) {
    elementsToDraw.sort((a, b) => compareByCreatedAt(a.item, b.item));
    elementsToDraw.forEach((entry) => {
      if (entry.type === "text") {
        // 正在编辑的文字由 textarea 负责显示，canvas 跳过渲染避免重影
        if (AppState.editingTextId && entry.item.id === AppState.editingTextId) return;
        drawText(ctx, entry.item);
      } else if (entry.type === "image") {
        drawImageElement(ctx, entry.item);
      }
    });
  }
  if (AppState.selectedSlotIds.length === 1) {
    const slot = puzzle.slots.find((item) => item.id === AppState.selectedSlotIds[0]);
    if (slot) {
      drawHandles(ctx, slot);
    }
  }
  const slotGroupBounds = getSlotGroupBounds(puzzle);
  if (slotGroupBounds) {
    drawGroupHandles(ctx, slotGroupBounds, "#1f6f5c", HANDLE_SIZE);
  }
  if (AppState.selectedImageIds.length) {
    AppState.selectedImageIds.forEach((id) => {
      const image = puzzle.images.find((item) => item.id === id);
      if (!image) return;
      const width = Math.max(1, Number(image.width) || 1);
      const height = Math.max(1, Number(image.height) || 1);
      drawTextSelection(ctx, { x: image.x, y: image.y, rotation: image.rotation }, { width, height });
    });
  }
  const imageGroupBounds = getImageGroupBounds(puzzle);
  if (imageGroupBounds) {
    drawGroupHandles(ctx, imageGroupBounds, "#2196f3", TEXT_HANDLE_SIZE);
  }
  if (AppState.selectedTextIds.length) {
    AppState.selectedTextIds.forEach((id) => {
      // 正在编辑的文字由 textarea border 显示选中框，canvas 跳过以避免重叠
      if (AppState.editingTextId && id === AppState.editingTextId) return;
      const text = puzzle.texts.find((item) => item.id === id);
      if (!text) return;
      const layout = getTextLayout(ctx, text);
      drawTextSelection(ctx, text, layout);
    });
  }
  const textGroupBounds = getTextGroupBounds(puzzle);
  if (textGroupBounds) {
    drawGroupHandles(ctx, textGroupBounds, "#2196f3", TEXT_HANDLE_SIZE);
  }
  if (selectionOverlay) {
    drawSelectionOverlay(ctx, selectionOverlay);
  }
  ctx.restore();
  updateTextEditorPosition();
}

async function renderPreviewMode(renderToken) {
  const shouldAbort = () => renderToken !== previewRenderToken || AppState.mode !== "preview";
  if (shouldAbort()) return;
  const task = AppState.taskQueue[AppState.previewIndex];
  if (!task) return;
  const view = ensurePreviewView(task);
  let backgroundImage = null;
  if (task.backgroundMode === "image" && task.backgroundPath) {
    backgroundImage = await loadBackgroundImage({ backgroundPath: task.backgroundPath });
  }
  if (shouldAbort()) return;
  await drawPreview(ctx, task, backgroundImage, loadImage, view, shouldAbort);
}

function render() {
  const puzzle = getCurrentPuzzle();
  updateEmptyHint();
  if (AppState.mode === "preview") {
    queuePreviewRender();
  } else {
    renderEditor(puzzle);
  }
}

function resizeCanvas() {
  const isPreview = AppState.mode === "preview";
  const puzzle = getCurrentPuzzle();
  const task = AppState.taskQueue?.[AppState.previewIndex];
  const canvasSize = isPreview ? task?.canvasSize : puzzle?.canvasSize;
  if (!canvasSize) return;
  const scrollSnapshot = getStageScrollSnapshot();

  let zoomRatio = 1;
  if (isPreview) {
    zoomRatio = getPreviewZoomRatio(task);
  } else {
    editZoomLevel = normalizeEditorZoom(editZoomLevel);
    zoomRatio = editZoomLevel;
  }

  const layout = layoutCanvasInStage({ canvasSize, zoomRatio });
  if (!layout) return;
  applyCanvasBackingSize(layout);

  if (isPreview) {
    centerPreviewView(layout);
  } else {
    centerEditorView(layout);
  }
  syncStageScrollAfterLayout(layout, scrollSnapshot);

  if (AppState.mode === "preview") {
    updatePreviewZoomLabel();
  } else {
    updateEditorZoomLabel();
  }
  scheduleRender();
}

function bindTabActivation() {
  const puzzleTabButton = document.querySelector(".tab-button[data-tab='puzzle']");
  if (puzzleTabButton) {
    puzzleTabButton.addEventListener("click", () => {
      setTimeout(() => {
        resizeCanvas();
      }, 0);
    });
  }
}

function observeCanvasWrapper() {
  const stage = getStageElement();
  if (!stage || typeof ResizeObserver === "undefined") {
    return;
  }
  const observer = new ResizeObserver(() => {
    resizeCanvas();
  });
  observer.observe(stage);
}

function applyCanvasSize() {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return;
  const w = Number(elements.canvasWInput.value);
  const h = Number(elements.canvasHInput.value);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return;
  const clamped = clampPuzzleCanvasSize(w, h);
  const nextW = clamped.w;
  const nextH = clamped.h;
  elements.canvasWInput.value = String(nextW);
  elements.canvasHInput.value = String(nextH);
  if (clamped.adjusted) {
    setStatus(`画布尺寸已自动限制为 ${nextW}x${nextH}（上限 ${PUZZLE_CANVAS_MAX_DIMENSION}px / ${PUZZLE_CANVAS_MAX_PIXELS} 像素）`);
    logPuzzle(`画布尺寸自动限制: ${clamped.sourceW}x${clamped.sourceH} -> ${nextW}x${nextH} (${clamped.reason})`);
  }
  if (puzzle.canvasSize.w === nextW && puzzle.canvasSize.h === nextH) return;
  puzzle.canvasSize.w = nextW;
  puzzle.canvasSize.h = nextH;
  updateCanvasAspect();
  setEditorZoomCentered(editZoomLevel);
  updateEstimateCount();
  saveStateToStorage();
  scheduleRender();
}

function handleCanvasSizeInput() {
  applyCanvasSize();
}

function handleAddSlot() {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return;
  pushUndoState();
  const slot = createDefaultSlot();
  slot.x = Math.max(0, Math.round((puzzle.canvasSize.w - slot.w) / 2));
  slot.y = Math.max(0, Math.round((puzzle.canvasSize.h - slot.h) / 2));
  assignNewSlotLayerFields(puzzle, slot);
  puzzle.slots.push(slot);
  AppState.selectedSlotIds = [slot.id];
  AppState.selectedTextIds = [];
  AppState.selectedImageIds = [];
  exitTextEditMode();
  updatePropertiesPanel();
  updateEstimateCount();
  saveStateToStorage();
  scheduleRender();
  logPuzzle(`新增坑位（${puzzle.name}）`);
}

function handleAddText() {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return;
  pushUndoState();
  const text = createDefaultText();
  const layout = getTextLayout(ctx, text);
  text.x = Math.max(0, Math.round((puzzle.canvasSize.w - layout.width) / 2));
  text.y = Math.max(0, Math.round((puzzle.canvasSize.h - layout.height) / 2));
  assignNewElementLayerFields(puzzle, text);
  puzzle.texts.push(text);
  AppState.selectedSlotIds = [];
  AppState.selectedTextIds = [text.id];
  AppState.selectedImageIds = [];
  exitTextEditMode();
  ensureFontLoaded(text.style?.fontFamily, text.style?.fontWeight, text.style?.fontStyle).then(
    () => scheduleRender()
  );
  updatePropertiesPanel();
  saveStateToStorage();
  scheduleRender();
  logPuzzle(`新增文字（${puzzle.name}）`);
}

async function handleAddImageElement() {
  if (!window.appApi?.openImageFile || !window.appApi?.copyPuzzleSticker) {
    setStatus("添加图片接口不可用");
    return;
  }
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return;
  const result = await window.appApi.openImageFile();
  if (!result || result.canceled) return;
  const filePath = result.filePaths?.[0];
  if (!filePath) return;
  const copyResult = await window.appApi.copyPuzzleSticker({ path: filePath });
  if (!copyResult?.ok || !copyResult.relativePath) {
    setStatus(copyResult?.error || "图片保存失败");
    return;
  }
  const img = await loadImage(copyResult.relativePath);
  if (!img) {
    setStatus("图片读取失败");
    return;
  }
  pushUndoState();
  let imageW = Math.max(1, Math.round(img.width || 1));
  let imageH = Math.max(1, Math.round(img.height || 1));
  const maxW = Math.max(1, Math.round(puzzle.canvasSize.w));
  const maxH = Math.max(1, Math.round(puzzle.canvasSize.h));
  if (imageW > maxW || imageH > maxH) {
    const scale = Math.min(maxW / imageW, maxH / imageH);
    imageW = Math.max(1, Math.round(imageW * scale));
    imageH = Math.max(1, Math.round(imageH * scale));
  }
  const image = createDefaultImage();
  image.imagePath = copyResult.relativePath;
  image.width = imageW;
  image.height = imageH;
  image.aspectRatio = imageH ? imageW / imageH : image.aspectRatio;
  image.x = Math.max(0, Math.round((puzzle.canvasSize.w - image.width) / 2));
  image.y = Math.max(0, Math.round((puzzle.canvasSize.h - image.height) / 2));
  assignNewElementLayerFields(puzzle, image);
  puzzle.images = puzzle.images || [];
  puzzle.images.push(image);
  AppState.selectedSlotIds = [];
  AppState.selectedTextIds = [];
  AppState.selectedImageIds = [image.id];
  exitTextEditMode();
  updatePropertiesPanel();
  saveStateToStorage();
  scheduleRender();
  logPuzzle(`添加图片元素（${puzzle.name}）`);
}

async function handleAddImageSlot() {
  if (!window.appApi?.openImageFile) {
    setStatus("添加图片接口不可用");
    return;
  }
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return;
  const result = await window.appApi.openImageFile();
  if (!result || result.canceled) return;
  const filePath = result.filePaths?.[0];
  if (!filePath) return;
  const img = await loadImage(filePath);
  if (!img) {
    setStatus("图片读取失败");
    return;
  }
  pushUndoState();
  let slotW = Math.max(1, Math.round(img.width || 1));
  let slotH = Math.max(1, Math.round(img.height || 1));
  const maxW = Math.max(1, Math.round(puzzle.canvasSize.w));
  const maxH = Math.max(1, Math.round(puzzle.canvasSize.h));
  if (slotW > maxW || slotH > maxH) {
    const scale = Math.min(maxW / slotW, maxH / slotH);
    slotW = Math.max(1, Math.round(slotW * scale));
    slotH = Math.max(1, Math.round(slotH * scale));
  }
  const slot = createDefaultSlot();
  slot.w = slotW;
  slot.h = slotH;
  slot.x = Math.max(0, Math.round((puzzle.canvasSize.w - slot.w) / 2));
  slot.y = Math.max(0, Math.round((puzzle.canvasSize.h - slot.h) / 2));
  slot.style.lockAspect = true;
  assignNewSlotLayerFields(puzzle, slot);
  puzzle.slots.push(slot);
  AppState.selectedSlotIds = [slot.id];
  AppState.selectedTextIds = [];
  AppState.selectedImageIds = [];
  exitTextEditMode();
  updatePropertiesPanel();
  updateEstimateCount();
  saveStateToStorage();
  scheduleRender();
  logPuzzle(`添加图片坑位（${puzzle.name}）`);
}

async function handleClearSlots() {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return;
  if (!await showConfirmModal("确定清空当前拼图的所有坑位吗？", "清空坑位")) return;
  pushUndoState();
  puzzle.slots = [];
  clearSelections();
  updatePropertiesPanel();
  updateEstimateCount();
  saveStateToStorage();
  scheduleRender();
  logPuzzle(`清空坑位（${puzzle.name}）`);
}

async function handleClearTexts() {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return;
  if (!await showConfirmModal("确定清空当前拼图的所有文字吗？", "清空文字")) return;
  if (!puzzle.texts || puzzle.texts.length === 0) return;
  pushUndoState();
  puzzle.texts = [];
  AppState.selectedTextIds = [];
  AppState.selectedImageIds = [];
  exitTextEditMode();
  updatePropertiesPanel();
  saveStateToStorage();
  scheduleRender();
  logPuzzle(`清空文字（${puzzle.name}）`);
}

async function handleClearImageElements() {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return;
  if (!await showConfirmModal("确定清空当前拼图的所有图片吗？", "清空图片")) return;
  if (!puzzle.images || puzzle.images.length === 0) return;
  pushUndoState();
  puzzle.images = [];
  AppState.selectedImageIds = [];
  updatePropertiesPanel();
  saveStateToStorage();
  scheduleRender();
  logPuzzle(`清空图片元素（${puzzle.name}）`);
}

function handleSelectOutput() {
  if (!window.appApi?.openOutputFolder) return;
  window.appApi.openOutputFolder().then((result) => {
    if (!result || result.canceled) return;
    AppState.outputDir = result.filePaths?.[0] || "";
    updateOutputPath();
    saveStateToStorage();
    logPuzzle(`设置输出目录: ${AppState.outputDir || "未设置"}`);
  });
}

function handleScaleChange() {
  if (!elements.scaleSelect) return;
  const value = Number(elements.scaleSelect.value);
  AppState.outputScale = Number.isFinite(value) ? value : 1;
  const puzzle = getCurrentPuzzle();
  const safeW = Math.max(1, Math.round(Number(puzzle?.canvasSize?.w) || 1));
  const safeH = Math.max(1, Math.round(Number(puzzle?.canvasSize?.h) || 1));
  const predictedPixels = Math.round(safeW * safeH * AppState.outputScale * AppState.outputScale);
  if (predictedPixels > PUZZLE_CANVAS_MAX_PIXELS) {
    setStatus(`提示：当前导出约 ${predictedPixels.toLocaleString("zh-CN")} 像素，预览/导出会自动降级以防闪退`);
  }
  resetExportPreviewCache();
  saveStateToStorage();
  logPuzzle(`导出倍率 ${AppState.outputScale}x`);
  if (AppState.mode === "preview") {
    updatePreviewZoomLabel();
    scheduleRender();
  }
}

async function handleImportImages() {
  if (!window.appApi?.openImageFiles) {
    setStatus("图片导入接口不可用");
    return;
  }
  if (AppState.generationMode === "multi-folder") {
    setStatus("多文件夹模式请使用选择文件夹");
    return;
  }
  const result = await window.appApi.openImageFiles();
  if (!result || result.canceled) {
    setStatus("未选择图片");
    return;
  }
  const files = Array.isArray(result.files) ? result.files : [];
  const filtered = files.filter((filePath) => isImagePath(filePath));
  const images = filtered.map((filePath) => ({
    name: getFileNameFromPath(filePath),
    path: filePath
  }));

  if (!images.length) {
    setStatus("未选择图片");
    return;
  }

  const normalized = images.map((item) => ({
    name: item?.name || getFileNameFromPath(item?.path || item),
    path: item?.path || item
  }));
  normalized.sort(compareImageListItemNatural);

  const stamp = Date.now();
  const existing = Array.isArray(AppState.images) ? AppState.images : [];
  const additions = normalized.map((item, index) => ({
    id: `img-${stamp}-${index}`,
    name: item.name,
    path: item.path
  }));
  AppState.images = existing.concat(additions);
  updateImageList();
  saveStateToStorage();
  scheduleRender();
  logPuzzle(`导入图片 ${additions.length} 张`);
}

function handleClearImages() {
  if (AppState.generationMode === "single") {
    AppState.images = [];
  } else if (isSubfolderBatchMode()) {
    AppState.multiFolderConfig = normalizeMultiFolderConfig(
      {
        ...AppState.multiFolderConfig,
        subfolderBatch: {
          ...AppState.multiFolderConfig?.subfolderBatch,
          parentFolder: "",
          parentFolderAccessible: true,
          groups: [],
          lastScannedAt: 0
        }
      },
      AppState.puzzles
    );
  } else {
    AppState.folderBindings = {};
    AppState.multiFolderConfig = normalizeMultiFolderConfig(
      {
        ...AppState.multiFolderConfig,
        perPuzzle: {
          ...AppState.multiFolderConfig?.perPuzzle,
          folderBindings: {}
        }
      },
      AppState.puzzles
    );
  }
  syncLegacyPerPuzzleStateFromConfig();
  updateImageList();
  saveStateToStorage();
  scheduleRender();
  logPuzzle("清空图片列表");
}

function handleAssignFolders() {
  if (AppState.generationMode !== "multi-folder") return;
  openFolderModal();
}

async function handleUploadBackground() {
  if (!window.appApi?.openImageFile || !window.appApi?.copyPuzzleBackground) {
    setStatus("背景图接口不可用");
    return;
  }
  const result = await window.appApi.openImageFile();
  if (!result || result.canceled) return;
  const filePath = result.filePaths?.[0];
  if (!filePath) return;
  const copyResult = await window.appApi.copyPuzzleBackground({ path: filePath });
  if (!copyResult?.ok) {
    setStatus(copyResult?.error || "背景图保存失败");
    return;
  }
  const puzzle = getCurrentPuzzle();
  puzzle.backgroundPath = copyResult.relativePath;
  puzzle.backgroundMode = "image";
  elements.transparentToggle.checked = false;
  if (elements.colorToggle) {
    elements.colorToggle.checked = false;
  }
  if (elements.colorInput) {
    elements.colorInput.disabled = false;
  }
  const img = await loadBackgroundImage(puzzle);
  if (img) {
    const clamped = clampPuzzleCanvasSize(img.width, img.height);
    puzzle.canvasSize = { w: clamped.w, h: clamped.h };
    if (clamped.adjusted) {
      setStatus(`背景图尺寸较大，画布已自动调整为 ${clamped.w}x${clamped.h}`);
      logPuzzle(`背景图画布自动限制: ${clamped.sourceW}x${clamped.sourceH} -> ${clamped.w}x${clamped.h} (${clamped.reason})`);
    }
    syncCanvasInputs();
    setEditorZoomCentered(editZoomLevel);
  }
  updateEstimateCount();
  saveStateToStorage();
  scheduleRender();
  logPuzzle(`设置背景图（${puzzle.name}）`);
}

function handleTransparentToggle() {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return;
  if (elements.transparentToggle.checked) {
    setBackgroundMode("transparent");
  } else if (elements.colorToggle?.checked) {
    setBackgroundMode("color");
  } else {
    setBackgroundMode("image");
  }
  logPuzzle(`透明背景 ${puzzle.backgroundMode === "transparent" ? "开启" : "关闭"}（${puzzle.name}）`);
}

function handleColorToggle() {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return;
  if (elements.colorToggle?.checked) {
    setBackgroundMode("color");
  } else if (elements.transparentToggle?.checked) {
    setBackgroundMode("transparent");
  } else {
    setBackgroundMode("image");
  }
  logPuzzle(`纯色背景 ${puzzle.backgroundMode === "color" ? "开启" : "关闭"}（${puzzle.name}）`);
}

function handleColorChange() {
  const puzzle = getCurrentPuzzle();
  if (!puzzle || !elements.colorInput) return;
  puzzle.backgroundColor = elements.colorInput.value || "#ffffff";
  if (puzzle.backgroundMode !== "color") {
    setBackgroundMode("color");
    return;
  }
  saveStateToStorage();
  scheduleRender();
}

function handleGenerationModeChange() {
  const selected = Array.from(elements.generationRadios).find((radio) => radio.checked);
  if (!selected) return;
  
  // Visual update
  elements.generationRadios.forEach(radio => {
      const label = radio.closest(".puzzle-radio-item");
      if (label) label.classList.toggle("checked", radio.checked);
  });

  AppState.generationMode = selected.value === "multi-folder" ? "multi-folder" : "single";
  syncGenerationModeUI();
  updateEstimateCount();
  saveStateToStorage();
  logPuzzle(`生成规则切换为 ${AppState.generationMode}`);
}

function handleSingleCoverOptionChange() {
  if (!elements.singleCoverOptionCheckbox) return;
  if (elements.singleCoverOptionCheckbox.disabled) return;
  AppState.singleFirstPuzzleOnce = elements.singleCoverOptionCheckbox.checked === true;
  updateEstimateCount();
  saveStateToStorage();
  logPuzzle(`拼图1封面单次生成 ${AppState.singleFirstPuzzleOnce ? "开启" : "关闭"}`);
}

function handleAddTab() {
  if (AppState.puzzles.length >= MAX_PUZZLES) {
    setStatus("拼图数量已达上限");
    return;
  }
  const nextIndex = AppState.puzzles.length + 1;
  AppState.puzzles.push(createPuzzle(`拼图${nextIndex}`));
  AppState.currentPuzzleIndex = AppState.puzzles.length - 1;
  clearSelections();
  renderTabBar();
  syncCanvasInputs();
  updatePropertiesPanel();
  updateEstimateCount();
  updateImageList();
  saveStateToStorage();
  scheduleRender();
  logPuzzle(`新增拼图标签（拼图${nextIndex}）`);
}

async function handleSaveTemplate() {
  if (AppState.currentTemplate?.id) {
    await saveCurrentTemplate();
    return;
  }
  openTemplateModal("create");
}

function handleRenameTemplate() {
  closeTemplateDropdown();
  if (!AppState.currentTemplate?.id) {
    const message = "未选择模板";
    setStatus(message);
    if (window.showToast) {
      window.showToast(message, "warning", 2000);
    }
    return;
  }
  openTemplateModal("rename");
}

async function handleDuplicateTemplate() {
  closeTemplateDropdown();
  if (!AppState.currentTemplate?.id) {
    const message = "未选择模板";
    setStatus(message);
    if (window.showToast) {
      window.showToast(message, "warning", 2000);
    }
    return;
  }
  const source = templates.find((item) => item.id === AppState.currentTemplate.id);
  if (!source) {
    const message = "模板不存在";
    setStatus(message);
    if (window.showToast) {
      window.showToast(message, "error", 3000);
    }
    return;
  }
  let copiedTemplate = null;
  try {
    copiedTemplate = duplicateTemplate(source, templates);
  } catch (error) {
    const message = error?.message || "复制模板失败";
    setStatus(message);
    if (window.showToast) {
      window.showToast(message, "error", 3000);
    }
    return;
  }
  templates.unshift(copiedTemplate);
  const result = await saveTemplates(templates);
  if (!result?.ok) {
    templates = templates.filter((item) => item.id !== copiedTemplate.id);
    const message = result?.error || "复制模板失败";
    setStatus(message);
    if (window.showToast) {
      window.showToast(message, "error", 3000);
    }
    return;
  }
  const applied = applyTemplate(copiedTemplate);
  AppState.puzzles = applied.puzzles;
  AppState.currentPuzzleIndex = 0;
  AppState.generationMode = applied.generationMode;
  AppState.singleFirstPuzzleOnce = normalizeSingleFirstPuzzleOnce(applied.singleFirstPuzzleOnce);
  AppState.currentTemplate = { id: copiedTemplate.id, name: copiedTemplate.name };
  clearSelections();
  clearUndoStack();
  renderTabBar();
  syncCanvasInputs();
  syncGenerationModeUI();
  updateTemplateSelect();
  updatePropertiesPanel();
  updateImageList();
  AppState.puzzles.forEach((puzzle) => preloadTextFonts(puzzle.texts));
  updateEstimateCount();
  syncTemplateAutoSaveBaseline();
  saveStateToStorage();
  scheduleRender();
  showTemplateToast(`已复制为「${copiedTemplate.name}」`, "success", 2200);
  logPuzzle(`复制模板: ${source.name || source.id} -> ${copiedTemplate.name}`);
}

function handleMigrateTemplateLibrary() {
  closeTemplateDropdown();
  openTemplateLibraryModal();
}

async function handleOpenTemplateLibraryFolder() {
  if (!window.appApi?.openPuzzleTemplateLibrary) {
    const message = "模板库接口不可用";
    setStatus(message);
    if (window.showToast) {
      window.showToast(message, "error", 3000);
    }
    return;
  }
  const result = await window.appApi.openPuzzleTemplateLibrary();
  if (!result?.ok) {
    const message = result?.error || "打开模板文件夹失败";
    setStatus(message);
    if (window.showToast) {
      window.showToast(message, "error", 3000);
    }
    return;
  }
  closeTemplateLibraryModal();
  showTemplateToast("已打开模板文件夹", "success", 1800);
}

async function saveCurrentTemplate(options = {}) {
  const {
    source = "manual",
    showSuccessToast = source !== "auto",
    showErrorToast = source !== "auto",
    skipOpenModal = false
  } = options;

  if (source !== "auto" && templateAutoSavePromise) {
    await templateAutoSavePromise;
  }

  if (!AppState.currentTemplate?.id) {
    if (!skipOpenModal) {
      openTemplateModal("create");
    }
    return { ok: false, skipped: true, error: "未选择模板" };
  }

  const name = AppState.currentTemplate?.name || getDefaultTemplateName();
  const existingTemplate = templates.find((item) => item.id === AppState.currentTemplate.id);
  const template = buildTemplate(name, AppState);
  const savedSignature = buildTemplateSignature(
    {
      id: template.id,
      generationMode: template.generationMode,
      singleFirstPuzzleOnce: template.singleFirstPuzzleOnce,
      puzzles: template.puzzles
    },
    template.name
  );
  if (Number.isFinite(existingTemplate?.createdAt)) {
    template.createdAt = existingTemplate.createdAt;
  }

  const previousTemplates = templates;
  const nextTemplates = templates.filter((item) => item.id !== template.id);
  nextTemplates.unshift(template);
  templates = nextTemplates;

  const result = await saveTemplates(templates);
  if (!result?.ok) {
    templates = previousTemplates;
    const message = result?.error || "保存模板失败";
    setStatus(message);
    if (showErrorToast && window.showToast) {
      window.showToast(message, "error", 3000);
    }
    return { ok: false, error: message };
  }

  AppState.currentTemplate = { id: template.id, name: template.name };
  updateTemplateSelect();
  syncTemplateAutoSaveBaseline(savedSignature);
  saveStateToStorage();

  if (showSuccessToast) {
    showTemplateToast(`已保存至 ${template.name}模板`, "success", 2000);
  }

  const sourceLabel = source === "auto" ? "自动保存模板" : "保存模板";
  logPuzzle(`${sourceLabel}: ${template.name}`);
  return { ok: true, template };
}

// 通用确认弹窗（替代 window.confirm）
let _confirmModalResolve = null;

function showConfirmModal(message, title = "确认操作") {
  return new Promise((resolve) => {
    if (!elements.confirmModal || !elements.confirmModalMessage) {
      resolve(window.confirm(message));
      return;
    }
    _confirmModalResolve = resolve;
    if (elements.confirmModalTitle) elements.confirmModalTitle.textContent = title;
    elements.confirmModalMessage.textContent = message;
    elements.confirmModal.classList.add("show");
    if (elements.confirmModalConfirm) elements.confirmModalConfirm.focus();
  });
}

function closeConfirmModal(result) {
  if (!elements.confirmModal) return;
  elements.confirmModal.classList.remove("show");
  if (_confirmModalResolve) {
    _confirmModalResolve(result);
    _confirmModalResolve = null;
  }
}

function openTemplateModal(mode = "create") {
  if (!elements.templateModal || !elements.templateModalInput) return;
  closeTemplateDropdown();
  templateModalMode = mode;
  const isRename = mode === "rename";
  if (isRename && !AppState.currentTemplate?.id) {
    const message = "未选择模板";
    setStatus(message);
    if (window.showToast) {
      window.showToast(message, "warning", 2000);
    }
    return;
  }
  const suggested = isRename
    ? (AppState.currentTemplate?.name || "")
    : (AppState.currentTemplate?.name || getDefaultTemplateName());
  if (elements.templateModalTitle) {
    elements.templateModalTitle.textContent = isRename ? "重命名模板" : "保存模板";
  }
  if (elements.templateModalConfirm) {
    elements.templateModalConfirm.textContent = isRename ? "重命名" : "保存";
  }
  elements.templateModalInput.disabled = false;
  elements.templateModalInput.readOnly = false;
  elements.templateModalInput.value = suggested;
  elements.templateModal.classList.add("show");
  elements.templateModalInput.focus();
  elements.templateModalInput.select();
}

function closeTemplateModal() {
  closeTemplateDropdown();
  if (!elements.templateModal) return;
  elements.templateModal.classList.remove("show");
  templateModalMode = "create";
  if (elements.templateModalTitle) {
    elements.templateModalTitle.textContent = "保存模板";
  }
  if (elements.templateModalConfirm) {
    elements.templateModalConfirm.textContent = "保存";
  }
}

function openTemplateLibraryModal() {
  closeTemplateDropdown();
  if (!elements.templateLibraryModal) return;
  elements.templateLibraryModal.classList.add("show");
}

function closeTemplateLibraryModal() {
  if (!elements.templateLibraryModal) return;
  elements.templateLibraryModal.classList.remove("show");
}

function buildCurrentMultiFolderDraft() {
  return normalizeMultiFolderConfig(
    cloneMultiFolderConfig(AppState.multiFolderConfig),
    AppState.puzzles,
    {
      folderBindings: AppState.folderBindings,
      outputByPuzzleFolder: AppState.outputByPuzzleFolder,
      shareSameFolderCycle: AppState.shareSameFolderCycleInMultiFolder
    }
  );
}

function getFolderModalHintText(draft = tempMultiFolderDraft) {
  if (isSubfolderBatchMode(draft)) {
    return "选择1个父文件夹，每个子文件夹按照当前单一文件夹规则生成图片";
  }
  return "为每个拼图格分别指定一个图片文件夹";
}

function canConfirmFolderModalDraft(draft = tempMultiFolderDraft) {
  if (!draft) return false;
  if (isSubfolderBatchMode(draft)) {
    const batch = draft.subfolderBatch || {};
    if (!String(batch.parentFolder || "").trim()) return false;
    if (batch.parentFolderAccessible === false) return false;
    const groups = Array.isArray(batch.groups) ? batch.groups : [];
    return groups.length > 0;
  }
  return true;
}

function removeSubfolderBatchDraftGroup(groupKey) {
  if (!tempMultiFolderDraft?.subfolderBatch) return;
  const groups = Array.isArray(tempMultiFolderDraft.subfolderBatch.groups)
    ? tempMultiFolderDraft.subfolderBatch.groups
    : [];
  tempMultiFolderDraft.subfolderBatch.groups = groups.filter((group) => {
    const currentKey = typeof group?.key === "string" && group.key.trim()
      ? group.key.trim()
      : (group?.folderPath || group?.name || "");
    return currentKey !== groupKey;
  });
}

function syncFolderModalSubModeUI() {
  if (!tempMultiFolderDraft) return;
  const isBatch = isSubfolderBatchMode(tempMultiFolderDraft);
  if (elements.folderSubModeBatchBtn) {
    elements.folderSubModeBatchBtn.classList.toggle("is-active", isBatch);
  }
  if (elements.folderSubModePerPuzzleBtn) {
    elements.folderSubModePerPuzzleBtn.classList.toggle("is-active", !isBatch);
  }
  if (elements.folderSubModeHint) {
    elements.folderSubModeHint.textContent = getFolderModalHintText(tempMultiFolderDraft);
  }
  if (elements.folderSubdirOption) {
    elements.folderSubdirOption.style.display = "";
  }
  if (elements.folderSubdirLabel) {
    elements.folderSubdirLabel.textContent = "支持输出到子文件夹中";
  }
  if (elements.folderSubdirToggle) {
    elements.folderSubdirToggle.checked = isBatch
      ? tempMultiFolderDraft.subfolderBatch.outputByInputSubfolder !== false
      : tempMultiFolderDraft.perPuzzle.outputByPuzzleFolder !== false;
  }
  if (elements.folderShareCycleOption) {
    elements.folderShareCycleOption.style.display = isBatch ? "none" : "";
  }
  if (elements.folderShareCycleToggle) {
    elements.folderShareCycleToggle.checked = normalizeShareSameFolderCycleInMultiFolder(
      tempMultiFolderDraft.perPuzzle.shareSameFolderCycle
    );
  }
  if (elements.folderConfirm) {
    elements.folderConfirm.disabled = !canConfirmFolderModalDraft(tempMultiFolderDraft);
  }
}

function renderSubfolderBatchPanel() {
  if (!elements.folderList || !tempMultiFolderDraft) return;
  const batch = tempMultiFolderDraft.subfolderBatch || {};
  const groups = Array.isArray(batch.groups) ? batch.groups : [];
  const totalImages = groups.reduce((sum, group) => sum + (group?.images?.length || 0), 0);
  const hasScanned = Number.isFinite(batch.lastScannedAt) && Number(batch.lastScannedAt) > 0;

  const panel = document.createElement("div");
  panel.className = "puzzle-folder-batch-panel";

  const card = document.createElement("div");
  card.className = "puzzle-folder-parent-card";

  const hasParent = !!String(batch.parentFolder || "").trim();
  const hasError = hasParent && (batch.parentFolderAccessible === false || groups.length === 0);
  if (hasError) {
    card.classList.add("is-error");
  }

  const row = document.createElement("div");
  row.className = "puzzle-folder-parent-row";

  const path = document.createElement("div");
  path.className = "puzzle-folder-parent-path";
  path.textContent = hasParent ? batch.parentFolder : "未选择文件夹";
  path.title = hasParent ? batch.parentFolder : "";

  const actions = document.createElement("div");
  actions.className = "puzzle-folder-parent-actions";

  const selectBtn = document.createElement("button");
  selectBtn.type = "button";
  selectBtn.textContent = "选择文件夹";
  selectBtn.addEventListener("click", () => {
    void selectSubfolderBatchParentFolder();
  });
  actions.appendChild(selectBtn);

  row.appendChild(path);
  row.appendChild(actions);
  card.appendChild(row);

  const meta = document.createElement("div");
  meta.className = "puzzle-folder-parent-meta";
  if (!hasParent) {
    meta.textContent = "请选择一个包含子文件夹的父目录";
  } else if (batch.parentFolderAccessible === false) {
    meta.classList.add("is-error");
    meta.textContent = "路径不可访问，请重新选择";
  } else if (!groups.length) {
    meta.classList.add("is-error");
    meta.textContent = hasScanned
      ? "当前未保留任何子文件夹，请点击“选择文件夹”重新扫描"
      : "未检测到子文件夹，请选择包含子文件夹的目录";
  } else {
    meta.textContent = `${groups.length}个子文件夹，共${totalImages}张`;
  }
  card.appendChild(meta);

  panel.appendChild(card);

  if (groups.length) {
    const summary = document.createElement("div");
    summary.className = "puzzle-folder-group-summary";
    groups.forEach((group) => {
      const item = document.createElement("div");
      item.className = "puzzle-folder-group-summary-item";

      const name = document.createElement("div");
      name.className = "puzzle-folder-group-summary-name";
      name.textContent = group?.name || "未命名子文件夹";
      name.title = group?.folderPath || "";

      const count = document.createElement("div");
      count.className = "puzzle-folder-group-summary-count";
      count.textContent = `${group?.images?.length || 0}张`;

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "puzzle-folder-group-remove";
      removeBtn.title = `删除${group?.name || "子文件夹"}`;
      removeBtn.setAttribute("aria-label", `删除${group?.name || "子文件夹"}`);
      removeBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
      removeBtn.addEventListener("click", () => {
        const groupKey = typeof group?.key === "string" && group.key.trim()
          ? group.key.trim()
          : (group?.folderPath || group?.name || "");
        removeSubfolderBatchDraftGroup(groupKey);
        renderFolderModal();
      });

      item.appendChild(name);
      item.appendChild(count);
      item.appendChild(removeBtn);
      summary.appendChild(item);
    });
    panel.appendChild(summary);
  } else if (hasParent && batch.parentFolderAccessible !== false) {
    const empty = document.createElement("div");
    empty.className = "puzzle-folder-batch-empty";
    empty.textContent = hasScanned
      ? "当前未保留任何子文件夹，请点击“选择文件夹”重新扫描。"
      : "当前父目录下未检测到第一层子文件夹。";
    panel.appendChild(empty);
  }

  elements.folderList.appendChild(panel);
}

function renderPerPuzzleFolderPanel() {
  if (!elements.folderList || !tempMultiFolderDraft) return;
  const bindings = tempMultiFolderDraft.perPuzzle?.folderBindings || {};
  elements.folderList.classList.add("puzzle-folder-list");

  AppState.puzzles.forEach((puzzle) => {
    const binding = bindings[puzzle.id];
    const images = Array.isArray(binding?.images) ? binding.images : [];

    const row = document.createElement("div");
    row.className = "puzzle-folder-row";

    const info = document.createElement("div");
    info.className = "puzzle-folder-info";

    const name = document.createElement("div");
    name.className = "puzzle-folder-name";
    name.textContent = puzzle.name;

    const meta = document.createElement("div");
    meta.className = "puzzle-folder-meta";
    if (!binding?.folder) {
      meta.textContent = "未选择文件夹";
    } else {
      meta.textContent = `${formatPath(binding.folder)} (${images.length}张)`;
      meta.title = binding.folder;
    }

    info.appendChild(name);
    info.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "puzzle-folder-actions";

    const selectBtn = document.createElement("button");
    selectBtn.type = "button";
    selectBtn.textContent = "选择";
    selectBtn.addEventListener("click", async () => {
      const result = await window.appApi.openFolder();
      if (!result || result.canceled) return;
      const folder = result.filePaths?.[0];
      if (!folder) return;
      const scan = await window.appApi.scanPuzzleImages({ folder });
      if (!scan?.ok) {
        setStatus(scan?.error || "图片读取失败");
        return;
      }
      const list = Array.isArray(scan.images) ? scan.images : [];
      const stamp = Date.now();
      const normalized = list.map((item, index) => ({
        id: `img-${stamp}-${index}`,
        name: item?.name || getFileNameFromPath(item?.path || item),
        path: item?.path || item
      }));
      tempMultiFolderDraft.perPuzzle.folderBindings[puzzle.id] = {
        folder,
        images: normalized
      };
      renderFolderModal();
    });

    actions.appendChild(selectBtn);

    if (binding?.folder) {
      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.textContent = "清除";
      clearBtn.addEventListener("click", () => {
        delete tempMultiFolderDraft.perPuzzle.folderBindings[puzzle.id];
        renderFolderModal();
      });
      actions.appendChild(clearBtn);
    }

    row.appendChild(info);
    row.appendChild(actions);
    elements.folderList.appendChild(row);
  });
}

function renderFolderModal() {
  if (!elements.folderList) return;
  elements.folderList.textContent = "";
  elements.folderList.className = "";
  syncFolderModalSubModeUI();
  if (isSubfolderBatchMode(tempMultiFolderDraft)) {
    renderSubfolderBatchPanel();
  } else {
    renderPerPuzzleFolderPanel();
  }
  if (elements.folderConfirm) {
    elements.folderConfirm.disabled = !canConfirmFolderModalDraft(tempMultiFolderDraft);
  }
}

async function ensureDraftParentFolderAccessible() {
  const parentFolder = String(tempMultiFolderDraft?.subfolderBatch?.parentFolder || "").trim();
  if (!parentFolder || !window.appApi?.checkPuzzleFolderAccess) return;
  const result = await window.appApi.checkPuzzleFolderAccess({ folder: parentFolder });
  if (!result?.ok) return;
  tempMultiFolderDraft.subfolderBatch.parentFolderAccessible = result.accessible === true;
}

async function selectSubfolderBatchParentFolder() {
  if (!window.appApi?.openFolder || !window.appApi?.scanPuzzleSubfolderGroups) {
    setStatus("文件夹接口不可用");
    return;
  }
  const result = await window.appApi.openFolder();
  if (!result || result.canceled) return;
  const parentFolder = result.filePaths?.[0];
  if (!parentFolder) return;

  const scan = await window.appApi.scanPuzzleSubfolderGroups({ parentFolder });
  if (!scan?.ok) {
    tempMultiFolderDraft.subfolderBatch.parentFolder = parentFolder;
    tempMultiFolderDraft.subfolderBatch.parentFolderAccessible = false;
    tempMultiFolderDraft.subfolderBatch.groups = [];
    tempMultiFolderDraft.subfolderBatch.lastScannedAt = Date.now();
    setStatus(scan?.error || "子文件夹读取失败");
    renderFolderModal();
    return;
  }

  tempMultiFolderDraft.subfolderBatch.parentFolder = scan.parentFolder || parentFolder;
  tempMultiFolderDraft.subfolderBatch.parentFolderAccessible = scan.parentFolderAccessible !== false;
  tempMultiFolderDraft.subfolderBatch.groups = normalizeSubfolderBatchGroups(scan.groups);
  tempMultiFolderDraft.subfolderBatch.lastScannedAt = Date.now();
  renderFolderModal();
}

async function openFolderModal() {
  if (!elements.folderModal || !elements.folderList) return;
  if (!window.appApi?.openFolder || !window.appApi?.scanPuzzleImages || !window.appApi?.scanPuzzleSubfolderGroups) {
    setStatus("文件夹接口不可用");
    return;
  }
  tempMultiFolderDraft = buildCurrentMultiFolderDraft();
  await ensureDraftParentFolderAccessible();
  renderFolderModal();
  elements.folderModal.classList.add("show");
}

function closeFolderModal() {
  if (!elements.folderModal) return;
  elements.folderModal.classList.remove("show");
  tempMultiFolderDraft = null;
}

function setFolderModalSubMode(subMode) {
  if (!tempMultiFolderDraft) return;
  tempMultiFolderDraft.subMode = normalizeMultiFolderSubMode(subMode);
  renderFolderModal();
}

function confirmFolderBindings() {
  if (!tempMultiFolderDraft) return;
  AppState.multiFolderConfig = normalizeMultiFolderConfig(tempMultiFolderDraft, AppState.puzzles);
  syncLegacyPerPuzzleStateFromConfig();
  saveStateToStorage();
  updateImageList();
  updateEstimateCount();
  closeFolderModal();
  logPuzzle("更新多文件夹配置");
}

async function confirmTemplateSave() {
  if (!elements.templateModalInput) return;
  const inputName = elements.templateModalInput.value.trim();
  if (!inputName) {
    setStatus("请输入模板名称");
    return;
  }
  if (templateModalMode === "rename") {
    await renameCurrentTemplate(inputName);
    return;
  }
  await saveTemplateAsNew(inputName);
}

async function saveTemplateAsNew(name) {
  const template = buildTemplate(name, AppState);
  templates = templates.filter((item) => item.id !== template.id);
  templates.unshift(template);
  const result = await saveTemplates(templates);
  if (!result?.ok) {
    const message = result?.error || "保存模板失败";
    setStatus(message);
    if (window.showToast) {
      window.showToast(message, "error", 3000);
    }
    return;
  }
  AppState.currentTemplate = { id: template.id, name: template.name };
  updateTemplateSelect();
  syncTemplateAutoSaveBaseline();
  saveStateToStorage();
  setStatus("模板已保存");
  logPuzzle(`保存模板: ${template.name}`);
  closeTemplateModal();
}

async function renameCurrentTemplate(name) {
  if (!AppState.currentTemplate?.id) {
    const message = "未选择模板";
    setStatus(message);
    if (window.showToast) {
      window.showToast(message, "warning", 2000);
    }
    return;
  }
  const template = templates.find((item) => item.id === AppState.currentTemplate.id);
  if (!template) {
    const message = "模板不存在";
    setStatus(message);
    if (window.showToast) {
      window.showToast(message, "error", 3000);
    }
    return;
  }
  if (template.name === name) {
    showTemplateToast("模板名称未改变", "info", 1600);
    closeTemplateModal();
    return;
  }
  template.name = name;
  template.updatedAt = Date.now();
  const result = await saveTemplates(templates);
  if (!result?.ok) {
    const message = result?.error || "重命名模板失败";
    setStatus(message);
    if (window.showToast) {
      window.showToast(message, "error", 3000);
    }
    return;
  }
  AppState.currentTemplate = { id: template.id, name: template.name };
  updateTemplateSelect();
  syncTemplateAutoSaveBaseline();
  saveStateToStorage();
  showTemplateToast(`已重命名为 ${template.name}`, "success", 2000);
  logPuzzle(`模板重命名: ${template.name}`);
  closeTemplateModal();
}

async function handleDeleteTemplate() {
  closeTemplateDropdown();
  const flushResult = await flushTemplateAutoSave("before-delete");
  if (!flushResult?.ok) {
    const message = flushResult?.error || "自动保存失败，请稍后重试";
    setStatus(message);
    if (window.showToast) {
      window.showToast(message, "error", 3000);
    }
    return;
  }
  if (!AppState.currentTemplate?.id) {
    setStatus("未选择模板");
    return;
  }
  if (!await showConfirmModal("确定删除当前模板吗？", "删除模板")) return;
  const deletingTemplateId = AppState.currentTemplate.id;
  let result = null;
  if (window.appApi?.deletePuzzleTemplate) {
    result = await window.appApi.deletePuzzleTemplate({ templateId: deletingTemplateId });
  } else {
    templates = templates.filter((item) => item.id !== deletingTemplateId);
    result = await saveTemplates(templates);
    if (result?.ok) {
      result = { ...result, templates, cleanup: null };
    }
  }
  if (!result?.ok) {
    setStatus(result?.error || "删除模板失败");
    if (window.showToast) {
      window.showToast(result?.error || "删除模板失败", "error", 3000);
    }
    return;
  }
  if (Array.isArray(result.templates)) {
    templates = result.templates;
  } else {
    templates = templates.filter((item) => item.id !== deletingTemplateId);
  }
  delete templateWorkingSets[deletingTemplateId];
  pruneTemplateWorkingSets();
  applyEmptyTemplateState("删除模板后切换为未选择模板");

  const cleanup = result?.cleanup || null;
  const deletedCount = Number(cleanup?.deletedCount) || 0;
  const sharedCount = Number(cleanup?.skippedSharedCount) || 0;
  const failedCount = Number(cleanup?.failedCount) || 0;
  const missingCount = Number(cleanup?.missingCount) || 0;
  const summary = `模板已删除（清理: 删除${deletedCount}，共享保留${sharedCount}，缺失${missingCount}，失败${failedCount}）`;
  setStatus(summary);
  if (window.showToast) {
    window.showToast(summary, failedCount > 0 ? "warning" : "success", failedCount > 0 ? 5000 : 3000);
  }
  if (failedCount > 0 && Array.isArray(cleanup?.failedFiles)) {
    const detail = cleanup.failedFiles
      .slice(0, 20)
      .map((item, index) => `${index + 1}. ${item.path || "-"} -> ${item.error || "删除失败"}`)
      .join("\n");
    logPuzzle(`模板素材清理失败详情:\n${detail}`);
  }
  logPuzzle("删除模板");
}

function applyEmptyTemplateState(reason = "切换为未选择模板") {
  AppState.puzzles = [createPuzzle("拼图1")];
  AppState.currentPuzzleIndex = 0;
  AppState.generationMode = "single";
  AppState.singleFirstPuzzleOnce = false;
  AppState.currentTemplate = null;
  if (!restoreWorkingSetForTemplate(null)) {
    AppState.images = [];
    AppState.folderBindings = {};
    AppState.multiFolderConfig = normalizeMultiFolderConfig(createDefaultMultiFolderConfig(), AppState.puzzles);
    syncLegacyPerPuzzleStateFromConfig();
  }
  clearSelections();
  clearUndoStack();
  renderTabBar();
  syncCanvasInputs();
  syncGenerationModeUI();
  updateTemplateSelect();
  updatePropertiesPanel();
  updateImageList();
  updateEstimateCount();
  syncTemplateAutoSaveBaseline();
  saveStateToStorage();
  scheduleRender();
  if (reason) {
    logPuzzle(reason);
  }
}

async function handleTemplateChange() {
  closeTemplateDropdown();
  const flushResult = await flushTemplateAutoSave("before-switch");
  if (!flushResult?.ok) {
    const message = flushResult?.error || "自动保存失败，请稍后重试";
    setStatus(message);
    elements.templateSelect.value = AppState.currentTemplate?.id || "";
    if (templateSelectInstance) {
      templateSelectInstance.refresh();
    }
    if (window.showToast) {
      window.showToast(message, "error", 3000);
    }
    return;
  }
  saveWorkingSetForTemplate(AppState.currentTemplate);
  const selectedId = elements.templateSelect.value;
  if (!selectedId) {
    applyEmptyTemplateState("切换为未选择模板");
    return;
  }
  const template = templates.find((item) => item.id === selectedId);
  if (!template) return;
  if (!await showConfirmModal(`加载模板「${template.name}」会覆盖当前拼图，是否继续？`, "加载模板")) {
    elements.templateSelect.value = AppState.currentTemplate?.id || "";
    if (templateSelectInstance) {
      templateSelectInstance.refresh();
    }
    return;
  }
  const applied = applyTemplate(template);
  AppState.puzzles = applied.puzzles;
  AppState.currentPuzzleIndex = 0;
  AppState.generationMode = applied.generationMode;
  AppState.singleFirstPuzzleOnce = normalizeSingleFirstPuzzleOnce(applied.singleFirstPuzzleOnce);
  AppState.currentTemplate = { id: template.id, name: template.name };
  if (!restoreWorkingSetForTemplate(AppState.currentTemplate)) {
    AppState.images = [];
    AppState.folderBindings = {};
    AppState.multiFolderConfig = normalizeMultiFolderConfig(createDefaultMultiFolderConfig(), AppState.puzzles);
    syncLegacyPerPuzzleStateFromConfig();
  }
  clearSelections();
  clearUndoStack();
  renderTabBar();
  syncCanvasInputs();
  syncGenerationModeUI();
  updateTemplateSelect();
  updatePropertiesPanel();
  updateImageList();
  AppState.puzzles.forEach((puzzle) => preloadTextFonts(puzzle.texts));
  updateEstimateCount();
  syncTemplateAutoSaveBaseline();
  saveStateToStorage();
  scheduleRender();
  logPuzzle(`加载模板: ${template.name}`);
}

function handlePreview() {
  if (AppState.mode === "preview") {
    exitPreview();
    return;
  }
  const normalizedBackgrounds = normalizePreviewBackgrounds();
  if (normalizedBackgrounds.length) {
    syncCanvasInputs();
    updateEstimateCount();
    saveStateToStorage();
    scheduleRender();
    const summary =
      normalizedBackgrounds.length === 1
        ? `预览前已将 ${normalizedBackgrounds[0]} 的背景自动设为白色`
        : `预览前已将 ${normalizedBackgrounds.length} 个未设置背景的拼图自动设为白色`;
    setStatus(summary);
    if (window.showToast) {
      window.showToast(summary, "info", 2500);
    }
    logPuzzle(`预览前自动补白底: ${normalizedBackgrounds.join("、")}`);
  }
  const tasks = buildTaskQueue(
    AppState.puzzles,
    AppState.images,
    AppState.generationMode,
    AppState.folderBindings,
    getGenerationQueueOptions(),
    AppState.multiFolderConfig
  );
  if (!tasks.length) {
    setStatus("没有可预览的图片");
    return;
  }
  AppState.previewMode = normalizePreviewMode(AppState.previewMode);
  AppState.taskQueue = tasks;
  AppState.mode = "preview";
  AppState.previewIndex = 0;
  setPreviewState(true);
  updatePreviewBar();
  updatePreviewIndex();
  scheduleRender();
  logPuzzle(`进入预览模式（${getPreviewModeLabel(AppState.previewMode)}）`);
}

function updatePreviewIndex() {
  if (!elements.previewIndex) return;
  elements.previewIndex.textContent = `预览 ${AppState.previewIndex + 1}/${AppState.taskQueue.length}`;
}

function hasMissingBackground() {
  return AppState.puzzles.some(
    (puzzle) => puzzle.backgroundMode === "image" && !puzzle.backgroundPath
  );
}

function handlePreviewNavigation(direction) {
  if (AppState.mode !== "preview") return;
  const next = AppState.previewIndex + direction;
  if (next < 0 || next >= AppState.taskQueue.length) return;
  AppState.previewIndex = next;
  resetPreviewView();
  updatePreviewIndex();
  resizeCanvas();
}

function exitPreview() {
  cancelPreviewRender();
  resetExportPreviewCache();
  AppState.mode = "edit";
  resetPreviewView();
  setPreviewState(false);
  updatePreviewBar();
  resizeCanvas();
  updateEditorZoomLabel();
  logPuzzle("返回编辑模式");
}

async function handleGenerate() {
  if (window.licenseManager) {
    const allowed = await window.licenseManager.checkAccess("puzzle");
    if (!allowed) return;
  }
  if (!window.appApi?.generatePuzzleImages) {
    setStatus("生成接口不可用");
    return;
  }
  if (!AppState.outputDir) {
    setStatus("请先选择输出目录");
    return;
  }
  if (hasMissingBackground()) {
    setStatus("请先上传背景图或开启透明背景");
    return;
  }
  const tasks = buildTaskQueue(
    AppState.puzzles,
    AppState.images,
    AppState.generationMode,
    AppState.folderBindings,
    getGenerationQueueOptions(),
    AppState.multiFolderConfig
  );
  if (!tasks.length) {
    setStatus("没有可生成的内容");
    return;
  }
  setStatus("生成中...");
  const payload = {
    outputDir: AppState.outputDir,
    templateName: AppState.currentTemplate?.name || "拼图模板",
    outputScale: AppState.outputScale || 1,
    shadowPipelineVersion: SHADOW_PIPELINE_VERSION,
    generationMode: AppState.generationMode,
    multiFolderSubMode: getActiveMultiFolderSubMode(),
    outputByPuzzleFolder: getActiveOutputBySubfolder(),
    continueOnError: true,
    tasks
  };
  logPuzzle(`开始生成，共 ${tasks.length} 张`);
  const result = await window.appApi.generatePuzzleImages(payload);
  if (result?.fontCheck) {
    reportFontCheckDiagnostics("导出", result.fontCheck);
  }
  const failedItems = Array.isArray(result?.failed) ? result.failed : [];
  if (!result?.ok) {
    const message = resolveGenerateErrorMessage(result);
    setStatus(message);
    logPuzzle(`生成失败: ${message}`);
    if (failedItems.length) {
      const summary = buildGenerateFailureSummary(failedItems, 8);
      logPuzzle(`失败详情:\n${summary}`);
    }
    if (window.showToast) {
      window.showToast(`导出失败: ${message}`, "error", 6000);
    }
    return;
  }
  const successCount = Number(result.count) || 0;
  if (failedItems.length) {
    const status = `导出部分成功：成功 ${successCount} 张，失败 ${failedItems.length} 张`;
    const summary = buildGenerateFailureSummary(failedItems, 12);
    setStatus(status);
    logPuzzle(status);
    logPuzzle(`失败详情:\n${summary}`);
    if (window.showToast) {
      window.showToast(
        `导出部分成功：成功 ${successCount}，失败 ${failedItems.length}`,
        "warning",
        8000,
        {
          actionText: "复制失败详情",
          actionCallback: async () => {
            const copied = await copyTextToClipboard(summary);
            setStatus(copied ? "失败详情已复制到剪贴板" : "复制失败，请查看日志面板");
          }
        }
      );
    }
    return;
  }
  setStatus(`生成完成，共 ${successCount || tasks.length} 张`);
  logPuzzle(`生成完成，共 ${successCount || tasks.length} 张`);
  const outputDir = AppState.outputDir;
  if (window.showToast) {
    window.showToast(`导出成功! 共生成 ${successCount || tasks.length} 张图片`, "success", 5000, {
      actionText: "打开文件夹",
      actionCallback: () => {
        if (window.appApi?.openPath && outputDir) {
          window.appApi.openPath({ path: outputDir, source: "puzzle-output-folder" });
        }
      }
    });
  }
}

function applySlotStyle(update, options = {}) {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return false;
  const targetIds = resolveTargetIdsByType("slot", options.targetIds, puzzle);
  if (!targetIds.length) return false;
  const targetSet = new Set(targetIds);
  const selected = puzzle.slots.filter((slot) => targetSet.has(slot.id));
  if (!selected.length) return false;
  let changed = false;
  selected.forEach((slot) => {
    const current = slot.style || {};
    const next = {
      borderRadius: update.borderRadius ?? current.borderRadius ?? 0,
      borderWidth: update.borderWidth ?? current.borderWidth ?? 0,
      borderColor: update.borderColor ?? current.borderColor ?? "#ffffff",
      shadow: update.shadow ?? current.shadow ?? false,
      lockAspect: update.lockAspect ?? current.lockAspect ?? false
    };
    if (
      next.borderRadius !== current.borderRadius ||
      next.borderWidth !== current.borderWidth ||
      next.borderColor !== current.borderColor ||
      next.shadow !== current.shadow ||
      next.lockAspect !== current.lockAspect
    ) {
      changed = true;
    }
    slot.style = next;
  });
  if (!changed) return false;
  if (options.pushUndo !== false) {
    pushUndoState();
  }
  saveStateToStorage();
  scheduleRender();
  return true;
}

function applyTextStyle(update, options = {}) {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return false;
  const targetIds = resolveTargetIdsByType("text", options.targetIds, puzzle);
  if (!targetIds.length) return false;
  const targetSet = new Set(targetIds);
  const selected = puzzle.texts.filter((text) => targetSet.has(text.id));
  if (!selected.length) return false;
  let changed = false;
  selected.forEach((text) => {
    const current = text.style || {};
    const next = {
      fontFamily: update.fontFamily ?? current.fontFamily ?? "SourceHanSansCN",
      fontSize: update.fontSize ?? current.fontSize ?? 32,
      fontWeight: update.fontWeight ?? current.fontWeight ?? 400,
      fontStyle: update.fontStyle ?? current.fontStyle ?? "normal",
      color: update.color ?? current.color ?? "#000000",
      textAlign: update.textAlign ?? current.textAlign ?? "left",
      letterSpacing: update.letterSpacing ?? current.letterSpacing ?? 0,
      lineHeight: update.lineHeight ?? current.lineHeight ?? 1.4,
      strokeWidth: update.strokeWidth ?? current.strokeWidth ?? 0,
      strokeColor: update.strokeColor ?? current.strokeColor ?? "#000000",
      shadowColor: update.shadowColor ?? current.shadowColor ?? "#000000",
      shadowBlur: update.shadowBlur ?? current.shadowBlur ?? 0,
      shadowOffsetX: update.shadowOffsetX ?? current.shadowOffsetX ?? 0,
      shadowOffsetY: update.shadowOffsetY ?? current.shadowOffsetY ?? 0
    };
    if (
      next.fontFamily !== current.fontFamily ||
      next.fontSize !== current.fontSize ||
      next.fontWeight !== current.fontWeight ||
      next.fontStyle !== current.fontStyle ||
      next.color !== current.color ||
      next.textAlign !== current.textAlign ||
      next.letterSpacing !== current.letterSpacing ||
      next.lineHeight !== current.lineHeight ||
      next.strokeWidth !== current.strokeWidth ||
      next.strokeColor !== current.strokeColor ||
      next.shadowColor !== current.shadowColor ||
      next.shadowBlur !== current.shadowBlur ||
      next.shadowOffsetX !== current.shadowOffsetX ||
      next.shadowOffsetY !== current.shadowOffsetY
    ) {
      changed = true;
    }
    text.style = next;
  });
  if (!changed) return false;
  if (options.pushUndo !== false) {
    pushUndoState();
  }
  const previewStyle = selected[0]?.style || {};
  ensureFontLoaded(previewStyle.fontFamily, previewStyle.fontWeight, previewStyle.fontStyle).then(
    () => scheduleRender()
  );
  saveStateToStorage();
  updatePropertiesPanel();
  scheduleRender();
  return true;
}

function alignSelected(type) {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return;
  const selected = puzzle.slots.filter((slot) => AppState.selectedSlotIds.includes(slot.id));
  if (selected.length < 2) return;
  pushUndoState();
  const minX = Math.min(...selected.map((slot) => slot.x));
  const maxX = Math.max(...selected.map((slot) => slot.x + slot.w));
  const minY = Math.min(...selected.map((slot) => slot.y));
  const maxY = Math.max(...selected.map((slot) => slot.y + slot.h));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  selected.forEach((slot) => {
    if (type === "left") slot.x = Math.round(minX);
    if (type === "right") slot.x = Math.round(maxX - slot.w);
    if (type === "top") slot.y = Math.round(minY);
    if (type === "bottom") slot.y = Math.round(maxY - slot.h);
    if (type === "hcenter") slot.x = Math.round(centerX - slot.w / 2);
    if (type === "vcenter") slot.y = Math.round(centerY - slot.h / 2);
  });
  saveStateToStorage();
  scheduleRender();
  logPuzzle(`对齐操作: ${type}`);
}

function distributeSelected(axis) {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return;
  const selected = puzzle.slots.filter((slot) => AppState.selectedSlotIds.includes(slot.id));
  if (selected.length < 3) return;
  pushUndoState();
  if (axis === "h") {
    const sorted = [...selected].sort((a, b) => a.x - b.x);
    const minX = sorted[0].x;
    const maxX = sorted[sorted.length - 1].x + sorted[sorted.length - 1].w;
    const totalWidth = sorted.reduce((sum, slot) => sum + slot.w, 0);
    const gap = (maxX - minX - totalWidth) / (sorted.length - 1);
    let cursor = minX;
    sorted.forEach((slot) => {
      slot.x = Math.round(cursor);
      cursor += slot.w + gap;
    });
  } else {
    const sorted = [...selected].sort((a, b) => a.y - b.y);
    const minY = sorted[0].y;
    const maxY = sorted[sorted.length - 1].y + sorted[sorted.length - 1].h;
    const totalHeight = sorted.reduce((sum, slot) => sum + slot.h, 0);
    const gap = (maxY - minY - totalHeight) / (sorted.length - 1);
    let cursor = minY;
    sorted.forEach((slot) => {
      slot.y = Math.round(cursor);
      cursor += slot.h + gap;
    });
  }
  saveStateToStorage();
  scheduleRender();
  logPuzzle(`分布操作: ${axis}`);
}

function scaleSelectedSlots(factor) {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return;
  const selected = puzzle.slots.filter((slot) => AppState.selectedSlotIds.includes(slot.id));
  if (!selected.length) return;
  pushUndoState();
  const minX = Math.min(...selected.map((slot) => slot.x));
  const maxX = Math.max(...selected.map((slot) => slot.x + slot.w));
  const minY = Math.min(...selected.map((slot) => slot.y));
  const maxY = Math.max(...selected.map((slot) => slot.y + slot.h));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  selected.forEach((slot) => {
    const slotCenterX = slot.x + slot.w / 2;
    const slotCenterY = slot.y + slot.h / 2;
    const nextW = Math.max(1, Math.round(slot.w * factor));
    const nextH = Math.max(1, Math.round(slot.h * factor));
    const nextCenterX = centerX + (slotCenterX - centerX) * factor;
    const nextCenterY = centerY + (slotCenterY - centerY) * factor;
    slot.w = nextW;
    slot.h = nextH;
    slot.x = Math.round(nextCenterX - nextW / 2);
    slot.y = Math.round(nextCenterY - nextH / 2);
  });
  updatePropertiesPanel();
  saveStateToStorage();
  scheduleRender();
  logPuzzle(`缩放坑位: ${factor}`);
}

function scaleSelectedTexts(factor) {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return;
  const selected = (puzzle.texts || []).filter((text) => AppState.selectedTextIds.includes(text.id));
  if (!selected.length) return;
  pushUndoState();
  const metrics = selected.map((text) => {
    const layout = getTextLayout(ctx, text);
    return {
      text,
      layout,
      centerX: text.x + layout.width / 2,
      centerY: text.y + layout.height / 2
    };
  });
  const minX = Math.min(...metrics.map((item) => item.text.x));
  const maxX = Math.max(...metrics.map((item) => item.text.x + item.layout.width));
  const minY = Math.min(...metrics.map((item) => item.text.y));
  const maxY = Math.max(...metrics.map((item) => item.text.y + item.layout.height));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  metrics.forEach((item) => {
    const text = item.text;
    const style = text.style || {};
    const nextFontSize = Math.max(8, Math.round((Number(style.fontSize) || 16) * factor));
    const nextWidth = Math.max(20, Math.round((Number(text.width) || 200) * factor));
    const nextLetterSpacing = Number(style.letterSpacing || 0) * factor;
    const nextStyle = {
      ...style,
      fontSize: nextFontSize,
      letterSpacing: Math.round(nextLetterSpacing * 100) / 100
    };
    const nextLayout = getTextLayout(ctx, { ...text, width: nextWidth, style: nextStyle });
    const nextCenterX = centerX + (item.centerX - centerX) * factor;
    const nextCenterY = centerY + (item.centerY - centerY) * factor;
    text.width = nextWidth;
    text.style = nextStyle;
    text.x = Math.round(nextCenterX - nextLayout.width / 2);
    text.y = Math.round(nextCenterY - nextLayout.height / 2);
  });
  updatePropertiesPanel();
  saveStateToStorage();
  scheduleRender();
  logPuzzle(`缩放文字: ${factor}`);
}

function handleSlotSizeChange(options = {}) {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return false;
  const targetIds = resolveTargetIdsByType("slot", options.targetIds, puzzle);
  if (targetIds.length !== 1) return false;
  const slot = puzzle.slots.find((item) => item.id === targetIds[0]);
  if (!slot) return false;
  const prevW = Math.max(1, Math.round(Number(slot.w) || 1));
  const prevH = Math.max(1, Math.round(Number(slot.h) || 1));
  const parsedW = Number(elements.slotWInput.value);
  const parsedH = Number(elements.slotHInput.value);
  const nextW = Math.max(1, Number.isFinite(parsedW) ? parsedW : prevW);
  const nextH = Math.max(1, Number.isFinite(parsedH) ? parsedH : prevH);
  let resolvedW = nextW;
  let resolvedH = nextH;
  const sourceInput = options.sourceInput || document.activeElement;
  if (slot.style?.lockAspect) {
    const aspect = prevW / prevH || 1;
    if (sourceInput === elements.slotHInput) {
      resolvedH = nextH;
      resolvedW = Math.max(1, Math.round(nextH * aspect));
      elements.slotWInput.value = String(resolvedW);
    } else {
      resolvedW = nextW;
      resolvedH = Math.max(1, Math.round(nextW / aspect));
      elements.slotHInput.value = String(resolvedH);
    }
  }
  resolvedW = Math.max(1, Math.round(resolvedW));
  resolvedH = Math.max(1, Math.round(resolvedH));
  if (resolvedW === prevW && resolvedH === prevH) {
    return false;
  }
  if (options.pushUndo !== false) {
    pushUndoState();
  }
  slot.w = resolvedW;
  slot.h = resolvedH;
  updateEstimateCount();
  saveStateToStorage();
  scheduleRender();
  return true;
}

function handleCopySlot() {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return;
  if (!AppState.selectedSlotIds.length) {
    setStatus("请先选择坑位");
    return;
  }
  clearLocalClipboardItems();
  const sourceMeta = getCurrentPuzzleSourceMeta(puzzle);
  const selected = puzzle.slots.filter((slot) => AppState.selectedSlotIds.includes(slot.id));
  selected.forEach((slot) => {
    clipboardSlots.push({
      ...sourceMeta,
      x: slot.x,
      y: slot.y,
      w: slot.w,
      h: slot.h,
      style: { ...slot.style }
    });
  });
  setStatus("已复制坑位");
  rememberLocalClipboardSource();
}

function handleCopyText() {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return;
  if (!AppState.selectedTextIds.length) {
    setStatus("请先选择文字");
    return;
  }
  clearLocalClipboardItems();
  const sourceMeta = getCurrentPuzzleSourceMeta(puzzle);
  const selected = puzzle.texts.filter((text) => AppState.selectedTextIds.includes(text.id));
  selected.forEach((text) => {
    clipboardTexts.push({
      ...sourceMeta,
      content: text.content ?? "",
      x: text.x ?? 0,
      y: text.y ?? 0,
      width: text.width ?? 200,
      rotation: text.rotation ?? 0,
      style: { ...text.style }
    });
  });
  setStatus("已复制文字");
  rememberLocalClipboardSource();
}

function handleCopyImage() {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return;
  if (!AppState.selectedImageIds.length) {
    setStatus("请先选择图片");
    return;
  }
  clearLocalClipboardItems();
  const sourceMeta = getCurrentPuzzleSourceMeta(puzzle);
  const selected = (puzzle.images || []).filter((image) => AppState.selectedImageIds.includes(image.id));
  selected.forEach((image) => {
    clipboardImages.push({
      ...sourceMeta,
      imagePath: image.imagePath || "",
      x: image.x ?? 0,
      y: image.y ?? 0,
      width: image.width ?? 200,
      height: image.height ?? 200,
      rotation: image.rotation ?? 0,
      aspectRatio: image.aspectRatio ?? (image.width && image.height ? image.width / image.height : 1)
    });
  });
  setStatus("已复制图片");
  rememberLocalClipboardSource();
}

function handlePasteSlot() {
  const puzzle = getCurrentPuzzle();
  if (!puzzle || !clipboardSlots.length) return;
  pushUndoState();
  const offset = getPasteOffsetForClipboard(clipboardSlots);
  const newIds = [];
  clipboardSlots.forEach((slot) => {
    const copy = createDefaultSlot();
    copy.x = slot.x + offset;
    copy.y = slot.y + offset;
    copy.w = slot.w;
    copy.h = slot.h;
    copy.style = { ...slot.style };
    assignNewSlotLayerFields(puzzle, copy);
    puzzle.slots.push(copy);
    newIds.push(copy.id);
  });
  AppState.selectedSlotIds = newIds;
  AppState.selectedTextIds = [];
  AppState.selectedImageIds = [];
  exitTextEditMode();
  updatePropertiesPanel();
  updateEstimateCount();
  saveStateToStorage();
  scheduleRender();
}

function handlePasteText() {
  const puzzle = getCurrentPuzzle();
  if (!puzzle || !clipboardTexts.length) return;
  pushUndoState();
  const offset = getPasteOffsetForClipboard(clipboardTexts);
  const newIds = [];
  clipboardTexts.forEach((text) => {
    const copy = createDefaultText();
    copy.content = text.content ?? "";
    copy.x = (text.x ?? 0) + offset;
    copy.y = (text.y ?? 0) + offset;
    copy.width = text.width ?? copy.width;
    copy.rotation = text.rotation ?? 0;
    copy.style = { ...copy.style, ...(text.style || {}) };
    assignNewElementLayerFields(puzzle, copy);
    puzzle.texts.push(copy);
    newIds.push(copy.id);
    ensureFontLoaded(copy.style?.fontFamily, copy.style?.fontWeight, copy.style?.fontStyle).then(
      () => scheduleRender()
    );
  });
  AppState.selectedSlotIds = [];
  AppState.selectedTextIds = newIds;
  AppState.selectedImageIds = [];
  exitTextEditMode();
  updatePropertiesPanel();
  saveStateToStorage();
  scheduleRender();
}

function handlePasteImage() {
  const puzzle = getCurrentPuzzle();
  if (!puzzle || !clipboardImages.length) return;
  pushUndoState();
  const offset = getPasteOffsetForClipboard(clipboardImages);
  const newIds = [];
  puzzle.images = puzzle.images || [];
  clipboardImages.forEach((image) => {
    const copy = createDefaultImage();
    copy.imagePath = image.imagePath || "";
    copy.x = (image.x ?? 0) + offset;
    copy.y = (image.y ?? 0) + offset;
    copy.width = image.width ?? copy.width;
    copy.height = image.height ?? copy.height;
    copy.rotation = image.rotation ?? 0;
    copy.aspectRatio = image.aspectRatio ?? (copy.width && copy.height ? copy.width / copy.height : copy.aspectRatio);
    assignNewElementLayerFields(puzzle, copy);
    puzzle.images.push(copy);
    newIds.push(copy.id);
  });
  AppState.selectedSlotIds = [];
  AppState.selectedTextIds = [];
  AppState.selectedImageIds = newIds;
  exitTextEditMode();
  updatePropertiesPanel();
  saveStateToStorage();
  scheduleRender();
}

async function handlePasteClipboard(options = {}) {
  try {
    const puzzle = getCurrentPuzzle();
    if (!puzzle) return false;
    if (!window.appApi?.readClipboardImage || !window.appApi?.readClipboardText) {
      setStatus("剪贴板接口不可用");
      return false;
    }

    const summary = options.summary || null;
    let imageError = null;
    if (!summary?.ok || summary.hasImage) {
      const imageResult = await window.appApi.readClipboardImage();
      if (imageResult?.ok && imageResult.relativePath) {
        const img = await loadImage(imageResult.relativePath);
        if (!img) {
          setStatus("剪贴板图片读取失败");
          return false;
        }
        pushUndoState();
        let imageW = Math.max(1, Math.round(imageResult.width || img.width || 1));
        let imageH = Math.max(1, Math.round(imageResult.height || img.height || 1));
        const maxW = Math.max(1, Math.round(puzzle.canvasSize.w));
        const maxH = Math.max(1, Math.round(puzzle.canvasSize.h));
        if (imageW > maxW || imageH > maxH) {
          const scale = Math.min(maxW / imageW, maxH / imageH);
          imageW = Math.max(1, Math.round(imageW * scale));
          imageH = Math.max(1, Math.round(imageH * scale));
        }
        const image = createDefaultImage();
        image.imagePath = imageResult.relativePath;
        image.width = imageW;
        image.height = imageH;
        image.aspectRatio = imageH ? imageW / imageH : image.aspectRatio;
        const position = getClipboardPastePosition(puzzle, image.width, image.height);
        image.x = position.x;
        image.y = position.y;
        assignNewElementLayerFields(puzzle, image);
        puzzle.images = puzzle.images || [];
        puzzle.images.push(image);
        AppState.selectedSlotIds = [];
        AppState.selectedTextIds = [];
        AppState.selectedImageIds = [image.id];
        exitTextEditMode();
        updatePropertiesPanel();
        saveStateToStorage();
        scheduleRender();
        setStatus("已粘贴剪贴板图片");
        logPuzzle(`剪贴板粘贴图片元素（${puzzle.name}）`);
        return true;
      }
      if (imageResult && !imageResult.ok && !imageResult.empty) {
        imageError = imageResult.error || "剪贴板图片读取失败";
      }
    }

    if (!summary?.ok || summary.hasText) {
      const textResult = await window.appApi.readClipboardText();
      const textValue = typeof textResult?.text === "string" ? textResult.text : "";
      if (textResult?.ok && textValue.trim()) {
        pushUndoState();
        const text = createDefaultText();
        text.content = textValue;
        const layout = getTextLayout(ctx, text);
        const position = getClipboardPastePosition(puzzle, layout.width, layout.height);
        text.x = position.x;
        text.y = position.y;
        assignNewElementLayerFields(puzzle, text);
        puzzle.texts = puzzle.texts || [];
        puzzle.texts.push(text);
        AppState.selectedSlotIds = [];
        AppState.selectedTextIds = [text.id];
        AppState.selectedImageIds = [];
        exitTextEditMode();
        ensureFontLoaded(text.style?.fontFamily, text.style?.fontWeight, text.style?.fontStyle).then(
          () => scheduleRender()
        );
        updatePropertiesPanel();
        saveStateToStorage();
        scheduleRender();
        setStatus("已粘贴剪贴板文字");
        logPuzzle(`剪贴板粘贴文字（${puzzle.name}）`);
        return true;
      }
      if (textResult && !textResult.ok && !textResult.empty) {
        setStatus(textResult.error || imageError || "剪贴板读取失败");
        return false;
      }
    }
    if (imageError) {
      setStatus(imageError);
      return false;
    }
    setStatus("剪贴板为空或不支持");
    return false;
  } catch (error) {
    setStatus(error?.message || "剪贴板读取失败");
    return false;
  }
}

function handlePasteLocalClipboard(options = {}) {
  if (!hasLocalClipboardItems()) return false;
  const hasImageSelection = !!options.hasImageSelection;
  const hasTextSelection = !!options.hasTextSelection;
  if (
    (hasImageSelection && clipboardImages.length) ||
    (!clipboardSlots.length && !clipboardTexts.length && clipboardImages.length)
  ) {
    handlePasteImage();
    return true;
  }
  if (
    (hasTextSelection && clipboardTexts.length) ||
    (!clipboardSlots.length && clipboardTexts.length)
  ) {
    handlePasteText();
    return true;
  }
  if (clipboardSlots.length) {
    handlePasteSlot();
    return true;
  }
  if (clipboardTexts.length) {
    handlePasteText();
    return true;
  }
  if (clipboardImages.length) {
    handlePasteImage();
    return true;
  }
  return false;
}

async function handlePasteShortcut(options = {}) {
  if (pasteShortcutRunning) return;
  pasteShortcutRunning = true;
  try {
    const hasLocalClipboard = hasLocalClipboardItems();
    const summary = await getSystemClipboardSummary();
    const shouldUseSystem = shouldPasteSystemClipboard(summary, hasLocalClipboard);
    if (shouldUseSystem) {
      const pasted = await handlePasteClipboard({ summary });
      if (pasted) {
        if (hasLocalClipboard) {
          clearLocalClipboardItems();
        }
        localClipboardSourceSignature = summary?.signature || null;
        return;
      }
    }
    if (hasLocalClipboard && handlePasteLocalClipboard(options)) {
      return;
    }
    await handlePasteClipboard({ summary });
  } finally {
    pasteShortcutRunning = false;
  }
}

function handleDeleteSlot() {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return;
  if (!AppState.selectedSlotIds.length) return;
  pushUndoState();
  puzzle.slots = puzzle.slots.filter((slot) => !AppState.selectedSlotIds.includes(slot.id));
  AppState.selectedSlotIds = [];
  AppState.selectedTextIds = [];
  AppState.selectedImageIds = [];
  exitTextEditMode();
  updatePropertiesPanel();
  updateEstimateCount();
  saveStateToStorage();
  scheduleRender();
  logPuzzle(`删除坑位（${puzzle.name}）`);
}

function handleDeleteText() {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return;
  if (!AppState.selectedTextIds.length) return;
  pushUndoState();
  puzzle.texts = (puzzle.texts || []).filter((text) => !AppState.selectedTextIds.includes(text.id));
  AppState.selectedSlotIds = [];
  AppState.selectedTextIds = [];
  AppState.selectedImageIds = [];
  exitTextEditMode();
  updatePropertiesPanel();
  saveStateToStorage();
  scheduleRender();
  logPuzzle(`删除文字（${puzzle.name}）`);
}

function handleDeleteImage() {
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return;
  if (!AppState.selectedImageIds.length) return;
  pushUndoState();
  puzzle.images = (puzzle.images || []).filter((image) => !AppState.selectedImageIds.includes(image.id));
  AppState.selectedSlotIds = [];
  AppState.selectedTextIds = [];
  AppState.selectedImageIds = [];
  exitTextEditMode();
  updatePropertiesPanel();
  saveStateToStorage();
  scheduleRender();
  logPuzzle(`删除图片元素（${puzzle.name}）`);
}

function handleKeyDown(event) {
  if (AppState.mode !== "edit") return;
  const puzzlePanel = document.querySelector(".tab-content[data-tab='puzzle']");
  if (puzzlePanel && !puzzlePanel.classList.contains("active")) return;
  if (elements.templateModal?.classList.contains("show")) return;
  if (elements.templateLibraryModal?.classList.contains("show")) return;
  if (elements.folderModal?.classList.contains("show")) return;
  if (elements.cropModal?.classList.contains("show")) return;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
  if (event.target.isContentEditable) return;
  if (reconcileTextEditState()) return;

  const isCmd = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (isCmd && key === "z") {
    event.preventDefault();
    if (event.shiftKey) {
      redoChange();
    } else {
      undoChange();
    }
    return;
  }
  if (isCmd && key === "y") {
    event.preventDefault();
    redoChange();
    return;
  }
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return;
  const hasImageSelection = AppState.selectedImageIds.length > 0;
  const hasTextSelection = AppState.selectedTextIds.length > 0;
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    if (hasImageSelection) {
      handleDeleteImage();
    } else if (hasTextSelection) {
      handleDeleteText();
    } else {
      handleDeleteSlot();
    }
  }
  if (isCmd && key === "c") {
    event.preventDefault();
    if (hasImageSelection) {
      handleCopyImage();
    } else if (hasTextSelection) {
      handleCopyText();
    } else {
      handleCopySlot();
    }
  }
  if (isCmd && key === "v") {
    event.preventDefault();
    void handlePasteShortcut({ hasImageSelection, hasTextSelection });
    return;
  }
  if (isCmd && key === "a") {
    event.preventDefault();
    if (hasImageSelection) {
      AppState.selectedSlotIds = [];
      AppState.selectedTextIds = [];
      AppState.selectedImageIds = puzzle.images.map((image) => image.id);
    } else if (hasTextSelection) {
      AppState.selectedSlotIds = [];
      AppState.selectedImageIds = [];
      AppState.selectedTextIds = puzzle.texts.map((text) => text.id);
    } else if (puzzle.slots.length) {
      AppState.selectedTextIds = [];
      AppState.selectedImageIds = [];
      AppState.selectedSlotIds = puzzle.slots.map((slot) => slot.id);
    } else if (puzzle.texts?.length) {
      AppState.selectedSlotIds = [];
      AppState.selectedImageIds = [];
      AppState.selectedTextIds = puzzle.texts.map((text) => text.id);
    } else if (puzzle.images?.length) {
      AppState.selectedSlotIds = [];
      AppState.selectedTextIds = [];
      AppState.selectedImageIds = puzzle.images.map((image) => image.id);
    }
    updatePropertiesPanel();
    scheduleRender();
  }
}

function handleSlotContextMenu(event) {
  if (AppState.mode !== "edit") return;
  if (!elements.canvas || !elements.canvasWrapper || !editor) return;
  event.preventDefault();
  const rect = elements.canvas.getBoundingClientRect();
  const stageRect = (getStageElement() || elements.canvasWrapper).getBoundingClientRect();
  const screenPoint = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
  const worldPoint = editor.toWorld(screenPoint);
  const hitElement = getElementAtWorldPoint(worldPoint);
  if (hitElement?.type === "image") {
    const image = hitElement.item;
    contextMenuTarget = "image";
    if (!AppState.selectedImageIds.includes(image.id)) {
      AppState.selectedImageIds = [image.id];
    }
    AppState.selectedSlotIds = [];
    AppState.selectedTextIds = [];
    exitTextEditMode();
    updatePropertiesPanel();
    scheduleRender();
    showSlotMenu(event.clientX - stageRect.left, event.clientY - stageRect.top);
    return;
  }
  if (hitElement?.type === "text") {
    const hitText = hitElement.item;
    contextMenuTarget = "text";
    if (!AppState.selectedTextIds.includes(hitText.id)) {
      AppState.selectedTextIds = [hitText.id];
    }
    AppState.selectedSlotIds = [];
    AppState.selectedImageIds = [];
    exitTextEditMode();
    updatePropertiesPanel();
    scheduleRender();
    showSlotMenu(event.clientX - stageRect.left, event.clientY - stageRect.top);
    return;
  }
  const hitSlot = getSlotAtWorldPoint(worldPoint);
  if (!hitSlot) {
    hideSlotMenu();
    return;
  }
  contextMenuTarget = "slot";
  if (!AppState.selectedSlotIds.includes(hitSlot.id)) {
    AppState.selectedSlotIds = [hitSlot.id];
    AppState.selectedTextIds = [];
    AppState.selectedImageIds = [];
    exitTextEditMode();
    updatePropertiesPanel();
    scheduleRender();
  }
  showSlotMenu(event.clientX - stageRect.left, event.clientY - stageRect.top);
}

function handleSlotMenuCopy() {
  if (!slotMenuVisible) return;
  if (contextMenuTarget === "text") {
    handleCopyText();
    handlePasteText();
  } else if (contextMenuTarget === "image") {
    handleCopyImage();
    handlePasteImage();
  } else {
    handleCopySlot();
    handlePasteSlot();
  }
  hideSlotMenu();
}

function handleSlotMenuDelete() {
  if (!slotMenuVisible) return;
  if (contextMenuTarget === "text") {
    handleDeleteText();
  } else if (contextMenuTarget === "image") {
    handleDeleteImage();
  } else {
    handleDeleteSlot();
  }
  hideSlotMenu();
}

function handleSlotMenuBringToFront() {
  if (!slotMenuVisible) return;
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return;
  const hasSelection = contextMenuTarget === "text"
    ? AppState.selectedTextIds.length > 0
    : contextMenuTarget === "image"
      ? AppState.selectedImageIds.length > 0
      : AppState.selectedSlotIds.length > 0;
  if (!hasSelection) {
    hideSlotMenu();
    return;
  }
  pushUndoState();
  const changed = moveCurrentSelectionLayer(true);
  if (!changed) {
    hideSlotMenu();
    return;
  }
  updatePropertiesPanel();
  saveStateToStorage();
  scheduleRender();
  hideSlotMenu();
}

function handleSlotMenuSendToBack() {
  if (!slotMenuVisible) return;
  const puzzle = getCurrentPuzzle();
  if (!puzzle) return;
  const hasSelection = contextMenuTarget === "text"
    ? AppState.selectedTextIds.length > 0
    : contextMenuTarget === "image"
      ? AppState.selectedImageIds.length > 0
      : AppState.selectedSlotIds.length > 0;
  if (!hasSelection) {
    hideSlotMenu();
    return;
  }
  pushUndoState();
  const changed = moveCurrentSelectionLayer(false);
  if (!changed) {
    hideSlotMenu();
    return;
  }
  updatePropertiesPanel();
  saveStateToStorage();
  scheduleRender();
  hideSlotMenu();
}

function initEditor() {
  editor = createCanvasEditor({
    canvas: elements.canvas,
    wrapper: elements.canvasWrapper,
    getPuzzle: getCurrentPuzzle,
    getSelectedIds: () => AppState.selectedSlotIds,
    setSelectedIds: (ids) => {
      AppState.selectedSlotIds = ids;
      AppState.selectedTextIds = [];
      AppState.selectedImageIds = [];
      exitTextEditMode();
      updatePropertiesPanel();
      scheduleRender();
    },
    onSlotsUpdated: (event) => {
      if (event?.phase === "start") {
        pushUndoState();
      }
      updatePropertiesPanel();
      updateEstimateCount();
      saveStateToStorage();
      scheduleRender();
    },
    onViewChanged: () => {
      updateEditorZoomLabel();
      updateCanvasWrapperHeight();
      scheduleRender();
    },
    onSelectionPreview: setSelectionOverlay,
    isEditable: () => AppState.mode === "edit",
    onPreviewClick: showPreviewToast,
    lockCenteredView: true,
    enableCanvasSelection: false,
    onWheelZoom: ({ deltaY }) => {
      applyEditorWheelZoom(deltaY);
    },
    getScaleBounds: () => {
      const baseScale = getEditorBaseScale();
      if (!baseScale) return null;
      return {
        min: baseScale * EDIT_ZOOM_MIN,
        max: baseScale * EDIT_ZOOM_MAX
      };
    }
  });

  if (selectionController?.dispose) {
    selectionController.dispose();
  }
  const stageSelectionTarget = elements.stageScroll || elements.stage;
  if (stageSelectionTarget && elements.canvas) {
    selectionController = createSelectionController({
      stage: stageSelectionTarget,
      canvas: elements.canvas,
      getPuzzle: getCurrentPuzzle,
      toWorld: (point) => editor.toWorld(point),
      isEditable: () => AppState.mode === "edit",
      shouldIgnoreEvent: shouldIgnoreStageSelectionEvent,
      shouldDeferToEditor: shouldDeferStageSelectionToEditor,
      getSelectedIds: getStageSelectionSnapshot,
      getSelectionTarget: getStageSelectionTarget,
      onSelectionPreview: setSelectionOverlay,
      onSelectionCommitted: commitStageSelection,
      onPreviewClick: showPreviewToast
    });
  }

  imageEditor = createImageEditor({
    canvas: elements.canvas,
    getPuzzle: getCurrentPuzzle,
    getSelectedImageIds: () => AppState.selectedImageIds,
    setSelectedImageIds: (ids) => {
      AppState.selectedImageIds = ids;
      AppState.selectedSlotIds = [];
      AppState.selectedTextIds = [];
      exitTextEditMode();
      updatePropertiesPanel();
      scheduleRender();
    },
    getSelectedTextIds: () => AppState.selectedTextIds,
    toWorld: (point) => editor.toWorld(point),
    isEditable: () => AppState.mode === "edit",
    onImagesUpdated: (event) => {
      if (event?.phase === "start") {
        pushUndoState();
      }
      if (event?.phase === "end") {
        updatePropertiesPanel();
        saveStateToStorage();
      }
      scheduleRender();
    },
    onSelectionPreview: setSelectionOverlay,
    onPreviewClick: showPreviewToast,
    getTopElementAtPoint: getElementAtWorldPoint,
    enableCanvasSelection: false
  });

  textEditor = createTextEditor({
    canvas: elements.canvas,
    getPuzzle: getCurrentPuzzle,
    getSelectedTextIds: () => AppState.selectedTextIds,
    setSelectedTextIds: (ids) => {
      AppState.selectedTextIds = ids;
      AppState.selectedSlotIds = [];
      AppState.selectedImageIds = [];
      exitTextEditMode();
      updatePropertiesPanel();
      scheduleRender();
    },
    toWorld: (point) => editor.toWorld(point),
    isEditable: () => AppState.mode === "edit",
    isEditing: () => reconcileTextEditState(),
    onTextsUpdated: (event) => {
      if (event?.phase === "start") {
        pushUndoState();
      }
      if (event?.phase === "end") {
        updatePropertiesPanel();
        saveStateToStorage();
      }
      scheduleRender();
    },
    onSelectionPreview: setSelectionOverlay,
    onEditRequested: (text) => {
      AppState.selectedSlotIds = [];
      AppState.selectedTextIds = [text.id];
      AppState.selectedImageIds = [];
      updatePropertiesPanel();
      openTextEditor(text);
    },
    onPreviewClick: showPreviewToast,
    getTopElementAtPoint: getElementAtWorldPoint,
    enableCanvasSelection: false
  });
}

function initColorPickers() {
  // 背景颜色选择器
  if (elements.colorInput) {
    const puzzle = getCurrentPuzzle();
    bgColorPicker = createColorPicker({
      el: elements.colorInput,
      default: puzzle?.backgroundColor || '#ffffff',
      onSave: (color) => {
        const puzzle = getCurrentPuzzle();
        if (!puzzle) return;
        puzzle.backgroundColor = color;
        if (puzzle.backgroundMode !== "color") {
          setBackgroundMode("color");
          return;
        }
        saveStateToStorage();
        scheduleRender();
      }
    });
  }

  // 边框颜色选择器
  if (elements.slotBorderColorInput) {
    slotBorderColorPicker = createColorPicker({
      el: elements.slotBorderColorInput,
      default: '#ffffff',
      onSave: (color) => {
        applySlotStyle(
          { borderColor: color },
          { targetIds: getSelectionSnapshotForType("slot") }
        );
      }
    });
  }

  // 文字颜色选择器
  if (elements.textColorInput) {
    textColorPicker = createColorPicker({
      el: elements.textColorInput,
      default: '#000000',
      onSave: (color) => {
        applyTextStyle(
          { color: color },
          { targetIds: getSelectionSnapshotForType("text") }
        );
      }
    });
  }

  // 文字描边颜色选择器
  if (elements.textStrokeColorInput) {
    textStrokeColorPicker = createColorPicker({
      el: elements.textStrokeColorInput,
      default: "#000000",
      onSave: (color) => {
        applyTextStyle(
          { strokeColor: color },
          { targetIds: getSelectionSnapshotForType("text") }
        );
      }
    });
  }

  // 文字阴影颜色选择器
  if (elements.textShadowColorInput) {
    textShadowColorPicker = createColorPicker({
      el: elements.textShadowColorInput,
      default: "#000000",
      onSave: (color) => {
        applyTextStyle(
          { shadowColor: color },
          { targetIds: getSelectionSnapshotForType("text") }
        );
      }
    });
  }
}

function initCustomSelects() {
  // 模板选择器
  if (elements.templateSelect) {
    templateSelectInstance = createCustomSelect(elements.templateSelect);
  }

  // 导出倍率选择器
  if (elements.scaleSelect) {
    scaleSelectInstance = createCustomSelect(elements.scaleSelect);
  }

  // 字体选择器
  if (elements.textFontSelect) {
    textFontSelectInstance = createCustomSelect(elements.textFontSelect);
  }

  // 字重选择器
  if (elements.textWeightSelect) {
    textWeightSelectInstance = createCustomSelect(elements.textWeightSelect);
  }
}

function bindPropertyDraftEvents() {
  ensurePropertyDraftCaptureListener();
  bindNumberPropertyDraft({
    input: elements.slotWInput,
    targetType: "slot",
    parseValue: (raw) => Number(raw),
    applyValue: (_value, context) => handleSlotSizeChange({
      targetIds: context.targetIds,
      sourceInput: context.input
    })
  });
  bindNumberPropertyDraft({
    input: elements.slotHInput,
    targetType: "slot",
    parseValue: (raw) => Number(raw),
    applyValue: (_value, context) => handleSlotSizeChange({
      targetIds: context.targetIds,
      sourceInput: context.input
    })
  });
  bindNumberPropertyDraft({
    input: elements.slotRadiusInput,
    targetType: "slot",
    parseValue: (raw) => {
      const value = Number(raw);
      if (!Number.isFinite(value)) return 0;
      return clamp(value, 0, 100);
    },
    applyValue: (value, context) => applySlotStyle(
      { borderRadius: value },
      { targetIds: context.targetIds }
    )
  });
  bindNumberPropertyDraft({
    input: elements.slotBorderWidthInput,
    targetType: "slot",
    parseValue: (raw) => {
      const value = Number(raw);
      if (!Number.isFinite(value)) return 0;
      return clamp(value, 0, 20);
    },
    applyValue: (value, context) => applySlotStyle(
      { borderWidth: value },
      { targetIds: context.targetIds }
    )
  });
  bindNumberPropertyDraft({
    input: elements.textSizeInput,
    targetType: "text",
    parseValue: (raw) => {
      const value = Number(raw);
      if (!Number.isFinite(value)) return 32;
      return clamp(value, 8, 200);
    },
    applyValue: (value, context) => applyTextStyle(
      { fontSize: value },
      { targetIds: context.targetIds }
    )
  });
  bindNumberPropertyDraft({
    input: elements.textLetterSpacingInput,
    targetType: "text",
    parseValue: (raw) => {
      const value = Number(raw);
      if (!Number.isFinite(value)) return 0;
      return clamp(value, -10, 50);
    },
    applyValue: (value, context) => applyTextStyle(
      { letterSpacing: value },
      { targetIds: context.targetIds }
    )
  });
  bindNumberPropertyDraft({
    input: elements.textLineHeightInput,
    targetType: "text",
    parseValue: (raw) => {
      const value = Number(raw);
      if (!Number.isFinite(value)) return 1.4;
      return clamp(value, 1, 3);
    },
    applyValue: (value, context) => applyTextStyle(
      { lineHeight: value },
      { targetIds: context.targetIds }
    )
  });
  bindNumberPropertyDraft({
    input: elements.textStrokeWidthInput,
    targetType: "text",
    parseValue: (raw) => {
      const value = Number(raw);
      if (!Number.isFinite(value)) return 0;
      return clamp(value, 0, 20);
    },
    applyValue: (value, context) => applyTextStyle(
      { strokeWidth: value },
      { targetIds: context.targetIds }
    )
  });
  bindNumberPropertyDraft({
    input: elements.textShadowBlurInput,
    targetType: "text",
    parseValue: (raw) => {
      const value = Number(raw);
      if (!Number.isFinite(value)) return 0;
      return clamp(value, 0, 20);
    },
    applyValue: (value, context) => applyTextStyle(
      { shadowBlur: value },
      { targetIds: context.targetIds }
    )
  });
  bindNumberPropertyDraft({
    input: elements.textShadowOffsetXInput,
    targetType: "text",
    parseValue: (raw) => {
      const value = Number(raw);
      if (!Number.isFinite(value)) return 0;
      return clamp(value, -20, 20);
    },
    applyValue: (value, context) => applyTextStyle(
      { shadowOffsetX: value },
      { targetIds: context.targetIds }
    )
  });
  bindNumberPropertyDraft({
    input: elements.textShadowOffsetYInput,
    targetType: "text",
    parseValue: (raw) => {
      const value = Number(raw);
      if (!Number.isFinite(value)) return 0;
      return clamp(value, -20, 20);
    },
    applyValue: (value, context) => applyTextStyle(
      { shadowOffsetY: value },
      { targetIds: context.targetIds }
    )
  });
}

function bindEvents() {
  elements.addSlotBtn.addEventListener("click", handleAddSlot);
  if (elements.addImageSlotBtn) {
    elements.addImageSlotBtn.addEventListener("click", handleAddImageSlot);
  }
  if (elements.addTextBtn) {
    elements.addTextBtn.addEventListener("click", handleAddText);
  }
  if (elements.addImageElementBtn) {
    elements.addImageElementBtn.addEventListener("click", handleAddImageElement);
  }
  if (elements.clearTextBtn) {
    elements.clearTextBtn.addEventListener("click", handleClearTexts);
  }
  if (elements.clearImageElementBtn) {
    elements.clearImageElementBtn.addEventListener("click", handleClearImageElements);
  }
  elements.clearSlotsBtn.addEventListener("click", handleClearSlots);
  if (elements.applyCanvasSizeBtn) {
    elements.applyCanvasSizeBtn.addEventListener("click", applyCanvasSize);
  }
  elements.canvasWInput.addEventListener("input", handleCanvasSizeInput);
  elements.canvasHInput.addEventListener("input", handleCanvasSizeInput);
  elements.canvasWInput.addEventListener("change", handleCanvasSizeInput);
  elements.canvasHInput.addEventListener("change", handleCanvasSizeInput);
  elements.uploadBgBtn.addEventListener("click", handleUploadBackground);
  elements.transparentToggle.addEventListener("change", handleTransparentToggle);
  if (elements.colorToggle) {
    elements.colorToggle.addEventListener("change", handleColorToggle);
  }
  elements.importImagesBtn.addEventListener("click", handleImportImages);
  if (elements.clearImagesBtn) {
    elements.clearImagesBtn.addEventListener("click", handleClearImages);
  }
  if (elements.assignFoldersBtn) {
    elements.assignFoldersBtn.addEventListener("click", handleAssignFolders);
  }
  elements.selectOutputBtn.addEventListener("click", handleSelectOutput);
  if (elements.scaleSelect) {
    elements.scaleSelect.addEventListener("change", handleScaleChange);
  }
  elements.previewBtn.addEventListener("click", handlePreview);
  elements.generateBtn.addEventListener("click", handleGenerate);
  elements.addTabBtn.addEventListener("click", handleAddTab);
  elements.saveTemplateBtn.addEventListener("click", handleSaveTemplate);
  if (elements.templateMenuBtn) {
    elements.templateMenuBtn.addEventListener("click", toggleTemplateDropdown);
  }
  if (elements.renameTemplateItem) {
    elements.renameTemplateItem.addEventListener("click", handleRenameTemplate);
  }
  if (elements.duplicateTemplateItem) {
    elements.duplicateTemplateItem.addEventListener("click", handleDuplicateTemplate);
  }
  if (elements.migrateTemplateLibraryItem) {
    elements.migrateTemplateLibraryItem.addEventListener("click", handleMigrateTemplateLibrary);
  }
  elements.deleteTemplateBtn.addEventListener("click", handleDeleteTemplate);
  elements.templateSelect.addEventListener("change", handleTemplateChange);
  if (elements.templateModalCancel) {
    elements.templateModalCancel.addEventListener("click", closeTemplateModal);
  }
  if (elements.templateModalConfirm) {
    elements.templateModalConfirm.addEventListener("click", confirmTemplateSave);
  }
  if (elements.templateModalInput) {
    elements.templateModalInput.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        confirmTemplateSave();
      }
      if (event.key === "Escape") {
        closeTemplateModal();
      }
    });
  }
  if (elements.templateModal) {
    elements.templateModal.addEventListener("click", (event) => {
      if (event.target === elements.templateModal) {
        closeTemplateModal();
      }
    });
  }
  if (elements.templateLibraryCancel) {
    elements.templateLibraryCancel.addEventListener("click", closeTemplateLibraryModal);
  }
  if (elements.templateLibraryOpen) {
    elements.templateLibraryOpen.addEventListener("click", handleOpenTemplateLibraryFolder);
  }
  if (elements.templateLibraryModal) {
    elements.templateLibraryModal.addEventListener("click", (event) => {
      if (event.target === elements.templateLibraryModal) {
        closeTemplateLibraryModal();
      }
    });
  }
  if (elements.folderCancel) {
    elements.folderCancel.addEventListener("click", closeFolderModal);
  }
  if (elements.folderSubModeBatchBtn) {
    elements.folderSubModeBatchBtn.addEventListener("click", () => {
      setFolderModalSubMode(MULTI_FOLDER_SUBMODE_SUBFOLDER);
    });
  }
  if (elements.folderSubModePerPuzzleBtn) {
    elements.folderSubModePerPuzzleBtn.addEventListener("click", () => {
      setFolderModalSubMode(MULTI_FOLDER_SUBMODE_PER_PUZZLE);
    });
  }
  if (elements.folderSubdirToggle) {
    elements.folderSubdirToggle.addEventListener("change", () => {
      if (!tempMultiFolderDraft) return;
      if (isSubfolderBatchMode(tempMultiFolderDraft)) {
        tempMultiFolderDraft.subfolderBatch.outputByInputSubfolder = elements.folderSubdirToggle.checked;
      } else {
        tempMultiFolderDraft.perPuzzle.outputByPuzzleFolder = elements.folderSubdirToggle.checked;
      }
    });
  }
  if (elements.folderShareCycleToggle) {
    elements.folderShareCycleToggle.addEventListener("change", () => {
      if (!tempMultiFolderDraft) return;
      tempMultiFolderDraft.perPuzzle.shareSameFolderCycle = elements.folderShareCycleToggle.checked;
    });
  }
  if (elements.folderConfirm) {
    elements.folderConfirm.addEventListener("click", confirmFolderBindings);
  }
  if (elements.folderModal) {
    elements.folderModal.addEventListener("click", (event) => {
      if (event.target === elements.folderModal) {
        closeFolderModal();
      }
    });
  }
  if (elements.confirmModalCancel) {
    elements.confirmModalCancel.addEventListener("click", () => closeConfirmModal(false));
  }
  if (elements.confirmModalConfirm) {
    elements.confirmModalConfirm.addEventListener("click", () => closeConfirmModal(true));
  }
  if (elements.confirmModal) {
    elements.confirmModal.addEventListener("click", (event) => {
      if (event.target === elements.confirmModal) closeConfirmModal(false);
    });
  }
  elements.prevBtn.addEventListener("click", () => handlePreviewNavigation(-1));
  elements.nextBtn.addEventListener("click", () => handlePreviewNavigation(1));
  elements.exitPreviewBtn.addEventListener("click", exitPreview);
  if (elements.zoomInBtn) {
    elements.zoomInBtn.addEventListener("click", handleZoomIn);
  }
  if (elements.zoomOutBtn) {
    elements.zoomOutBtn.addEventListener("click", handleZoomOut);
  }
  if (elements.zoomFitBtn) {
    elements.zoomFitBtn.addEventListener("click", handlePreviewZoomFit);
  }
  if (elements.zoomPixelBtn) {
    elements.zoomPixelBtn.addEventListener("click", handlePreviewZoomPixel);
  }
  if (elements.canvas) {
    elements.canvas.addEventListener("wheel", handlePreviewWheel, { passive: false });
    elements.canvas.addEventListener("mousemove", updateLastCanvasPointer);
    elements.canvas.addEventListener("mouseleave", clearLastCanvasPointer);
  }
  if (elements.stageScroll || elements.stage) {
    (elements.stageScroll || elements.stage).addEventListener("wheel", handleStageWheelZoom, { passive: false });
  }

  elements.generationRadios.forEach((radio) => {
    radio.addEventListener("change", handleGenerationModeChange);
  });
  if (elements.singleCoverOptionCheckbox) {
    elements.singleCoverOptionCheckbox.addEventListener("change", handleSingleCoverOptionChange);
  }

  bindPropertyDraftEvents();

  elements.slotShadowInput.addEventListener("change", () => {
    applySlotStyle(
      { shadow: elements.slotShadowInput.checked },
      { targetIds: getSelectionSnapshotForType("slot") }
    );
  });
  if (elements.slotLockInput) {
    elements.slotLockInput.addEventListener("change", () => {
      const puzzle = getCurrentPuzzle();
      if (!puzzle) return;
      if (AppState.selectedSlotIds.length !== 1) return;
      const slot = puzzle.slots.find((item) => item.id === AppState.selectedSlotIds[0]);
      if (!slot) return;
      pushUndoState();
      slot.style.lockAspect = elements.slotLockInput.checked;
      saveStateToStorage();
      scheduleRender();
    });
  }
  if (elements.cropBtn) {
    elements.cropBtn.addEventListener("click", handleCropEdit);
  }
  if (elements.cropClearBtn) {
    elements.cropClearBtn.addEventListener("click", handleCropClear);
  }

  elements.copySlotBtn.addEventListener("click", handleCopySlot);
  elements.deleteSlotBtn.addEventListener("click", handleDeleteSlot);

  if (elements.textFontSelect) {
    elements.textFontSelect.addEventListener("change", () => {
      const family = elements.textFontSelect.value;
      syncTextWeightOptions(family, Number(elements.textWeightSelect?.value));
      const weight = Number(elements.textWeightSelect?.value) || 400;
      applyTextStyle({ fontFamily: family, fontWeight: weight });
    });
  }
  if (elements.textWeightSelect) {
    elements.textWeightSelect.addEventListener("change", () => {
      applyTextStyle({ fontWeight: Number(elements.textWeightSelect.value) || 400 });
    });
  }
  if (elements.textBoldBtn) {
    elements.textBoldBtn.addEventListener("click", () => {
      const puzzle = getCurrentPuzzle();
      if (!puzzle) return;
      const selected = puzzle.texts.filter((text) => AppState.selectedTextIds.includes(text.id));
      if (!selected.length) return;
      const family = selected[0]?.style?.fontFamily || elements.textFontSelect?.value;
      const currentWeight = Number(selected[0]?.style?.fontWeight) || 400;
      const nextWeight = currentWeight >= 600
        ? getNormalWeight(family)
        : getBoldWeight(family);
      applyTextStyle({ fontWeight: nextWeight });
      if (elements.textWeightSelect) {
        elements.textWeightSelect.value = String(nextWeight);
      }
    });
  }
  if (elements.textItalicBtn) {
    elements.textItalicBtn.addEventListener("click", () => {
      const puzzle = getCurrentPuzzle();
      if (!puzzle) return;
      const selected = puzzle.texts.filter((text) => AppState.selectedTextIds.includes(text.id));
      if (!selected.length) return;
      const currentStyle = selected[0]?.style?.fontStyle || "normal";
      applyTextStyle({ fontStyle: currentStyle === "italic" ? "normal" : "italic" });
    });
  }
  if (elements.textAlignLeftBtn) {
    elements.textAlignLeftBtn.addEventListener("click", () => {
      applyTextStyle({ textAlign: "left" });
      updateTextAlignButtons("left");
    });
  }
  if (elements.textAlignCenterBtn) {
    elements.textAlignCenterBtn.addEventListener("click", () => {
      applyTextStyle({ textAlign: "center" });
      updateTextAlignButtons("center");
    });
  }
  if (elements.textAlignRightBtn) {
    elements.textAlignRightBtn.addEventListener("click", () => {
      applyTextStyle({ textAlign: "right" });
      updateTextAlignButtons("right");
    });
  }
  if (elements.textScaleDownBtn) {
    elements.textScaleDownBtn.addEventListener("click", () => scaleSelectedTexts(0.9));
  }
  if (elements.textScaleUpBtn) {
    elements.textScaleUpBtn.addEventListener("click", () => scaleSelectedTexts(1.1));
  }
  if (elements.copyTextBtn) {
    elements.copyTextBtn.addEventListener("click", handleCopyText);
  }
  if (elements.deleteTextBtn) {
    elements.deleteTextBtn.addEventListener("click", handleDeleteText);
  }

  elements.alignLeftBtn.addEventListener("click", () => alignSelected("left"));
  elements.alignRightBtn.addEventListener("click", () => alignSelected("right"));
  elements.alignTopBtn.addEventListener("click", () => alignSelected("top"));
  elements.alignBottomBtn.addEventListener("click", () => alignSelected("bottom"));
  elements.alignHCenterBtn.addEventListener("click", () => alignSelected("hcenter"));
  elements.alignVCenterBtn.addEventListener("click", () => alignSelected("vcenter"));
  elements.distributeHBtn.addEventListener("click", () => distributeSelected("h"));
  elements.distributeVBtn.addEventListener("click", () => distributeSelected("v"));
  if (elements.scaleDownBtn) {
    elements.scaleDownBtn.addEventListener("click", () => scaleSelectedSlots(0.9));
  }
  if (elements.scaleUpBtn) {
    elements.scaleUpBtn.addEventListener("click", () => scaleSelectedSlots(1.1));
  }

  elements.imageList.addEventListener("dragover", handleImageReorder);
  elements.imageList.addEventListener("drop", handleImageReorder);

  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("focus", handleWindowFocus);
  window.addEventListener("blur", handleWindowBlur);
  window.addEventListener("beforeunload", stopTemplateAutoSaveTimer);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  document.addEventListener("keydown", handleKeyDown);
  if (elements.canvasWrapper) {
    elements.canvasWrapper.addEventListener("contextmenu", handleSlotContextMenu);
  }
  if (elements.slotMenuCopy) {
    elements.slotMenuCopy.addEventListener("click", handleSlotMenuCopy);
  }
  if (elements.slotMenuDelete) {
    elements.slotMenuDelete.addEventListener("click", handleSlotMenuDelete);
  }
  if (elements.slotMenuBringToFront) {
    elements.slotMenuBringToFront.addEventListener("click", handleSlotMenuBringToFront);
  }
  if (elements.slotMenuSendToBack) {
    elements.slotMenuSendToBack.addEventListener("click", handleSlotMenuSendToBack);
  }
  document.addEventListener("click", (event) => {
    if (slotMenuVisible) {
      if (!elements.slotMenu || !elements.slotMenu.contains(event.target)) {
        hideSlotMenu();
      }
    }
    if (elements.templateDropdown?.classList.contains("show")) {
      const clickedInTemplateMenu = elements.templateMenuWrap
        && elements.templateMenuWrap.contains(event.target);
      if (!clickedInTemplateMenu) {
        closeTemplateDropdown();
      }
    }
  });

  if (elements.canvasWrapper) {
    elements.canvasWrapper.addEventListener("click", () => {
      hideSlotMenu();
      if (AppState.mode === "preview") {
        showPreviewToast();
      }
    });
  }
}

async function init() {
  loadStateFromStorage();
  templates = await loadTemplates();
  pruneTemplateWorkingSets();
  logPuzzle(`模板加载完成，共 ${templates.length} 个`);
  updateTemplateSelect();
  syncTemplateAutoSaveBaseline();
  renderTabBar();
  syncGenerationModeUI();
  syncCanvasInputs();
  await initTextFontOptions();
  syncScaleSelect();
  updateOutputPath();
  updateImageList();
  initEditor();
  initColorPickers();
  initCustomSelects();
  cropEditor = createCropEditor(elements);
  AppState.puzzles.forEach((puzzle) => preloadTextFonts(puzzle.texts));
  bindEvents();
  bindTabActivation();
  observeCanvasWrapper();
  if (window.appApi?.onPuzzleProgress) {
    window.appApi.onPuzzleProgress((data) => {
      if (!data) return;
      if (data.phase === "start") {
        setStatus(`生成中 0/${data.total || 0}`);
      }
      if (data.phase === "item") {
        setStatus(`生成中 ${data.current || 0}/${data.total || 0}`);
      }
      if (data.phase === "item-error") {
        setStatus(`生成中 ${data.current || 0}/${data.total || 0}（失败 ${data.failed || 0}）`);
      }
      if (data.phase === "done") {
        const failed = Number(data.failed) || 0;
        if (failed > 0) {
          const success = Number(data.success) || Math.max(0, (Number(data.total) || 0) - failed);
          setStatus(`生成完成：成功 ${success} 张，失败 ${failed} 张`);
        } else {
          setStatus(`生成完成，共 ${data.total || 0} 张`);
        }
      }
    });
  }
  resizeCanvas();
  updatePropertiesPanel();
  updatePreviewBar();
  updateEstimateCount();
  setPreviewState(AppState.mode === "preview");
  updateEditorZoomLabel();
  startTemplateAutoSaveTimer();
}

init();
