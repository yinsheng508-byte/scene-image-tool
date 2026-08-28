# Working Context

> 每次开工必读。记录当前真实状态，不记录理想状态。

## 当前阶段

Standard-Development：GitHub public 首次上线已完成；采用 GitHub-ready 干净导出仓库，不公开当前迁移仓库历史。macOS 首次 clone、依赖安装、Electron 开发启动、基础 puzzle smoke、Darwin LibreOffice runtime 探测、导出 fixture smoke、unsigned app bundle、基础 CI matrix、Mac 渲染 QA 矩阵和 MAC-09 平台能力设置页 / 诊断区已完成；Mac 主应用开发改造需求和任务卡已落地，并已按代码全面审查结果校准。PR #1、PR #2、PR #3、PR #4、PR #5、PR #6、PR #7、PR #8、PR #9 和 PR #10 已合并到 `platform/macos-bootstrap`；当前 `feature/platform-capability-panel` 已完成实现，待 PR/CI/合并。

## 当前最高优先级任务

当前目标：以 GitHub public 干净基线作为 Windows / macOS 并行开发起点。当前迁移仓库历史仍不能公开推送；已通过 GitHub-ready 干净导出仓库上线 public 远端。

GitHub public 远端：

- 仓库：`https://github.com/yinsheng508-byte/scene-image-tool`
- 默认分支：`main`
- macOS 基线分支：`platform/macos-bootstrap`
- 远端提交：`main` 和 `platform/macos-bootstrap` 保持同步，当前 HEAD 以 GitHub refs 为准

迁移进度：

- Phase 0：冻结和保护现场，已完成。
- Phase 1：安装 AI 协作治理脚手架，已完成。
- Phase 2：建立根忽略规则和产物策略，已完成。
- Phase 3：从索引移除明确构建产物，已完成。
- Phase 4：迁移 `desktop/` 到 `code/desktop/`，已完成。
- Phase 5：重排历史文档，已完成。
- Phase 6：治理大资源，已完成。
- Phase 7：根目录清理，已完成。
- Phase 8：验证、收口和验收，已完成。
- 迁移后规范检查：已完成。
- 迁移后本地构建垃圾清理：已完成。
- GitHub 同步与 macOS 准备审计：已完成，用户已确认 public 干净导出路线。
- GitHub 公开同步执行手册：已完成；public 远端已上线并完成 clone 验收。
- Windows / macOS 并行开发方案：已完成。
- macOS 开发落地指令：已新增。
- macOS 主应用开发改造规划：已新增 `docs/current/macos-main-app-development-requirements.md` 和 `docs/current/macos-main-app-task-cards.md`。
- macOS 代码全面审查与文档校准：已完成，已把当前真实风险回写到需求、任务卡、资源、能力、闸口和并行开发文档。
- 当前后续任务：提交并推送 `feature/platform-capability-panel`，为 MAC-09 开 PR；CI 通过并合并后，回到 `platform/macos-bootstrap`，再进入 MAC-10 主进程 service 层最小拆分。

## 上次停在哪里

已创建迁移分支 `codex/project-structure-template-migration`，已完成 `ai-project-template` 治理脚手架、根 `.gitignore`、索引产物清理、代码目录迁移、历史文档归档、资源治理、根目录清理和自动化验收。迁移后已继续完成文档/代码规范检查和本地构建垃圾清理。当前已完成 GitHub 同步审计、Windows / macOS 并行开发方案、GitHub 公开同步、macOS 开发落地手册、macOS 首次开发启动验证、Darwin LibreOffice runtime 探测，以及 Mac 主应用开发改造规划。

## 已验证 vs 仍是猜测

已验证：

