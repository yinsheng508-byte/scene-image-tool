# macOS 主应用开发任务卡

> 日期：2026-08-28
> 使用方式：每张卡应对应一个小 PR。执行者必须先读本卡的 Context，再按 Acceptance 和 Validation 验收。
> 默认 cwd：`/Users/yinxinhe/dev/scene-image-tool`
> 默认 Node：`PATH="/opt/homebrew/opt/node@22/bin:$PATH"`

## 总体依赖图

```text
MAC-00
  -> MAC-01
    -> MAC-02
      -> MAC-03
        -> MAC-04
        -> MAC-05
      -> MAC-06
    -> MAC-07
  -> MAC-08
  -> MAC-09
    -> MAC-10
      -> MAC-11
  -> MAC-13
```

可并行：

- `MAC-07` CI 可在 `MAC-01` 后并行做基础版。
- `MAC-08` fixture 可与 adapter 工作并行，但不能改主导出逻辑。
- `MAC-09` UI 文案可在 `MAC-03` capability 结构稳定后做。
- `MAC-13` 可在 `MAC-01` 后独立做 hardening，但涉及 `preload.js` 时需要避开 UI/capability PR。

高冲突文件：

- `code/desktop/main.js`
- `code/desktop/renderer/renderer.js`
- `code/desktop/renderer/index.html`
- `code/desktop/preload.js`
- `code/desktop/package.json`

这些文件相关 PR 需要串行合并。

## 代码审查校准

本任务卡已按 2026-08-28 代码审查结果校准，后续执行时先把以下风险当作已确认事实，而不是待发现问题：

- `runMicrosoftOfficeHealthCheck()` 当前没有非 Windows 早退，macOS 选择 Office engine 仍可能进入 PowerShell 执行链路。
- `runLibreOfficeHealthCheck()` 和 renderer LibreOffice 弹窗仍存在 Windows 修复文案，macOS 上系统 LibreOffice 不应被描述为 Full 安装包 fallback。
- MAC-06 已把 `package.json` 顶层 `build.extraResources` 平台化，Windows runtime / redist 留在 `win.extraResources`，macOS 打包不再读取这些资源。
- `scripts/check-lo-runtime.js` 是 Windows embedded runtime 完整性检查，不应作为 macOS runtime 探测命令。
- `shell:openExternal` / `shell:openPath`、长任务网络取消需要独立 hardening，不要在新增 Mac UI 时继续扩大 IPC 暴露面。

## MAC-00：合并 macOS LibreOffice runtime detection

Priority：P0
Platform：macOS / Shared
Branch：`platform/macos-runtime-detection`
PR：#1

Objective：

把 Darwin LibreOffice runtime 探测合并为 macOS 开发基线。

Context to read：

- `AGENTS.md`
- `docs/current/WORKING_CONTEXT.md`
- `docs/current/tasks.md`
- `docs/current/session-log.md`
- `code/desktop/platform/darwin/libreoffice-runtime.js`
- `code/desktop/main.js`

Scope：

- 仅复核和合并 PR #1。
- 如有冲突，仅解决 PR #1 范围内的 runtime detection / docs 冲突。

Out of scope：

- 不新增打包脚本。
- 不迁移 Windows adapter。
- 不改 UI 文案。

Steps：

1. 查看 PR 状态和 diff。
2. 确认本地 smoke 记录完整。
3. 合并到 `platform/macos-bootstrap`。
4. 更新本地 `platform/macos-bootstrap`。

Acceptance：

- `platform/macos-bootstrap` 包含 Darwin runtime detection。
- Electron 启动自检在已安装 LibreOffice 的 Mac 上显示 `source=system_app` 或 Homebrew source。
- 缺失路径测试返回结构化 `LO_MISSING_BINARY`。

Validation：

```bash
git switch platform/macos-bootstrap
git pull --ff-only
PATH="/opt/homebrew/opt/node@22/bin:$PATH" node --check code/desktop/main.js
PATH="/opt/homebrew/opt/node@22/bin:$PATH" node --check code/desktop/platform/darwin/libreoffice-runtime.js
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --prefix code/desktop run puzzle:shadow:smoke
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --prefix code/desktop run puzzle:text:smoke
```

Deliverables：

