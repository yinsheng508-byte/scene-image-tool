# Session Log

## 2026-08-26

- 阶段：Phase 0 冻结和保护现场。
- 修改文件：无业务文件修改；新增本地快照目录 `.migration-backups/`。
- 验证：已创建分支 `codex/project-structure-template-migration`；已生成 status、untracked、git size、worktree diff 快照。
- 风险：快照目录需要在 Phase 2 加入 `.gitignore`；当前工作区已有大量迁移前改动。

## 2026-08-26

- 阶段：Phase 1 安装 AI 协作治理脚手架。
- 修改文件：新增根入口文档、`code/README.md`、`docs/current/*`、`docs/architecture/*`、`docs/workflows/*`、`docs/templates/*`。
- 验证：已复核 24 个治理文件全部存在；已检查关键标题结构；本阶段未修改业务代码。
- 风险：Phase 1 只建立治理入口，不移动 `desktop/`，后续文档中的路径需在 Phase 4 后更新。

## 2026-08-26

- 阶段：Phase 2 建立根忽略规则和产物策略。
- 修改文件：新增 `.gitignore`；更新当前任务和上下文文档。
- 验证：`git check-ignore` 抽查确认 `.migration-backups/`、根 ZIP 备份、`desktop - 副本/`、`desktop/node_modules/` 已被忽略；源码和当前文档未被误忽略。
- 风险：已跟踪的 `desktop/dist2/` 不会因 `.gitignore` 自动消失，Phase 3 需要从索引移除。

## 2026-08-26

- 阶段：Phase 3 从索引移除明确构建产物。
- 修改文件：从 Git 索引移除 `desktop/dist2/`、`desktop/_tmp/`、`desktop/test_*.png`；更新当前任务和上下文文档。
- 验证：`git ls-files desktop/dist2 desktop/_tmp 'desktop/test_*.png'` 无输出；本地 `desktop/dist2/builder-debug.yml` 和 `desktop/_tmp/msiexec_help.txt` 仍存在。
- 风险：本阶段只清理当前索引，不清理 Git 历史；`.git/objects` 体量需要后续独立历史瘦身任务。

## 2026-08-26

- 阶段：Phase 4 迁移代码目录到 `code/desktop/`。
- 修改文件：使用 `git mv desktop code/desktop` 完成被跟踪应用目录迁移；更新 README、Agent 入口、当前上下文和架构路径文档。
- 验证：`Test-Path desktop` 为 `False`，`Test-Path code\desktop\package.json` 为 `True`，`git ls-files desktop` 无输出，`git ls-files code/desktop/package.json` 返回当前入口，`npm --prefix code/desktop run font:probe` 通过。
- 风险：迁移前已有业务改动继续表现为 `RM` / 未暂存修改，Phase 4 提交只应包含纯目录重命名和文档回写，不纳入业务修改。

## 2026-08-26

- 阶段：Phase 5 重排历史文档。
- 修改文件：新增 `docs/archive/README.md`；将历史方案/任务卡迁入 `docs/archive/legacy-plans/`，将烟测/回归/实施报告迁入 `docs/archive/reports/`，将用户说明、接口说明、许可证和回滚说明迁入 `docs/archive/reference/`；更新当前导航和上下文文档。
- 验证：`docs/archive/legacy-plans` 41 个文件，`docs/archive/reports` 9 个文件，`docs/archive/reference` 6 个文件；`docs/` 根目录只剩 `INDEX.md`、`context.md` 和迁移规划文档。
- 风险：根目录 `API_key.md`、样例 Office 文档、图片、HTML 和脚本碎片仍待 Phase 6 / Phase 7 治理。

## 2026-08-26

- 阶段：Phase 6 治理大资源。
- 修改文件：新增 `docs/architecture/resources.md`；更新 `.gitignore`、README、AGENTS、文档索引和当前上下文；将 `场景化图片排版工具.html` 归档到 `docs/archive/reference/`；从 Git 索引移除根目录 `API_key.md`、图片和 Office 样例，并将本地文件移入 `local-artifacts/`。
- 验证：`git ls-files` 不再返回根目录敏感/样例文件；`git check-ignore` 确认 `local-artifacts/secrets/API_key.md`、`local-artifacts/samples/寻根之旅.pptx`、`local-artifacts/assets/image.png` 被忽略；`code/desktop/fonts` 29 个跟踪文件，`code/desktop/vendor/libreoffice` 14069 个跟踪文件，均已登记策略。
- 风险：字体和 LibreOffice 运行时仍保留在 Git 当前索引中；历史大对象瘦身需要后续独立任务，不能混入当前迁移。

## 2026-08-26

- 阶段：Phase 7 根目录清理。
- 修改文件：新增 `docs/current/root-structure.md`；更新 `.gitignore`、文档索引、当前上下文和任务状态；从 Git 索引移除根目录临时脚本碎片、`stdout` 和 `.claude/settings.local.json`，本地文件保留在 `local-artifacts/scratch/` 或原本地配置位置。
- 验证：`git ls-files` 根目录只返回 `.gitignore`、`AGENTS.md`、`CLAUDE.md`、`CODEX.md`、`GEMINI.md`、`README.md`；物理根目录只剩当前入口、`code/`、`docs/` 和已忽略的本地目录/备份。
- 风险：`desktop - 副本/`、`虚拟笔记工具箱 - 副本.zip` 和 `.migration-backups/` 仍保留为本地忽略项，不随 Git 分发。

