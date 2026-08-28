# macOS 主应用开发改造需求

> 日期：2026-08-28
> 模式：深度分析，落地需求文档和任务卡文档
> 当前基线：`platform/macos-bootstrap`，PR #1/#2/#3/#4/#5 已合并；MAC-04 正在 `platform/macos-export-preflight-ui` 落地。
> 目标：把现有 Windows Electron 工具稳妥落地到 macOS，形成可持续主应用开发架构，而不是复制一套 Mac 分叉。

## 1. 结论

本项目后续应按“共享业务核心 + 平台适配层 + 平台构建配置 + 分层 CI”的方式继续构建。Mac 版本不是另起一个应用，也不是在 UI 层到处写 `process.platform` 分支，而是把当前集中在 `code/desktop/main.js` 的平台差异逐步下沉到 `code/desktop/platform/*`。

短期目标是 macOS 上能稳定完成：

1. 应用启动、设置、授权和基础窗口行为。
2. 场景化图片排版和百变拼图核心能力。
3. PDF 渲染到图片。
4. Word / PPT 通过系统 LibreOffice 转 PDF，再进入现有图片渲染链路。
5. 飞书上传、小红书图片下载的基础文件和网络链路。
6. unsigned macOS `.app` 开发包。
7. Windows / macOS 基础 CI。

中期目标是建立可维护的主应用架构：

1. `main.js` 从“所有能力的承载文件”降级为 Electron bootstrap + IPC composition。
2. 导出、拼图、上传、下载、授权、设置分别进入 service 层。
3. Windows-only 能力进入 `platform/win32`，macOS-only 能力进入 `platform/darwin`。
4. UI 只消费统一 capability / health / progress 结构，不理解底层命令。
5. 所有构建、资源、runtime 都按平台隔离，避免 Mac 打包误带 Windows runtime。

## 2. 当前事实

已完成：

- GitHub public 干净基线上线，不包含原仓库历史大文件和敏感历史。
- 当前可运行入口固定为 `code/desktop/`。
- Mac 首次 clone、`npm ci`、Electron 开发启动、`puzzle:shadow:smoke`、`puzzle:text:smoke` 已通过。
- PR #1 已新增 Darwin LibreOffice runtime 探测，可识别：
  - `/Applications/LibreOffice.app/Contents/MacOS/soffice`
  - `/opt/homebrew/bin/soffice`
  - `/usr/local/bin/soffice`
  - `LIBREOFFICE_PATH`
- PR #1 中 runtime 探测已返回结构化字段：`ok`、`platform`、`capability`、`source`、`path`、`version`、`warnings`、`errorCode`、`message`、`actions`。

仍未完成：

- `main.js` 仍包含大量 Windows-only 转换、PowerShell、Office COM 和 runtime 探测逻辑；进程终止已先通过 MAC-02 接入 platform process adapter。
- MAC-03 已新增统一 health report helper；`export:healthCheck` / `office:healthCheck` 会保留旧字段，并新增 `platform/engine/capability/capabilities/errorCode/message`。
- MAC-03 已新增 `capability:getAll` IPC 和 preload `getCapabilities`，供后续平台能力 UI 消费。
- `office:healthCheck` / `export:healthCheck` 的 UI 语义已开始按 capability-aware 方式改造；MAC-04 已覆盖导出引擎文案、LibreOffice 弹窗、Office COM unsupported 弹窗和诊断日志，完整平台能力设置区仍待 MAC-09。
- `runMicrosoftOfficeHealthCheck()` 在非 Windows 平台已早退为 `PLATFORM_UNSUPPORTED`；macOS 选择 Office engine 不应进入 PowerShell。
- `package.json` 顶层 `build.extraResources` 仍引用缺失的 Windows LibreOffice runtime 和 VC redist exe；public Mac clone 在打包前必须先平台化构建资源配置。
- `scripts/check-lo-runtime.js` 当前是 Windows embedded LibreOffice 完整性检查，不是 macOS 系统 LibreOffice 探测脚本。
- `shell:openExternal` / `shell:openPath` 目前只通过 renderer 约束调用意图，主进程还缺 URL scheme 和路径使用边界校验。
- 飞书上传和小红书下载的取消逻辑主要在队列间检查；当前正在进行的 `fetch` / upload 请求仍缺统一 AbortController 或超时取消模型。
- macOS 文档导出真实文件 smoke 尚未建立脱敏 fixture。
- `dist:mac:dir` 尚未实现。
- `.github/workflows` 尚不存在。
- macOS `.icns` 图标尚未准备。
- 字体二进制不在 public 仓库，严格字体探针和最终字体分发策略仍待 artifact / provisioning 设计。
- `npm ci` 仍报告既有 21 个 audit 漏洞，需后续独立治理。

