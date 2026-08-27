import { createPuzzle } from "./state.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeTemplateName(name) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  return trimmed || "未命名模板";
}

function buildDuplicateName(baseName, existingNames) {
  const duplicateBase = `${baseName} - 复制`;
  if (!existingNames.has(duplicateBase)) {
    return duplicateBase;
  }
  let index = 2;
  let candidate = `${duplicateBase}(${index})`;
  while (existingNames.has(candidate)) {
    index += 1;
    candidate = `${duplicateBase}(${index})`;
  }
  return candidate;
}

function buildUniqueTemplateId(existingIds) {
  let id = `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  while (existingIds.has(id)) {
    id = `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
  return id;
}

export async function loadTemplates() {
  if (!window.appApi?.loadPuzzleTemplates) {
    return [];
  }
  const result = await window.appApi.loadPuzzleTemplates();
  if (!result?.ok) {
    return [];
  }
  return Array.isArray(result.templates) ? result.templates : [];
}

export async function saveTemplates(templates) {
  if (!window.appApi?.savePuzzleTemplates) {
    return { ok: false, error: "模板接口不可用" };
  }
  return window.appApi.savePuzzleTemplates({ templates });
}

export function serializeState(state) {
  return {
    id: state.currentTemplate?.id || null,
    name: state.currentTemplate?.name || "",
    generationMode: state.generationMode,
    singleFirstPuzzleOnce: state.singleFirstPuzzleOnce === true,
    puzzles: state.puzzles.map((puzzle) => ({
      id: puzzle.id,
      name: puzzle.name,
      backgroundMode: puzzle.backgroundMode,
      backgroundPath: puzzle.backgroundPath,
      backgroundColor: puzzle.backgroundColor,
      canvasSize: clone(puzzle.canvasSize),
      slots: puzzle.slots.map((slot) => ({
        id: slot.id,
        x: slot.x,
        y: slot.y,
        w: slot.w,
        h: slot.h,
        layerIndex: slot.layerIndex,
        zOrder: slot.zOrder,
        fillOrder: slot.fillOrder,
        style: clone(slot.style),
        crop: slot.crop ? clone(slot.crop) : null
      })),
      images: Array.isArray(puzzle.images)
        ? puzzle.images.map((image) => ({
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
        }))
        : [],
      texts: Array.isArray(puzzle.texts)
        ? puzzle.texts.map((text) => ({
          id: text.id,
          type: text.type,
          content: text.content,
          x: text.x,
          y: text.y,
          width: text.width,
          rotation: text.rotation,
          createdAt: text.createdAt,
          zOrder: text.zOrder,
          style: clone(text.style)
        }))
        : []
    }))
  };
}

export function buildTemplate(name, state) {
  const now = Date.now();
  const payload = serializeState(state);
  return {
    id: payload.id || `tpl-${now}`,
    name,
    createdAt: now,
    updatedAt: now,
    generationMode: payload.generationMode,
    singleFirstPuzzleOnce: payload.singleFirstPuzzleOnce === true,
    puzzles: payload.puzzles
  };
}

export function duplicateTemplate(template, existingTemplates = []) {
  if (!template || typeof template !== "object") {
    throw new Error("复制模板失败：模板数据无效");
  }
  const existingIds = new Set(
    (Array.isArray(existingTemplates) ? existingTemplates : [])
      .map((item) => item?.id)
      .filter((id) => typeof id === "string" && id.trim())
  );
  const existingNames = new Set(
    (Array.isArray(existingTemplates) ? existingTemplates : [])
      .map((item) => (typeof item?.name === "string" ? item.name.trim() : ""))
      .filter(Boolean)
  );
  const baseName = normalizeTemplateName(template.name);
  const now = Date.now();
  return {
    id: buildUniqueTemplateId(existingIds),
    name: buildDuplicateName(baseName, existingNames),
    createdAt: now,
    updatedAt: now,
    generationMode: template.generationMode === "multi-folder" ? "multi-folder" : "single",
    singleFirstPuzzleOnce: template.singleFirstPuzzleOnce === true,
    puzzles: clone(Array.isArray(template.puzzles) ? template.puzzles : [])
  };
}

export function applyTemplate(template) {
  const puzzles = template.puzzles.map((item, index) => {
    const puzzle = createPuzzle(item.name || `拼图${index + 1}`);
    puzzle.id = item.id || puzzle.id;
    puzzle.backgroundMode = item.backgroundMode || "image";
    puzzle.backgroundPath = item.backgroundPath || null;
    puzzle.backgroundColor = item.backgroundColor || "#ffffff";
    puzzle.canvasSize = item.canvasSize ? { ...item.canvasSize } : { ...puzzle.canvasSize };
    puzzle.slots = Array.isArray(item.slots)
      ? item.slots.map((slot, slotIndex) => ({
        id: slot.id || `slot-${index}-${Date.now()}`,
        x: slot.x,
        y: slot.y,
        w: slot.w,
        h: slot.h,
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
      : [];
    puzzle.images = Array.isArray(item.images)
      ? item.images.map((image) => ({
        id: image.id || `image-${index}-${Date.now()}`,
        type: image.type || "image",
        imagePath: image.imagePath || "",
        x: image.x ?? 0,
        y: image.y ?? 0,
        width: image.width ?? 200,
        height: image.height ?? 200,
        rotation: image.rotation ?? 0,
        aspectRatio: image.aspectRatio ?? (image.width && image.height ? image.width / image.height : 1),
        createdAt: image.createdAt ?? Date.now(),
        zOrder: image.zOrder ?? image.createdAt ?? Date.now()
      }))
      : [];
    puzzle.texts = Array.isArray(item.texts)
      ? item.texts.map((text) => ({
        id: text.id || `text-${index}-${Date.now()}`,
        type: text.type || "text",
        content: text.content ?? "",
        x: text.x ?? 0,
        y: text.y ?? 0,
        width: text.width ?? 200,
        rotation: text.rotation ?? 0,
        createdAt: text.createdAt ?? Date.now(),
        zOrder: text.zOrder ?? text.createdAt ?? Date.now(),
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
      : [];
    return puzzle;
  });

  return {
    puzzles,
    generationMode: template.generationMode === "multi-folder" ? "multi-folder" : "single",
    singleFirstPuzzleOnce: template.singleFirstPuzzleOnce === true
  };
}