- Merged PR。
- `docs/current/session-log.md` 更新合并结果。

Risks and rollback：

- 若 Windows 路径意外变化，revert PR #1 commit，并保留文档记录。

## MAC-01：建立 platform adapter 总壳

Priority：P0
Platform：Shared
Branch：`platform/macos-adapter-boundary`
Status：已完成，PR #3 已合并。

Objective：

建立稳定的 `platform/index.js`、common result helper 和当前平台选择逻辑，让后续改造有统一入口。

Context to read：

- `docs/current/macos-main-app-development-requirements.md`
- `docs/architecture/map.md`
- `docs/architecture/do-not-break.md`
- `docs/architecture/gates.md`
- `code/desktop/main.js`
- `code/desktop/platform/darwin/libreoffice-runtime.js`

Scope：

- 新增 `code/desktop/platform/index.js`。
- 新增 `code/desktop/platform/common/capability-result.js`。
- 将 Darwin runtime detection 从直接 require 过渡到 platform 总入口。
- Windows 先提供 passthrough / placeholder，不改变旧行为。

Out of scope：

- 不迁移 Office COM 转换。
- 不改 renderer UI。
- 不改打包配置。

Steps：

1. 定义 capability success/failure normalizer。
2. 定义 adapter shape：`runtime`、`process`、`office`、`packaging`。
3. 在 `main.js` 只替换 macOS LibreOffice resolve 的入口来源。
4. 确认 Windows 没有行为变化。

Acceptance：

- `main.js` 通过 `platform.runtime.resolveLibreOffice()` 获取 macOS runtime。
- 旧的 Windows runtime resolve 仍保留原逻辑。
- capability result 字段稳定并有单测或脚本级验证。

Validation：

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" node --check code/desktop/main.js
PATH="/opt/homebrew/opt/node@22/bin:$PATH" node --check code/desktop/platform/index.js
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --prefix code/desktop run puzzle:shadow:smoke
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --prefix code/desktop run puzzle:text:smoke
git diff --check
```

Deliverables：

- platform 总入口和 common helper。
- `docs/architecture/map.md`、`capabilities.md` 更新。
- `docs/current/tasks.md`、`session-log.md`、`WORKING_CONTEXT.md` 更新。

Risks and rollback：

- 风险是提前抽象过度。若 adapter shape 不稳定，回滚总入口，保留 Darwin runtime 模块直连。

## MAC-02：抽出跨平台进程终止能力

Priority：P0
Platform：Shared / Windows / macOS
Branch：`platform/process-adapter`
Status：已完成，PR #4 已合并。

Objective：

把 `taskkill` 与 macOS `child.kill()` / process group 终止隔离到 platform adapter，保证导出取消语义跨平台一致。

Context to read：

- `docs/architecture/do-not-break.md`
- `docs/architecture/gates.md`
- `code/desktop/main.js` 中 `killProcessTreeByPid`、`terminateActiveLibreOfficeProcesses`、`terminateActiveOfficeProcesses`
- `code/desktop/scripts/ppt-export-smoke.js`

Scope：

- 新增 `platform/win32/process-tree.js`。
- 新增 `platform/darwin/process-tree.js`。
- 新增 `platform/common/process-utils.js`。
- `main.js` 调用 platform process adapter。

Out of scope：

- 不改具体转换命令。
- 不改用户取消按钮 UI。

Steps：

1. 迁出 `killProcessTreeByPid`。
2. Windows adapter 保持 `taskkill /T /F`。
3. macOS adapter 使用 `process.kill(pid, "SIGTERM")`，必要时为后续 process group 预留接口。
4. 确认 active pid set 清理逻辑不变。

Acceptance：

- macOS 取消不会调用 `taskkill`。
- Windows 仍调用 `taskkill /T /F`。
- `convert:cancel` 返回结构不变。

Validation：

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" node --check code/desktop/main.js
PATH="/opt/homebrew/opt/node@22/bin:$PATH" node --check code/desktop/platform/darwin/process-tree.js
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --prefix code/desktop run puzzle:shadow:smoke
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --prefix code/desktop run puzzle:text:smoke
git diff --check
```

Deliverables：

- Process adapter。
- 更新 `do-not-break.md` 中进程取消边界。

Risks and rollback：