## 3. 产品能力落地范围

| 能力 | macOS 目标等级 | 第一版策略 | 不做 / 降级 |
|---|---:|---|---|
| 应用启动 | P0 | Electron 开发模式和 unsigned app bundle 都能打开主界面 | 不接入签名和公证 |
| 设置 / 授权 | P0 | 复用现有 IPC、userData 和授权 UI | 不改变授权接口和设备绑定口径 |
| 场景化图片排版 | P0 | 复用 Canvas 前端逻辑，验证文件选择、导出目录和保存 | 不重写为新 UI |
| 百变拼图 | P0 | 复用 `renderer/puzzle/*` 和 `shared/*`，验证预览 / 导出一致性 | 不改动复杂多文件夹状态语义 |
| PDF 到图片 | P0 | 验证 `@hyzyla/pdfium`、`sharp`、`skia-canvas` 在 Mac native 依赖下稳定运行 | 不把 PDF 渲染换成系统工具 |
| Word / PPT 导出 | P1 | 使用系统 LibreOffice 转 PDF，再复用现有 PDF 渲染 | 不支持 Office COM 等价能力 |
| Office 高保真导出 | P2 | 在 macOS 明确显示不可用或后置评估 AppleScript/JXA | 不承诺与 Windows COM 同等保真 |
| 飞书上传 | P1 | 复用主进程网络上传和取消机制，验证文件路径、排序和失败重试 | 不改接口口径 |
| 小红书下载 | P1 | 验证 webview / 网络下载 / referer / 输出目录 | 不绕过平台风控或登录态 |
| 字体 | P1 | 第一版使用系统字体 fallback 和 public 仓库 README；后续做字体 artifact | 不把字体二进制直接提交到 Git |
| 打包 | P1 | 先 `dist:mac:dir` unsigned `.app`，再 `dist:mac` dmg/zip | 第一版不签名、不公证 |
| CI | P1 | Windows/macOS 跑 `npm ci` 和 puzzle smoke | 不把 LibreOffice / 字体 / 打包发布设为第一版 required |

## 4. 架构目标

### 4.1 分层目标

```text
code/desktop/
  main.js                  # Electron bootstrap, IPC registration, service composition
  preload.js               # contextBridge whitelist only
  renderer/                # UI, state, interaction; no Node direct access
  shared/                  # pure shared render/font/text specs
  services/                # business services, platform-agnostic orchestration
    export/
    puzzle/
    upload/
    xhs/
    license/
    settings/
  platform/
    index.js               # selects current platform adapter
    common/
      capability-result.js
      process-utils.js
      path-utils.js
      runtime-manifest.js
    win32/
      powershell.js
      process-tree.js
      libreoffice-runtime.js
      office-com.js
      export-health.js
      packaging.js
    darwin/
      libreoffice-runtime.js
      process-tree.js
      export-health.js
      packaging.js
      system-open.js
  scripts/                 # CLI / smoke / platform scripts
```

### 4.2 迁移原则

1. 采用 strangler pattern：先给旧逻辑套 adapter，再逐步迁出函数，不做一次性大拆。
2. `main.js` 每次只减少一种职责，例如只抽 PowerShell 或只抽 process tree。
3. Windows 路径必须先包测试或 smoke，再迁移；Windows COM / PowerShell 现有错误码不能被改写。
4. macOS 路径必须用 Node 原生 spawn / kill / fs 能力，不调用 Windows shell。
5. Renderer 不直接判断底层命令细节，只看 capability 状态和用户动作建议。
6. 所有新增公共结构先写 schema / normalizer，再让旧返回兼容这个结构。
7. 平台限制必须在主进程或 platform adapter 成为权威判断；renderer 只负责展示，不能作为阻止 PowerShell、COM、`taskkill` 或外部路径打开的唯一防线。

## 5. Platform Adapter 设计