## 2026-08-26

- 阶段：Phase 8 验证、收口和验收。
- 修改文件：更新 `docs/current/acceptance.md`、`docs/current/WORKING_CONTEXT.md`、`docs/current/tasks.md`、`docs/current/session-log.md` 和迁移规划文档。
- 验证：LibreOffice 运行时、字体探针、字体枚举、拼图阴影、拼图文字、PPT smoke、`dist:dev`、`dist:checked`、关键 JS 语法、Git 禁止清单和忽略规则均已完成；Electron unpacked 可执行文件启动后存活 10 秒。
- 风险：页签级业务交互未自动点击验证；迁移前已有 `code/desktop` 业务改动仍留在工作区，需独立审查。

## 2026-08-26

- 阶段：迁移后规范检查。
- 修改文件：修正 `AGENTS.md`、`README.md`、`CLAUDE.md`、`CODEX.md`、`GEMINI.md`、`docs/current/WORKING_CONTEXT.md`、`docs/current/tasks.md` 中迁移完成后的过期表述；调整 `code/desktop/scripts/font-enum-regression.js`，主路径 PowerShell 字体枚举成功后不再触发 noisy `font-list` fallback。
- 验证：过期迁移状态扫描无命中；`npm --prefix code/desktop run font:enum:smoke` 通过且不再输出 fallback 错误堆栈；34 个非 vendor / 非 dist JS 文件 `node --check` 全部通过；业务代码旧 `desktop/` 路径硬编码扫描无命中；Git 禁止清单和忽略规则抽查通过。
- 风险：迁移前已有 `code/desktop` 业务改动仍未提交，未纳入本轮规范修复。

## 2026-08-26

- 阶段：迁移后本地构建垃圾清理。
- 修改文件：物理删除 `.migration-backups/`、`.claude/`、`desktop - 副本/`、`虚拟笔记工具箱 - 副本.zip`、`local-artifacts/`、`code/desktop/dist/`、`code/desktop/dist2/`、`code/desktop/_tmp/`、`code/desktop/_test_output/`；删除 `code/desktop/probe_test1.js`、`code/desktop/probe_test2.js`、`code/desktop/未命名 (1).png` 和未引用的 `code/desktop/scripts/puzzle-text-baseline-regression.js`。
- 验证：删除前确认目标均未被 Git 跟踪或无代码引用；清理后 `Test-Path` 确认删除目标均不存在；保留 `code/desktop/fonts/`、`code/desktop/vendor/`、`code/desktop/node_modules/`；`check:lo-runtime`、`font:probe`、`font:enum:smoke`、`puzzle:shadow:smoke`、`puzzle:text:smoke`、`dist:dev`、47 个 JS `node --check` 和 Electron 10 秒存活检查均通过；验证生成的 `code/desktop/dist/` 已再次删除。
- 风险：`code/desktop/renderer/puzzle/selection-controller.js` 仍是未跟踪业务文件，但当前 `puzzle/index.js` 已引用它，不能作为垃圾清理；迁移前业务改动仍需独立审查。

## 2026-08-26

- 阶段：GitHub 同步与 macOS 准备审计。
- 修改文件：新增 `.gitattributes` 和 `docs/current/github-sync-macos-plan.md`；更新文档导航、根目录结构、资源治理、任务表、看板和当前上下文。
- 验证：确认当前无 Git remote；`git-lfs/3.7.0` 已安装，`git filter-repo` 未安装；当前 HEAD 存在 140.85 MiB 的 `mergedlo.dll`，历史存在多个 100 MiB+ blob；历史出现过 `API_key.md` 和 `.claude/settings.local.json`；当前工作区仍有迁移前业务改动。
- 风险：当前仓库不能直接 push 到 GitHub；建议创建 GitHub-ready 干净仓库并先设为 private，密钥按历史泄露处理并轮换。

## 2026-08-26

- 阶段：Windows / macOS 并行开发方案。
- 修改文件：新增 `docs/current/win-mac-parallel-development.md`；更新 `docs/current/github-sync-macos-plan.md`、`docs/INDEX.md`、`docs/current/tasks.md`、`docs/current/_dashboard.md` 和 `docs/current/WORKING_CONTEXT.md`。
- 验证：已基于当前仓库状态和 GitHub Actions 官方 matrix / hosted runners / setup-node 文档补齐分支模型、平台 adapter、CI 分层、GitHub Project 字段、资源和发布策略。
- 风险：方案仍依赖 G1 业务改动审查、G2 runtime 外部化和 GitHub-ready 干净仓库导入完成后才能实际进入 macOS 并行开发。

## 2026-08-26

