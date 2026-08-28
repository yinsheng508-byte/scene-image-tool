# 系统模块地图

> 新增功能或模块前必读。当前应用入口为 `code/desktop/`。

## 模块列表

| 模块名 | 职责 | 入口文件 | 关键依赖 | 备注 |
|---|---|---|---|---|
| Electron 主进程 | 窗口、菜单、IPC composition、授权、转换、上传、下载、拼图生成 | `code/desktop/main.js` | Electron、PDFium、sharp、skia-canvas、PowerShell | 当前约 9200+ 行，settings、shell IPC 和 request control 已先拆入 service，Windows-only 能力仍需继续拆入 adapter |
| 主进程设置 service | 应用设置文件路径、读写、清洗和 settings IPC 注册 | `code/desktop/services/settings-service.js` | Electron `app.getPath("userData")`、Node `fs/path` | 保持 `app-settings.json` 路径和 `settings:*` IPC contract 不变 |
| 主进程 Shell service | `shell:openExternal` / `shell:openPath` IPC 注册、外链 allowlist、可打开目录登记 | `code/desktop/services/shell-service.js` | Electron `shell`、Node `fs/path` | `openExternal` 默认只允许 `https:`；`openPath` 只打开主进程登记过的既有目录 |
| 主进程请求控制 service | 可取消 fetch、request tracker、timeout 和取消错误识别 | `code/desktop/services/request-control.js` | Node `AbortController`、`fetch` | 飞书上传和小红书下载当前网络请求取消共用 |
| 预加载桥 | 向渲染进程暴露白名单 API | `code/desktop/preload.js` | Electron `contextBridge`、`ipcRenderer` | 不打开 nodeIntegration |
| 主界面 Shell | 6 个页签、全局状态和通用交互 | `code/desktop/renderer/index.html`、`code/desktop/renderer/renderer.js` | DOM、`window.appApi`、`window.licenseAPI` | 当前包含导出、飞书、小红书、设置 |
| 授权模块 | 授权密钥、免费次数、版本检查、微信登录状态 | `code/desktop/renderer/license/*`、`code/desktop/main.js` | 远端授权 API、微信验证码登录 API | 业务闸口 |
| 场景化图片排版 | 底图、叠图、四角定位、批量导出 | `code/desktop/renderer/compose.html`、`compose.js`、`compose.css` | Canvas、FileSaver、JSZip | 旧工具页集成进主界面 |
| 百变拼图编辑器 | 模板、坑位、文字、图片元素、裁剪、多文件夹、预览、生成 | `code/desktop/renderer/puzzle/*` | Canvas、shared render spec、字体加载、Pickr | 当前 `puzzle/index.js` 过大 |
| 共享渲染规范 | 字体映射、文字布局、拼图渲染规则 | `code/desktop/shared/*` | ESM | 主进程和渲染进程共享 |
| 平台适配层 | 平台专属 runtime、进程和打包能力逐步隔离 | `code/desktop/platform/*` | Node `fs/path/child_process` | 当前已新增 platform 总入口、common capability helper、Darwin LibreOffice runtime 探测、跨平台进程终止 adapter 和 packaging capability；后续继续拆 Office / 打包实现细节 |
| 文档转换脚本 | Office / LibreOffice 检测和转换 | `code/desktop/scripts/*` | PowerShell、Microsoft Office COM、LibreOffice | Windows 兼容重点 |
| 资源 provisioning | runtime / fonts artifact manifest、本地复制和 sha256 校验 | `code/desktop/resources/runtime-manifest.json`、`code/desktop/scripts/provision-runtime-artifacts.js` | Node `fs/path/crypto` | 不下载、不提交大资源；从外部 artifact root 复制并校验 |
| macOS release signing | macOS 签名环境预检、signed dmg/zip 构建入口和 tag workflow | `code/desktop/scripts/check-macos-signing-env.js`、`code/desktop/scripts/build-macos-release.js`、`.github/workflows/macos-release.yml` | electron-builder、Apple Developer 证书、notarization credentials | 当前已落准备能力；真实 signed/notarized 验收等待 Apple 凭据 |
| 应用资源 | 图标、二维码、字体、运行时 | `code/desktop/assets/`、`code/desktop/fonts/`、`code/desktop/vendor/`、`code/desktop/resources/` | electron-builder extraResources、本地 provisioning | 资源策略见 `docs/architecture/resources.md` |

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
    services/
      settings-service.js
      shell-service.js
      request-control.js
    renderer/
    scripts/
    shared/
    build/
      entitlements.mac.plist
      entitlements.mac.inherit.plist
    resources/
      runtime-manifest.json
    platform/
      index.js
      common/
        capability-result.js
        health-report.js
        process-utils.js
      darwin/
        libreoffice-runtime.js
        process-tree.js
      win32/
        process-tree.js
    assets/
    fonts/
    vendor/
```

## 模块边界规则

- 渲染进程通过 `preload.js` 暴露的 `window.appApi` 和 `window.licenseAPI` 调用主进程能力。
- 文件系统、shell、clipboard、Office/LibreOffice、网络上传下载等能力留在主进程。
- 拼图预览和导出必须共享 `code/desktop/shared/puzzle-render-spec.mjs` 和 `text-layout.mjs`，避免预览/导出不一致。
- 授权、微信登录、导出预检、飞书上传、取消任务走统一闸口，不在 UI 中直接绕过。
- Shell 外链和目录打开通过 `services/shell-service.js` 组合进主进程；renderer 只能请求，主进程按 URL scheme 和已登记目录校验。
- 飞书上传和小红书下载的网络请求取消通过 `services/request-control.js` 组合进主进程；cancel IPC 需要 abort 当前 fetch 并返回稳定取消状态。
- 导出取消的进程终止能力从 `platform/index.js` 进入对应平台 adapter；macOS 不调用 `taskkill`，Windows 继续由 win32 adapter 保留 `taskkill /T /F` 语义。
- 导出预检返回必须同时保留旧 UI 字段和统一 capability 字段；`office-com` 在非 Windows 平台由主进程直接返回 `PLATFORM_UNSUPPORTED`，不得进入 PowerShell 脚本链路。
- 设置持久化通过 `services/settings-service.js` 组合进主进程；renderer 仍只能通过 preload 暴露的 `getAppSettings()` / `setAppSetting()` 调用。