### 5.1 Adapter 总入口

`code/desktop/platform/index.js` 应提供稳定入口：

```js
const platform = require("./platform");

platform.runtime.resolveLibreOffice(options);
platform.office.healthCheck(options);
platform.process.terminateTree(pid);
platform.capabilities.getAll();
```

适配层只做平台能力，不直接操作 DOM，不直接发 IPC，不读 renderer 状态。

### 5.2 Capability 统一结构

```js
{
  ok: true,
  platform: "darwin",
  capability: "libreoffice",
  source: "system_app",
  path: "/Applications/LibreOffice.app/Contents/MacOS/soffice",
  version: "26.8.0.3",
  warnings: [],
  checkedAt: "2026-08-28T00:00:00.000Z",
  actions: []
}
```

失败：

```js
{
  ok: false,
  platform: "darwin",
  capability: "office-com",
  source: "",
  path: "",
  version: "",
  warnings: [],
  errorCode: "PLATFORM_UNSUPPORTED",
  message: "macOS 不支持 Windows Office COM 高保真导出，请切换 LibreOffice。",
  actions: ["切换到 LibreOffice 导出", "安装 macOS LibreOffice"]
}
```

### 5.3 Windows Adapter 边界

必须留在 `platform/win32`：

- `powershell.exe` 绝对路径查找。
- `runPowerShellScript`、`parsePowerShellJsonOutput`、GB18030 解码。
- Office COM health check / fix / export scripts。
- `taskkill /T /F` process tree cleanup。
- Windows embedded LibreOffice runtime、注册表、`where soffice.exe`、`soffice.com` fallback。
- VC redist 检查和提示。

### 5.4 macOS Adapter 边界

必须留在 `platform/darwin`：

- 系统 LibreOffice / Homebrew LibreOffice 探测。
- `LIBREOFFICE_PATH` custom path。
- Node spawn 执行 `soffice`。
- `child.kill()` / process group 终止策略。
- macOS bundle、dmg、zip 相关打包配置。
- `.app` 打开、权限提示、Finder 路径打开等系统行为。

macOS 不应执行：

- `taskkill`
- `reg query`
- `where soffice.exe`
- PowerShell Office COM 脚本
- Windows embedded LibreOffice runtime 检查
- VC redist 修复

## 6. 导出链路落地

### 6.1 当前链路

当前 `convert:documents` 主要在 `main.js` 中完成：

1. renderer 提交文件、输出目录、倍率、页数和导出引擎。
2. 主进程扫描可导出类型。
3. 非 PDF 文件先转 PDF。
4. PDF 再渲染为图片。
5. 长任务通过 progress IPC 回传。
6. 用户取消时终止活跃 LibreOffice / Office 进程。

### 6.2 macOS 第一版导出链路

```text
doc/docx/ppt/pptx
  -> platform.darwin.runtime.resolveLibreOffice()
  -> export service spawn soffice --headless --convert-to pdf
  -> wait output pdf
  -> shared PDF render service
  -> PNG output
```

要求：

- 每个转换任务使用独立 LibreOffice profile 目录。
- 输出目录不能依赖当前工作目录。
- timeout、stdout、stderr、exitCode、runtimePath 必须进入 diagnostics。
- 缺 runtime 时返回 `LO_MISSING_BINARY`，UI 提供安装/配置动作。
- 用户取消后不留下 active pid 记录。

### 6.3 Office 高保真模式

macOS 第一版将 Office COM 标记为不可用：

- `office-com` capability: `PLATFORM_UNSUPPORTED`
- UI 下拉可显示“仅 Windows 可用”或选择后弹出解释。
- 若未来评估 AppleScript/JXA，应作为独立 P2 研究任务，不混入 LibreOffice 导出。

## 7. UI 和体验改造

当前导出页文案仍偏 Windows，例如“默认使用内置 LibreOffice”“安装到 C:\\Program Files”。Mac 主应用需要改成 capability-aware：

1. 导出引擎选项根据 capability 状态展示。
2. LibreOffice 弹窗根据 `platform` 和 `errorCode` 显示不同动作。
3. Office 高保真模式在 macOS 不应让用户误以为可以修复 COM。
4. 日志面板保留诊断细节，但用户主提示用清晰短句。
5. 设置页后续可增加“平台能力”诊断区，展示 runtime、字体、PDF、上传、下载状态。