- 阶段：GitHub 公开同步执行手册和 macOS 落地指令。
- 修改文件：新增 `docs/current/github-public-sync-runbook.md`、`docs/current/mac-development-runbook.md`、`code/desktop/vendor/README.md`；更新 `.gitignore`、README、文档索引、任务表、看板、GitHub 同步规划、Windows / macOS 并行开发方案、资源治理和当前上下文。
- 验证：确认当前无 Git remote，当前环境未安装 `gh`，Git LFS 可用；确认 GitHub 公开路线只能走 GitHub-ready 干净导出仓库；文档 diff 空白检查通过。
- 风险：真实 push 仍需要用户提供 public 空仓库 URL，或在本机安装并登录 `gh`；当前迁移仓库的 `.git` 历史仍不可公开推送。

## 2026-08-26

- 阶段：GitHub-ready 干净仓库本地导出和验证。
- 修改文件：生成外部导出目录 `D:\deptask\scene-image-tool-github-public`；回写当前上下文、任务表、看板、GitHub 同步规划和公开同步执行手册。
- 验证：导出仓库已 `git init -b main` 并提交公开基线；已创建 `platform/macos-bootstrap`；共跟踪 144 个文件；无 95 MiB+ 文件；无实际敏感文件路径；`code/desktop/vendor/` 仅跟踪 `README.md` 和 `redist/vc_redist.x64.exe.sha256`；`npm ci`、`font:probe`、`puzzle:shadow:smoke`、`puzzle:text:smoke` 均通过。
- 风险：`npm ci` 报告 21 个依赖漏洞，后续需要独立依赖治理；真实 GitHub push 仍缺 public 远端 URL 或 `gh` 登录。

## 2026-08-27

- 阶段：GitHub public 首次上线和 Mac 基线发布。
- 修改文件：更新 `.gitignore`、`code/desktop/fonts/README.md`、`docs/architecture/resources.md`、`docs/current/WORKING_CONTEXT.md`、`docs/current/tasks.md`、`docs/current/_dashboard.md`、`docs/current/github-sync-macos-plan.md`、`docs/current/github-public-sync-runbook.md`、`docs/current/mac-development-runbook.md`、`docs/current/acceptance.md` 和本日志。
- 验证：已安装并登录 GitHub CLI；已创建 public 仓库 `https://github.com/yinsheng508-byte/scene-image-tool`；普通 Git HTTPS push 在当前 Windows 环境多次出现 HTTP 408 / TLS EOF，最终通过 GitHub REST Git Database API 写入 public 首次线上基线；源码基线提交为 `e20a52dd1df9e6f632eee36946f34b7f9a80ee6b`；文档状态回写后，远端 `main` 和 `platform/macos-bootstrap` 保持同步，当前 HEAD 以 GitHub refs 为准；远端 HEAD 不含 `.bootstrap`、字体二进制、`code/desktop/vendor/libreoffice/` 和 `code/desktop/vendor/redist/vc_redist.x64.exe`；全新 clone 到 `D:\deptask\scene-image-tool-clone-verify-20260827-163358` 成功，tracked 文件数 117；公开 clone 的 `npm ci`、`puzzle:shadow:smoke`、`puzzle:text:smoke` 通过。
- 风险：public 首次线上基线不包含字体二进制、Windows LibreOffice runtime 和 VC redist exe；严格字体探针、Windows full build 和 runtime 检查需要本地资源或后续 artifact / provisioning 支撑；`npm ci` 仍报告 21 个依赖漏洞，后续单独治理。

## 2026-08-28

- 阶段：GitHub public 覆盖校验和中文归档文档补齐。
- 修改文件：补齐 public split 仓库中缺失的 40 份中文归档文档；更新 `docs/current/WORKING_CONTEXT.md`、`docs/current/tasks.md`、`docs/current/_dashboard.md`、`docs/current/acceptance.md`、`docs/current/github-public-sync-runbook.md`、`docs/current/github-sync-macos-plan.md` 和本日志。
- 验证：通过 GitHub tree API 和本地 `git hash-object --path` 做 hash 级对比；`code/desktop/` 开发代码缺失 0、内容不一致 0；本地 dirty 的 20 个 public-eligible 开发文件均已上传且内容一致；发现 40 份中文归档文档缺失，缺失项中 `code/` 文件数为 0；高置信密钥扫描未发现真实凭据，命中的 Authorization 字段为占位值或变量名；补齐后 public 源码 blob 数为 157。
- 风险：public 仓库仍按策略排除字体二进制、Windows LibreOffice runtime 和 VC redist exe；这类资源不应被视为漏传代码。

## 2026-08-28

- 阶段：macOS 首次开发启动验证。
- 修改文件：本阶段仅回写 `docs/current/tasks.md`、`docs/current/session-log.md`、`docs/current/WORKING_CONTEXT.md`；未修改业务代码。
- 验证：已在 macOS 安装/确认 Xcode Command Line Tools、Homebrew、git、git-lfs、Homebrew `node@22` 和 LibreOffice；`node@22` 为 `v22.23.2`，npm 为 `10.9.8`，git-lfs 为 `3.7.1`，LibreOffice 为 `26.8.0.3`。已 clone `https://github.com/yinsheng508-byte/scene-image-tool.git` 到 `~/dev/scene-image-tool` 并切换跟踪 `origin/platform/macos-bootstrap`；`npm --prefix code/desktop ci` 通过，仍报告既有 21 个 npm audit 漏洞；`cd code/desktop && npm exec electron .` 能打开 Electron 主界面并持续运行，启动日志显示现有 `[LO_RUNTIME_STARTUP] missing`；`npm --prefix code/desktop run puzzle:shadow:smoke` 和 `npm --prefix code/desktop run puzzle:text:smoke` 均通过。
- 风险：macOS 启动阶段确认现有 LibreOffice 启动探测尚未识别系统 LibreOffice；第一阶段按约束未运行 `font:probe`、`check:lo-runtime`、`dist`、`dist:full`、`dist:dev`。