- 当前迁移基线提交：`e538575 chore: align post-migration docs and font enum smoke`。
- 当前清理后提交：`13ac1b3 chore: remove local build clutter`。
- 迁移分支：`codex/project-structure-template-migration`。
- 当前迁移仓库本身没有 Git remote；public GitHub 远端由干净导出仓库上线：`https://github.com/yinsheng508-byte/scene-image-tool`。
- GitHub CLI `gh` 已安装并登录到 `yinsheng508-byte`，不要在文档或输出中泄露 token。
- `git-lfs/3.7.0` 已安装，`git filter-repo` 当前不可用。
- Git 对象体量：loose 约 1.07 GiB，pack 约 1.71 GiB。
- 当前 HEAD 存在 100 MiB+ 文件：`code/desktop/vendor/libreoffice/program/mergedlo.dll` 约 140.85 MiB。
- 历史中存在多个 100 MiB+ blob：旧 LibreOffice MSI、样例 PPT、旧 `dist2` 安装包和 exe。
- 历史中出现过 `API_key.md` 和 `.claude/settings.local.json`，GitHub 同步前应按密钥泄露处理。
- 已新增 `.gitattributes`，用于 GitHub / macOS 协作时固定文本和二进制策略。
- 已新增 `docs/current/github-sync-macos-plan.md`，记录 GitHub-ready 同步路线和 macOS 分阶段改造方案。
- 已更新 `docs/current/github-public-sync-runbook.md`，记录 public clean export、GitHub REST API 上线过程和远端验收结果。
- 已更新 `docs/current/mac-development-runbook.md`，记录真实 GitHub 地址、Mac 首次环境、clone、启动、smoke 和每日开发命令。
- 已新增 `docs/current/win-mac-parallel-development.md`，记录 Windows / macOS 并行开发分支模型、平台 adapter、CI、GitHub Project 看板和发布策略。
- GitHub Actions 官方支持 workflow matrix 在多个 OS 上运行 job，hosted runners 支持 Windows 和 macOS，`actions/setup-node` 支持 npm cache；并行开发方案已按这些能力设计 CI 草案。
- 当前可运行应用目录为 `code/desktop/`。
- `code/desktop/main.js`、`code/desktop/renderer/renderer.js`、`code/desktop/renderer/puzzle/index.js` 是主要大文件热点。
- `code/desktop/vendor/`、`code/desktop/fonts/` 已造成明显仓库体量压力。
- `.gitignore` 已明确排除 GitHub-ready 公开仓库不应携带的 `code/desktop/vendor/libreoffice/` 和 `code/desktop/vendor/redist/vc_redist.x64.exe`。
- `code/desktop/vendor/README.md` 已记录 runtime 外部化策略。
- `D:\deptask\scene-image-tool-github-public` 已生成 GitHub-ready 干净仓库，分支为 `main`，共跟踪 144 个文件；该目录包含本地字体资源，用于 Windows 本地验证，不作为最终 public 首次线上基线。
- `D:\deptask\scene-image-tool-github-public-split` 已生成 public 首次线上基线；2026-08-28 补齐中文归档文档后，public 源码文件数为 157；只保留 `code/desktop/fonts/README.md`，不提交字体二进制。
- `D:\deptask\scene-image-tool-github-public-split` 的 `main` 和 `platform/macos-bootstrap` 已上线到 public GitHub。
- 远端 `main` 和 `platform/macos-bootstrap` 保持同步，当前 HEAD 以 GitHub refs 为准。
- 本轮普通 `git push` 因当前 Windows 网络 / TLS 问题多次失败，最终通过 GitHub REST Git Database API 写入远端；后续正常开发仍走普通 Git clone / branch / PR。
- 干净导出仓库仅包含一个新的公开基线历史，不包含当前迁移仓库 `.git` 历史。
- public 首次线上基线已确认不存在 95 MiB+ 文件；字体二进制不进入 public 首次线上基线。
- 干净导出仓库已确认不包含实际 `API_key.md`、`.claude/settings.local.json`、`.env*` 文件路径。
- 干净导出仓库中 `code/desktop/vendor/` 仅跟踪 `README.md` 和 `redist/vc_redist.x64.exe.sha256`。
- 干净导出仓库已执行 `npm --prefix code/desktop ci`、`font:probe`、`puzzle:shadow:smoke`、`puzzle:text:smoke` 并通过。
- 干净导出仓库的 `npm ci` 报告 21 个依赖漏洞，需后续依赖治理任务处理。
- 干净导出仓库和 public split 仓库中验证生成的 `code/desktop/dist/` 和 `code/desktop/node_modules/` 均为 ignored，不进入 Git。
- 已从 GitHub clone 验收 `platform/macos-bootstrap` 到 `D:\deptask\scene-image-tool-clone-verify-20260827-163358`，首次源码基线 tracked 文件数 117；2026-08-28 覆盖校验发现并补齐 40 份中文归档文档后，public 源码文件数为 157。
- 公开 clone 中 `npm --prefix code/desktop ci`、`puzzle:shadow:smoke`、`puzzle:text:smoke` 已通过；`npm ci` 仍报告 21 个依赖漏洞，后续独立治理。
- 2026-08-28 本地工作区与 GitHub public 的 hash 级对比已完成：`code/desktop/` 开发代码缺失 0、内容不一致 0；本地 dirty 的 20 个 public-eligible 开发文件均已存在于 GitHub 且内容一致。
- Phase 1 新增的根入口、`docs/current`、`docs/architecture`、`docs/workflows`、`docs/templates` 文件均已存在。
- `.migration-backups/`、根 ZIP 备份、`desktop - 副本/` 已物理删除；`node_modules/` 保留并被忽略。
- `desktop/dist2`、`desktop/_tmp`、`desktop/test_*.png` 已从 Git 索引清空，旧 `desktop/` 目录已不存在。
- `desktop/` 旧目录已不存在。
- `git ls-files desktop` 无跟踪条目。
- `code/desktop/package.json` 是当前应用入口。
- 2026-08-28 macOS 首次环境准备已完成：Xcode Command Line Tools 位于 `/Library/Developer/CommandLineTools`，Homebrew 位于 `/opt/homebrew/bin/brew`，git 位于 `/opt/homebrew/bin/git`，git-lfs 为 `3.7.1`，Homebrew `node@22` 可用且版本为 `v22.23.2`，npm 为 `10.9.8`，LibreOffice 为 `26.8.0.3`。
- 2026-08-28 macOS 已 clone public 仓库到 `~/dev/scene-image-tool`，当前分支 `platform/macos-bootstrap` 跟踪 `origin/platform/macos-bootstrap`，HEAD 为 `cb7307830cd428f6ff6d80415d448f0bbb047053`。
- 2026-08-28 macOS `npm --prefix code/desktop ci` 已通过，仍报告既有 21 个 npm audit 漏洞。
- 2026-08-28 macOS 初始 `cd code/desktop && npm exec electron .` 已能打开 Electron 主界面并持续运行；修复前启动日志曾出现 `[LO_RUNTIME_STARTUP] missing mode=auto checked=4`，说明当时探测尚未识别 macOS 系统 LibreOffice。
- 2026-08-28 macOS `npm --prefix code/desktop run puzzle:shadow:smoke` 已通过。
- 2026-08-28 macOS `npm --prefix code/desktop run puzzle:text:smoke` 已通过。
- 2026-08-28 已新增 `code/desktop/platform/darwin/libreoffice-runtime.js`，macOS 能识别 `/Applications/LibreOffice.app/Contents/MacOS/soffice`、`/opt/homebrew/bin/soffice`、`/usr/local/bin/soffice` 和 `LIBREOFFICE_PATH`，并返回 `ok/platform/capability/source/path/version/warnings/errorCode/message/actions`。
- 2026-08-28 Darwin LibreOffice runtime 探测在本机命中 `source=system_app`，版本 `26.8.0.3`；空候选返回 `errorCode=LO_MISSING_BINARY`，embedded 模式返回 `errorCode=PLATFORM_UNSUPPORTED`，均不崩溃。
- 2026-08-28 接入后 Electron 启动自检已显示 `[LO_RUNTIME_STARTUP] source=system_app path=/Applications/LibreOffice.app/Contents/MacOS/soffice version=26.8.0.3 probe=ok`。
- 2026-08-28 PR #1 `platform/macos-runtime-detection` 和 PR #2 `docs/macos-main-app-plan` 已合并到 `platform/macos-bootstrap`；本地分支已 fast-forward 到合并后基线。
- 2026-08-28 MAC-01 已新增 `code/desktop/platform/index.js` 和 `code/desktop/platform/common/capability-result.js`；`main.js` 的 macOS LibreOffice runtime 入口已从 Darwin 模块直连改为 `currentPlatformAdapter.runtime.resolveLibreOffice()`。
- 2026-08-28 PR #3 `platform/macos-adapter-boundary` 已合并到 `platform/macos-bootstrap`。
- 2026-08-28 MAC-02 已新增 `code/desktop/platform/common/process-utils.js`、`code/desktop/platform/darwin/process-tree.js` 和 `code/desktop/platform/win32/process-tree.js`；`main.js` 的导出取消进程终止已通过 `currentPlatformAdapter.process.killProcessTreeByPid()` 进入平台 adapter；非 Windows `getProcessNameByPid()` 已早退，避免 macOS 取消路径触发 PowerShell 进程名查询。
- 2026-08-28 PR #4 `platform/process-adapter` 已合并到 `platform/macos-bootstrap`。
- 2026-08-28 MAC-03 已新增 `code/desktop/platform/common/health-report.js`；`runLibreOfficeHealthCheck()` 和 `runMicrosoftOfficeHealthCheck()` 返回旧字段兼容 + 新 `platform/engine/capability/capabilities/errorCode/message` 字段；非 Windows Office COM health 直接返回 `PLATFORM_UNSUPPORTED`；已新增 `capability:getAll` IPC 和 preload `getCapabilities`。
- 2026-08-28 PR #5 `feature/shared-capability-status` 已合并到 `platform/macos-bootstrap`。
- 2026-08-28 MAC-04 已更新导出页描述和导出引擎 option 文案；`openLibreOfficeModal()` 读取 macOS `platform/errorCode/actions`，缺失时提示 Homebrew cask / `LIBREOFFICE_PATH`；`openOfficeEngineModal()` 在 macOS Office COM unsupported 时禁用继续按钮并提示切回 LibreOffice；诊断文本和导出日志已包含 `platform/errorCode`。
- 2026-08-28 MAC-05 已新增生成式 `code/desktop/test-fixtures/export-basic/` fixture 定义和 `code/desktop/scripts/libreoffice-export-fixture-smoke.js`；`export:fixture:smoke` 会在 ignored `code/desktop/_test_output/` 下生成 DOCX/PPTX、LibreOffice PDF、PDF 渲染 PNG 和 `report.json`。
- 2026-08-28 PR #6 `platform/macos-export-preflight-ui` 已合并到 `platform/macos-bootstrap`。
- 2026-08-28 PR #7 `platform/macos-export-smoke` 已合并到 `platform/macos-bootstrap`。
- 2026-08-28 MAC-06 已新增 `dist:mac:dir`、`assets/app-icon.icns`、`build.mac` dir target 和 `sign: null`；`build.files` 已包含 `platform/**`；Windows-only `vendor/libreoffice`、`vendor/redist` 和 packaged scripts 已下沉到 `build.win.extraResources`，macOS app bundle 不再携带这些资源。
- 2026-08-28 PR #8 `platform/macos-package-dir` 已合并到 `platform/macos-bootstrap`。
- 2026-08-28 MAC-07 已新增 `.github/workflows/desktop-ci.yml`，使用 Windows/macOS matrix、Node 22、npm cache、`npm ci`、`puzzle:shadow:smoke`、`puzzle:text:smoke` 和 `git diff --check`；第一版 CI 不调用 LibreOffice、字体探针、打包或发布脚本。PR #9 已合并，最新 Actions 已通过：Windows job 57s，macOS job 31s。
- 2026-08-28 MAC-08 已新增 `render:fixture:smoke`，覆盖 Skia Canvas PNG、Sharp resize、PDFium PDF 渲染到 PNG；已用 Electron remote debugging 完成 Compose DOM smoke，走 file input 和 preload `saveImageFile()` 导出 1600x1000 PNG；结果写入 `docs/current/macos-render-qa-matrix.md`。PR #10 已合并，Desktop CI 已通过：Windows job 40s，macOS job 25s。
- 2026-08-28 MAC-09 已扩展 `capability:getAll` 汇总，返回 LibreOffice、Office COM、PDF render、font 和 packaging 5 项结构化 capability；设置页新增平台能力面板，使用 `window.appApi.getCapabilities()` 展示 loading/refresh/unsupported/missing 状态。macOS Electron DOM 验收通过：LibreOffice `system_app` 可用，Office COM `PLATFORM_UNSUPPORTED`，字体走 `system_fallback` 且明确 public 仓库不含字体二进制，packaging 指向 `dist:mac:dir`；无横向溢出、无重叠、无 Windows 修复词。当前待 PR/CI/合并。
- 2026-08-28 已新增并校准 `docs/current/macos-main-app-development-requirements.md`，把 Mac 主应用能力范围、platform adapter 目标、导出链路、UI capability、打包、CI、IPC hardening、资源治理和 M0-M11 阶段路线写成当前规划。
- 2026-08-28 已新增并校准 `docs/current/macos-main-app-task-cards.md`，拆出 MAC-00 至 MAC-13 任务卡；每张卡包含 Objective、Context、Scope、Out of scope、Steps、Acceptance、Validation、Deliverables 和 Risks。
- `npm --prefix code/desktop run font:probe` 已通过。
- `docs/` 根目录当前只保留 `INDEX.md`、`context.md` 和迁移规划文档。
- 历史资料已归档为 41 份历史方案、9 份报告、7 份参考说明。
- `docs/architecture/resources.md` 已记录字体、LibreOffice、redist、敏感资料、样例资料和本地图片策略。
- `local-artifacts/` 已物理删除；`.gitignore` 仍保留规则，防止本地敏感资料、样例或临时文件再次误入 Git。
- 原根目录 `API_key.md`、图片和 Office 样例已从 Git 索引移除；本轮已删除对应本地 artifacts。
- `docs/archive/reference/场景化图片排版工具.html` 已归档历史单页工具。
- Git 跟踪的根入口只剩 `.gitignore`、`AGENTS.md`、`CLAUDE.md`、`CODEX.md`、`GEMINI.md`、`README.md`、`code/`、`docs/`。
- 根目录临时脚本碎片和 `stdout` 已从索引移除；本轮已删除对应本地 scratch。
- `.claude/settings.local.json` 已从索引移除并加入忽略；本轮已删除本地 `.claude/`。
- `code/desktop/dist/`、`code/desktop/dist2/`、`code/desktop/_tmp/`、`code/desktop/_test_output/` 已物理删除。
- `code/desktop/probe_test1.js`、`code/desktop/probe_test2.js`、`code/desktop/未命名 (1).png` 已确认无引用并从源码删除。
- 未跟踪的 `code/desktop/scripts/puzzle-text-baseline-regression.js` 无 npm 脚本或代码引用，且会被 `scripts/**` 打包规则复制，已删除。
- `code/desktop/renderer/puzzle/selection-controller.js` 当前未跟踪，但已被 `puzzle/index.js` 引用，属于迁移前业务改动的一部分，不能作为垃圾删除。
- `npm --prefix code/desktop run check:lo-runtime`、`font:probe`、`font:enum:smoke`、`puzzle:shadow:smoke`、`puzzle:text:smoke` 均已完成。
- PPT smoke 2/2 通过。
- `npm --prefix code/desktop run dist:dev` 和 `dist:checked` 均通过。
- `code/desktop/dist/win-unpacked/流量蜂虚拟笔记工具.exe` 基础启动存活 10 秒。
- 迁移后规范检查已修正活动入口文档的过期迁移状态。
- `code/desktop/scripts/font-enum-regression.js` 已避免主路径成功时触发 noisy `font-list` fallback。
- 已复跑 `npm --prefix code/desktop run font:enum:smoke`，输出不再包含 fallback 错误堆栈。
- 已完成 34 个非 vendor / 非 dist JS 文件 `node --check`，全部通过。
- 业务代码旧 `desktop/` 路径硬编码扫描无命中。