UI 改造仍需遵守 preload / contextBridge 边界：renderer 只能通过 `window.appApi` 获取能力状态。

## 8. 打包和资源

### 8.1 electron-builder 策略

当前官方文档确认：

- electron-builder 可在 `package.json` 的 `build` 字段或外部配置文件定义配置。
- macOS 顶层 `mac` key 控制 macOS targets。
- macOS 默认 target 是 `zip` 和 `dmg`，`dir` 适合开发和调试。
- 平台配置可以覆盖 common build options。
- `actions/setup-node` 支持 npm cache 和 `cache-dependency-path`，不会缓存 `node_modules`。

本项目建议先从 `package.json` 内配置过渡到独立配置文件：

```text
code/desktop/electron-builder.base.yml
code/desktop/electron-builder.win.yml
code/desktop/electron-builder.mac.yml
```

也可以先保持 `package.json`，但必须把 `extraResources` 平台化，避免 macOS 打包读取不存在的 Windows runtime。

### 8.2 macOS packaging 第一版

脚本建议：

```json
{
  "dist:mac:dir": "electron-builder --mac dir --config electron-builder.mac.yml",
  "dist:mac": "electron-builder --mac dmg zip --config electron-builder.mac.yml"
}
```

第一版配置：

- `mac.target`: `dir`
- `mac.category`: `public.app-category.productivity`
- `mac.icon`: `assets/app-icon.icns`
- signing / notarization 后置；开发包明确 unsigned。
- `extraResources` 只包含跨平台 scripts / assets，不包含 Windows LibreOffice 和 VC redist。
- 在新增 `dist:mac:dir` 前，先拆分或覆盖当前顶层 `extraResources`；否则 electron-builder 仍会读取 public 仓库中不存在的 `vendor/libreoffice` 和 `vendor/redist/vc_redist.x64.exe`。

### 8.3 资源策略

- 字体二进制继续不进 public Git。
- Windows LibreOffice runtime 继续不进 public Git。
- VC redist exe 继续不进 public Git。
- macOS 使用系统 LibreOffice，不内置 runtime dump。
- 后续用 `runtime-manifest.json` 描述外部资源来源、版本、sha256、平台路径。

## 9. CI / QA 策略

### 9.1 Required CI

第一版 required checks：

- Windows：`npm --prefix code/desktop ci`
- Windows：`puzzle:shadow:smoke`
- Windows：`puzzle:text:smoke`
- macOS：`npm --prefix code/desktop ci`
- macOS：`puzzle:shadow:smoke`
- macOS：`puzzle:text:smoke`
- `git diff --check` 类空白检查可放在任一 OS。

### 9.2 Optional / Nightly

后置 optional checks：

- macOS LibreOffice runtime probe。
- macOS doc/ppt fixture 转 PDF smoke。
- Windows Office COM smoke。
- Windows embedded / external LibreOffice smoke。
- `dist:mac:dir`。
- `dist:win:dir`。
- release packaging。

### 9.3 本地验收顺序

每个 PR 至少：

```bash
git status --short
npm --prefix code/desktop run puzzle:shadow:smoke
npm --prefix code/desktop run puzzle:text:smoke
git diff --check
```

涉及 main process / adapter：

```bash
node --check code/desktop/main.js
node --check <changed-js-files>
```

涉及 Mac 打包：

```bash
npm --prefix code/desktop run dist:mac:dir
open code/desktop/dist/mac*/流量蜂虚拟笔记工具.app
```

涉及导出：

```bash
npm --prefix code/desktop run export:fixture:smoke
```

`export:fixture:smoke` 目前尚未实现，需要先新增脱敏 fixture。

## 10. 阶段路线

