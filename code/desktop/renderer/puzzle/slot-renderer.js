export const HANDLE_SIZE = 8;

export function isPointInSlot(point, slot) {
  return (
    point.x >= slot.x &&
    point.x <= slot.x + slot.w &&
    point.y >= slot.y &&
    point.y <= slot.y + slot.h
  );
}

export function drawSlots(ctx, slots, selectedIds) {
  slots.forEach((slot, index) => {
    const isSelected = selectedIds.includes(slot.id);
    ctx.save();
    const borderWidth = slot.style?.borderWidth || 0;
    const borderColor = slot.style?.borderColor || "#ffffff";
    const borderRadius = slot.style?.borderRadius || 0;
    const radius = Math.min(borderRadius, slot.w / 2, slot.h / 2);

    if (borderWidth > 0) {
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = borderWidth;
      ctx.setLineDash([]);
      if (radius > 0 && typeof ctx.roundRect === "function") {
        ctx.beginPath();
        ctx.roundRect(slot.x, slot.y, slot.w, slot.h, radius);
        ctx.stroke();
      } else {
        ctx.strokeRect(slot.x, slot.y, slot.w, slot.h);
      }
    }

    ctx.strokeStyle = isSelected ? "#1f6f5c" : "rgba(31, 41, 55, 0.55)";
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.setLineDash(isSelected ? [] : [4, 4]);
    ctx.strokeRect(slot.x, slot.y, slot.w, slot.h);

    ctx.fillStyle = "rgba(31, 111, 92, 0.08)";
    ctx.fillRect(slot.x, slot.y, slot.w, slot.h);
    ctx.restore();

    const layerIndex = Number(slot.layerIndex);
    const displayIndex = Number.isFinite(layerIndex)
      ? Math.max(1, Math.round(layerIndex))
      : index + 1;
    drawSlotIndex(ctx, slot, displayIndex);
    if (slot.crop) {
      drawCropBadge(ctx, slot);
    }
  });
}

export function drawSlotIndex(ctx, slot, index) {
  const radius = 10;
  const x = slot.x + radius + 4;
  const y = slot.y + radius + 4;
  ctx.save();
  ctx.fillStyle = "#1f6f5c";
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(index), x, y);
  ctx.restore();
}

function drawCropBadge(ctx, slot) {
  const size = 18;
  const radius = size / 2;
  const x = slot.x + slot.w - radius - 6;
  const y = slot.y + radius + 6;
  ctx.save();
  ctx.fillStyle = "#1f6f5c";
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("✂", x, y + 1);
  ctx.restore();
}

export function drawHandles(ctx, slot) {
  const handles = getHandles(slot);
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#1f6f5c";
  handles.forEach((handle) => {
    ctx.beginPath();
    ctx.rect(handle.x - HANDLE_SIZE / 2, handle.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
}

export function getHandles(slot) {
  const x = slot.x;
  const y = slot.y;
  const w = slot.w;
  const h = slot.h;
  return [
    { key: "nw", x, y },
    { key: "n", x: x + w / 2, y },
    { key: "ne", x: x + w, y },
    { key: "e", x: x + w, y: y + h / 2 },
    { key: "se", x: x + w, y: y + h },
    { key: "s", x: x + w / 2, y: y + h },
    { key: "sw", x, y: y + h },
    { key: "w", x, y: y + h / 2 }
  ];
}

export function getHandleAtPoint(point, slot) {
  const handles = getHandles(slot);
  return handles.find(
    (handle) =>
      Math.abs(point.x - handle.x) <= HANDLE_SIZE &&
      Math.abs(point.y - handle.y) <= HANDLE_SIZE
  );
}
