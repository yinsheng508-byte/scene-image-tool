# 系统模块地图

> 新增功能或模块前必读。当前应用入口为 `code/desktop/`。

## 模块列表

| 模块名 | 职责 | 入口文件 | 关键依赖 | 备注 |
|---|---|---|---|---|
| Electron 主进程 | 窗口、菜单、IPC、设置、授权、转换、上传、下载、拼图生成 | `code/desktop/main.js` | Electron、PDFium、sharp、skia-canvas、PowerShell | 当前 8300+ 行，后续应拆分 |
| 预加载桥 | 向渲染进程暴露白名单 API | `code/desktop/preload.js` | Electron `contextBridge`、`ipcRenderer` | 不打开 nodeIntegration |
| 主界面 Shell | 6 个页签、全局状态和通用交互 | `code/desktop/renderer/index.html`、`code/desktop/renderer/renderer.js` | DOM、`window.appApi`、`window.licenseAPI` | 当前包含导出、飞书、小红书、设置 |
| 授权模块 | 授权密钥、免费次数、版本检查、微信登录状态 | `code/desktop/renderer/license/*`、`code/desktop/main.js` | 远端授权 API、微信验证码登录 API | 业务闸口 |
| 场景化图片排版 | 底图、叠图、四角定位、批量导出 | `code/desktop/renderer/compose.html`、`compose.js`、`compose.css` | Canvas、FileSaver、JSZip | 旧工具页集成进主界面 |
| 百变拼图编辑器 | 模板、坑位、文字、图片元素、裁剪、多文件夹、预览、生成 | `code/desktop/renderer/puzzle/*` | Canvas、shared render spec、字体加载、Pickr | 当前 `puzzle/index.js` 过大 |
| 共享渲染规范 | 字体映射、文字布局、拼图渲染规则 | `code/desktop/shared/*` | ESM | 主进程和渲染进程共享 |
| 文档转换脚本 | Office / LibreOffice 检测和转换 | `code/desktop/scripts/*` | PowerShell、Microsoft Office COM、LibreOffice | Windows 兼容重点 |
| 应用资源 | 图标、二维码、字体、运行时 | `code/desktop/assets/`、`code/desktop/fonts/`、`code/desktop/vendor/` | electron-builder extraResources | 资源策略见 `docs/architecture/resources.md` |

## 用户功能入口

| 页签 | DOM 标识 | 主要代码 | 说明 |
|---|---|---|---|
| 文档一键导出 | `data-tab="export"` | `renderer.js`、`main.js`、`scripts/*` | Word / PPT / PDF 到图片 |
| 场景化图片排版 | `data-tab="compose"` | `compose.*` | 底图和叠图合成 |
| 百变拼图排版 | `data-tab="puzzle"` | `puzzle/*`、`shared/*`、`main.js` | 模板化拼图批量生成 |
| 飞书一键上传 | `data-tab="upload"` | `renderer.js`、`main.js` | 分模块上传和按笔记上传 |
| 小红书商品下载 | `data-tab="xhs"` | `renderer.js`、`main.js` | 商品图片提取和下载 |
| 设置 / 授权 | `data-tab="settings"` | `license/*`、`main.js` | 授权、版本检查、日志 |

## 目录结构目标

```text
code/
  desktop/
    main.js
    preload.js
    package.json
    renderer/
    scripts/
    shared/
    assets/
    fonts/
    vendor/
```

## 模块边界规则

- 渲染进程通过 `preload.js` 暴露的 `window.appApi` 和 `window.licenseAPI` 调用主进程能力。
- 文件系统、shell、clipboard、Office/LibreOffice、网络上传下载等能力留在主进程。
- 拼图预览和导出必须共享 `code/desktop/shared/puzzle-render-spec.mjs` 和 `text-layout.mjs`，避免预览/导出不一致。
- 授权、微信登录、导出预检、飞书上传、取消任务走统一闸口，不在 UI 中直接绕过。