| 阶段 | 目标 | 依赖 | 验收 |
|---|---|---|---|
| M0 | 合并 PR #1，冻结 Mac runtime 探测基线 | 当前 PR | `platform/macos-bootstrap` 包含 Darwin runtime detection |
| M1 | 建立 platform adapter 壳 | M0 | `main.js` 通过统一入口调用平台能力 |
| M2 | 统一 capability / health 结构 | M1 | UI 和主进程可消费同一字段集合 |
| M3 | Mac 导出预检和 UI 文案 | M2 | macOS 上 Office COM 清晰不可用，LibreOffice 缺失提示正确 |
| M4 | Mac LibreOffice 导出 smoke | M2 | 脱敏 doc/ppt fixture 可转 PDF / PNG |
| M5 | PDF / 图片 / 拼图 Mac 验证 | M0 | native 渲染依赖和拼图 smoke 稳定 |
| M6 | macOS unsigned packaging | M2 | `dist:mac:dir` 生成可打开 `.app` |
| M7 | GitHub Actions matrix | M0 | PR 有 Windows/macOS required checks |
| M8 | IPC shell 边界和长任务取消 hardening | M1 | 外链/路径打开有主进程白名单，网络长任务取消可中断当前请求 |
| M9 | 主应用模块拆分 | M1-M8 | `main.js` 明显减负，service 层边界稳定 |
| M10 | 资源 artifact / provisioning | M6 | 字体和 Windows runtime 不进 Git，但可复现安装 |
| M11 | 签名、公证、release | M6-M10 | tag 构建 dmg/zip，发布说明按平台分区 |

## 11. Review 和 Acceptance Gate

### Gate A：平台边界

通过条件：

- macOS 不再触发 PowerShell、`taskkill`、注册表、Windows `where`。
- Windows 旧导出链路仍能走原脚本。
- adapter 返回结构稳定。

### Gate B：导出能力

通过条件：

- PDF-only 不依赖 LibreOffice。
- Word/PPT 缺 LibreOffice 时不崩溃。
- 安装 LibreOffice 后可完成基础转换。
- 取消任务不会留下活跃 pid。

### Gate C：打包能力

通过条件：

- `dist:mac:dir` 可生成 `.app`。
- `.app` 能打开主界面。
- Mac 包不包含 Windows runtime / VC redist。
- 产物目录被 `.gitignore` 排除。

### Gate D：CI

通过条件：

- PR 上有 Windows 和 macOS 基础检查。
- required checks 不依赖本地字体二进制和 LibreOffice runtime。
- optional jobs 的失败不会阻断基础 PR。

## 12. 风险和处理

| 风险 | 影响 | 处理 |
|---|---|---|
| `main.js` 过大 | 平台改造容易互相冲突 | 先抽 adapter 壳，再迁移单一职责 |
| Windows 导出回退 | 老用户核心能力受损 | Windows adapter 保持旧行为，迁移后跑 Windows smoke |
| macOS 误触 PowerShell / Office COM | 用户选择 Office engine 后出现无意义失败或错误提示 | `runMicrosoftOfficeHealthCheck` / Office adapter 在非 Windows 先返回 `PLATFORM_UNSUPPORTED`，不进入脚本执行 |
| macOS LibreOffice 行为差异 | PPT/Word 排版可能变化 | 第一版承诺“可解释导出”，不承诺 COM 高保真 |
| 无脱敏 fixture | 导出回归无法常规化 | 新增 `code/desktop/test-fixtures/` 小样例 |
| 字体不入库 | 拼图字体一致性不稳定 | 第一版 fallback，后续 artifact/provisioning |
| macOS 打包误带 Windows 资源 | 构建失败或包体污染 | 平台化 `extraResources` |
| 主进程 shell IPC 过宽 | renderer 注入风险会扩大到任意 URL / 路径打开 | `openExternal` 仅允许明确 scheme；`openPath` 只允许来自用户选择或应用生成的已知路径 |
| 长任务取消不能中断当前网络请求 | 用户点击取消后仍要等待当前下载或上传完成 | 为 XHS 下载、飞书上传接入 AbortController / timeout，并统一进度收尾 |
| 签名公证缺账号 | 用户打开有 Gatekeeper 提示 | 第一版明确 unsigned，签名作为 P2 |
| npm audit 漏洞 | 发布合规风险 | 单独依赖治理 PR，不混入平台重构 |

## 13. 参考

- electron-builder configuration: https://www.electron.build/docs/configuration/
- electron-builder macOS targets: https://www.electron.build/docs/mac/
- electron-builder CLI target behavior: https://www.electron.build/docs/cli/
- GitHub Actions matrix: https://docs.github.com/actions/writing-workflows/choosing-what-your-workflow-does/running-variations-of-jobs-in-a-workflow
- actions/setup-node cache: https://github.com/actions/setup-node