- macOS LibreOffice 子进程可能继续存活；如发现，追加 process group 方案，不回退到 shell 杀进程。

## MAC-03：统一导出 capability / health 返回结构

Priority：P0
Platform：Shared
Branch：`feature/shared-capability-status`
Status：已完成，PR #5 已合并。

Objective：

让 `export:healthCheck`、`office:healthCheck` 和后续 UI 都消费统一 capability/health 结构，不再直接依赖底层脚本细节。

Context to read：

- `docs/current/macos-main-app-development-requirements.md`
- `docs/architecture/gates.md`
- `code/desktop/main.js` 中 `runLibreOfficeHealthCheck`、`runMicrosoftOfficeHealthCheck`、`runExportEngineHealthCheck`
- `code/desktop/renderer/renderer.js` 中 `checkOfficeEngineForModal`、`openLibreOfficeModal`、`openOfficeEngineModal`

Scope：

- 新增 common health normalizer。
- 主进程 health check 返回兼容旧字段，同时新增 `capabilities` 或 `capability` 字段。
- macOS Office COM 返回 `PLATFORM_UNSUPPORTED`。
- `office:healthCheck` 作为历史兼容 alias 保留；新代码以 `export:healthCheck` / `capability:getAll` 为权威入口。

Out of scope：

- 不重做 UI 样式。
- 不实现 AppleScript/JXA Office。

Steps：

1. 定义 `normalizeHealthReport()`。
2. LibreOffice health 把 runtime capability 放入顶层。
3. Office health 在 macOS 直接返回 unsupported，并且必须早于任何 `runPowerShellWithOutput("office-health-check.ps1")` 调用。
4. `convert:documents` 选择 Office engine 时也走同一 unsupported 结果，不另起 PowerShell 预检。
5. 保留 `score`、`blockExport`、`warnings`、`suggestions` 兼容旧 UI。

Acceptance：

- macOS 选择 Office engine 时不会尝试 PowerShell。
- LibreOffice 缺失时 `blockExport=true`，`errorCode=LO_MISSING_BINARY`。
- `office:healthCheck` 的兼容行为有文档说明，不再被当作新的 Office COM health API 使用。
- 旧 renderer 不崩溃。

Validation：

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" node --check code/desktop/main.js
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --prefix code/desktop run puzzle:shadow:smoke
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --prefix code/desktop run puzzle:text:smoke
git diff --check
```

Deliverables：

- Health normalizer。
- capability 字段约定写入 `docs/architecture/capabilities.md`。

Risks and rollback：

- 旧 UI 依赖 `score/blockExport`；必须双写兼容，不能直接删旧字段。

## MAC-04：Mac 导出预检 UI 文案和交互

Priority：P1
Platform：macOS / Renderer
Branch：`platform/macos-export-preflight-ui`
Status：已完成，PR #6 已合并。

Objective：

让导出页在 macOS 上清晰表达 LibreOffice / Office 能力状态，减少 Windows 文案误导。

Context to read：

- `docs/architecture/components.md`
- `docs/architecture/gates.md`
- `code/desktop/renderer/index.html`
- `code/desktop/renderer/renderer.js`
- `code/desktop/renderer/styles.css`

Scope：

- 导出引擎下拉文案。
- LibreOffice 运行时弹窗文案。
- Office 高保真弹窗 macOS unsupported 状态。
- 日志诊断文本。

Out of scope：

- 不新增完整设置页。
- 不改变导出业务流程。
- 不改变授权逻辑。

Steps：

1. Renderer 从 health report 读取 `platform/errorCode/actions`。
2. macOS 缺 LibreOffice 时提示安装 Homebrew cask 或设置 `LIBREOFFICE_PATH`。
3. macOS Office COM 不可用时提供“切回 LibreOffice”主动作。
4. runtime source 为 `system_app` / Homebrew 时不显示“内置运行时不可用”或“重装 Full 安装包”主文案。
5. 保持现有 modal 样式，不新增第二套弹窗系统。

Acceptance：

- macOS 不出现 `C:\\Program Files`、VC redist、Full 安装包等 Windows 修复主文案。
- Office engine 在 macOS 显示不可用且不会继续导出。
- LibreOffice engine 在 runtime ok 时不阻断导出。

Validation：

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" node --check code/desktop/renderer/renderer.js
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --prefix code/desktop run puzzle:shadow:smoke
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --prefix code/desktop run puzzle:text:smoke
git diff --check
```

