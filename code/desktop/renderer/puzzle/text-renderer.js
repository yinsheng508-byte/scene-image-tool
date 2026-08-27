import { drawText as drawTextBase, getTextLayout } from "../../shared/text-layout.mjs";

export const TEXT_HANDLE_SIZE = 8;
export const TEXT_ROTATE_HANDLE_SIZE = 12;
export const TEXT_ROTATE_HANDLE_OFFSET = 20;

export { getTextLayout };

export function drawText(ctx, textItem) {
  return drawTextBase(ctx, textItem);
}

export function drawTextSelection(ctx, textItem, layout = null) {
  const metrics = layout || getTextLayout(ctx, textItem);
  const width = metrics.width;
  const height = metrics.height;
  const rotation = Number(textItem.rotation) || 0;
  const centerX = (textItem.x || 0) + width / 2;
  const centerY = (textItem.y || 0) + height / 2;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.translate(-width / 2, -height / 2);

  ctx.strokeStyle = "#2196f3";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(0, 0, width, height);
  ctx.setLineDash([]);

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#2196f3";

  const size = TEXT_HANDLE_SIZE;
  const half = size / 2;
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
  handles.forEach((handle) => {
    ctx.beginPath();
    ctx.rect(handle.x - half, handle.y - half, size, size);
    ctx.fill();
    ctx.stroke();
  });

  const rotateX = width / 2;
  const rotateY = -TEXT_ROTATE_HANDLE_OFFSET;
  ctx.beginPath();
  ctx.moveTo(width / 2, 0);
  ctx.lineTo(rotateX, rotateY);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(rotateX, rotateY, TEXT_ROTATE_HANDLE_SIZE / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}
