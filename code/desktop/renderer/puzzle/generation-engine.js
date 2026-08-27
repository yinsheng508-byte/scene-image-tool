import {
  MULTI_FOLDER_SUBMODE_PER_PUZZLE,
  MULTI_FOLDER_SUBMODE_SUBFOLDER
} from "./state.js";

function getOrderValue(item, field, fallback = 0) {
  const value = Number(item?.[field]);
  return Number.isFinite(value) ? value : fallback;
}

function compareSlotsByFillOrder(a, b) {
  const diff = getOrderValue(a, "fillOrder") - getOrderValue(b, "fillOrder");
  if (diff !== 0) return diff;
  return String(a?.id || "").localeCompare(String(b?.id || ""), "zh-CN");
}

function getSlotsForFill(puzzle) {
  const slots = Array.isArray(puzzle?.slots) ? [...puzzle.slots] : [];
  slots.sort(compareSlotsByFillOrder);
  return slots;
}

function cloneSlot(slot, imagePath) {
  return {
    id: slot.id,
    x: slot.x,
    y: slot.y,
    w: slot.w,
    h: slot.h,
    layerIndex: slot.layerIndex,
    zOrder: slot.zOrder,
    fillOrder: slot.fillOrder,
    style: { ...slot.style },
    crop: slot.crop ? { ...slot.crop } : null,
    imagePath
  };
}

function cloneText(text) {
  return {
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
  };
}

function cloneImage(image) {
  return {
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
  };
}

function buildTask(puzzle, slots, outputIndex) {
  return {
    outputIndex,
    puzzleId: puzzle.id,
    puzzleName: puzzle.name || "",
    canvasSize: { ...puzzle.canvasSize },
    backgroundMode: puzzle.backgroundMode,
    backgroundPath: puzzle.backgroundPath || null,
    backgroundColor: puzzle.backgroundColor || "#ffffff",
    slots,
    texts: Array.isArray(puzzle.texts) ? puzzle.texts.map(cloneText) : [],
    images: Array.isArray(puzzle.images) ? puzzle.images.map(cloneImage) : []
  };
}

function normalizeGenerationOptions(options = null) {
  return {
    singleFirstPuzzleOnce: options?.singleFirstPuzzleOnce === true,
    shareSameFolderCycleInMultiFolder: options?.shareSameFolderCycleInMultiFolder !== false
  };
}

function buildTaskForPuzzle(puzzle, images, imageIndex, outputIndex) {
  const slots = [];
  const beforeIndex = imageIndex;
  const orderedSlots = getSlotsForFill(puzzle);
  for (const slot of orderedSlots) {
    if (imageIndex >= images.length) {
      slots.push(cloneSlot(slot, null));
      continue;
    }
    const image = images[imageIndex];
    imageIndex += 1;
    slots.push(cloneSlot(slot, image.path));
  }
  if (imageIndex === beforeIndex) {
    return null;
  }
  return {
    task: buildTask(puzzle, slots, outputIndex),
    nextImageIndex: imageIndex,
    nextOutputIndex: outputIndex + 1
  };
}

function normalizeMultiFolderSubMode(config) {
  return config?.subMode === MULTI_FOLDER_SUBMODE_PER_PUZZLE
    ? MULTI_FOLDER_SUBMODE_PER_PUZZLE
    : MULTI_FOLDER_SUBMODE_SUBFOLDER;
}

export function buildTaskQueue(
  puzzles,
  images,
  mode,
  folderBindings = null,
  options = null,
  multiFolderConfig = null
) {
  if (!Array.isArray(puzzles) || puzzles.length === 0) {
    return [];
  }
  const normalizedOptions = normalizeGenerationOptions(options);
  if (mode === "multi-folder") {
    const subMode = normalizeMultiFolderSubMode(multiFolderConfig);
    if (subMode === MULTI_FOLDER_SUBMODE_SUBFOLDER) {
      const groups = Array.isArray(multiFolderConfig?.subfolderBatch?.groups)
        ? multiFolderConfig.subfolderBatch.groups
        : [];
      return buildSubfolderBatchQueue(puzzles, groups, normalizedOptions);
    }
    return buildMultiFolderQueue(puzzles, folderBindings || {}, normalizedOptions);
  }
  if (!Array.isArray(images) || images.length === 0) {
    return [];
  }
  return buildSingleQueue(puzzles, images, normalizedOptions);
}

function buildSingleQueue(puzzles, images, options = null) {
  const normalizedOptions = normalizeGenerationOptions(options);
  if (normalizedOptions.singleFirstPuzzleOnce && puzzles.length > 1) {
    return buildSingleQueueWithCover(puzzles, images);
  }
  return buildSingleQueueDefault(puzzles, images);
}

function buildSingleQueueDefault(puzzles, images) {
  const tasks = [];
  let imageIndex = 0;
  let outputIndex = 1;

  while (imageIndex < images.length) {
    for (const puzzle of puzzles) {
      const result = buildTaskForPuzzle(puzzle, images, imageIndex, outputIndex);
      if (!result) {
        return tasks;
      }
      tasks.push(result.task);
      imageIndex = result.nextImageIndex;
      outputIndex = result.nextOutputIndex;
      if (imageIndex >= images.length) {
        break;
      }
    }
  }
  return tasks;
}