Manual QA：

- `npm exec electron .`
- 打开文档导出页。
- 切换 Office engine。
- 触发 LibreOffice 重新检测。

Deliverables：

- UI 文案和交互调整。
- 截图或手工冒烟记录写入 `session-log.md`。

Risks and rollback：

- 文案变化可能影响 Windows 用户理解；所有平台文案必须按 `report.platform` 分支，不改 Windows 默认。

## MAC-05：Mac LibreOffice 导出 smoke 和脱敏 fixture

Priority：P1
Platform：macOS / Shared
Branch：`platform/macos-export-smoke`
Status：已完成，PR #7 已合并。

Objective：

建立可重复的 macOS 文档导出 smoke，让 doc/ppt 到 PDF/PNG 不只靠人工试。

Context to read：

- `docs/architecture/resources.md`
- `docs/architecture/gates.md`
- `code/desktop/scripts/ppt-export-smoke.js`
- `code/desktop/main.js` 导出链路
- `code/desktop/test-fixtures/` 策略

Scope：

- 新增脱敏小型 fixture。
- 新增 `export:fixture:smoke` 或 `lo:export:smoke` npm script。
- 覆盖 docx/pptx 至少各 1 个基础样例。

Out of scope：

- 不提交真实客户样例。
- 不测试大文件性能。
- 不把字体二进制放入 Git。

Steps：

1. 创建 `code/desktop/test-fixtures/export-basic/`。
2. 准备可公开的小 docx/pptx。
3. 新增 Node smoke 脚本，调用 LibreOffice runtime 并检查 PDF/PNG 输出。
4. 输出 JSON report 到 ignored 临时目录。

Acceptance：

- macOS 安装 LibreOffice 时 smoke 通过。
- 未安装 LibreOffice 时 smoke 返回明确 skip 或 structured failure，不误报 pass。
- fixture 总体积小，可进入 Git。

Validation：

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --prefix code/desktop run export:fixture:smoke
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --prefix code/desktop run puzzle:shadow:smoke
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --prefix code/desktop run puzzle:text:smoke
git diff --check
```

Deliverables：

- Fixture。
- Smoke script。
- 资源策略文档更新。

Risks and rollback：

- Office 文件二进制可能变大；提交前做 size check，必要时只提交生成脚本和 tiny fixture。

## MAC-06：macOS unsigned app bundle

Priority：P1
Platform：macOS / Packaging
Branch：`platform/macos-package-dir`
Status：已完成，PR #8 已合并。

Objective：

实现 `dist:mac:dir`，生成可打开的 unsigned macOS `.app`，且不带 Windows runtime / redist。

Context to read：

- `docs/current/macos-main-app-development-requirements.md`
- `code/desktop/package.json`
- `code/desktop/assets/`
- `docs/architecture/resources.md`

Scope：

- `package.json` scripts。
- electron-builder mac config。
- `assets/app-icon.icns` 或图标生成脚本。
- 平台化 `extraResources`。

Out of scope：

- 不做签名、公证、自动更新。
- 不生成 release dmg 作为 required。

Steps：

1. 选择配置形态：继续 `package.json` 或新增 `electron-builder.mac.yml`。
2. 加 `dist:mac:dir`。
3. 准备 `.icns`。
4. macOS `extraResources` 排除 `vendor/libreoffice` 和 `vendor/redist`。
5. 执行本地打包和打开 `.app`。

Acceptance：

- `npm --prefix code/desktop run dist:mac:dir` 成功。
- `.app` 能打开主界面。
- `dist/` 被 Git 忽略。
- app bundle 不包含 Windows LibreOffice runtime 和 VC redist exe。
- generic `dist` / `dist:dev` 在平台配置未拆好前不得作为 macOS 验收命令。

Validation：

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --prefix code/desktop run dist:mac:dir
find code/desktop/dist -maxdepth 5 -iname '*vc_redist*' -o -iname 'soffice.exe'
git status --ignored --short code/desktop/dist
```

Deliverables：

- macOS package config。
- app bundle 验证记录。

Risks and rollback：

