# PPT Stitcher 技术对接方案（PPT 拼图排版模块）

## 1. 目标与范围
- 在现有 Electron 桌面应用中新增「PPT 拼图排版」模块。
- 支持多拼图标签页、坑位编辑、模板保存/加载、批量合成导出。
- **新增要求**：支持透明背景导出（背景可为空）。

## 2. 现有代码梳理（关键对接点）
- `desktop/main.js`：主进程 IPC、文件系统、Sharp、日志与进度通道。
- `desktop/preload.js`：渲染端可用的 IPC API 白名单。
- `desktop/renderer/index.html`：主界面 Tabs 与模块容器。
- `desktop/renderer/styles.css`：全局布局与控件样式（Tab/卡片/按钮等）。
- `desktop/renderer/renderer.js`：Tab 切换逻辑 + 通用 UI/日志/进度。
- `desktop/renderer/compose.*`：现有「场景化图片排版」模块，可参考 UI 与保存逻辑。

## 3. 新增文件结构（建议）
```
desktop/renderer/
  puzzle/
    index.js              # 入口（事件绑定/初始化）
    state.js              # 全局状态
    canvas-editor.js      # 编辑器（拖拽/缩放/多选）
    slot-renderer.js      # 画布渲染（坑位/序号/样式）
    template-manager.js   # 模板保存/加载
    generation-engine.js  # 规则计算与任务队列
    preview-mode.js       # 预览模式
    ui-bindings.js        # DOM 绑定/交互
  puzzle.css              # 模块样式
```

> 采用 `type="module"` 加载 `puzzle/index.js`，其余文件使用 ES module 导出/导入。

## 4. 数据模型（渲染端）
```js
// state.js
export const AppState = {
  mode: "edit", // edit | preview
  puzzles: [{
    id: "puzzle-1",
    name: "拼图1",
    backgroundMode: "image", // image | transparent
    backgroundPath: null,    // 相对路径，透明背景时为 null
    canvasSize: { w: 1080, h: 1440 },
    slots: []                // 坑位数组
  }],
  currentPuzzleIndex: 0,
  images: [], // [{ id, name, path, width, height }]
  generationMode: "single", // single | cover-inner
  outputDir: null,
  currentTemplate: null,
  selectedSlotIds: [],
  previewIndex: 0
};
```

## 5. UI 集成方案
### 5.1 入口
- `desktop/renderer/index.html` 新增 Tab 按钮与内容区。
- 新增样式：`<link rel="stylesheet" href="./puzzle.css" />`
- 新增脚本：`<script type="module" src="./puzzle/index.js"></script>`

### 5.2 透明背景交互
- 在「画布操作区」增加 `透明背景` 开关。
- 透明背景开启时：
  - 背景图可为空，画布尺寸可手动输入（默认 1080×1440）。
  - 编辑区显示棋盘格背景以提示透明区域。
  - 导出 PNG 保持透明。

## 6. IPC 设计（主/渲染）
### 6.1 新增接口
| 通道 | 方向 | 用途 | 备注 |
|------|------|------|------|
| `puzzle:copyBackground` | renderer → main | 复制背景图到 userData | 返回相对路径 |
| `puzzle:loadBackground` | renderer → main | 相对路径 → 绝对路径 | 用于渲染 |
| `puzzle:scanImages` | renderer → main | 扫描图片文件夹 | 过滤 jpg/png |
| `puzzle:saveTemplates` | renderer → main | 写入模板 JSON | 覆盖存储 |
| `puzzle:loadTemplates` | renderer → main | 读取模板 JSON | 返回列表 |
| `puzzle:generate` | renderer → main | 批量合成导出 | 返回结果/错误 |

> 复用已有通道：`dialog:openFolder`、`dialog:openOutputFolder`、`file:saveImage`。

### 6.2 IPC 负载建议
```js
// puzzle:generate payload
{
  outputDir: "D:/output",
  naming: { templateName: "我的模板" },
  tasks: [
    {
      outputIndex: 1,
      canvasSize: { w: 1080, h: 1440 },
      backgroundMode: "image" | "transparent",
      backgroundPath: "backgrounds/xxx.png" | null,
      slots: [
        { x, y, w, h, imagePath, style: { borderRadius, borderWidth, borderColor, shadow } }
      ]
    }
  ]
}
```

## 7. 画布渲染与导出实现
### 7.1 编辑器（Canvas 2D）
- 背景模式：
  - image：绘制背景图；
  - transparent：绘制棋盘格（仅编辑态）。
- 坑位渲染：序号、选中边框、控制点、辅助线。
- 多选与对齐：仅操作 `selectedSlotIds`。

### 7.2 导出（Sharp 合成）
核心逻辑（伪代码）：
```js
const base = backgroundMode === "transparent"
  ? sharp({ create: { width, height, channels: 4, background: { r:0, g:0, b:0, alpha:0 }}})
  : sharp(absoluteBgPath).resize(width, height);

for (slot of slots) {
  const resized = await sharp(slot.imagePath)
    .resize(slot.w, slot.h, { fit: "cover", position: "centre" })
    .toBuffer();

  // 圆角遮罩
  const maskSvg = `<svg width="${slot.w}" height="${slot.h}">
    <rect x="0" y="0" width="${slot.w}" height="${slot.h}" rx="${radius}" ry="${radius}" fill="#fff"/>
  </svg>`;

  let slotImage = await sharp(resized)
    .composite([{ input: Buffer.from(maskSvg), blend: "dest-in" }])
    .toBuffer();

  // 边框
  if (slot.style.borderWidth > 0) {
    const stroke = `<svg width="${slot.w}" height="${slot.h}">
      <rect x="${bw/2}" y="${bw/2}" width="${slot.w-bw}" height="${slot.h-bw}"
            rx="${radius}" ry="${radius}" fill="none" stroke="${color}" stroke-width="${bw}"/>
    </svg>`;
    slotImage = await sharp(slotImage).composite([{ input: Buffer.from(stroke) }]).toBuffer();
  }

  // 阴影（外扩 + blur）
  // 方案：生成 alpha mask → blur → composite 到 base（先阴影再图片）

  base.composite([{ input: slotImage, left: slot.x, top: slot.y }]);
}

await base.png().toFile(outputPath);
```

