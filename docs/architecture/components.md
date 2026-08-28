# 组件注册表

> 实现 UI 前必读。已有组件优先复用，避免继续堆叠一套新样式。

## 已有组件

| 组件名 | 用途 | 文件路径 | 使用方式 | 备注 |
|---|---|---|---|---|
| 主页签导航 | 切换 6 个主功能页 | `code/desktop/renderer/index.html`、`renderer.js`、`styles.css` | `.tab-button` + `data-tab` | 新主功能入口应先登记 |
| Toast 通知 | 成功、错误、警告、信息反馈 | `code/desktop/renderer/renderer.js`、`styles.css` | `showToast(...)` | 不重复造提示系统 |
| 运行日志面板 | 展示导出、上传、错误日志 | `code/desktop/renderer/index.html`、`renderer.js` | `appendLog(...)` | 支持导出日志 |
| 全局自定义下拉 | 主界面 select 美化 | `code/desktop/renderer/renderer.js` | `createGlobalCustomSelect(...)` | 导出引擎、倍率使用 |
| 授权弹窗 | 授权密钥输入和验证 | `code/desktop/renderer/license/*`、`index.html` | `window.licenseManager` | 涉及授权闸口 |
| 版本更新弹窗 | 检查和跳转下载 | `code/desktop/renderer/license/*` | `checkUpdate` | 依赖 `licenseAPI.openExternal` |
| LibreOffice 预检弹窗 | 导出前运行时风险提示 | `code/desktop/renderer/index.html`、`renderer.js` | `openLibreOfficeModal(...)` | 不应绕过预检；macOS 文案读 `platform/errorCode/actions`，不显示 Windows 修复主文案 |
| Office 高保真导出弹窗 | Office 模式说明、预检和继续 | `code/desktop/renderer/index.html`、`renderer.js` | `openOfficeEngineModal(...)` | 受 COM 环境影响；非 Windows `PLATFORM_UNSUPPORTED` 时禁用继续动作并提示切回 LibreOffice |
| 拼图自定义下拉 | 拼图模块 select 美化 | `code/desktop/renderer/puzzle/custom-select.js` | `createCustomSelect(...)` | 拼图模块内复用 |
| 拼图颜色选择器 | 颜色选择和透明度交互 | `code/desktop/renderer/puzzle/color-picker.js` | `createColorPicker(...)` | 已处理 Pickr 兼容细节 |
| 拼图画布编辑器 | 坑位拖拽、缩放、命中检测 | `code/desktop/renderer/puzzle/canvas-editor.js` | `createCanvasEditor(...)` | 拼图核心交互 |
| 拼图文字编辑器 | 文字编辑、拖拽、旋转、缩放 | `code/desktop/renderer/puzzle/text-editor.js` | `createTextEditor(...)` | 与颜色选择器焦点有历史坑 |
| 拼图图片元素编辑器 | 装饰图片拖拽、旋转、缩放 | `code/desktop/renderer/puzzle/image-editor.js` | `createImageEditor(...)` | 与选择控制器协作 |
| 拼图裁剪弹窗 | 坑位图片裁剪参数 | `code/desktop/renderer/puzzle/crop-editor.js` | `createCropEditor(...)` | 依赖 shared render spec |
| 拼图模板弹窗 | 保存、重命名、复制、删除模板 | `code/desktop/renderer/puzzle/index.js` | 模板相关 handler | 后续应拆分 |
| 拼图多文件夹弹窗 | 多文件夹绑定和子模式 | `code/desktop/renderer/puzzle/index.js` | folder modal handler | 高风险状态逻辑 |
| 拼图确认弹窗 | 删除、覆盖等二次确认 | `code/desktop/renderer/puzzle/index.js` | confirm modal handler | 避免新增重复 confirm |

## 组件规则

- 新增页签必须更新 `map.md` 和本文件。
- 新增弹窗前先确认是否能复用现有 modal 结构。
- 新增按钮、选择器、开关时优先扩展现有样式类。
- 拼图模块内部组件不要依赖主界面 `renderer.js` 的私有状态。