未验证：

- 当前未提交业务改动的完整业务意图。
- 字体资源的最终分发授权边界。
- `code/desktop/vendor/libreoffice/` 是否必须继续随源码仓库分发，或后续迁往外部 artifact / Git LFS。
- 页签级业务交互人工冒烟结果。
- 迁移前已有 `code/desktop` 业务改动的完整业务意图。
- 本地样例已清理后，旧 `ppt:smoke` 仍需要外部样例路径；macOS 基础导出可通过新增的 `export:fixture:smoke` 复跑生成式 DOCX/PPTX fixture。
- 当前迁移前业务改动是全部纳入 GitHub 基线，还是拆分后逐步合并。
- Windows / macOS 并行开发的实际人员分工、GitHub Project 是否启用、CI 是否先走 required + optional 分层。
- platform adapter 边界尚未系统性拆分；Windows Office COM、PowerShell、taskkill 和 Windows embedded LibreOffice 仍主要集中在 `code/desktop/main.js`。
- MAC-09 平台能力面板已在 macOS Electron DOM 验收通过；Windows 实机 UI 展示和 Office / LibreOffice 能力文本仍待 Windows 环境复测。
- `runMicrosoftOfficeHealthCheck()` 已在非 Windows 平台早退为 `PLATFORM_UNSUPPORTED`，不再进入 `office-health-check.ps1` PowerShell 链路。
- `runLibreOfficeHealthCheck()` 和 renderer LibreOffice 弹窗已完成 MAC-04 文案校准；完整平台能力设置区已在 MAC-09 实现，待 PR/CI/合并。
- `code/desktop/package.json` 已完成 MAC-06 平台化构建配置；`dist:mac:dir` 可生成 macOS arm64 `.app`，Windows build 仍需 Windows 实机复测。
- `shell:openExternal` / `shell:openPath` 主进程侧缺少 allowlist，XHS 下载 / 飞书上传取消还不能稳定中断当前网络请求；已追加 MAC-13 hardening 任务。
- macOS 主应用开发改造规划尚未进入代码实施；需要按任务卡小 PR 串行推进。

