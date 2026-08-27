# Export Options Plan

目标：在“文档一键导出”新增两个能力：
1) 导出前 N 页（用户可输入页数，文件总页数小于 N 时跳过该文件）
2) 输出结构可选（全部输出到总目录 / 每个文件一个子文件夹）

## 现状梳理（基于当前实现）
- UI：`desktop/renderer/index.html` 的“导出设置”仅有清晰度倍率与开始/取消按钮。
- 前端：`desktop/renderer/renderer.js` 中 `handleConvert()` 只上传 `scale`。
- 主进程：`desktop/main.js`
  - `convert:documents` -> `convertItem()` -> `convertPdf*()`。
  - `getOutputDirForItem()` 为每个文件创建独立输出文件夹。
  - `getOutputFilePath()` 在单一目录下通过文件名/扩展/序号避免冲突。

## 功能一：导出前 N 页（全部生效）
### 交互
- 在“导出设置”增加数字输入框：
  - 文案：`导出前几页`
  - placeholder：`留空=全部`
  - `min=1`，仅允许正整数
- 行为：
  - 空值或未填：按现有逻辑全量导出
  - 文件总页数 < N：该文件不导出并计入跳过
  - N = 1：仅导出第一页

### 数据流（建议）
- 前端：`handleConvert()` 读取输入值，做数值校验。
  - 空字符串：不限制页数
  - 非空：`parseInt`，必须为整数且 `>= 1`，否则 toast + 日志提示并阻止导出
  - 合法则携带 `pageLimit` 到 `convert:documents`（无需额外上限，后端会按总页数裁剪）
- 主进程：
  - `convert:documents` 把 `pageLimit` 填入 options
  - `convertPdfBufferToImages()` 内控制页数遍历，并修正进度总页数：
    - `const totalPages = pages.length`
    - `const limit = options.pageLimit ? Math.min(options.pageLimit, totalPages) : totalPages`
    - 循环到 `limit`
    - `reportPage(pageNumber, limit)`，确保进度与实际导出页数一致

### 影响范围
- Word/PPT 最终也走 PDF 渲染流程，因此限制页数将对 PDF/Word/PPT 全部生效。

## 功能二：输出结构可选（总目录 / 每文件夹）
### 交互
- 在“导出设置”新增一个开关或单选：
  - 文案：`输出到子文件夹`
  - 默认：开启（保持当前行为）
  - 位置：`index.html` 导出设置区，清晰度倍率输入下方
- 语义：
  - 开启：一个源文件 -> 一个输出子文件夹（现有逻辑）
  - 关闭：所有图片直接输出到用户选择的总目录

### 数据流（建议）
- 前端：`handleConvert()` 追加 `outputMode` 或 `useSubfolder`
- 主进程：
  - `convertItem()` 根据模式决定 `outputDir`
    - 子文件夹模式：仍用 `getOutputDirForItem()`
    - 平铺模式：`outputRoot` 作为 `outputDir`
  - 平铺模式仍调用 `getOutputFilePath()` 生成文件名

### 冲突策略（已确认）
- 平铺输出到总目录时，沿用自动避让命名，并在首选命名中包含扩展以降低冲突概率：
  - 直接使用 `baseName-ext-page.png` 作为首选
  - 仍冲突 -> `baseName-ext-page-1.png`
  - 再冲突 -> `baseName-ext-page-2.png` ... 最多 999，再回退到时间戳
  - `getOutputFilePath()` 可新增参数 `useSubfolder` / `flatMode` 来切换命名策略

## 持久化策略
- `导出前几页`：需要持久化（localStorage），下次打开自动回填。
- `输出到子文件夹`：需要持久化（localStorage），下次打开自动回填（默认仍为开启）。

## 预计修改点（文件级）
1) UI：`desktop/renderer/index.html`
   - 导出设置区新增“导出前几页”输入框
   - 新增“输出到子文件夹”开关/单选
2) 前端逻辑：`desktop/renderer/renderer.js`
   - DOM 引用 + 校验逻辑
   - payload 增加 `pageLimit`、`outputMode/useSubfolder`
3) 主进程：`desktop/main.js`
   - `convert:documents` 读取 `pageLimit`、`outputMode/useSubfolder`
   - `convertPdfBufferToImages()` 控制页数与 `reportPage` 总数
   - `convertItem()` 根据模式选择 `outputDir`

## 已确认事项
1) 平铺输出到总目录时，采用自动避让命名。
2) “导出前几页”需要持久化（下次打开记住）。
