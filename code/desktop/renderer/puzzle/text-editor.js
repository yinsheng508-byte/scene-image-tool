import { getTextLayout, TEXT_HANDLE_SIZE, TEXT_ROTATE_HANDLE_OFFSET } from "./text-renderer.js";

const MIN_WIDTH = 20;
const MIN_FONT_SIZE = 8;

function getElementZOrderValue(item) {
  const zOrder = Number(item?.zOrder);
  if (Number.isFinite(zOrder)) return zOrder;
  const createdAt = Number(item?.createdAt);
  return Number.isFinite(createdAt) ? createdAt : 0;
}

function compareElementsByZOrder(a, b) {
  const diff = getElementZOrderValue(a) - getElementZOrderValue(b);
  if (diff !== 0) return diff;
  return String(a?.id || "").localeCompare(String(b?.id || ""), "zh-CN");
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

function toLocalPoint(worldPoint, textItem, layout) {
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
    center,
    width,
    height
  };
}

function getHandleAtPoint(localPoint, layout) {
  const size = TEXT_HANDLE_SIZE;
  const half = size / 2;
  const { width, height } = layout;
  const handles = [
    { key: "nw", x: 0, y: 0 },
    { key: "n", x: width / 2, y: 0 },
    { key: "ne", x: width, y: 0 },
    { key: "e", x: width, y: height / 2 },
    { key: "se", x: width, y: height },
    { key: "s", x: width / 2, y: height },
    { key: "sw", x: 0, y: height },
    { key: "w", x: 0, y: height / 2 }
  ];
  for (const handle of handles) {
    if (
      Math.abs(localPoint.x - handle.x) <= half &&
      Math.abs(localPoint.y - handle.y) <= half
    ) {
      return handle.key;
    }
  }
  const rotateX = width / 2;
  const rotateY = -TEXT_ROTATE_HANDLE_OFFSET;
  const dx = localPoint.x - rotateX;
  const dy = localPoint.y - rotateY;
  if (Math.sqrt(dx * dx + dy * dy) <= TEXT_HANDLE_SIZE) {
    return "rotate";
  }
  return null;
}

function isPointInText(worldPoint, textItem, layout) {
  const local = toLocalPoint(worldPoint, textItem, layout);
  return local.x >= 0 && local.x <= local.width && local.y >= 0 && local.y <= local.height;
}

function rectFromPoints(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);
  return { x, y, w, h };
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
  ];
  if (!rotation) return corners;
  return corners.map((point) => rotatePoint(point, center, rotation));
}

