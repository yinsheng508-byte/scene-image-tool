function getPointerPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function getStagePoint(event, stage) {
  const rect = stage.getBoundingClientRect();
  return {
    x: event.clientX - rect.left + (stage.scrollLeft || 0),
    y: event.clientY - rect.top + (stage.scrollTop || 0)
  };
}

function rectFromPoints(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);
  return { x, y, w, h };
}

function stopStageSelectionEvent(event) {
  event.preventDefault();
  event.stopPropagation();
}

export function createSelectionController(options) {
  const {
    stage,
    canvas,
    getPuzzle,
    toWorld,
    isEditable,
    shouldIgnoreEvent,
    shouldDeferToEditor,
    getSelectedIds,
    getSelectionTarget,
    onSelectionPreview,
    onSelectionCommitted,
    onPreviewClick
  } = options;

  const SELECTION_THRESHOLD = 4;
  const LASSO_POINT_MIN = 6;

  let selectionDrag = null;
  let selectionActive = false;

  function canEdit() {
    if (typeof isEditable === "function") {
      return isEditable();
    }
    return true;
  }

  function getWorldPoint(event) {
    const screenPoint = getPointerPoint(event, canvas);
    const stagePoint = getStagePoint(event, stage);
    return {
      screenPoint,
      stagePoint,
      worldPoint: toWorld(screenPoint)
    };
  }

  function clearDrag() {
    selectionDrag = null;
    selectionActive = false;
    if (onSelectionPreview) onSelectionPreview(null);
    window.removeEventListener("mousemove", handleMouseMove, true);
    window.removeEventListener("mouseup", handleMouseUp, true);
  }

  function handleMouseDown(event) {
    if (event.button !== 0) return;
    if (!stage || !canvas || typeof toWorld !== "function") return;
    if (typeof shouldIgnoreEvent === "function" && shouldIgnoreEvent(event)) return;
    if (!canEdit()) {
      if (typeof onPreviewClick === "function") onPreviewClick();
      return;
    }
    const puzzle = typeof getPuzzle === "function" ? getPuzzle() : null;
    if (!puzzle) return;

    const { screenPoint, stagePoint, worldPoint } = getWorldPoint(event);
    if (
      typeof shouldDeferToEditor === "function" &&
      shouldDeferToEditor({ event, screenPoint, worldPoint })
    ) {
      return;
    }

    const baseSelection = typeof getSelectedIds === "function"
      ? getSelectedIds()
      : { slotIds: [], textIds: [], imageIds: [] };
    const target = typeof getSelectionTarget === "function"
      ? getSelectionTarget(baseSelection)
      : "mixed";
    const append = event.ctrlKey || event.shiftKey || event.metaKey;

    selectionDrag = {
      startWorld: worldPoint,
      startScreen: screenPoint,
      startStage: stagePoint,
      currentWorld: worldPoint,
      currentStage: stagePoint,
      mode: event.altKey ? "lasso" : "rect",
      append,
      target,
      baseSelection,
      points: [worldPoint],
      stagePoints: [stagePoint]
    };
    selectionActive = false;

    window.addEventListener("mousemove", handleMouseMove, true);
    window.addEventListener("mouseup", handleMouseUp, true);
    stopStageSelectionEvent(event);
  }

  function handleMouseMove(event) {
    if (!selectionDrag) return;
    const { screenPoint, stagePoint, worldPoint } = getWorldPoint(event);
    const dx = screenPoint.x - selectionDrag.startScreen.x;
    const dy = screenPoint.y - selectionDrag.startScreen.y;
    if (!selectionActive) {
      if (Math.hypot(dx, dy) < SELECTION_THRESHOLD) {
        stopStageSelectionEvent(event);
        return;
      }
      selectionActive = true;
    }
    selectionDrag.currentWorld = worldPoint;
    selectionDrag.currentStage = stagePoint;
    if (selectionDrag.mode === "lasso") {
      const last = selectionDrag.points[selectionDrag.points.length - 1];
      if (Math.hypot(worldPoint.x - last.x, worldPoint.y - last.y) >= LASSO_POINT_MIN) {
        selectionDrag.points.push(worldPoint);
        selectionDrag.stagePoints.push(stagePoint);
      }
    }
    if (onSelectionPreview) {
      if (selectionDrag.mode === "rect") {
        onSelectionPreview({
          type: "rect",
          target: selectionDrag.target,
          rect: rectFromPoints(selectionDrag.startWorld, worldPoint),
          stageOverlay: {
            type: "rect",
            target: selectionDrag.target,
            rect: rectFromPoints(selectionDrag.startStage, stagePoint)
          }
        });
      } else {
        onSelectionPreview({
          type: "lasso",
          target: selectionDrag.target,
          points: [...selectionDrag.points, worldPoint],
          stageOverlay: {
            type: "lasso",
            target: selectionDrag.target,
            points: [...selectionDrag.stagePoints, stagePoint]
          }
        });
      }
    }
    stopStageSelectionEvent(event);
  }

  function handleMouseUp(event) {
    if (!selectionDrag) return;
    const drag = selectionDrag;
    const { worldPoint, stagePoint } = getWorldPoint(event);
    drag.currentWorld = worldPoint;
    drag.currentStage = stagePoint;
    const selection = selectionActive
      ? (
        drag.mode === "rect"
          ? { type: "rect", rect: rectFromPoints(drag.startWorld, drag.currentWorld) }
          : { type: "lasso", points: [...drag.points, drag.currentWorld] }
      )
      : null;
    if (typeof onSelectionCommitted === "function") {
      onSelectionCommitted({
        selection,
        target: drag.target,
        append: drag.append,
        baseSelection: drag.baseSelection,
        clearOnly: !selectionActive
      });
    }
    clearDrag();
    stopStageSelectionEvent(event);
  }

  stage.addEventListener("mousedown", handleMouseDown, true);

  return {
    dispose() {
      stage.removeEventListener("mousedown", handleMouseDown, true);
      clearDrag();
    }
  };
}
