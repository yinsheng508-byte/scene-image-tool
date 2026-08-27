export const DEFAULT_CANVAS_SIZE = { w: 1242, h: 1656 };
export const MAX_PUZZLES = 10;
export const MULTI_FOLDER_SUBMODE_SUBFOLDER = "subfolder-batch";
export const MULTI_FOLDER_SUBMODE_PER_PUZZLE = "per-puzzle-folder";

let idSeed = 0;

export function createId(prefix) {
  idSeed += 1;
  return `${prefix}-${Date.now()}-${idSeed}`;
}

export function createDefaultSlot() {
  return {
    id: createId("slot"),
    x: 440,
    y: 620,
    w: 200,
    h: 200,
    layerIndex: 0,
    zOrder: 0,
    fillOrder: 0,
    style: {
      borderRadius: 0,
      borderWidth: 0,
      borderColor: "#ffffff",
      shadow: false,
      lockAspect: false
    },
    crop: null
  };
}

export function createDefaultText() {
  const stamp = Date.now();
  return {
    id: createId("text"),
    type: "text",
    content: "双击编辑",
    x: 440,
    y: 620,
    width: 200,
    rotation: 0,
    createdAt: stamp,
    zOrder: stamp,
    style: {
      fontFamily: "SourceHanSansCN",
      fontSize: 32,
      fontWeight: 400,
      fontStyle: "normal",
      color: "#000000",
      textAlign: "left",
      letterSpacing: 0,
      lineHeight: 1.4,
      strokeWidth: 0,
      strokeColor: "#000000",
      shadowColor: "#000000",
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0
    }
  };
}

export function createDefaultImage() {
  const stamp = Date.now();
  return {
    id: createId("image"),
    type: "image",
    imagePath: "",
    x: 440,
    y: 620,
    width: 200,
    height: 200,
    rotation: 0,
    aspectRatio: 1,
    createdAt: stamp,
    zOrder: stamp
  };
}

export function createPuzzle(name) {
  return {
    id: createId("puzzle"),
    name,
    backgroundMode: "image",
    backgroundPath: null,
    backgroundColor: "#ffffff",
    canvasSize: { ...DEFAULT_CANVAS_SIZE },
    slots: [],
    texts: [],
    images: []
  };
}

export function createDefaultMultiFolderConfig() {
  return {
    subMode: MULTI_FOLDER_SUBMODE_SUBFOLDER,
    perPuzzle: {
      folderBindings: {},
      outputByPuzzleFolder: true,
      shareSameFolderCycle: true
    },
    subfolderBatch: {
      parentFolder: "",
      parentFolderAccessible: true,
      groups: [],
      outputByInputSubfolder: true,
      lastScannedAt: 0
    }
  };
}

export const AppState = {
  mode: "edit",
  puzzles: [createPuzzle("拼图1")],
  currentPuzzleIndex: 0,
  images: [],
  generationMode: "single",
  singleFirstPuzzleOnce: false,
  folderBindings: {},
  shareSameFolderCycleInMultiFolder: true,
  outputDir: "",
  outputScale: 1,
  previewMode: "fast",
  outputByPuzzleFolder: true,
  multiFolderConfig: createDefaultMultiFolderConfig(),
  currentTemplate: null,
  selectedSlotIds: [],
  selectedTextIds: [],
  selectedImageIds: [],
  editingTextId: null,
  previewIndex: 0,
  taskQueue: []
};