function getGroupBounds(texts, canvas) {
  if (texts.length < 2) return null;
  const bounds = texts.map((text) => {
    const layout = getTextLayout(canvas.getContext("2d"), text);
    const corners = getTextCorners(text, layout);
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

function getGroupHandles(bounds) {
  const x = bounds.x;
  const y = bounds.y;
  const w = bounds.w;
  const h = bounds.h;
  return [
    { key: "nw", x, y },
    { key: "ne", x: x + w, y },
    { key: "se", x: x + w, y: y + h },
    { key: "sw", x, y: y + h }
  ];
}

function getGroupHandleAtPoint(point, bounds) {
  const handles = getGroupHandles(bounds);
  return handles.find(
    (handle) =>
      Math.abs(point.x - handle.x) <= TEXT_HANDLE_SIZE &&
      Math.abs(point.y - handle.y) <= TEXT_HANDLE_SIZE
  );
}

function roundScaledSpacing(value) {
  return Math.round(value * 100) / 100;
}

function applyTextScaleFromCenter(ctx, text, origin, center, scale) {
  if (!text || !origin || !center) return;
  const safeScale = Math.max(0.1, Number(scale) || 0.1);
  const originStyle = origin.style || {};
  const nextFontSize = Math.max(
    MIN_FONT_SIZE,
    Math.round((Number(originStyle.fontSize) || 16) * safeScale)
  );
  const nextWidth = Math.max(
    MIN_WIDTH,
    Math.round((Number(origin.width) || MIN_WIDTH) * safeScale)
  );
  const nextLetterSpacing = (Number(originStyle.letterSpacing) || 0) * safeScale;
  const nextStyle = {
    ...originStyle,
    fontSize: nextFontSize,
    letterSpacing: roundScaledSpacing(nextLetterSpacing)
  };
  const nextLayout = getTextLayout(ctx, {
    ...origin,
    width: nextWidth,
    style: nextStyle
  });
  text.width = nextWidth;
  text.style = nextStyle;
  text.x = Math.round(center.x - nextLayout.width / 2);
  text.y = Math.round(center.y - nextLayout.height / 2);
}

export function createTextEditor(options) {
  const {
    canvas,
    getPuzzle,
    getSelectedTextIds,
    setSelectedTextIds,
    toWorld,
    isEditable,
    isEditing,
    onTextsUpdated,
    onSelectionPreview,
    onEditRequested,
    onPreviewClick,
    getTopElementAtPoint,
    enableCanvasSelection = true
  } = options;

  let isDragging = false;
  let activeHandle = null;
  let dragStart = null;
  let dragTextIds = [];
  let selectionDrag = null;
  let selectionActive = false;

  const SELECTION_THRESHOLD = 4;
  const LASSO_POINT_MIN = 6;
  const DRAG_START_THRESHOLD = 4;

  function hasDragExceeded(start, current) {
    if (!start || !current) return true;
    return Math.hypot(current.x - start.x, current.y - start.y) >= DRAG_START_THRESHOLD;
  }

  function beginDragIfNeeded(screenPoint) {
    if (!isDragging || !dragStart) return false;
    if (dragStart.dragStarted) return true;
    if (!hasDragExceeded(dragStart.startScreen, screenPoint)) return false;
    dragStart.dragStarted = true;
    if (onTextsUpdated) onTextsUpdated({ phase: "start" });
    return true;
  }

  function canEdit() {
    if (typeof isEditable === "function" && !isEditable()) return false;
    if (typeof isEditing === "function" && isEditing()) return false;
    return true;
  }

  function findTextAtPoint(worldPoint, puzzle) {
    const texts = Array.isArray(puzzle.texts) ? [...puzzle.texts] : [];
    texts.sort(compareElementsByZOrder);
    for (let i = texts.length - 1; i >= 0; i -= 1) {
      const text = texts[i];
      const layout = getTextLayout(canvas.getContext("2d"), text);
      if (isPointInText(worldPoint, text, layout)) {
        return { text, layout };
      }
    }
    return null;
  }

  function handleMouseDown(event) {
    if (event.button !== 0) return;
    if (!canEdit()) {
      if (typeof isEditable === "function" && !isEditable() && typeof onPreviewClick === "function") {
        onPreviewClick();
      }
      return;
    }
    const puzzle = getPuzzle();
    if (!puzzle) return;
    const rect = canvas.getBoundingClientRect();
    const screenPoint = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    const worldPoint = toWorld(screenPoint);
    if (typeof getTopElementAtPoint === "function") {
      const top = getTopElementAtPoint(worldPoint);
      const topType = typeof top === "string" ? top : top?.type;
      if (topType && topType !== "text") {
        return;
      }
    }

    const selectedIds = getSelectedTextIds();
    if (selectedIds.length === 1) {
      const text = puzzle.texts.find((item) => item.id === selectedIds[0]);
      if (text) {
        const layout = getTextLayout(canvas.getContext("2d"), text);
        const local = toLocalPoint(worldPoint, text, layout);
        const handle = getHandleAtPoint(local, layout);
        if (handle) {
          activeHandle = handle;
          isDragging = true;
          dragTextIds = [text.id];
          dragStart = {
            worldPoint,
            startScreen: screenPoint,
            dragStarted: false,
            localPoint: local,
            text: { ...text, style: { ...text.style } },
            layout,
            center: local.center,
            angle: Math.atan2(worldPoint.y - local.center.y, worldPoint.x - local.center.x)
          };
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }
    }

    if (selectedIds.length > 1) {
      const selected = puzzle.texts.filter((item) => selectedIds.includes(item.id));
      const groupBounds = getGroupBounds(selected, canvas);
      if (groupBounds) {
        const groupHandle = getGroupHandleAtPoint(worldPoint, groupBounds);
        if (groupHandle) {
          const ctx = canvas.getContext("2d");
          const minScale = Math.max(
            ...selected.map((item) => {
              const fontSize = Number(item.style?.fontSize) || 16;
              const width = Number(item.width) || MIN_WIDTH;
              return Math.max(MIN_FONT_SIZE / fontSize, MIN_WIDTH / width);
            })
          );
          activeHandle = groupHandle.key;
          isDragging = true;
          dragTextIds = [...selectedIds];
          dragStart = {
            worldPoint,
            startScreen: screenPoint,
            dragStarted: false,
            group: {
              bounds: groupBounds,
              minScale,
              texts: selected.map((item) => {
                const layout = getTextLayout(ctx, item);
                return {
                  id: item.id,
                  x: item.x,
                  y: item.y,
                  width: item.width,
                  style: { ...item.style },
                  centerX: (item.x || 0) + layout.width / 2,
                  centerY: (item.y || 0) + layout.height / 2
                };
              })
            }
          };
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }
    }

    const hit = findTextAtPoint(worldPoint, puzzle);
    const multiKey = event.ctrlKey || event.metaKey || event.shiftKey;
    if (!hit) {
      if (!multiKey && selectedIds.length) {
        setSelectedTextIds([]);
      }
      if (!enableCanvasSelection) {
        return;
      }
      if (!selectedIds.length && puzzle.slots.length) return;
      selectionDrag = {
        startWorld: worldPoint,
        startScreen: screenPoint,
        mode: event.altKey ? "lasso" : "rect",
        append: multiKey,
        baseSelection: [...selectedIds],
        points: [worldPoint],
        currentWorld: worldPoint
      };
      selectionActive = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (multiKey) {
      if (selectedIds.includes(hit.text.id)) {
        setSelectedTextIds(selectedIds.filter((id) => id !== hit.text.id));
        return;
      }
      setSelectedTextIds([...selectedIds, hit.text.id]);
    } else if (!selectedIds.includes(hit.text.id)) {
      setSelectedTextIds([hit.text.id]);
    }

    const nextSelected = getSelectedTextIds();
    dragTextIds = nextSelected.includes(hit.text.id) ? nextSelected : [hit.text.id];
    isDragging = true;
    activeHandle = "move";
    dragStart = {
      worldPoint,
      startScreen: screenPoint,
      dragStarted: false,
      texts: dragTextIds.map((id) => {
        const item = puzzle.texts.find((text) => text.id === id);
        return { id, x: item.x, y: item.y };
      })
    };
    event.preventDefault();
    event.stopPropagation();
  }

  function handleMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    const screenPoint = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    const worldPoint = toWorld(screenPoint);

    if (selectionDrag) {
      const dx = screenPoint.x - selectionDrag.startScreen.x;
      const dy = screenPoint.y - selectionDrag.startScreen.y;
      if (!selectionActive) {
        if (Math.hypot(dx, dy) < SELECTION_THRESHOLD) {
          return;
        }
        selectionActive = true;
      }
      selectionDrag.currentWorld = worldPoint;
      if (selectionDrag.mode === "lasso") {
        const last = selectionDrag.points[selectionDrag.points.length - 1];
        if (Math.hypot(worldPoint.x - last.x, worldPoint.y - last.y) >= LASSO_POINT_MIN) {
          selectionDrag.points.push(worldPoint);
        }
      }
      if (onSelectionPreview) {
        if (selectionDrag.mode === "rect") {
          onSelectionPreview({
            type: "rect",
            target: "text",
            rect: rectFromPoints(selectionDrag.startWorld, worldPoint)
          });
        } else {
          const points = [...selectionDrag.points, worldPoint];
          onSelectionPreview({ type: "lasso", target: "text", points });
        }
      }
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (isDragging && dragStart?.group) {
      if (!beginDragIfNeeded(screenPoint)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const puzzle = getPuzzle();
      if (!puzzle) return;
      const group = dragStart.group;
      const base = group.bounds;
      const baseLeft = base.x;
      const baseTop = base.y;
      const baseRight = base.x + base.w;
      const baseBottom = base.y + base.h;
      const anchorX = activeHandle.includes("w") ? baseRight : baseLeft;
      const anchorY = activeHandle.includes("n") ? baseBottom : baseTop;
      const handleBaseX = activeHandle.includes("w") ? baseLeft : baseRight;
      const handleBaseY = activeHandle.includes("n") ? baseTop : baseBottom;
      const scaleX = (worldPoint.x - anchorX) / (handleBaseX - anchorX || 1);
      const scaleY = (worldPoint.y - anchorY) / (handleBaseY - anchorY || 1);
      let scale = Math.abs(scaleX) >= Math.abs(scaleY) ? scaleX : scaleY;
      if (!Number.isFinite(scale) || scale <= 0) {
        scale = group.minScale;
      }
      scale = Math.max(scale, group.minScale);
      const nextW = base.w * scale;
      const nextH = base.h * scale;
      const nextLeft = activeHandle.includes("w") ? anchorX - nextW : anchorX;
      const nextTop = activeHandle.includes("n") ? anchorY - nextH : anchorY;
      const ctx = canvas.getContext("2d");
      group.texts.forEach((origin) => {
        const text = puzzle.texts.find((item) => item.id === origin.id);
        if (!text) return;
        const relX = (origin.centerX - baseLeft) / base.w;
        const relY = (origin.centerY - baseTop) / base.h;
        const nextCenterX = nextLeft + relX * nextW;
        const nextCenterY = nextTop + relY * nextH;
        const nextFontSize = Math.max(MIN_FONT_SIZE, Math.round((origin.style?.fontSize || 16) * scale));
        const nextWidth = Math.max(MIN_WIDTH, Math.round((origin.width || MIN_WIDTH) * scale));
        const nextLetterSpacing = (origin.style?.letterSpacing || 0) * scale;
        const nextStyle = {
          ...origin.style,
          fontSize: nextFontSize,
          letterSpacing: Math.round(nextLetterSpacing * 100) / 100
        };
        const nextLayout = getTextLayout(ctx, { ...text, width: nextWidth, style: nextStyle });
        text.width = nextWidth;
        text.style = nextStyle;
        text.x = Math.round(nextCenterX - nextLayout.width / 2);
        text.y = Math.round(nextCenterY - nextLayout.height / 2);
      });
      if (onTextsUpdated) onTextsUpdated({ phase: "change" });
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (!isDragging || !dragStart) return;
    if (!beginDragIfNeeded(screenPoint)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const puzzle = getPuzzle();
    if (!puzzle) return;

    if (activeHandle === "move" && dragStart.texts) {
      const dx = worldPoint.x - dragStart.worldPoint.x;
      const dy = worldPoint.y - dragStart.worldPoint.y;
      dragStart.texts.forEach((origin) => {
        const item = puzzle.texts.find((text) => text.id === origin.id);
        if (!item) return;
        item.x = Math.round(origin.x + dx);
        item.y = Math.round(origin.y + dy);
      });
      if (onTextsUpdated) onTextsUpdated({ phase: "change" });
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (!dragStart.text) return;
    const text = puzzle.texts.find((item) => item.id === dragStart.text.id);
    if (!text) return;

    const base = dragStart.text;

    if (activeHandle === "rotate") {
      const angle = Math.atan2(worldPoint.y - dragStart.center.y, worldPoint.x - dragStart.center.x);
      const delta = angle - dragStart.angle;
      text.rotation = (Number(base.rotation) || 0) + (delta * 180) / Math.PI;
    } else {
      const center = dragStart.center;
      const startDist = Math.hypot(
        dragStart.worldPoint.x - center.x,
        dragStart.worldPoint.y - center.y
      ) || 1;
      const currentDist = Math.hypot(worldPoint.x - center.x, worldPoint.y - center.y);
      const scale = Math.max(0.1, currentDist / startDist);
      applyTextScaleFromCenter(canvas.getContext("2d"), text, base, center, scale);
    }

    if (onTextsUpdated) onTextsUpdated({ phase: "change" });
    event.preventDefault();
    event.stopPropagation();
  }

  function handleMouseUp(event) {
    if (selectionDrag) {
      const puzzle = getPuzzle();
      if (selectionActive && puzzle) {
        const selection = selectionDrag.mode === "rect"
          ? { type: "rect", rect: rectFromPoints(selectionDrag.startWorld, selectionDrag.currentWorld) }
          : { type: "lasso", points: [...selectionDrag.points, selectionDrag.currentWorld] };
        const ctx = canvas.getContext("2d");
        const selected = puzzle.texts.filter((text) => {
          const layout = getTextLayout(ctx, text);
          const corners = getTextCorners(text, layout);
          const center = {
            x: (text.x || 0) + layout.width / 2,
            y: (text.y || 0) + layout.height / 2
          };
          if (selection.type === "rect") {
            return corners.some((point) => isPointInRect(point, selection.rect)) ||
              isPointInRect(center, selection.rect);
          }
          if (selection.points.length < 3) return false;
          const inPolygon = corners.some((point) => isPointInPolygon(point, selection.points)) ||
            isPointInPolygon(center, selection.points);
          if (inPolygon) return true;
          const xs = corners.map((point) => point.x);
          const ys = corners.map((point) => point.y);
          const bounds = {
            x: Math.min(...xs),
            y: Math.min(...ys),
            w: Math.max(...xs) - Math.min(...xs),
            h: Math.max(...ys) - Math.min(...ys)
          };
          return selection.points.some((point) => isPointInRect(point, bounds));
        }).map((text) => text.id);
        const next = selectionDrag.append
          ? Array.from(new Set([...selectionDrag.baseSelection, ...selected]))
          : selected;
        setSelectedTextIds(next);
      }
      selectionDrag = null;
      selectionActive = false;
      if (onSelectionPreview) onSelectionPreview(null);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (isDragging && dragStart?.dragStarted && onTextsUpdated) {
      onTextsUpdated({ phase: "end" });
    }
    if (isDragging) {
      event.preventDefault();
      event.stopPropagation();
    }
    isDragging = false;
    activeHandle = null;
    dragStart = null;
    dragTextIds = [];
  }

  function handleDblClick(event) {
    if (!canEdit()) return;
    const puzzle = getPuzzle();
    if (!puzzle) return;
    const rect = canvas.getBoundingClientRect();
    const screenPoint = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    const worldPoint = toWorld(screenPoint);
    if (typeof getTopElementAtPoint === "function") {
      const top = getTopElementAtPoint(worldPoint);
      const topType = typeof top === "string" ? top : top?.type;
      if (topType && topType !== "text") {
        return;
      }
    }
    const hit = findTextAtPoint(worldPoint, puzzle);
    if (!hit) return;
    if (onEditRequested) {
      onEditRequested(hit.text);
    }
    event.preventDefault();
    event.stopPropagation();
  }

  canvas.addEventListener("mousedown", handleMouseDown, true);
  canvas.addEventListener("mousemove", handleMouseMove, true);
  canvas.addEventListener("mouseup", handleMouseUp, true);
  canvas.addEventListener("mouseleave", handleMouseUp, true);
  canvas.addEventListener("dblclick", handleDblClick, true);

  return {
    dispose: () => {
      canvas.removeEventListener("mousedown", handleMouseDown, true);
      canvas.removeEventListener("mousemove", handleMouseMove, true);
      canvas.removeEventListener("mouseup", handleMouseUp, true);
      canvas.removeEventListener("mouseleave", handleMouseUp, true);
      canvas.removeEventListener("dblclick", handleDblClick, true);
    }
  };
}
