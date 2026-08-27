#!/usr/bin/env node
"use strict";

const path = require("path");
const { pathToFileURL } = require("url");

function toKey(mask) {
  const rect = mask?.slotRect || mask;
  const radius = mask?.radius ?? mask?.borderRadius ?? mask?.spec?.borderRadius ?? 0;
  return `${Math.round(rect?.x || 0)}|${Math.round(rect?.y || 0)}|${Math.round(rect?.w || 0)}|${Math.round(rect?.h || 0)}|${Math.round(radius)}`;
}

function toEntry(spec, id) {
  return {
    id,
    slotRect: {
      x: Math.round(spec.slotRect.x),
      y: Math.round(spec.slotRect.y),
      w: Math.round(spec.slotRect.w),
      h: Math.round(spec.slotRect.h)
    },
    radius: Math.max(0, Number(spec.borderRadius) || 0),
    shadow: spec.shadow
  };
}

function createSlot(id, x, y, w, h, zOrder, shadow = true) {
  return {
    id,
    x,
    y,
    w,
    h,
    zOrder,
    style: {
      borderRadius: 12,
      borderWidth: 0,
      borderColor: "#ffffff",
      shadow
    }
  };
}

function assertCondition(condition, message, details, failures) {
  if (condition) return;
  failures.push({
    message,
    details
  });
}

async function loadRenderSpec() {
  const specPath = path.join(__dirname, "..", "shared", "puzzle-render-spec.mjs");
  return import(pathToFileURL(specPath).href);
}

function buildEntries(specModule, slots) {
  const ordered = specModule.sortSlotsByZOrder(slots);
  return ordered.map((slot) => {
    const spec = specModule.getSlotRenderSpec({
      slot,
      imageW: 1200,
      imageH: 1600,
      scale: 1
    });
    return toEntry(spec, slot.id);
  });
}

function runOverlapCase(specModule, failures) {
  const slots = [
    createSlot("left", 0, 0, 240, 320, 0, true),
    createSlot("right", 180, 0, 240, 320, 1, true)
  ];
  const entries = buildEntries(specModule, slots);
  const leftMasks = specModule.buildShadowCutoutMasks(entries, 0, { includeOwner: true, onlyAbove: true });
  const rightMasks = specModule.buildShadowCutoutMasks(entries, 1, { includeOwner: true, onlyAbove: true });
  const leftKeys = new Set(leftMasks.map(toKey));
  const rightKeys = new Set(rightMasks.map(toKey));

  assertCondition(
    leftKeys.has(toKey(entries[0])) && leftKeys.has(toKey(entries[1])) && leftMasks.length === 2,
    "重叠场景: 低层阴影必须被自身+上层坑位共同挖空",
    { leftMasks },
    failures
  );
  assertCondition(
    rightKeys.has(toKey(entries[1])) && rightMasks.length === 1,
    "重叠场景: 顶层阴影只应被自身挖空",
    { rightMasks },
    failures
  );
}

function runDistanceCase(specModule, failures) {
  const slots = [
    createSlot("a", 0, 0, 240, 320, 0, true),
    createSlot("b", 520, 0, 240, 320, 1, true)
  ];
  const entries = buildEntries(specModule, slots);
  const masks = specModule.buildShadowCutoutMasks(entries, 0, { includeOwner: true, onlyAbove: true });
  assertCondition(
    masks.length === 1 && toKey(masks[0]) === toKey(entries[0]),
    "远距离场景: 不相交坑位不能参与阴影挖空",
    { masks },
    failures
  );
}

function runNearEdgeCase(specModule, failures) {
  const slots = [
    createSlot("a", 0, 0, 240, 320, 0, true),
    createSlot("b", 274, 0, 240, 320, 1, true)
  ];
  const entries = buildEntries(specModule, slots);
  const masks = specModule.buildShadowCutoutMasks(entries, 0, { includeOwner: true, onlyAbove: true });
  const keys = new Set(masks.map(toKey));
  assertCondition(
    keys.has(toKey(entries[0])) && keys.has(toKey(entries[1])) && masks.length === 2,
    "接壤场景: 阴影影响范围内的上层坑位必须参与挖空",
    { masks },
    failures
  );
}

function runCropCase(specModule, failures) {
  const slot = createSlot("crop", 0, 0, 240, 320, 0, true);
  slot.crop = { scale: 1.12, offsetX: 0, offsetY: 0 };
  const baseSpec = specModule.getSlotRenderSpec({
    slot: { ...slot, crop: null },
    imageW: 1200,
    imageH: 1600,
    scale: 1
  });
  const cropSpec = specModule.getSlotRenderSpec({
    slot,
    imageW: 1200,
    imageH: 1600,
    scale: 1
  });
  assertCondition(
    cropSpec.imageRect.w > baseSpec.imageRect.w && cropSpec.imageRect.h > baseSpec.imageRect.h,
    "裁剪场景: 放大裁剪应扩大绘制区域",
    { baseRect: baseSpec.imageRect, cropRect: cropSpec.imageRect },
    failures
  );
}

async function main() {
  const specModule = await loadRenderSpec();
  const failures = [];
  runOverlapCase(specModule, failures);
  runDistanceCase(specModule, failures);
  runNearEdgeCase(specModule, failures);
  runCropCase(specModule, failures);

  const report = {
    pipelineVersion: specModule.SHADOW_PIPELINE_VERSION,
    failed: failures.length,
    passed: failures.length === 0,
    failures
  };

  if (report.passed) {
    console.log("[shadow-regression] PASS");
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.error("[shadow-regression] FAIL");
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
}

main().catch((error) => {
  console.error("[shadow-regression] FATAL", error.message || String(error));
  process.exit(2);
});