- electron-builder 配置可能影响 Windows；本阶段只把 Windows 资源移动到 `win.extraResources`，Windows 实机打包需后续复测。

## MAC-07：GitHub Actions 基础 CI matrix

Priority：P1
Platform：Infra
Branch：`infra/github-desktop-ci`
Status：已完成，PR #9 已合并。

Objective：

让每个 PR 自动跑 Windows 和 macOS 基础检查，先保护 `npm ci` 和 puzzle smoke。

Context to read：

- `docs/current/win-mac-parallel-development.md`
- `.github/workflows/` 当前状态
- `code/desktop/package.json`
- GitHub Actions matrix 官方文档
- `actions/setup-node` 官方 README

Scope：

- 新增 `.github/workflows/desktop-ci.yml`。
- Windows/macOS matrix。
- Node 22。
- npm cache with `cache-dependency-path: code/desktop/package-lock.json`。

Out of scope：

- 不把 LibreOffice / font / package jobs 设为 required。
- 不发布 artifacts。
- 第一版 CI 不运行 `dist:dev`、`dist:mac:dir`、`font:probe`、`check:lo-runtime`。

Steps：

1. 新增 workflow。
2. 设置 `fail-fast: false`。
3. 跑 `npm ci` 和两个 puzzle smoke。
4. 可选增加 `git diff --check`。
5. PR 上确认 checks 出现。

Acceptance：

- PR 能看到 Windows/macOS 两个基础 job。
- job 不依赖字体二进制、Windows runtime、LibreOffice。
- workflow 不调用任何打包脚本。
- 失败时日志能定位到具体 OS。

Validation：

```bash
git diff --check
```

Remote QA：

- 推分支后查看 GitHub Actions。

Deliverables：

- `desktop-ci.yml`。
- PR checks 链接。

Risks and rollback：

- npm native dependency 在 runner 上失败；先作为 required 前手工观察一次，必要时拆成 bootstrap job 和 optional native job。

## MAC-08：Mac PDF / 拼图 / 图片能力验收矩阵

Priority：P1
Platform：macOS / QA
Branch：`platform/macos-render-qa`
Status：已完成，PR #10 已合并。

Objective：

确认 macOS 主应用的图片核心能力稳定，包括 PDF 渲染、场景化图片排版、百变拼图。

Context to read：

- `docs/architecture/components.md`
- `docs/architecture/capabilities.md`
- `code/desktop/renderer/compose.*`
- `code/desktop/renderer/puzzle/*`
- `code/desktop/shared/*`

Scope：

- 增加 smoke 或手工 QA checklist。
- 必要时补小型 image/pdf fixture。
- 不改业务渲染算法，除非发现 Mac-only bug。

Out of scope：

- 不做大规模 UI redesign。
- 不改模板业务规则。

Steps：

1. 盘点当前 puzzle smoke 覆盖。
2. 补 PDF render smoke 或手工验收项。
3. 补 compose 导出手工验收。
4. 将结果写入 acceptance。

Acceptance：

- Mac 上 puzzle shadow/text smoke 通过。
- PDF 渲染基础样例输出 PNG。
- Compose 可选择图片、导出图片。

Validation：

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --prefix code/desktop run puzzle:shadow:smoke
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --prefix code/desktop run puzzle:text:smoke
```

Deliverables：

- QA matrix 文档或新增 smoke。
- `docs/current/acceptance.md` 更新。

Risks and rollback：

- Mac 字体差异导致像素回归不稳定；阈值调整必须有截图/指标依据。

## MAC-09：平台能力设置页 / 诊断区

Priority：P2
Platform：Renderer / Shared
Branch：`feature/platform-capability-panel`
Status：已完成，PR #11 已合并。

Objective：

在主应用设置或导出页增加平台能力诊断区，让用户知道当前 Mac 哪些能力可用、缺什么、下一步怎么修。

Context to read：

- `docs/architecture/components.md`
- `docs/architecture/gates.md`
- `code/desktop/renderer/index.html`
- `code/desktop/renderer/renderer.js`
- `code/desktop/preload.js`
- `code/desktop/main.js`

Scope：

- 消费 MAC-03 已新增的 `window.appApi.getCapabilities()`。
- Renderer 用已有 panel / toast / modal 样式展示平台能力。
- 必要时补充 PDF render、font、packaging 等 capability 项，但不重复实现底层 LibreOffice / Office COM 汇总入口。

Out of scope：

- 不新增 Node direct access。
- 不做设置页大改版。

Steps：

1. 调用 `window.appApi.getCapabilities()` 获取平台能力。
2. UI 展示 LibreOffice、Office COM、PDF render、font、packaging 状态。
3. 每项提供 `message/actions`。

Acceptance：

- macOS 上能看到 LibreOffice ok、Office COM unsupported。
- Windows 上能看到 Office / LibreOffice 原有能力状态。
- renderer 不包含底层命令判断。

Validation：

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" node --check code/desktop/main.js
PATH="/opt/homebrew/opt/node@22/bin:$PATH" node --check code/desktop/preload.js
PATH="/opt/homebrew/opt/node@22/bin:$PATH" node --check code/desktop/renderer/renderer.js
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --prefix code/desktop run puzzle:shadow:smoke
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --prefix code/desktop run puzzle:text:smoke
```

