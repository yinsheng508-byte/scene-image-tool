# 已实现能力清单

> 新增能力前必读。优先复用已有 IPC、脚本和 shared 模块。

## 能力列表

| 能力描述 | 实现位置 | 调用方式 | 适用场景 | 备注 |
|---|---|---|---|---|
| 应用元信息和设置持久化 | `code/desktop/main.js` | `app:getMeta`、`settings:getAll`、`settings:set` | 标题、配置、导出选项 | 设置文件在 userData |
| 授权验证和版本检查 | `code/desktop/main.js`、`renderer/license/*` | `license:*` IPC | 授权、更新、免费次数 | 业务闸口 |
| 微信验证码登录 | `code/desktop/main.js`、`wechat-login.js` | `wechat:getStatus`、`wechat:login` | 登录状态校验 | 远端 API |
| 文件和文件夹选择 | `code/desktop/main.js`、`preload.js` | `dialog:*` IPC | 导出、上传、拼图、下载 | 统一从主进程调用 |
| 文档扫描 | `code/desktop/main.js` | `scan:documents` | Word / PPT / PDF 扫描 | 支持文件夹遍历 |
| 文档转换和渲染 | `code/desktop/main.js`、`scripts/*` | `convert:documents` | 文档导出为图片 | 支持 LibreOffice / Office |
| 导出取消 | `code/desktop/main.js` | `convert:cancel` | 长任务取消 | 需要清理活跃 Office / LO 进程 |
| 平台 adapter 总入口 | `code/desktop/platform/index.js`、`platform/common/capability-result.js` | 主进程内部调用 | 平台能力选择、统一 capability 返回结构 | macOS runtime 已通过总入口接入；Windows runtime 暂保持 legacy passthrough |
| 跨平台进程终止 adapter | `code/desktop/platform/index.js`、`platform/common/process-utils.js`、`platform/darwin/process-tree.js`、`platform/win32/process-tree.js` | 主进程内部调用 | 导出取消、活跃 Office / LO 进程清理 | macOS 使用 Node `process.kill(..., "SIGTERM")`；Windows adapter 保留 `taskkill /T /F`；`convert:cancel` 返回结构不变 |
| LibreOffice 运行时检测 | `code/desktop/main.js`、`scripts/check-lo-runtime.js` | `export:healthCheck`、`office:healthCheck` | 导出前预检 | `office:healthCheck` 为历史兼容 alias；`scripts/check-lo-runtime.js` 只检查 Windows embedded runtime，macOS 不使用该脚本作为系统 LibreOffice 探测 |
| macOS LibreOffice runtime 探测 | `code/desktop/platform/darwin/libreoffice-runtime.js`、`code/desktop/main.js` | 启动自检、`export:healthCheck`、后续 platform adapter | macOS 系统 LibreOffice 能力发现 | 识别 `/Applications/LibreOffice.app/Contents/MacOS/soffice`、Homebrew `soffice` 和 `LIBREOFFICE_PATH`，返回结构化 capability 状态 |
| Microsoft Office COM 检测和转换 | `code/desktop/scripts/*.ps1`、`main.js` | PowerShell 脚本 | 高保真导出 | Windows-only；macOS 必须返回 `PLATFORM_UNSUPPORTED`，不得进入 PowerShell 脚本链路 |
| PDF 渲染为图片 | `code/desktop/main.js` | `@hyzyla/pdfium` | PDF / 中间态渲染 | 受 DPI、缩放、内存限制影响 |
| 拼图模板存储 | `code/desktop/main.js`、`puzzle/template-manager.js` | `puzzle:loadTemplates`、`puzzle:saveTemplates` | 模板库 | 资源路径需规范化 |
| 拼图背景和贴图复制 | `code/desktop/main.js` | `puzzle:copyBackground`、`puzzle:copySticker` | 模板资源管理 | 存入 userData puzzle 目录 |
| 拼图图片扫描 | `code/desktop/main.js` | `puzzle:scanImages`、`puzzle:scanSubfolderGroups` | 单文件夹、多文件夹、子文件夹模式 | 排序规则要保持 |
| 拼图导出预览 | `code/desktop/main.js` | `puzzle:renderExportPreview` | 预览导出效果 | 与实际导出共享渲染逻辑 |
| 拼图批量生成 | `code/desktop/main.js`、`puzzle/generation-engine.js` | `puzzle:generate` | 批量生成成品图 | 有像素上限和字体检查 |
| 字体配置和探针 | `code/desktop/shared/font-config.mjs`、`scripts/font-probe-test.js` | `font:getSystemFonts`、npm scripts | 预览/导出字体一致性 | 不只看注册成功 |
| 飞书 Base 上传 | `code/desktop/main.js`、`renderer.js` | `feishu:uploadImages`、`feishu:uploadRandom` | 图片上传到附件字段 | PersonalBaseToken 口径 |
| 飞书按笔记扫描 | `code/desktop/main.js`、`renderer.js` | `feishu:scanNoteFolders` | 按文件夹结构写入 | 入口顺序决定写入顺序 |
| 飞书上传取消 | `code/desktop/main.js` | `feishu:cancel` | 长上传任务取消 | 需要保持进度一致 |
| 小红书图片下载 | `code/desktop/main.js`、`renderer.js` | `xhs:download`、`xhs:cancel` | 商品图下载 | webview 提取 + 主进程下载 |
| Shell 外链和路径打开 | `code/desktop/main.js`、`preload.js` | `shell:openExternal`、`shell:openPath` | 更新下载、导出目录打开、模板库打开 | 主进程侧还需 URL scheme allowlist 和路径来源约束；不要只依赖 renderer 校验 |
| 共享文字布局 | `code/desktop/shared/text-layout.mjs` | ESM import | 拼图文字预览和导出 | 避免双实现 |
| 共享拼图渲染规范 | `code/desktop/shared/puzzle-render-spec.mjs` | ESM import | 阴影、坑位、裁剪、图层 | 不要绕过 |

## 能力分类

### 文件处理

文档扫描、文档转换、PDF 渲染、图片保存、文件夹选择、路径打开。

### 用户交互

页签、Toast、日志、弹窗、自定义下拉、拼图画布编辑器。

### 集成

飞书 Base、微信验证码登录、小红书商品图下载。

### 授权和版本

授权密钥验证、免费次数、版本检查、下载链接打开。

### 渲染和导出

PDFium、sharp、skia-canvas、字体探针、拼图渲染规范。