## 本轮必读文件

- `docs/ai-project-template-项目结构迁移落地规划.md`
- `AGENTS.md`
- `docs/current/tasks.md`
- `docs/architecture/map.md`
- `docs/architecture/do-not-break.md`
- `docs/current/github-sync-macos-plan.md`
- `docs/current/github-public-sync-runbook.md`
- `docs/current/mac-development-runbook.md`
- `docs/current/win-mac-parallel-development.md`
- `docs/current/macos-main-app-development-requirements.md`
- `docs/current/macos-main-app-task-cards.md`

## 当前环境状态

- 当前执行环境为 macOS 工作区：`~/dev/scene-image-tool`。
- 当前 Git 分支：`feature/platform-capability-panel`，基于已包含 PR #1/#2/#3/#4/#5/#6/#7/#8/#9/#10 的 `platform/macos-bootstrap`。
- GitHub public 远端已上线，Mac 端已完成首次 clone 和基础启动验证。
- 不在生产部署流程中。

## 已知风险、阻塞、验收标准

风险：

- 当前 macOS clone 在第一阶段回写文档后工作区会出现文档修改；后续检查必须只 stage / 提交本轮明确文件。
- 当前规划分支包含 PR #1 的 runtime detection 基线；若 PR #1 尚未合并，规划 PR 应作为 stacked PR 或等待 rebase。
- Git 历史已经包含大文件，历史瘦身需要后续独立任务。
- 当前迁移仓库仍不能直接 push 到 GitHub：当前 HEAD 和历史均存在 100 MiB+ blob；只能使用干净导出仓库或后续独立历史瘦身结果。
- 历史中出现过敏感路径，不能公开当前迁移历史；只允许公开 GitHub-ready 干净导出仓库。
- CRLF 提示已出现，当前迁移不处理换行符规范。
- 迁移前已有 `code/desktop` 业务改动仍未提交；本轮不应把无关业务改动混入治理修复。
- `local-artifacts/` 已删除，后续如需内置 PPT smoke 样例，应新增脱敏的 `code/desktop/test-fixtures/`。
- 清理后已复跑 `check:lo-runtime`、`font:probe`、`font:enum:smoke`、`puzzle:shadow:smoke`、`puzzle:text:smoke`、`dist:dev`、47 个 JS `node --check` 和 Electron 10 秒存活检查。
- 验证期间生成的 `code/desktop/dist/` 已再次删除，最终工作区不保留构建产物。