## 2026-08-28

- 阶段：macOS LibreOffice runtime 探测。
- 修改文件：新增 `code/desktop/platform/darwin/libreoffice-runtime.js`；更新 `code/desktop/main.js`、`docs/current/tasks.md`、`docs/current/session-log.md`、`docs/current/WORKING_CONTEXT.md`、`docs/architecture/map.md`、`docs/architecture/capabilities.md`、`docs/architecture/resources.md`。
- 验证：`node --check code/desktop/platform/darwin/libreoffice-runtime.js` 和 `node --check code/desktop/main.js` 通过；直接调用 Darwin runtime adapter 可返回结构化结果，真实环境命中 `source=system_app`、`path=/Applications/LibreOffice.app/Contents/MacOS/soffice`、`version=26.8.0.3`；空候选测试返回 `ok=false`、`errorCode=LO_MISSING_BINARY` 和明确安装/配置 actions；`runtimeMode=embedded` 在 macOS 返回 `errorCode=PLATFORM_UNSUPPORTED`，不崩溃；`cd code/desktop && npm exec electron .` 启动自检已显示 `[LO_RUNTIME_STARTUP] source=system_app ... probe=ok`；`puzzle:shadow:smoke` 和 `puzzle:text:smoke` 复跑通过。
- 风险：本阶段只完成 Darwin LibreOffice runtime 探测和小范围预检适配；当时 Windows Office COM / PowerShell / taskkill 的系统性 win32 adapter 拆分尚未开始，macOS 打包脚本和 GitHub Actions matrix 也尚未实现；后续 MAC-02、MAC-06、MAC-07 已分别推进部分边界。

## 2026-08-28

- 阶段：macOS 主应用开发改造规划和任务卡。
- 修改文件：新增 `docs/current/macos-main-app-development-requirements.md`、`docs/current/macos-main-app-task-cards.md`；更新 `docs/INDEX.md`、`docs/current/_dashboard.md`、`docs/current/tasks.md`、`docs/current/session-log.md`、`docs/current/WORKING_CONTEXT.md`。
- 验证：已把 Mac 主应用能力范围、platform adapter 目标、LibreOffice 导出链路、capability 结构、unsigned 打包、CI matrix、资源治理和 M0-M10 阶段门禁落到文档；已拆 MAC-00 至 MAC-12 任务卡，每张卡包含目标、范围、验收、验证命令和风险回滚；`git diff --check`、`npm --prefix code/desktop run puzzle:shadow:smoke`、`npm --prefix code/desktop run puzzle:text:smoke` 通过。
- 风险：本阶段为规划和任务拆分，不包含新的业务代码实现；当前规划分支基于 `platform/macos-runtime-detection`，需要先合并 PR #1，再把规划文档合入后续基线。

## 2026-08-28

- 阶段：代码全面审查与 macOS 规划文档校准。
- 修改文件：更新 `docs/current/macos-main-app-development-requirements.md`、`docs/current/macos-main-app-task-cards.md`、`docs/current/win-mac-parallel-development.md`、`docs/current/github-sync-macos-plan.md`、`docs/current/mac-development-runbook.md`、`docs/current/acceptance.md`、`docs/current/_dashboard.md`、`docs/current/tasks.md`、`docs/current/WORKING_CONTEXT.md`、`docs/architecture/map.md`、`docs/architecture/capabilities.md`、`docs/architecture/gates.md`、`docs/architecture/do-not-break.md`、`docs/architecture/resources.md`。
- 验证：已审查 `code/desktop/main.js`、`code/desktop/preload.js`、`code/desktop/package.json`、`code/desktop/scripts/check-lo-runtime.js`、`code/desktop/platform/darwin/libreoffice-runtime.js` 和 renderer 相关调用点；确认 macOS Office engine 当前仍可能进入 PowerShell、LibreOffice 预检/弹窗文案仍偏 Windows、顶层 `extraResources` 仍引用 public 仓库缺失的 Windows runtime/redist、`check:lo-runtime` 是 Windows-only 检查、shell IPC 和网络长任务取消需独立 hardening。`git diff --check`、`node --check code/desktop/main.js`、`node --check code/desktop/preload.js`、`node --check code/desktop/platform/darwin/libreoffice-runtime.js`、`puzzle:shadow:smoke`、`puzzle:text:smoke` 均通过。
- 风险：本轮只修改文档，不改业务代码；上述代码风险需按任务卡逐个小 PR 落地，MAC-01、MAC-03、MAC-04、MAC-06、MAC-07 已完成，MAC-13 等仍待推进。第一阶段仍未运行 `font:probe`、`check:lo-runtime`、`dist`、`dist:full`、`dist:dev`。

## 2026-08-28

