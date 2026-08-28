# macOS Render QA Matrix

> 日期：2026-08-28
> 范围：MAC-08，验证 Mac 主应用图片核心能力，不重构渲染算法。

## 自动 smoke

| 能力 | 命令 / 方法 | 结果 | 产物 |
|---|---|---|---|
| Skia Canvas PNG | `npm --prefix code/desktop run render:fixture:smoke` | 通过 | `code/desktop/_test_output/render-fixture-smoke/skia-source.png`，800x500，非空 |
| Sharp 图片处理 | 同上 | 通过 | `sharp-resized.png`，400x250，非空 |
| PDFium PDF 渲染 | 同上 | 通过 | `pdfium-basic.pdf` 1 页，`pdfium-basic-1.png` 960x540，非空 |
| 拼图阴影规范 | `npm --prefix code/desktop run puzzle:shadow:smoke` | 通过 | `pipelineVersion=2`，`failed=0` |
| 拼图文字预览 / 导出一致性 | `npm --prefix code/desktop run puzzle:text:smoke` | 通过 | `failed=0`，`previewExportMeanAlphaDiff=0.020618940631808278` |

## Compose DOM Smoke

本轮用 Electron remote debugging 做了一次不改业务代码的 Compose 页签 smoke：

1. 启动开发模式：`npm exec electron -- --remote-debugging-port=9335 .`。
2. 通过 CDP 切到 `compose` tab。
3. 给 `#bgInput` 注入 `render-fixture-smoke/skia-source.png`。
4. 给 `#pptInput` 注入 `render-fixture-smoke/sharp-resized.png`。
5. 在页面上下文设置保存目录为 `code/desktop/_test_output/compose-dom-smoke`。
6. 点击 `#downloadAllBtn`，导出经 preload `window.appApi.saveImageFile()` 落盘。

结果：

| 指标 | 值 |
|---|---|
| active tab | `compose` |
| preview item count | `1` |
| button text | `导出图片` |
| editor canvas | `1200x900` |
| output path | `code/desktop/_test_output/compose-dom-smoke/skia-source_output.png` |
| output size | `241363` bytes |
| output dimensions | `1600x1000` |
| output varied channels | `3` |

视觉检查：输出图能看到背景和叠图合成效果。

## 手工抽查清单

后续改动 Compose 或渲染链路时，仍建议人工抽查：

- 通过系统文件选择器上传一张底图。
- 通过系统文件选择器上传多张叠图。
- 通过系统目录选择器设置保存目录。
- 调整四角定位点、透明度、混合模式后导出。
- 验证单图和多图批量导出文件名、尺寸和打开目录动作。

## 未覆盖

- 大图、超大 PDF、多页 PDF 和长批量压力测试。
- 字体二进制缺失下的复杂中文排版视觉差异。
- CI runner 上的 Electron UI 自动化。
- Windows 实机渲染回归。