Deliverables：

- Capability UI。
- Electron DOM / 布局验收记录：macOS 显示 5 项 capability，刷新按钮可恢复，无横向溢出和元素重叠；系统截图受其他前台窗口遮挡，未作为有效截图证据。

Risks and rollback：

- 设置页复杂度上升；若 UI 变动过大，先退回为日志输出和导出页弹窗。

## MAC-10：主进程 service 层拆分

Priority：P2
Platform：Shared Architecture
Branch：`refactor/main-process-services`

Objective：

逐步把 `main.js` 中稳定业务域拆到 service 层，降低后续 Mac 主应用开发冲突。

Context to read：

- `docs/architecture/map.md`
- `docs/architecture/do-not-break.md`
- `code/desktop/main.js`
- `code/desktop/preload.js`

Scope：

- 每个 PR 只迁移一个 service：
  - settings
  - dialogs/files
  - export
  - puzzle
  - upload
  - xhs
  - license
- 先抽纯函数和 helper，再抽 IPC registration。

Out of scope：

- 不改变 renderer API。
- 不改变数据目录和用户配置格式。
- 不同时迁移多个业务域。

Steps：

1. 选择最小风险 service，例如 settings 或 dialogs。
2. 创建 service 模块。
3. `main.js` 保持 IPC 名称不变，只委派 service。
4. 跑对应 smoke。

Acceptance：

- `main.js` 行数逐步下降。
- IPC contract 不变。
- 用户数据路径不变。