- 阶段：MAC-00 合并 macOS LibreOffice runtime detection 基线。
- 修改文件：通过 GitHub 合并 PR #1 `platform/macos-runtime-detection` 和 PR #2 `docs/macos-main-app-plan` 到 `platform/macos-bootstrap`；回写 `docs/current/tasks.md`、`docs/current/session-log.md`、`docs/current/WORKING_CONTEXT.md`、`docs/current/_dashboard.md`、`docs/current/mac-development-runbook.md`。
- 验证：本地 `platform/macos-bootstrap` 已 fast-forward 到合并后基线；`node --check code/desktop/main.js`、`node --check code/desktop/platform/darwin/libreoffice-runtime.js`、`puzzle:shadow:smoke`、`puzzle:text:smoke` 均通过；Darwin runtime adapter 在本机返回 `ok=true`、`source=system_app`、`path=/Applications/LibreOffice.app/Contents/MacOS/soffice`、`version=26.8.0.3`；空候选返回 `errorCode=LO_MISSING_BINARY`。
- 风险：MAC-00 只完成基线合并；platform adapter 总壳、Office COM unsupported 早退、CI、打包和 hardening 尚未实现。

## 2026-08-28

- 阶段：MAC-01 platform adapter 总壳。
- 修改文件：新增 `code/desktop/platform/index.js`、`code/desktop/platform/common/capability-result.js`；更新 `code/desktop/main.js`，让 macOS LibreOffice runtime resolve 通过 `currentPlatformAdapter.runtime.resolveLibreOffice()`；回写 `docs/architecture/map.md`、`docs/architecture/capabilities.md`、`docs/current/tasks.md`、`docs/current/WORKING_CONTEXT.md`、`docs/current/_dashboard.md`、`docs/current/macos-main-app-task-cards.md`。
- 验证：`node --check code/desktop/main.js`、`node --check code/desktop/platform/index.js`、`node --check code/desktop/platform/common/capability-result.js` 通过；直接调用 `createPlatformAdapter("darwin")` 可返回 `source=system_app`、`version=26.8.0.3`；`createPlatformAdapter("win32").runtime.resolveLibreOffice()` 返回 `null`，保持 Windows legacy path；`puzzle:shadow:smoke`、`puzzle:text:smoke` 和 `git diff --check` 均通过。
- 风险：MAC-01 只建立 adapter 入口和 helper，不迁移 PowerShell、Office COM、进程终止或打包配置；Windows 行为需要后续在对应 PR 中继续保护。PR #3 已合并到 `platform/macos-bootstrap`。

## 2026-08-28

- 阶段：MAC-02 跨平台进程终止 adapter。
- 修改文件：新增 `code/desktop/platform/common/process-utils.js`、`code/desktop/platform/darwin/process-tree.js`、`code/desktop/platform/win32/process-tree.js`；更新 `code/desktop/platform/index.js` 和 `code/desktop/main.js`；回写 `docs/architecture/map.md`、`docs/architecture/capabilities.md`、`docs/architecture/do-not-break.md`、`docs/current/tasks.md`、`docs/current/WORKING_CONTEXT.md`、`docs/current/_dashboard.md`、`docs/current/macos-main-app-task-cards.md`。
- 验证：`node --check code/desktop/main.js`、`node --check code/desktop/platform/index.js`、`node --check code/desktop/platform/common/process-utils.js`、`node --check code/desktop/platform/darwin/process-tree.js`、`node --check code/desktop/platform/win32/process-tree.js` 通过；直接调用 `createPlatformAdapter("darwin").process.killProcessTreeByPid(-1)` 和 `createPlatformAdapter("win32").process.killProcessTreeByPid(-1)` 均返回 invalid pid 短路；`puzzle:shadow:smoke`、`puzzle:text:smoke` 通过。
- 风险：macOS 当前先使用 `process.kill(pid, "SIGTERM")`，尚未实现 process group 级联终止；Windows `taskkill /T /F` 逻辑已隔离到 win32 adapter，但本机未执行 Windows 环境实机取消验证。PR #4 已合并到 `platform/macos-bootstrap`。

## 2026-08-28

- 阶段：MAC-03 统一导出 capability / health 返回结构。
- 修改文件：新增 `code/desktop/platform/common/health-report.js`；更新 `code/desktop/main.js` 和 `code/desktop/preload.js`；回写 `docs/architecture/map.md`、`docs/architecture/capabilities.md`、`docs/architecture/gates.md`、`docs/architecture/do-not-break.md`、`docs/current/tasks.md`、`docs/current/WORKING_CONTEXT.md`、`docs/current/_dashboard.md`、`docs/current/macos-main-app-development-requirements.md`、`docs/current/macos-main-app-task-cards.md`。
- 验证：`node --check code/desktop/main.js`、`node --check code/desktop/preload.js`、`node --check code/desktop/platform/common/health-report.js` 通过；直接调用 common health normalizer 包装 Darwin Office COM capability 时返回 `ok=false`、`blockExport=true`、`errorCode=PLATFORM_UNSUPPORTED`，并保留 actions；`npm exec electron .` 能启动主界面，启动自检命中 `source=system_app`、`version=26.8.0.3`。
- 风险：本阶段保留旧 renderer 字段，不重做导出页文案；macOS LibreOffice / Office 弹窗的用户文案仍交给 MAC-04，Windows Office health 未在 Windows 实机复测。PR #5 已合并到 `platform/macos-bootstrap`。

