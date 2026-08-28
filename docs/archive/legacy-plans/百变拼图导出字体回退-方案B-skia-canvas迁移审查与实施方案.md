# 百变拼图导出字体回退：方案 B（`skia-canvas`）审查与实施方案

## 1. 目标与结论

目标：将导出渲染从 `node-canvas + Pango/fontconfig` 迁移到 `skia-canvas`，消除当前导出侧字体静默回退（思源宋体等不可用导致回退到楷体/系统字体）问题。

结论：**方案方向正确，建议实施**。  
你给出的“修订版”已经覆盖了大部分关键点，但还需要补齐少量执行细节与验收口径，才能作为可直接落地的工程方案。

---

## 2. 审查结果（按严重度）

### P0（阻断级）

1. 验收标准“全部字体 `capable=true`”过强，易导致发布流程长期被阻断。
- 现有字体资产中存在完整性问题（例如阿里字体包部分目录为空），即使迁移成功，也不应把“所有字体全绿”作为唯一放行条件。
- 建议改为“关键字体集必须通过 + 总通过率阈值”双条件放行。

### P1（高优先级）

1. `createShadowBuffer` 在当前代码已是 `async`，修订方案里“改为 async”属于误判。
- 当前实现：`desktop/main.js:1733`
- 迁移时应只改 `toBuffer` 调用格式，不需要改函数签名。

2. 文件清单缺少 `desktop/package-lock.json`。
- 依赖从 `canvas` 改为 `skia-canvas` 后，锁文件必然变化，应明确纳入改造清单和代码评审范围。

3. `dist:checked` 链路需要保持可用性闭环。
- 当前发布脚本依赖 `font-probe-test.js`（`desktop/package.json:9`）。
- 迁移后必须先确保 probe 脚本可运行，否则“打包成功但字体回退复发”风险仍然存在。

### P2（建议优化）

1. 建议在 `getCanvasLib()` 适配层保留统一接口定义（`createCanvas/loadImage/FontLibrary`），并在注释中声明“这是唯一渲染引擎入口”。

2. 建议在迁移完成后保留导出探针日志（`verifyFontsAvailable` + `probeExportFontCapability`），不要在同一迭代删减诊断能力。

---

## 3. 当前代码基线（需改文件）

以下为当前仓库实际命中点（用于实施定位）：

- `desktop/package.json:20`：仍依赖 `canvas`
- `desktop/main.js:75`：`require("canvas")`
- `desktop/main.js:337`：`registerFont` 路径
- `desktop/main.js:583`：`toBuffer("image/png")`
- `desktop/main.js:699`：`toBuffer("image/png")`
- `desktop/main.js:1759`：`toBuffer("image/png")`
- `desktop/shared/text-layout.mjs:1`：导入 `resolveNodeCanvasFontWeight`
- `desktop/shared/text-layout.mjs:5`：`isNodeCanvasContext`
- `desktop/shared/text-layout.mjs:30`：Pango 权重分支
- `desktop/shared/font-config.mjs:231`：`resolveNodeCanvasFontWeight`
- `desktop/scripts/font-probe-test.js:99`：dev `canvas` 模块路径
- `desktop/scripts/font-probe-test.js:105`：packaged `canvas` 模块路径
- `desktop/scripts/font-probe-test.js:241`：`registerFont/createCanvas` 逻辑
- `desktop/scripts/puzzle-export-smoke.js:13`：`require("canvas")`

---

## 4. 最终改造范围（审查后定稿）

必须改：

1. `desktop/package.json`
2. `desktop/package-lock.json`
3. `desktop/main.js`
4. `desktop/shared/text-layout.mjs`
5. `desktop/shared/font-config.mjs`
6. `desktop/scripts/font-probe-test.js`
7. `desktop/scripts/puzzle-export-smoke.js`

---

## 5. 文件级实施方案（定稿）

## 5.1 `desktop/package.json`

改动：

1. 依赖替换：`canvas` -> `skia-canvas`
2. `asarUnpack` 增加 `node_modules/skia-canvas/**`
3. 保留现有脚本名（`font:probe` / `font:probe:packaged` / `dist:checked`），避免调用方改造。

说明：

- `skia-canvas` 官方提供 `Canvas`、`FontLibrary`、`loadImage`，覆盖当前导出能力。
- 依赖变更后需要同步更新 `desktop/package-lock.json`。

## 5.2 `desktop/main.js`

改动 A：`getCanvasLib()` 改为适配层

1. `require("skia-canvas")`
2. 暴露统一接口：
- `createCanvas: (w, h) => new Canvas(w, h)`
- `loadImage: skia.loadImage`
- `FontLibrary: skia.FontLibrary`

改动 B：`registerTextFonts()` 改为 `FontLibrary.use`

1. 删除 `registerFont` 逻辑。
2. 删除 `resolveNodeCanvasFontWeight` 依赖。
3. 先按 family/alias 聚合路径，再批量 `FontLibrary.use(family, paths)`。
4. 用 `FontLibrary.use()` 返回的真实 `weight/style/file` 回填 `addRegisteredFontFace`，避免固定 `400` 造成诊断失真。

