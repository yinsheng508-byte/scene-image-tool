import { HANDLE_SIZE, getHandleAtPoint, isPointInSlot } from "./slot-renderer.js";

function getSlotZOrderValue(slot) {
  const value = Number(slot?.zOrder);
  return Number.isFinite(value) ? value : 0;
}

function compareSlotsByZOrder(a, b) {
  const diff = getSlotZOrderValue(a) - getSlotZOrderValue(b);
  if (diff !== 0) return diff;
  return String(a?.id || "").localeCompare(String(b?.id || ""), "zh-CN");
}

export function createCanvasEditor(options) {
  const {
    canvas,
    wrapper,
    getPuzzle,
    getSelectedIds,
    setSelectedIds,
    onSlotsUpdated,
    onViewChanged,
    onSelectionPreview,
    isEditable,
    onPreviewClick,
    getScaleBounds,
    onWheelZoom,
    lockCenteredView = false,
    enableCanvasSelection = true
  } = options;

  const view = {
    scale: 1,
    offsetX: 0,
    offsetY: 0
  };

  const MIN_SCALE = 0.1;
  const MAX_SCALE = 5;

  let isDragging = false;
  let isPanning = false;
  let dragStart = null;
  let activeHandle = null;
  let dragSlotIds = [];
  let spacePressed = false;
  let selectionDrag = null;
  let selectionActive = false;

  const SELECTION_THRESHOLD = 4;
  const LASSO_POINT_MIN = 6;
  const DRAG_START_THRESHOLD = 4;

  function hasDragExceeded(start, current) {
    if (!start || !current) return true;
    return Math.hypot(current.x - start.x, current.y - start.y) >= DRAG_START_THRESHOLD;
  }

  function beginDragIfNeeded(screenPos) {
    if (!isDragging || !dragStart) return false;
    if (dragStart.dragStarted) return true;
    if (!hasDragExceeded(dragStart.startScreen, screenPos)) return false;
    dragStart.dragStarted = true;
    if (onSlotsUpdated) onSlotsUpdated({ phase: "start" });
    return true;
  }

  function canEdit() {
    if (typeof isEditable === "function") {
      return isEditable();
    }
    return true;
  }

  function setView(next) {
    view.scale = next.scale;
    view.offsetX = next.offsetX;
    view.offsetY = next.offsetY;
    if (onViewChanged) onViewChanged();
  }

  function clampScale(value) {
    let minScale = MIN_SCALE;
    let maxScale = MAX_SCALE;
    if (typeof getScaleBounds === "function") {
      const bounds = getScaleBounds();
      if (
        bounds
        && Number.isFinite(bounds.min)
        && Number.isFinite(bounds.max)
        && bounds.max > bounds.min
      ) {
        minScale = bounds.min;
        maxScale = bounds.max;
      }
    }
    return Math.min(maxScale, Math.max(minScale, value));
  }

  function setScaleAt(scale, anchor) {
    const nextScale = clampScale(scale);
    const before = toWorld(anchor);
    view.scale = nextScale;
    const after = toScreen(before);
    view.offsetX += anchor.x - after.x;
    view.offsetY += anchor.y - after.y;
    if (onViewChanged) onViewChanged();
  }

  function setScaleCentered(scale) {
    const puzzle = getPuzzle();
    if (!puzzle) return;
    const rect = wrapper.getBoundingClientRect();
    const nextScale = clampScale(scale);
    const offsetX = (rect.width - puzzle.canvasSize.w * nextScale) / 2;
    const offsetY = (rect.height - puzzle.canvasSize.h * nextScale) / 2;
    setView({ scale: nextScale, offsetX, offsetY });
  }

  function fitView() {
    const puzzle = getPuzzle();
    if (!puzzle) return;
    const rect = wrapper.getBoundingClientRect();
    const scale = Math.min(
      rect.width / puzzle.canvasSize.w,
      rect.height / puzzle.canvasSize.h
    );
    const offsetX = (rect.width - puzzle.canvasSize.w * scale) / 2;
    const offsetY = (rect.height - puzzle.canvasSize.h * scale) / 2;
    setView({ scale, offsetX, offsetY });
  }

  function toWorld(point) {
    return {
      x: (point.x - view.offsetX) / view.scale,
      y: (point.y - view.offsetY) / view.scale
    };
  }

  function toScreen(point) {
    return {
      x: point.x * view.scale + view.offsetX,
      y: point.y * view.scale + view.offsetY
    };
  }

  function getMousePos(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function getSlotAtPoint(point) {
    const puzzle = getPuzzle();
    if (!puzzle) return null;
    const sortedSlots = [...puzzle.slots].sort(compareSlotsByZOrder);
    for (let i = sortedSlots.length - 1; i >= 0; i -= 1) {
      const slot = sortedSlots[i];
      if (isPointInSlot(point, slot)) {
        return slot;
      }
    }
    return null;
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

  function polygonIntersectsRect(polygon, rect) {
    const rectPoints = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.w, y: rect.y },
      { x: rect.x + rect.w, y: rect.y + rect.h },
      { x: rect.x, y: rect.y + rect.h }
    ];
    if (rectPoints.some((point) => isPointInPolygon(point, polygon))) {
      return true;
    }
    if (polygon.some((point) => isPointInRect(point, rect))) {
      return true;
    }
    return false;
  }

  function getGroupBounds(puzzle, selectedIds) {
    const selected = puzzle.slots.filter((slot) => selectedIds.includes(slot.id));
    if (selected.length < 2) return null;
    const minX = Math.min(...selected.map((slot) => slot.x));
    const minY = Math.min(...selected.map((slot) => slot.y));
    const maxX = Math.max(...selected.map((slot) => slot.x + slot.w));
    const maxY = Math.max(...selected.map((slot) => slot.y + slot.h));
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
        Math.abs(point.x - handle.x) <= HANDLE_SIZE &&
        Math.abs(point.y - handle.y) <= HANDLE_SIZE
    );
  }

  function handleMouseDown(event) {
    if (event.button !== 0) return;
    if (!canEdit()) {
      if (typeof onPreviewClick === "function") onPreviewClick();
      return;
    }
    const puzzle = getPuzzle();
    if (!puzzle) return;
    const screenPos = getMousePos(event);
    const worldPos = toWorld(screenPos);

    if (spacePressed && !lockCenteredView) {
      isPanning = true;
      dragStart = { ...screenPos, offsetX: view.offsetX, offsetY: view.offsetY };
      return;
    }

    const selectedIds = getSelectedIds();
    const selectedSlot = puzzle.slots.find((slot) => slot.id === selectedIds[0]);
    if (selectedIds.length === 1 && selectedSlot) {
      const handle = getHandleAtPoint(worldPos, selectedSlot);
      if (handle) {
        activeHandle = handle.key;
        isDragging = true;
        dragStart = {
          worldPos,
          startScreen: screenPos,
          dragStarted: false,
          slot: { ...selectedSlot },
          aspect: selectedSlot.w / selectedSlot.h || 1,
          lockAspect: !!selectedSlot.style?.lockAspect
        };
        return;
      }
    }

    if (selectedIds.length > 1) {
      const groupBounds = getGroupBounds(puzzle, selectedIds);
      if (groupBounds) {
        const groupHandle = getGroupHandleAtPoint(worldPos, groupBounds);
        if (groupHandle) {
          activeHandle = groupHandle.key;
          isDragging = true;
          const selectedSlots = puzzle.slots.filter((slot) => selectedIds.includes(slot.id));
          const minScale = Math.max(
            ...selectedSlots.map((slot) => Math.max(1 / slot.w, 1 / slot.h))
          );
          dragStart = {
            worldPos,
            startScreen: screenPos,
            dragStarted: false,
            group: {
              bounds: groupBounds,
              minScale,
              slots: selectedSlots.map((slot) => ({
                id: slot.id,
                x: slot.x,
                y: slot.y,
                w: slot.w,
                h: slot.h
              }))
            }
          };
          return;
        }
      }
    }

    const hitSlot = getSlotAtPoint(worldPos);
    const isMultiKey = event.ctrlKey || event.shiftKey || event.metaKey;
    if (!hitSlot) {
      if (!isMultiKey && selectedIds.length) {
        setSelectedIds([]);
      }
      if (!enableCanvasSelection) {
        return;
      }
      selectionDrag = {
        startWorld: worldPos,
        startScreen: screenPos,
        mode: event.altKey ? "lasso" : "rect",
        append: isMultiKey,
        baseSelection: [...selectedIds],
        points: [worldPos],
        currentWorld: worldPos
      };
      selectionActive = false;
      return;
    }

    if (isMultiKey) {
      if (selectedIds.includes(hitSlot.id)) {
        setSelectedIds(selectedIds.filter((id) => id !== hitSlot.id));
      } else {
        setSelectedIds([...selectedIds, hitSlot.id]);
      }
    } else {
      if (!selectedIds.includes(hitSlot.id)) {
        setSelectedIds([hitSlot.id]);
      }
    }

    const nextSelectedIds = getSelectedIds();
    dragSlotIds = nextSelectedIds.includes(hitSlot.id)
      ? nextSelectedIds
      : [hitSlot.id];
    isDragging = true;
    dragStart = {
      worldPos,
      startScreen: screenPos,
      dragStarted: false,
      slots: dragSlotIds.map((id) => {
        const slot = puzzle.slots.find((item) => item.id === id);
        return { id, x: slot.x, y: slot.y, w: slot.w, h: slot.h };
      })
    };
  }

  function handleMouseMove(event) {
    if (!canEdit()) return;
    const puzzle = getPuzzle();
    if (!puzzle) return;
    const screenPos = getMousePos(event);
    const worldPos = toWorld(screenPos);

    if (isPanning && dragStart) {
      view.offsetX = dragStart.offsetX + (screenPos.x - dragStart.x);
      view.offsetY = dragStart.offsetY + (screenPos.y - dragStart.y);
      if (onViewChanged) onViewChanged();
      return;
    }

    if (selectionDrag) {
      const dx = screenPos.x - selectionDrag.startScreen.x;
      const dy = screenPos.y - selectionDrag.startScreen.y;
      if (!selectionActive) {
        if (Math.hypot(dx, dy) < SELECTION_THRESHOLD) {
          return;
        }
        selectionActive = true;
      }
      selectionDrag.currentWorld = worldPos;
      if (selectionDrag.mode === "lasso") {
        const last = selectionDrag.points[selectionDrag.points.length - 1];
        if (Math.hypot(worldPos.x - last.x, worldPos.y - last.y) >= LASSO_POINT_MIN) {
          selectionDrag.points.push(worldPos);
        }
      }
      if (onSelectionPreview) {
        if (selectionDrag.mode === "rect") {
          onSelectionPreview({
            type: "rect",
            target: "slot",
            rect: rectFromPoints(selectionDrag.startWorld, worldPos)
          });
        } else {
          const points = [...selectionDrag.points, worldPos];
          onSelectionPreview({ type: "lasso", target: "slot", points });
        }
      }
      return;
    }

    if (!isDragging || !dragStart) {
      const selectedIds = getSelectedIds();
      if (selectedIds.length === 1) {
        const slot = puzzle.slots.find((item) => item.id === selectedIds[0]);
        if (slot) {
          const handle = getHandleAtPoint(worldPos, slot);
          canvas.style.cursor = handle ? `${handle.key}-resize` : "default";
          return;
        }
      }
      canvas.style.cursor = "default";
      return;
    }

    if (!beginDragIfNeeded(screenPos)) {
      return;
    }

    if (activeHandle && dragStart.group) {
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
      const scaleX = (worldPos.x - anchorX) / (handleBaseX - anchorX || 1);
      const scaleY = (worldPos.y - anchorY) / (handleBaseY - anchorY || 1);
      let scale = Math.abs(scaleX) >= Math.abs(scaleY) ? scaleX : scaleY;
      if (!Number.isFinite(scale) || scale <= 0) {
        scale = group.minScale;
      }
      scale = Math.max(scale, group.minScale);
      const nextW = base.w * scale;
      const nextH = base.h * scale;
      const nextLeft = activeHandle.includes("w") ? anchorX - nextW : anchorX;
      const nextTop = activeHandle.includes("n") ? anchorY - nextH : anchorY;
      group.slots.forEach((origin) => {
        const slot = puzzle.slots.find((item) => item.id === origin.id);
        if (!slot) return;
        slot.x = Math.round(nextLeft + (origin.x - baseLeft) * scale);
        slot.y = Math.round(nextTop + (origin.y - baseTop) * scale);
        slot.w = Math.max(1, Math.round(origin.w * scale));
        slot.h = Math.max(1, Math.round(origin.h * scale));
      });
      if (onSlotsUpdated) onSlotsUpdated({ phase: "change" });
      return;
    }

    if (activeHandle && dragStart.slot) {
      const slot = puzzle.slots.find((item) => item.id === dragStart.slot.id);
      if (!slot) return;
      const dx = worldPos.x - dragStart.worldPos.x;
      const dy = worldPos.y - dragStart.worldPos.y;
      const base = dragStart.slot;
      const next = { ...base };
      const hasH = activeHandle.includes("e") || activeHandle.includes("w");
      const hasV = activeHandle.includes("n") || activeHandle.includes("s");
      const isCorner = hasH && hasV;
      const lockAspect = dragStart.lockAspect || isCorner;
      const aspect = dragStart.aspect || (base.w / base.h) || 1;
      let dw = 0;
      let dh = 0;
      if (activeHandle.includes("n")) {
        dh = -dy;
      }
      if (activeHandle.includes("s")) {
        dh = dy;
      }
      if (activeHandle.includes("w")) {
        dw = -dx;
      }
      if (activeHandle.includes("e")) {
        dw = dx;
      }

      if (lockAspect) {
        if (isCorner) {
          if (Math.abs(dw) >= Math.abs(dh)) {
            next.w = Math.max(1, base.w + dw);
            next.h = Math.max(1, next.w / aspect);
          } else {
            next.h = Math.max(1, base.h + dh);
            next.w = Math.max(1, next.h * aspect);
          }
          if (activeHandle.includes("w")) {
            next.x = base.x + (base.w - next.w);
          }
          if (activeHandle.includes("n")) {
            next.y = base.y + (base.h - next.h);
          }
        } else if (hasH) {
          next.w = Math.max(1, base.w + dw);
          next.h = Math.max(1, next.w / aspect);
          if (activeHandle.includes("w")) {
            next.x = base.x + (base.w - next.w);
          }
          next.y = base.y + (base.h - next.h) / 2;
        } else if (hasV) {
          next.h = Math.max(1, base.h + dh);
          next.w = Math.max(1, next.h * aspect);
          if (activeHandle.includes("n")) {
            next.y = base.y + (base.h - next.h);
          }
          next.x = base.x + (base.w - next.w) / 2;
        }
      } else {
        if (activeHandle.includes("n")) {
          next.y = base.y + dy;
          next.h = base.h - dy;
        }
        if (activeHandle.includes("s")) {
          next.h = base.h + dy;
        }
        if (activeHandle.includes("w")) {
          next.x = base.x + dx;
          next.w = base.w - dx;
        }
        if (activeHandle.includes("e")) {
          next.w = base.w + dx;
        }
        next.w = Math.max(1, next.w);
        next.h = Math.max(1, next.h);
      }

      slot.x = Math.round(next.x);
      slot.y = Math.round(next.y);
      slot.w = Math.round(next.w);
      slot.h = Math.round(next.h);
      if (onSlotsUpdated) onSlotsUpdated({ phase: "change" });
      return;
    }

    if (dragStart.slots) {
      const dx = worldPos.x - dragStart.worldPos.x;
      const dy = worldPos.y - dragStart.worldPos.y;
      dragStart.slots.forEach((origin) => {
        const slot = puzzle.slots.find((item) => item.id === origin.id);
        if (!slot) return;
        slot.x = Math.round(origin.x + dx);
        slot.y = Math.round(origin.y + dy);
      });
      if (onSlotsUpdated) onSlotsUpdated({ phase: "change" });
    }
  }

  function handleMouseUp() {
    if (selectionDrag) {
      const puzzle = getPuzzle();
      if (selectionActive) {
        if (!puzzle) {
          selectionDrag = null;
          selectionActive = false;
          if (onSelectionPreview) onSelectionPreview(null);
          return;
        }
        const selection = selectionDrag.mode === "rect"
          ? { type: "rect", rect: rectFromPoints(selectionDrag.startWorld, selectionDrag.currentWorld) }
          : { type: "lasso", points: [...selectionDrag.points, selectionDrag.currentWorld] };
        const selected = puzzle.slots.filter((slot) => {
          const slotRect = { x: slot.x, y: slot.y, w: slot.w, h: slot.h };
          if (selection.type === "rect") {
            return rectsIntersect(selection.rect, slotRect);
          }
          if (selection.points.length < 3) return false;
          return polygonIntersectsRect(selection.points, slotRect);
        }).map((slot) => slot.id);
        const next = selectionDrag.append
          ? Array.from(new Set([...selectionDrag.baseSelection, ...selected]))
          : selected;
        setSelectedIds(next);
      }
      selectionDrag = null;
      selectionActive = false;
      if (onSelectionPreview) onSelectionPreview(null);
      return;
    }

    if (isDragging && dragStart?.dragStarted && onSlotsUpdated) {
      onSlotsUpdated({ phase: "end" });
    }
    isDragging = false;
    isPanning = false;
    activeHandle = null;
    dragStart = null;
    dragSlotIds = [];
  }

  function handleWheel(event) {
    if (!canEdit()) return;
    if (!event.ctrlKey) return;
    event.preventDefault();
    if (typeof onWheelZoom === "function") {
      onWheelZoom({
        deltaY: event.deltaY,
        point: getMousePos(event)
      });
      return;
    }
    const delta = event.deltaY > 0 ? 0.9 : 1.1;
    setScaleCentered(view.scale * delta);
  }

  function handleKeyDown(event) {
    if (!canEdit()) return;
    if (lockCenteredView) return;
    if (event.code === "Space") {
      spacePressed = true;
      canvas.style.cursor = "grab";
    }
  }

  function handleKeyUp(event) {
    if (lockCenteredView) return;
    if (event.code === "Space") {
      spacePressed = false;
      canvas.style.cursor = "default";
    }
  }

  canvas.addEventListener("mousedown", handleMouseDown);
  canvas.addEventListener("mousemove", handleMouseMove);
  canvas.addEventListener("mouseup", handleMouseUp);
  canvas.addEventListener("mouseleave", handleMouseUp);
  canvas.addEventListener("wheel", handleWheel, { passive: false });
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  return {
    view,
    fitView,
    toWorld,
    toScreen,
    setView,
    setScaleAt
  };
}
