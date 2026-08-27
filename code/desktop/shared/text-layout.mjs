import { resolveFontFamilyName, resolveFontWeight } from "./font-config.mjs";

export function normalizeStyle(style) {
  const next = style || {};
  const family = resolveFontFamilyName(next.fontFamily) || "sans-serif";
  const weight = resolveFontWeight(family, next.fontWeight);
  return {
    fontFamily: family,
    fontSize: Number(next.fontSize) || 16,
    fontWeight: weight,
    fontStyle: next.fontStyle === "italic" ? "italic" : "normal",
    color: next.color || "#000000",
    textAlign: next.textAlign || "left",
    letterSpacing: Number(next.letterSpacing) || 0,
    lineHeight: Number(next.lineHeight) || 1.4,
    strokeWidth: Math.max(0, Math.min(20, Number(next.strokeWidth) || 0)),
    strokeColor: next.strokeColor || "#000000",
    shadowColor: next.shadowColor || "#000000",
    shadowBlur: Math.max(0, Math.min(20, Number(next.shadowBlur) || 0)),
    shadowOffsetX: Number(next.shadowOffsetX) || 0,
    shadowOffsetY: Number(next.shadowOffsetY) || 0
  };
}

export function applyTextStyle(ctx, style, options = {}) {
  const safe = normalizeStyle(style);
  const weightToken = String(safe.fontWeight);
  ctx.font = `${safe.fontStyle} ${weightToken} ${safe.fontSize}px "${safe.fontFamily}"`;
  ctx.fillStyle = safe.color;
  ctx.textBaseline = options.textBaseline || "top";
  return safe;
}

export function measureLineWidth(ctx, text, letterSpacing = 0) {
  const value = String(text || "");
  if (!value) return 0;
  let width = 0;
  for (let i = 0; i < value.length; i += 1) {
    width += ctx.measureText(value[i]).width;
    if (i < value.length - 1) {
      width += letterSpacing;
    }
  }
  return width;
}

export function wrapText(ctx, content, width, letterSpacing = 0) {
  const maxWidth = Math.max(1, Number(width) || 1);
  const raw = String(content ?? "");
  const paragraphs = raw.split(/\r?\n/);
  const lines = [];
  paragraphs.forEach((paragraph, index) => {
    if (!paragraph) {
      lines.push("");
      return;
    }
    let line = "";
    for (const char of paragraph) {
      const nextLine = line + char;
      if (!line || measureLineWidth(ctx, nextLine, letterSpacing) <= maxWidth) {
        line = nextLine;
      } else {
        lines.push(line);
        line = char;
      }
    }
    lines.push(line);
  });
  return lines.length ? lines : [""];
}