## 2026-08-28

- 阶段：MAC-04 Mac 导出预检 UI 文案和交互。
- 修改文件：更新 `code/desktop/renderer/index.html`、`code/desktop/renderer/renderer.js`；回写 `docs/architecture/components.md`、`docs/current/tasks.md`、`docs/current/WORKING_CONTEXT.md`、`docs/current/_dashboard.md`、`docs/current/macos-main-app-development-requirements.md`、`docs/current/macos-main-app-task-cards.md`。
- 验证：`node --check code/desktop/renderer/renderer.js`、`node --check code/desktop/main.js`、`node --check code/desktop/preload.js` 通过；真实 Electron 以 `--remote-debugging-port=9333` 启动，主进程自检命中 `source=system_app`、`version=26.8.0.3`；通过 preload IPC 调用 `exportHealthCheck({ engine: "office" })` 返回 `PLATFORM_UNSUPPORTED` 且 `blockExport=true`；`exportHealthCheck({ engine: "libreoffice" })` 返回 `source=system_app` 且 `blockExport=false`；Office 弹窗继续按钮禁用，LibreOffice 缺失弹窗包含 Homebrew / `LIBREOFFICE_PATH` 动作且不含 Windows 修复词；截图保存为 `/tmp/scene-image-tool-mac-office-modal.png` 和 `/tmp/scene-image-tool-mac-lo-modal.png`。
- 风险：本阶段不改变导出业务流程，不新增设置页；Windows 用户仍看到原 Office 修复口径，未在 Windows 实机复测。PR #6 已合并到 `platform/macos-bootstrap`。

## 2026-08-28

- 阶段：MAC-05 Mac LibreOffice 导出 smoke 和脱敏 fixture。
- 修改文件：新增 `code/desktop/scripts/libreoffice-export-fixture-smoke.js`、`code/desktop/test-fixtures/export-basic/README.md`、`code/desktop/test-fixtures/export-basic/manifest.json`；更新 `code/desktop/package.json`、`docs/architecture/resources.md`、`docs/current/tasks.md`、`docs/current/WORKING_CONTEXT.md`、`docs/current/_dashboard.md`、`docs/current/macos-main-app-development-requirements.md`、`docs/current/macos-main-app-task-cards.md`、`docs/current/acceptance.md` 和本日志。
- 验证：`node --check code/desktop/scripts/libreoffice-export-fixture-smoke.js` 通过；`npm --prefix code/desktop run export:fixture:smoke` 在本机命中 `/Applications/LibreOffice.app/Contents/MacOS/soffice`、版本 `26.8.0.3`，生成式 `basic-docx` 和 `basic-pptx` 均完成 PDF 转换和 PNG 渲染，结果 2/2 通过；`npm --prefix code/desktop run export:fixture:smoke -- --runtime-mode embedded --output _test_output/export-fixture-smoke-missing` 返回 SKIP、`ok=false`、`skipped=true`、`errorCode=PLATFORM_UNSUPPORTED`，不误报 pass。
- 风险：本阶段只新增公开小 fixture 定义和 smoke 脚本，不改导出业务链路；Windows 实机未运行该新 smoke，后续 CI matrix 合入后再观察跨平台 native 依赖表现。PR #7 已合并到 `platform/macos-bootstrap`。

## 2026-08-28

- 阶段：MAC-06 macOS unsigned app bundle。
- 修改文件：更新 `code/desktop/package.json`；新增 `code/desktop/assets/app-icon.icns`；回写 `docs/architecture/resources.md`、`docs/current/tasks.md`、`docs/current/WORKING_CONTEXT.md`、`docs/current/_dashboard.md`、`docs/current/macos-main-app-development-requirements.md`、`docs/current/macos-main-app-task-cards.md`、`docs/current/acceptance.md`、`docs/current/github-sync-macos-plan.md`、`docs/current/win-mac-parallel-development.md`、`docs/current/mac-development-runbook.md` 和本日志。
- 验证：Context7 已核对 electron-builder macOS `dir` target、platform-specific `extraResources` 和 unsigned signing 口径；`node` JSON parse 检查 `code/desktop/package.json` 通过；`npm --prefix code/desktop run dist:mac:dir` 成功生成 `code/desktop/dist/mac-arm64/流量蜂虚拟笔记工具.app`；app bundle 直接启动并保持运行 10 秒，启动日志命中 `source=system_app`、LibreOffice `26.8.0.3`；包内容检查确认 Resources 下无 `libreoffice`、`redist`、`scripts`、`*.ps1`、`soffice.exe`、`vc_redist*`，`app.asar` 包含 `platform/**`，`dist/` 为 ignored。
- 风险：本阶段只生成 unsigned 开发目录包，不做 dmg/zip、签名、公证或自动更新；Windows build 配置从顶层 `extraResources` 移到 `win.extraResources`，需后续 Windows 实机打包复测。PR #8 已合并到 `platform/macos-bootstrap`。

## 2026-08-28