改动 C：三处 `toBuffer`

1. `createTextLayerBuffer`：`await canvas.toBuffer("png")`
2. `createElementLayerBuffer`：`await canvas.toBuffer("png")`
3. `buildShadowBuffer`：`await canvas.toBuffer("png")`

注意：

- `buildShadowBuffer` 当前已是 `async`，无需改函数签名，只改返回语句。

改动 D：保持现有导出探针流程

1. 保留 `verifyFontsAvailable(tasks)` 调用位置。
2. 保留字体替换日志，迁移后继续用于回归验证。

## 5.3 `desktop/shared/text-layout.mjs`

改动：

1. 删除 `resolveNodeCanvasFontWeight` 导入。
2. 删除 `isNodeCanvasContext` 分支函数。
3. `applyTextStyle` 统一使用 `String(safe.fontWeight)`。

目标：

- 统一预览与导出的 `ctx.font` 权重拼装逻辑。

## 5.4 `desktop/shared/font-config.mjs`

改动：

1. 删除 `resolveNodeCanvasFontWeight` 导出函数。

前提：

- 所有调用点完成迁移后再删除，避免中间态报错。

## 5.5 `desktop/scripts/font-probe-test.js`

改动 A：运行时模块路径

1. dev 路径改为 `node_modules/skia-canvas`
2. packaged 路径改为 `app.asar.unpacked/node_modules/skia-canvas`

改动 B：字体注册逻辑

1. 用 `FontLibrary.use` 替代 `registerFont`。
2. 移除 `resolveNodeCanvasFontWeight` 调用。
3. `probeFace` 权重 token 直接用数字字符串。

改动 C：画布创建

1. `new Canvas(width, height)` 替代 `createCanvas(...)`。

目标：

- 保持 `dist:checked` 字体门禁能力不退化。

## 5.6 `desktop/scripts/puzzle-export-smoke.js`

改动：

1. `require("canvas")` 改为 `require("skia-canvas")`。
2. 保持 `loadImage(buffer)` 调用方式不变。

---

## 6. 实施顺序（可直接执行）

1. 改 `desktop/package.json`，执行安装，生成新的 `desktop/package-lock.json`。
2. 改 `desktop/shared/text-layout.mjs`（去掉权重分支）。
3. 改 `desktop/main.js`（适配层、字体注册、三处 `toBuffer`）。
4. 改 `desktop/scripts/font-probe-test.js`。
5. 改 `desktop/scripts/puzzle-export-smoke.js`。
6. 最后删 `desktop/shared/font-config.mjs` 中 `resolveNodeCanvasFontWeight`。
7. 全量跑验证命令（见第 7 节）。

---

## 7. 验证与验收

## 7.1 命令级验证

1. `node --check desktop/main.js`
2. `node --check desktop/shared/text-layout.mjs`
3. `node --check desktop/shared/font-config.mjs`
4. `node --check desktop/scripts/font-probe-test.js`
5. `npm --prefix desktop run font:probe`
6. `npm --prefix desktop run dist:dev`
7. `npm --prefix desktop run font:probe:packaged`
8. `npm --prefix desktop run dist:checked`

## 7.2 业务级验收（模板实测）

必须覆盖：

1. 思源宋体（常见问题字体）
2. 思源黑体
3. 楷体
4. 苹方

验收口径：

1. 预览与导出字形一致（肉眼 + 样图对比）。
2. `font:probe:packaged` 对关键字体集通过。
3. 导出日志中不再出现“目标字体不可用导致替换为楷体”的链路。

## 7.3 门禁建议（替代“全绿”）

发布放行条件建议：

1. 关键字体集通过（至少：`SourceHanSerifCN`、`SourceHanSansCN`、`PingFangSC`、`KaiTi`）。
2. 总体通过率 >= 0.90（而不是强制 1.00）。

---

## 8. 风险与回滚

主要风险：

1. 打包后原生模块加载路径问题（`asarUnpack` 配置不完整）。
2. `font-probe-test` 迁移不完整导致 `dist:checked` 失效。
3. 字体资产本身残缺（与引擎迁移正交，但会影响通过率）。

回滚方案：

1. 还原 `desktop/package.json` 依赖到 `canvas`。
2. 还原 `desktop/main.js` 的 `getCanvasLib/registerTextFonts/toBuffer` 三块改动。
3. 还原 `desktop/shared/text-layout.mjs` 与 `desktop/shared/font-config.mjs`。
4. 还原两个脚本文件的 `skia-canvas` 相关改动。

---

## 9. 参考资料（官方）

1. FontLibrary：`https://skia-canvas.org/api/font-library`
2. Canvas API：`https://skia-canvas.org/api/canvas`
3. Image / loadImage：`https://skia-canvas.org/api/image`
4. 项目主页：`https://skia-canvas.org/`

---

## 10. 最终建议

建议按本方案实施。  
相较继续在 `node-canvas + Pango` 上做权重/别名补丁，迁移 `skia-canvas` 的确定性更高，且更接近浏览器渲染结果，是更稳妥的长期解法。