function readPositiveMetric(metrics, key, fallback = 0) {
  const value = Number(metrics?.[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getLineVerticalMetrics(ctx, line, style) {
  const sample = String(line || "") || "国";
  const metrics = ctx.measureText(sample);
  const fallbackAscent = Math.max(1, style.fontSize * 0.85);
  const fallbackDescent = Math.max(0, style.fontSize * 0.15);
  const ascent = readPositiveMetric(
    metrics,
    "actualBoundingBoxAscent",
    readPositiveMetric(metrics, "fontBoundingBoxAscent", fallbackAscent)
  );
  const descent = readPositiveMetric(
    metrics,
    "actualBoundingBoxDescent",
    readPositiveMetric(metrics, "fontBoundingBoxDescent", fallbackDescent)
  );
  // strokeWidth is configured as the outward visual thickness; draw uses a
  // doubled canvas lineWidth, so half of that extends beyond the glyph bounds.
  const strokeOutset = Math.max(0, Number(style.strokeWidth) || 0);
  return {
    ascent,
    descent,
    strokeOutset,
    baselineOffset: ascent + strokeOutset,
    visualHeight: ascent + descent + strokeOutset * 2
  };
}

export function getTextLayout(ctx, textItem) {
  const width = Math.max(1, Number(textItem?.width) || 1);
  const style = applyTextStyle(ctx, textItem?.style || {});
  const lines = wrapText(ctx, textItem?.content || "", width, style.letterSpacing);
  const lineWidths = lines.map((line) => measureLineWidth(ctx, line, style.letterSpacing));
  applyTextStyle(ctx, style, { textBaseline: "alphabetic" });
  const lineMetrics = lines.map((line) => getLineVerticalMetrics(ctx, line, style));
  const lineHeightPx = Math.max(1, style.fontSize * style.lineHeight);
  const contentHeight = lineMetrics.reduce((max, metrics, index) => {
    const lineBottom = index * lineHeightPx + metrics.visualHeight;
    return Math.max(max, lineBottom);
  }, 0);
  const height = Math.max(style.fontSize, lines.length * lineHeightPx, contentHeight);
  return {
    width,
    height,
    lineHeightPx,
    lines,
    lineWidths,
    lineMetrics,
    style
  };
}

export function drawLineWithLetterSpacing(ctx, text, x, y, style) {
  const value = String(text || "");
  const letterSpacing = Number(style?.letterSpacing) || 0;
  const hasStroke = Number(style?.strokeWidth) > 0;
  const hasShadow =
    Number(style?.shadowBlur) > 0 ||
    Number(style?.shadowOffsetX) !== 0 ||
    Number(style?.shadowOffsetY) !== 0;
  if (hasStroke) {
    ctx.strokeStyle = style.strokeColor || "#000000";
    ctx.lineWidth = Number(style.strokeWidth) * 2;
    ctx.lineJoin = "round";
  }
  let cursor = x;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (hasStroke) {
      ctx.strokeText(char, cursor, y);
      if (hasShadow) {
        ctx.shadowColor = "transparent";
      }
    }
    ctx.fillText(char, cursor, y);
    if (hasStroke && hasShadow) {
      ctx.shadowColor = style.shadowColor || "#000000";
    }
    cursor += ctx.measureText(char).width + letterSpacing;
  }
}

export function drawText(ctx, textItem, options = {}) {
  if (!textItem) return;
  const layout = getTextLayout(ctx, textItem);
  const { width, height, lines, lineWidths, lineHeightPx, style } = layout;
  const rotation = Number(textItem.rotation) || 0;
  const centerX = (textItem.x || 0) + width / 2;
  const centerY = (textItem.y || 0) + height / 2;
  const shadowScaleRaw = Number(options?.shadowScale);
  const shadowScale = Number.isFinite(shadowScaleRaw) && shadowScaleRaw > 0 ? shadowScaleRaw : 1;
  const drawStyle =
    shadowScale === 1
      ? style
      : {
        ...style,
        shadowOffsetX: style.shadowOffsetX * shadowScale,
        shadowOffsetY: style.shadowOffsetY * shadowScale
      };

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.translate(-width / 2, -height / 2);

  applyTextStyle(ctx, drawStyle, { textBaseline: "alphabetic" });
  const hasShadow =
    drawStyle.shadowBlur > 0 ||
    drawStyle.shadowOffsetX !== 0 ||
    drawStyle.shadowOffsetY !== 0;
  if (hasShadow) {
    ctx.shadowColor = drawStyle.shadowColor;
    ctx.shadowBlur = drawStyle.shadowBlur;
    ctx.shadowOffsetX = drawStyle.shadowOffsetX;
    ctx.shadowOffsetY = drawStyle.shadowOffsetY;
  }
  lines.forEach((line, index) => {
    const lineWidth = lineWidths[index] ?? measureLineWidth(ctx, line, drawStyle.letterSpacing);
    let drawX = 0;
    if (drawStyle.textAlign === "center") {
      drawX = (width - lineWidth) / 2;
    } else if (drawStyle.textAlign === "right") {
      drawX = width - lineWidth;
    }
    const metrics = layout.lineMetrics?.[index] || getLineVerticalMetrics(ctx, line, drawStyle);
    const drawY = index * lineHeightPx + metrics.baselineOffset;
    drawLineWithLetterSpacing(ctx, line, drawX, drawY, drawStyle);
  });

  ctx.restore();
  return layout;
}