- 阶段：MAC-07 GitHub Actions 基础 CI matrix。
- 修改文件：新增 `.github/workflows/desktop-ci.yml`；更新 `docs/current/tasks.md`、`docs/current/WORKING_CONTEXT.md`、`docs/current/_dashboard.md`、`docs/current/macos-main-app-development-requirements.md`、`docs/current/macos-main-app-task-cards.md`、`docs/current/win-mac-parallel-development.md`、`docs/current/acceptance.md` 和本日志。
- 验证：Context7 已核对 GitHub Actions matrix 和 `actions/setup-node` npm cache / `cache-dependency-path` 口径；workflow 只配置 `windows-latest` / `macos-latest`、Node 22、`npm --prefix code/desktop ci`、`puzzle:shadow:smoke`、`puzzle:text:smoke` 和 `git diff --check`，未调用 LibreOffice、字体探针、打包或发布脚本；本地 YAML 解析、两个 puzzle smoke 和 `git diff --check` 通过；PR #9 最新 Actions 已通过，Windows job 57s，macOS job 31s。
- 风险：第一版 CI 只覆盖基础依赖安装和 puzzle smoke；LibreOffice 导出、字体探针、打包发布仍是后续 optional / 独立任务。PR #9 已合并到 `platform/macos-bootstrap`。

## 2026-08-28

- 阶段：MAC-08 Mac PDF / 拼图 / 图片能力验收矩阵。
- 修改文件：新增 `code/desktop/scripts/render-fixture-smoke.js` 和 `docs/current/macos-render-qa-matrix.md`；更新 `code/desktop/package.json`、`docs/INDEX.md`、`docs/architecture/capabilities.md`、`docs/current/tasks.md`、`docs/current/WORKING_CONTEXT.md`、`docs/current/_dashboard.md`、`docs/current/macos-main-app-development-requirements.md`、`docs/current/macos-main-app-task-cards.md`、`docs/current/acceptance.md` 和本日志。
- 验证：`node --check code/desktop/scripts/render-fixture-smoke.js` 和 package JSON parse 通过；`npm --prefix code/desktop run render:fixture:smoke` 通过，Skia Canvas PNG 800x500、Sharp resize PNG 400x250、PDFium PDF 渲染 PNG 960x540 均非空；已视觉检查 Skia 和 PDFium 输出；Electron remote debugging Compose DOM smoke 通过，给 `#bgInput` / `#pptInput` 注入临时 PNG，经 preload `saveImageFile()` 导出 `skia-source_output.png`，尺寸 1600x1000、非空、视觉检查正常；`puzzle:shadow:smoke` 和 `puzzle:text:smoke` 复跑通过。
- 风险：本阶段不改业务渲染算法；Compose 只覆盖单图 DOM 注入路径，系统文件选择器、多图批量、大图压力和 Windows 实机渲染仍需后续人工或 optional 自动化。PR #10 已合并到 `platform/macos-bootstrap`，Desktop CI 已通过：Windows job 40s，macOS job 25s。

## 2026-08-28

- 阶段：MAC-09 平台能力设置页 / 诊断区。
- 修改文件：更新 `code/desktop/main.js`、`code/desktop/platform/index.js`、`code/desktop/renderer/index.html`、`code/desktop/renderer/renderer.js`、`code/desktop/renderer/styles.css`；回写 `docs/architecture/components.md`、`docs/architecture/capabilities.md`、`docs/current/tasks.md`、`docs/current/WORKING_CONTEXT.md`、`docs/current/_dashboard.md`、`docs/current/macos-main-app-development-requirements.md`、`docs/current/macos-main-app-task-cards.md` 和本日志。
- 验证：`node --check code/desktop/main.js`、`node --check code/desktop/preload.js`、`node --check code/desktop/renderer/renderer.js`、`node --check code/desktop/platform/index.js` 通过；Electron 以 `--remote-debugging-port=9341` 启动，启动自检命中 `/Applications/LibreOffice.app/Contents/MacOS/soffice`、版本 `26.8.0.3`；设置页 DOM 验收显示 5 项 capability：LibreOffice 可用、Office COM `PLATFORM_UNSUPPORTED`、PDF render 可用、font 走 `system_fallback` 且提示 public 仓库不含字体二进制、packaging 指向 `dist:mac:dir`；刷新按钮可恢复；无横向溢出、无元素重叠、无 Windows 修复词；`puzzle:shadow:smoke`、`puzzle:text:smoke` 和 `git diff --check` 通过。系统截图受其他前台窗口遮挡，未作为有效截图证据。
- 风险：本阶段只新增设置页诊断面板和轻量 capability 汇总，不运行字体探针或打包；Windows 上 Office / LibreOffice 原有能力状态依赖既有主进程返回，PR #11 Desktop CI 已通过（Windows job 53s、macOS job 32s），Windows 实机 UI 展示仍待后续复测。PR #11 已合并到 `platform/macos-bootstrap`。

## 2026-08-28