function buildSingleQueueWithCover(puzzles, images) {
  const tasks = [];
  let imageIndex = 0;
  let outputIndex = 1;

  const coverResult = buildTaskForPuzzle(puzzles[0], images, imageIndex, outputIndex);
  if (!coverResult) {
    return tasks;
  }
  tasks.push(coverResult.task);
  imageIndex = coverResult.nextImageIndex;
  outputIndex = coverResult.nextOutputIndex;

  if (imageIndex >= images.length) {
    return tasks;
  }

  const loopPuzzles = puzzles.slice(1);
  while (imageIndex < images.length) {
    for (const puzzle of loopPuzzles) {
      const result = buildTaskForPuzzle(puzzle, images, imageIndex, outputIndex);
      if (!result) {
        return tasks;
      }
      tasks.push(result.task);
      imageIndex = result.nextImageIndex;
      outputIndex = result.nextOutputIndex;
      if (imageIndex >= images.length) {
        break;
      }
    }
  }
  return tasks;
}

function buildSubfolderBatchQueue(puzzles, groups, options = null) {
  const normalizedOptions = normalizeGenerationOptions(options);
  const tasks = [];
  let outputIndex = 1;

  (Array.isArray(groups) ? groups : []).forEach((group) => {
    const groupImages = Array.isArray(group?.images) ? group.images : [];
    if (!groupImages.length) {
      return;
    }
    const groupTasks = buildSingleQueue(puzzles, groupImages, {
      singleFirstPuzzleOnce: normalizedOptions.singleFirstPuzzleOnce
    });
    groupTasks.forEach((task, index) => {
      tasks.push({
        ...task,
        outputIndex,
        sourceGroupName: String(group?.name || "").trim() || `分组${tasks.length + 1}`,
        sourceGroupPath: String(group?.folderPath || "").trim(),
        sourceGroupIndex: index + 1
      });
      outputIndex += 1;
    });
  });

  return tasks;
}

function normalizeFolderBindingKey(folder) {
  const normalized = String(folder || "")
    .trim()
    .replace(/[\\/]+/g, "/")
    .toLowerCase();
  return normalized;
}

function buildTaskForPuzzleWithPool(puzzle, orderedSlots, pool, outputIndex) {
  if (!pool || !Array.isArray(pool.images)) return null;
  let cursor = Number(pool.cursor) || 0;
  const beforeCursor = cursor;
  const slots = [];
  for (const slot of orderedSlots) {
    if (cursor >= pool.images.length) {
      slots.push(cloneSlot(slot, null));
      continue;
    }
    const image = pool.images[cursor];
    cursor += 1;
    slots.push(cloneSlot(slot, image?.path || null));
  }
  if (cursor === beforeCursor) {
    return null;
  }
  pool.cursor = cursor;
  return {
    task: buildTask(puzzle, slots, outputIndex),
    nextOutputIndex: outputIndex + 1
  };
}

function buildMultiFolderQueue(puzzles, folderBindings, options = null) {
  const normalizedOptions = normalizeGenerationOptions(options);
  const shareSameFolderCycle = normalizedOptions.shareSameFolderCycleInMultiFolder !== false;
  const tasks = [];
  let outputIndex = 1;
  const activePuzzles = [];

  for (const puzzle of puzzles) {
    const binding = folderBindings[puzzle.id];
    const images = Array.isArray(binding?.images) ? binding.images : [];
    const orderedSlots = getSlotsForFill(puzzle);
    if (!images.length || !orderedSlots.length) {
      continue;
    }
    activePuzzles.push({
      puzzle,
      folder: binding?.folder || "",
      orderedSlots,
      images
    });
  }

  if (!activePuzzles.length) {
    return tasks;
  }

  const poolMap = new Map();
  activePuzzles.forEach((entry) => {
    const sharedKey = normalizeFolderBindingKey(entry.folder);
    const poolKey = shareSameFolderCycle && sharedKey
      ? `folder:${sharedKey}`
      : `puzzle:${entry.puzzle.id}`;
    let pool = poolMap.get(poolKey);
    if (!pool) {
      pool = {
        images: entry.images,
        cursor: 0
      };
      poolMap.set(poolKey, pool);
    }
    entry.pool = pool;
  });

  while (true) {
    let generatedInRound = false;
    for (const entry of activePuzzles) {
      const result = buildTaskForPuzzleWithPool(
        entry.puzzle,
        entry.orderedSlots,
        entry.pool,
        outputIndex
      );
      if (!result) {
        continue;
      }
      tasks.push(result.task);
      outputIndex = result.nextOutputIndex;
      generatedInRound = true;
    }
    if (!generatedInRound) break;
  }
  return tasks;
}

export function calculateEstimateCount(
  puzzles,
  images,
  mode,
  folderBindings = null,
  options = null,
  multiFolderConfig = null
) {
  return buildTaskQueue(
    puzzles,
    images,
    mode,
    folderBindings,
    options,
    multiFolderConfig
  ).length;
}