> 图片填充建议：`fit: "cover"`，保持裁剪一致性（如需等比留白，再新增“contain”选项）。

## 8. 生成规则与任务队列
- 单一文件夹循环：拼图列表依序循环，剩余图片不足时仅填充部分坑位。
- 封面 + 内页循环：拼图1 仅生成一次，后续拼图2..N 循环。
- 任务队列产出：`[{ puzzle, slotImages, outputIndex }]`，供导出与预览共用。

## 9. 模板存储方案
- 目录：`{userData}/PPT-Stitcher/templates.json`
- 背景图：`{userData}/PPT-Stitcher/backgrounds/`
- 删除模板时，若背景图未被引用则清理。
- 透明背景模式不存储背景图。

## 9.1 现存问题与修复方向（请按需逐项落地）
1) 预览区高度会被撑大，缺少自适应
- 现象：画布区域宽度固定、高度可随内容扩张，预览区无法稳定自适应。
- 原因方向：`puzzle` 模块父容器缺少严格的 `flex` 高度约束，画布容器未按画布比例或可视区自适应收缩。
- 修复方向：
  - 为 `.puzzle-body`、`.card-body`、`.puzzle-main` 增加 `flex: 1` 与 `min-height: 0` 约束，确保内部滚动生效。
  - 预览区采用固定比例容器（基于 `canvasSize`），用 JS 动态计算高度或 CSS `aspect-ratio`。
  - 入口：`desktop/renderer/puzzle.css`、`desktop/renderer/index.html`、`desktop/renderer/styles.css`。

2) 生成填充不变形，剩余透明
- 现象：预览会拉伸图片，导出使用 `cover` 导致裁切，未做透明留白。
- 修复方向：
  - 预览：改为等比缩放绘制（contain），中心对齐，留白透明。
  - 导出：`sharp.resize` 改为 `{ fit: "contain", background: { r:0,g:0,b:0,alpha:0 } }`。
  - 入口：`desktop/renderer/puzzle/preview-mode.js`、`desktop/main.js`（`createSlotImage`）。

3) 预览时可编辑且无提示
- 现象：进入预览模式后仍可拖拽/修改坑位，且无“预览模式不可编辑”提示。
- 修复方向：
  - 进入预览时：禁用左侧按钮/属性面板/画布编辑事件，或加遮罩层拦截交互。
  - 显示提示：在画布区域或状态栏显示“预览中，已锁定编辑”。
  - 入口：`desktop/renderer/puzzle/index.js`、`desktop/renderer/puzzle/canvas-editor.js`、`desktop/renderer/puzzle.css`。

4) 预览无样式（圆角/边框/阴影）
- 现象：预览中样式未呈现（边框/圆角/阴影缺失）。
- 修复方向：
  - 预览绘制应与导出一致：圆角裁切 + 边框描边 + 阴影（先阴影后图片）。
  - 若图片为空，也可绘制样式占位框辅助校验。
  - 入口：`desktop/renderer/puzzle/preview-mode.js`。

5) 模板保存与生成规则不可用
- 现象：模板保存失败；生成规则只能单一模板。
- 修复方向：
  - 模板保存：确认 prompt/输入逻辑、IPC `puzzle:saveTemplates` 是否有错误回传；失败时明确提示。
  - 生成规则：当前禁用条件过严（要求封面与内页均有坑位），应按需求仅校验“拼图数≥2 且内页总坑位数>0”。
  - 入口：`desktop/renderer/puzzle/index.js`、`desktop/preload.js`、`desktop/main.js`。

## 10. 开发计划（可落地）
1. **基础集成**：新增 Tab + puzzle.css + puzzle/index.js，空白 UI 能加载。
2. **状态与画布**：实现 AppState、画布渲染、背景上传/透明模式切换。
3. **坑位编辑**：创建/拖拽/缩放/多选/删除/复制。
4. **模板管理**：保存/加载/删除 + 背景图复制到 userData。
5. **生成规则**：任务队列 + 预计生成数量计算。
6. **预览模式**：分页预览 + 返回编辑。
7. **导出引擎**：Sharp 合成 + 文件命名与冲突处理。
8. **异常处理**：缺图/损坏/路径不存在/模板损坏提示。

## 11. 测试清单
- 透明背景：无背景图时可生成，导出 PNG 透明。
- 背景替换：坑位按比例缩放且不超界。
- 坑位样式：圆角/边框/阴影渲染正确。
- 规则计算：单一模式、封面+内页模式页数正确。
- 生成中断：异常图片跳过，结果与提示正确。

## 12. 待确认项（默认方案）
- 图片填充方式默认 `cover`（裁剪）。如需 `contain`，需加选项。
- 透明背景画布尺寸默认 1080×1440，可在 UI 输入修改。
