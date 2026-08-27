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
- 验证：已安装并登录 GitHub CLI；已创建 public 仓库 `https://github.com/yinsheng508-byte/scene-image-tool`；普通 Git HTTPS push 在当前 Windows 环境多次出现 HTTP 408 / TLS EOF，最终通过 GitHub REST Git Database API 写入 public 首次线上基线；远端 `main` 和 `platform/macos-bootstrap` 均指向 `e20a52dd1df9e6f632eee36946f34b7f9a80ee6b`；远端 HEAD 不含 `.bootstrap`、字体二进制、`code/desktop/vendor/libreoffice/` 和 `code/desktop/vendor/redist/vc_redist.x64.exe`；全新 clone 到 `D:\deptask\scene-image-tool-clone-verify-20260827-163358` 成功，tracked 文件数 117；公开 clone 的 `npm ci`、`puzzle:shadow:smoke`、`puzzle:text:smoke` 通过。
- 风险：public 首次线上基线不包含字体二进制、Windows LibreOffice runtime 和 VC redist exe；严格字体探针、Windows full build 和 runtime 检查需要本地资源或后续 artifact / provisioning 支撑；`npm ci` 仍报告 21 个依赖漏洞，后续单独治理。