Validation：

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" node --check code/desktop/main.js
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --prefix code/desktop run puzzle:shadow:smoke
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --prefix code/desktop run puzzle:text:smoke
git diff --check
```

Deliverables：

- 一个 service 模块。
- 架构文档更新。

Risks and rollback：

- 大文件拆分容易引入隐性顺序依赖；每次只拆一块，失败可整块 revert。

## MAC-11：资源 artifact / provisioning

Priority：P2
Platform：Infra / Release
Branch：`infra/runtime-artifact-provisioning`

Objective：

让字体、Windows LibreOffice runtime、VC redist 等大资源不进入 Git，但开发和打包可复现。

Context to read：

- `docs/architecture/resources.md`
- `code/desktop/vendor/README.md`
- `code/desktop/fonts/README.md`
- `code/desktop/package.json`

Scope：

- 新增 runtime manifest。
- 新增 provisioning script。
- 校验 sha256。
- 文档化本地安装步骤。

Out of scope：

- 不上传未授权字体。
- 不把 runtime dump commit 进 Git。

Steps：

1. 定义 `code/desktop/resources/runtime-manifest.json`。
2. 明确每个资源的 source、version、sha256、target path。
3. 写 provisioning script，支持 dry-run。
4. 更新 runbook。

Acceptance：

- 新 clone 可通过文档准备本地资源。
- 大文件不进入 Git。
- sha256 校验失败时阻断。

Validation：

```bash
git status --ignored --short code/desktop/fonts code/desktop/vendor code/desktop/dist
git diff --check
```

Deliverables：

- Manifest。
- Provisioning script。
- 资源治理文档。

Risks and rollback：

- 资源授权不清会阻断公开分发；未经确认只写 manifest，不上传资源。

## MAC-12：macOS 签名、公证和发布

Priority：P2
Platform：macOS / Release
Branch：`platform/macos-release-signing`

Objective：

在 unsigned app bundle 稳定后，接入 Developer ID 签名、公证和正式 dmg/zip 发布。

Context to read：

- `docs/current/macos-main-app-development-requirements.md`
- `code/desktop/package.json`
- Apple Developer 账号资料和证书配置，不能写入 Git
- electron-builder macOS docs

Scope：

- signing config。
- notarization config。
- release workflow。
- secrets 使用 GitHub Actions encrypted secrets。

Out of scope：

- 不把证书、Apple ID、密码、API key 写入仓库。
- 不影响 unsigned dev build。

Steps：

1. 明确 Apple Developer 账号和证书。
2. 本地验证签名。
3. GitHub Actions 使用 secrets。
4. tag 触发正式 dmg/zip。
5. 写 release notes 模板。

Acceptance：

- tag build 生成 signed + notarized dmg/zip。
- 用户下载后 Gatekeeper 不阻断。
- secrets 未出现在日志和仓库中。

Validation：

```bash
codesign --verify --deep --strict <app>
spctl --assess --type execute <app>
```

Deliverables：

- Release workflow。
- Signing runbook。
- 发布验收记录。

Risks and rollback：

- 签名失败不能阻断日常开发；保留 `dist:mac:dir` unsigned 路径作为 fallback。

## MAC-13：IPC shell 边界和长任务取消 hardening

Priority：P1
Platform：Shared Security / Runtime
Branch：`hardening/ipc-shell-and-cancel`

Objective：

收紧主进程 shell 类 IPC，并让飞书上传、小红书下载这类网络长任务在用户取消时能尽快停止当前请求。

Context to read：

- `docs/architecture/do-not-break.md`
- `docs/architecture/gates.md`
- `code/desktop/main.js` 中 `shell:openExternal`、`shell:openPath`、`feishu:*`、`xhs:*`
- `code/desktop/preload.js`
- `code/desktop/renderer/renderer.js`
- `code/desktop/renderer/license/ui.js`

Scope：

- `shell:openExternal` 主进程侧 URL scheme allowlist，默认只允许 `https:`。
- `shell:openPath` 明确调用场景和路径约束，优先打开用户选择目录、应用生成目录或已知下载 URL。
- XHS 下载接入 timeout / AbortController，`xhs:cancel` 可中断当前 fetch。
- 飞书上传接入 timeout / AbortController 或等价取消模型，`feishu:cancel` 可中断当前 upload。
- preload 事件 listener 返回 unsubscribe，避免重复注册造成进度日志翻倍。

Out of scope：

- 不改变授权 API。
- 不重写飞书或小红书业务规则。
- 不新增 renderer Node direct access。

Steps：

1. 定义 shell IPC allowlist 和错误返回结构。
2. 收窄 `openExternal` scheme，并为拦截场景返回清晰 `errorCode/message`。
3. 为 `openPath` 建立路径来源约束或调用级 action 参数。
4. 为 XHS 下载和飞书上传建立可取消请求控制器。
5. preload progress listener 返回取消订阅函数。
6. 更新 gates / capabilities 文档。

Acceptance：

- renderer 不能通过暴露 API 打开任意非 `https:` 外部链接。
- Mac/Windows 上取消 XHS 下载时不会等待当前网络请求自然结束。
- Mac/Windows 上取消飞书上传时进度能稳定收尾。
- 重复初始化 UI 不会重复消费同一 progress event。
- `contextIsolation: true`、`nodeIntegration: false` 保持不变。

Validation：

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" node --check code/desktop/main.js
PATH="/opt/homebrew/opt/node@22/bin:$PATH" node --check code/desktop/preload.js
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --prefix code/desktop run puzzle:shadow:smoke
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --prefix code/desktop run puzzle:text:smoke
git diff --check
```

Deliverables：

- IPC hardening patch。
- 网络取消验收记录。
- `docs/architecture/gates.md` / `docs/architecture/capabilities.md` 更新。

Risks and rollback：

- 外链和路径打开过度收窄可能影响更新下载、导出目录打开；先记录所有现有调用点，再按调用场景放行。