阶段验收：

- macOS 首次开发启动验证已完成：`npm ci`、Electron 开发启动、`puzzle:shadow:smoke`、`puzzle:text:smoke` 均通过。
- macOS LibreOffice runtime 探测已完成：Darwin adapter 命中系统 LibreOffice，缺失和 unsupported mode 返回结构化错误，不影响 Electron 启动。
- macOS 主应用规划已按代码审查修正：第一版 CI 不跑打包/字体/runtime 检查，`extraResources` 已在 MAC-06 平台化，Office COM 非 Windows 早退作为 P0/P1 任务。
- 文档或规范修复完成后，更新 `docs/current/tasks.md` 和 `docs/current/session-log.md`。
- 如修改代码脚本，执行对应最小自动化验证。

## 本轮禁区

- 第一阶段已完成；后续 macOS runtime 探测仍不应大范围重构业务逻辑。
- 不删除 `code/desktop/fonts/`、`code/desktop/vendor/`、`code/desktop/node_modules/` 和 `.git/`。
- 不做 Git 历史重写。
- 不把 `node_modules/`、`dist/`、`release/`、`out/`、本地样例、密钥、字体二进制或 runtime dump 提交到 Git。
- 不运行第一阶段禁跑命令作为 macOS 首次启动验收：`font:probe`、`check:lo-runtime`、`dist`、`dist:full`、`dist:dev`。
- 后续不要把迁移前业务改动混入治理修复提交；需要单独审查和提交。

## 不要再踩的坑

- 不要把历史方案文档当成当前事实。
- 不要用模板 `.gitignore` 覆盖本项目忽略规则；模板只忽略 `.DS_Store`。
- 不要在未确认资源策略前移除字体或 LibreOffice 运行时。