- 阶段：MAC-10 主进程 settings service 最小拆分。
- 修改文件：新增 `code/desktop/services/settings-service.js`；更新 `code/desktop/main.js`，删除内联 settings helper，并通过 service 注册原有 `settings:getAll` / `settings:set` IPC；回写 `docs/architecture/map.md`、`docs/architecture/capabilities.md`、`docs/current/tasks.md`、`docs/current/WORKING_CONTEXT.md`、`docs/current/_dashboard.md`、`docs/current/macos-main-app-development-requirements.md`、`docs/current/macos-main-app-task-cards.md`、`docs/current/acceptance.md` 和本日志。
- 验证：`main.js` 从 9180 行降至 9105 行；`node --check code/desktop/main.js` 和 `node --check code/desktop/services/settings-service.js` 通过；临时 userData service smoke 验证 `readSettings()`、`setSetting()`、清空设置和 `getSettingsPath()` 均保持原语义；真实 Electron 以 `--remote-debugging-port=9351` 启动成功，LibreOffice 自检仍命中 `source=system_app`、版本 `26.8.0.3`；`puzzle:shadow:smoke` 和 `puzzle:text:smoke` 均通过。
- 风险：本阶段只迁移 settings 一个稳定 service，不改变 renderer API、配置文件名、用户数据目录或授权/导出链路；Windows 实机 settings UI 未单独复测，PR #12 Desktop CI 已通过（Windows job 47s、macOS job 24s），后续 Windows 人工回归继续补充验证。PR #12 已合并到 `platform/macos-bootstrap`。

## 2026-08-28

- 阶段：MAC-11 资源 artifact / provisioning。
- 修改文件：新增 `code/desktop/resources/runtime-manifest.json` 和 `code/desktop/scripts/provision-runtime-artifacts.js`；更新 `code/desktop/package.json`、`.gitignore`、`code/desktop/vendor/README.md`、`code/desktop/fonts/README.md`、`docs/architecture/map.md`、`docs/architecture/capabilities.md`、`docs/architecture/resources.md`、`docs/current/mac-development-runbook.md`、`docs/current/tasks.md`、`docs/current/WORKING_CONTEXT.md`、`docs/current/_dashboard.md`、`docs/current/macos-main-app-development-requirements.md`、`docs/current/macos-main-app-task-cards.md`、`docs/current/acceptance.md` 和本日志。
- 验证：`node --check code/desktop/scripts/provision-runtime-artifacts.js` 通过；`code/desktop/resources/runtime-manifest.json` 和 `code/desktop/package.json` JSON 解析通过；`resources:provision:dry-run` 和 `resources:check` 在 macOS 命中 `/Applications/LibreOffice.app/Contents/MacOS/soffice`，缺 bundled fonts 作为 warning 并提示 `--artifact-root`；`--platform win32 --dry-run` 只列出 fonts、Windows LibreOffice runtime、VC redist 缺失动作，不复制大资源；临时 manifest sha256 mismatch smoke 返回非 0 并确认阻断。
- 风险：本阶段不下载、不上传、不提交真实字体、Windows LibreOffice runtime 或 VC redist exe；字体和 Windows LibreOffice runtime 的逐文件 checksum 仍需在授权和 artifact 存储确定后补齐。PR #13 Desktop CI 已通过（Windows job 47s、macOS job 39s），PR #13 已合并到 `platform/macos-bootstrap`。

## 2026-08-28

- 阶段：MAC-12 macOS 签名、公证和发布准备。
- 修改文件：新增 `code/desktop/scripts/check-macos-signing-env.js`、`code/desktop/scripts/build-macos-release.js`、`code/desktop/build/entitlements.mac.plist`、`code/desktop/build/entitlements.mac.inherit.plist`、`.github/workflows/macos-release.yml`、`docs/current/macos-release-signing-runbook.md` 和 `docs/templates/macos-release-notes.md`；更新 `code/desktop/package.json`、`docs/INDEX.md`、`docs/architecture/map.md`、`docs/architecture/capabilities.md`、`docs/architecture/gates.md`、`docs/architecture/resources.md`、`docs/current/tasks.md`、`docs/current/WORKING_CONTEXT.md`、`docs/current/_dashboard.md`、`docs/current/mac-development-runbook.md`、`docs/current/macos-main-app-development-requirements.md`、`docs/current/macos-main-app-task-cards.md`、`docs/current/acceptance.md` 和本日志。
- 验证：Context7 已核对 electron-builder macOS signing / notarization 环境变量、`mac.notarize` 和 hardened runtime entitlements 口径；`node --check` 检查 signing preflight 和 release build 脚本通过；package JSON 解析通过；`plutil -lint` 检查两个 entitlements 通过；macOS release workflow YAML 可解析；本机 `security find-identity -v -p codesigning` 返回 0 个有效 identities，且无 `CSC_*` / `APPLE_*` env；缺凭据时 `signing:mac:check` 和 `dist:mac` 均返回非 0 并阻断；`resources:check` 通过；`dist:mac:dir` unsigned fallback 仍能生成 macOS app bundle。
- 风险：真实 signed + notarized dmg/zip 未执行，需 Apple Developer 证书和 notarization secrets 后才能完成 `codesign` / `spctl` 验收；本阶段不提交任何证书、Apple ID、app-specific password、API key、issuer 或 team secret。PR #14 Desktop CI 已通过（Windows job 1m14s、macOS job 34s），PR #14 已合并到 `platform/macos-bootstrap`。
