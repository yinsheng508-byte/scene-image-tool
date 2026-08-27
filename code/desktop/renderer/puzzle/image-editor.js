import { TEXT_HANDLE_SIZE, TEXT_ROTATE_HANDLE_OFFSET } from "./text-renderer.js";

const MIN_SIZE = 20;

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

function toLocalPoint(worldPoint, imageItem) {
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

function isPointInImage(worldPoint, imageItem) {
  const local = toLocalPoint(worldPoint, imageItem);
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

function getImageCorners(imageItem) {
  const width = Math.max(1, Number(imageItem.width) || 1);
  const height = Math.max(1, Number(imageItem.height) || 1);
  const rotation = (Number(imageItem.rotation) || 0) * (Math.PI / 180);
  const center = {
    x: (imageItem.x || 0) + width / 2,
    y: (imageItem.y || 0) + height / 2
  };
  const corners = [
    { x: imageItem.x, y: imageItem.y },
    { x: imageItem.x + width, y: imageItem.y },
    { x: imageItem.x + width, y: imageItem.y + height },
    { x: imageItem.x, y: imageItem.y + height }
  ];
  if (!rotation) return corners;
  return corners.map((point) => rotatePoint(point, center, rotation));
}

function getGroupBounds(images) {
  if (images.length < 2) return null;
  const bounds = images.map((image) => {
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

export function createImageEditor(options) {
  const {
    canvas,
    getPuzzle,
    getSelectedImageIds,
    setSelectedImageIds,
    getSelectedTextIds,
    toWorld,
    isEditable,
    onImagesUpdated,
    onSelectionPreview,
    onPreviewClick,
    getTopElementAtPoint,
    enableCanvasSelection = true
  } = options;

  let isDragging = false;
  let activeHandle = null;
  let dragStart = null;
  let dragImageIds = [];
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
    if (onImagesUpdated) onImagesUpdated({ phase: "start" });
    return true;
  }

  function canEdit() {
    if (typeof isEditable === "function" && !isEditable()) return false;
    return true;
  }

  function findImageAtPoint(worldPoint, puzzle) {
    const images = Array.isArray(puzzle.images) ? [...puzzle.images] : [];
    images.sort(compareElementsByZOrder);
    for (let i = images.length - 1; i >= 0; i -= 1) {
      const image = images[i];
      if (isPointInImage(worldPoint, image)) {
        return image;
      }
    }
    return null;
  }

  function handleMouseDown(event) {
    if (event.button !== 0) return;
    if (!canEdit()) {
      if (typeof onPreviewClick === "function") onPreviewClick();
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
      if (topType && topType !== "image") {
        return;
      }
    }

    const selectedIds = getSelectedImageIds();
    if (selectedIds.length === 1) {
      const image = puzzle.images.find((item) => item.id === selectedIds[0]);
      if (image) {
        const local = toLocalPoint(worldPoint, image);
        const handle = getHandleAtPoint(local, local);
        if (handle) {
          activeHandle = handle;
          isDragging = true;
          dragImageIds = [image.id];
          dragStart = {
            worldPoint,
            startScreen: screenPoint,
            dragStarted: false,
            image: { ...image },
            center: local.center,
            angle: Math.atan2(worldPoint.y - local.center.y, worldPoint.x - local.center.x),
            distance: Math.hypot(worldPoint.x - local.center.x, worldPoint.y - local.center.y) || 1
          };
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }
    }

    if (selectedIds.length > 1) {
      const selected = puzzle.images.filter((item) => selectedIds.includes(item.id));
      const groupBounds = getGroupBounds(selected);
      if (groupBounds) {
        const groupHandle = getGroupHandleAtPoint(worldPoint, groupBounds);
        if (groupHandle) {
          const minScale = Math.max(
            ...selected.map((item) => {
              const w = Math.max(1, Number(item.width) || 1);
              const h = Math.max(1, Number(item.height) || 1);
              return Math.max(MIN_SIZE / w, MIN_SIZE / h);
            })
          );
          activeHandle = groupHandle.key;
          isDragging = true;
          dragImageIds = [...selectedIds];
          dragStart = {
            worldPoint,
            startScreen: screenPoint,
            dragStarted: false,
            group: {
              bounds: groupBounds,
              minScale,
              images: selected.map((item) => ({
                id: item.id,
                width: Math.max(1, Number(item.width) || 1),
                height: Math.max(1, Number(item.height) || 1),
                centerX: (item.x || 0) + (Number(item.width) || 1) / 2,
                centerY: (item.y || 0) + (Number(item.height) || 1) / 2
              }))
            }
          };
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }
    }

    const hit = findImageAtPoint(worldPoint, puzzle);
    const multiKey = event.ctrlKey || event.metaKey || event.shiftKey;
    if (!hit) {
      if (!multiKey && selectedIds.length) {
        setSelectedImageIds([]);
      }
      if (!enableCanvasSelection) {
        return;
      }
      if (!selectedIds.length && puzzle.slots.length) return;
      if (!selectedIds.length && typeof getSelectedTextIds === "function" && getSelectedTextIds().length) return;
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
      if (selectedIds.includes(hit.id)) {
        setSelectedImageIds(selectedIds.filter((id) => id !== hit.id));
        return;
      }
      setSelectedImageIds([...selectedIds, hit.id]);
    } else if (!selectedIds.includes(hit.id)) {
      setSelectedImageIds([hit.id]);
    }

    const nextSelected = getSelectedImageIds();
    dragImageIds = nextSelected.includes(hit.id) ? nextSelected : [hit.id];
    isDragging = true;
    activeHandle = "move";
    dragStart = {
      worldPoint,
      startScreen: screenPoint,
      dragStarted: false,
      images: dragImageIds.map((id) => {
        const item = puzzle.images.find((image) => image.id === id);
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
            target: "image",
            rect: rectFromPoints(selectionDrag.startWorld, worldPoint)
          });
        } else {
          const points = [...selectionDrag.points, worldPoint];
          onSelectionPreview({ type: "lasso", target: "image", points });
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
      group.images.forEach((origin) => {
        const image = puzzle.images.find((item) => item.id === origin.id);
        if (!image) return;
        const relX = (origin.centerX - baseLeft) / base.w;
        const relY = (origin.centerY - baseTop) / base.h;
        const nextCenterX = nextLeft + relX * nextW;
        const nextCenterY = nextTop + relY * nextH;
        const nextWidth = Math.max(MIN_SIZE, Math.round(origin.width * scale));
        const nextHeight = Math.max(MIN_SIZE, Math.round(origin.height * scale));
        image.width = nextWidth;
        image.height = nextHeight;
        image.aspectRatio = nextHeight ? nextWidth / nextHeight : image.aspectRatio;
        image.x = Math.round(nextCenterX - nextWidth / 2);
        image.y = Math.round(nextCenterY - nextHeight / 2);
      });
      if (onImagesUpdated) onImagesUpdated({ phase: "change" });
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

    if (activeHandle === "move" && dragStart.images) {
      const dx = worldPoint.x - dragStart.worldPoint.x;
      const dy = worldPoint.y - dragStart.worldPoint.y;
      dragStart.images.forEach((origin) => {
        const item = puzzle.images.find((image) => image.id === origin.id);
        if (!item) return;
        item.x = Math.round(origin.x + dx);
        item.y = Math.round(origin.y + dy);
      });
      if (onImagesUpdated) onImagesUpdated({ phase: "change" });
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (!dragStart.image) return;
    const image = puzzle.images.find((item) => item.id === dragStart.image.id);
    if (!image) return;
    const base = dragStart.image;

    if (activeHandle === "rotate") {
      const angle = Math.atan2(worldPoint.y - dragStart.center.y, worldPoint.x - dragStart.center.x);
      const delta = angle - dragStart.angle;
      image.rotation = (Number(base.rotation) || 0) + (delta * 180) / Math.PI;
    } else {
      const currentDist = Math.hypot(worldPoint.x - dragStart.center.x, worldPoint.y - dragStart.center.y);
      let scale = currentDist / (dragStart.distance || 1);
      if (!Number.isFinite(scale) || scale <= 0) {
        scale = 1;
      }
      const nextWidth = Math.max(MIN_SIZE, Math.round((Number(base.width) || 1) * scale));
      const nextHeight = Math.max(MIN_SIZE, Math.round((Number(base.height) || 1) * scale));
      image.width = nextWidth;
      image.height = nextHeight;
      image.aspectRatio = nextHeight ? nextWidth / nextHeight : image.aspectRatio;
      image.x = Math.round(dragStart.center.x - nextWidth / 2);
      image.y = Math.round(dragStart.center.y - nextHeight / 2);
    }

    if (onImagesUpdated) onImagesUpdated({ phase: "change" });
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
        const selected = puzzle.images.filter((image) => {
          const corners = getImageCorners(image);
          const center = {
            x: (image.x || 0) + (Number(image.width) || 1) / 2,
            y: (image.y || 0) + (Number(image.height) || 1) / 2
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
        }).map((image) => image.id);
        const next = selectionDrag.append
          ? Array.from(new Set([...selectionDrag.baseSelection, ...selected]))
          : selected;
        setSelectedImageIds(next);
      }
      selectionDrag = null;
      selectionActive = false;
      if (onSelectionPreview) onSelectionPreview(null);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (isDragging && dragStart?.dragStarted && onImagesUpdated) {
      onImagesUpdated({ phase: "end" });
    }
    if (isDragging) {
      event.preventDefault();
      event.stopPropagation();
    }
    isDragging = false;
    activeHandle = null;
    dragStart = null;
    dragImageIds = [];
  }

  canvas.addEventListener("mousedown", handleMouseDown, true);
  canvas.addEventListener("mousemove", handleMouseMove, true);
  canvas.addEventListener("mouseup", handleMouseUp, true);
  canvas.addEventListener("mouseleave", handleMouseUp, true);

  return {
    dispose: () => {
      canvas.removeEventListener("mousedown", handleMouseDown, true);
      canvas.removeEventListener("mousemove", handleMouseMove, true);
      canvas.removeEventListener("mouseup", handleMouseUp, true);
      canvas.removeEventListener("mouseleave", handleMouseUp, true);
    }
  };
}
