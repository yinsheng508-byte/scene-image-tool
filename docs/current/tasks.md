# 当前任务列表

任务来源：`docs/ai-project-template-项目结构迁移落地规划.md`；macOS 后续主线见 `docs/current/macos-main-app-development-requirements.md` 和 `docs/current/macos-main-app-task-cards.md`。

| 阶段 | 状态 | 可演示路径 | 修改范围 | 验收点 |
|---|---|---|---|---|
| Phase 0：冻结和保护现场 | 已完成 | 查看分支和 `.migration-backups/` | Git 分支、本地快照 | 已创建迁移分支和迁移前快照 |
| Phase 1：安装 AI 协作治理脚手架 | 已完成 | 读取 `AGENTS.md` 和 `docs/INDEX.md` | 根入口、`docs/current`、`docs/architecture` | 当前事实有唯一入口，24 个治理文件已创建 |
| Phase 2：建立忽略规则和产物策略 | 已完成 | `git status --ignored` | `.gitignore` | `.migration-backups/`、备份目录、ZIP、node_modules 等已被忽略 |
| Phase 3：从索引移除明确构建产物 | 已完成 | `git ls-files desktop/dist2 desktop/_tmp 'desktop/test_*.png'` | Git 索引 | 目标路径已从索引清空，本地 `dist2` / `_tmp` 保留 |
| Phase 4：迁移代码目录到 `code/desktop/` | 已完成 | `npm --prefix code/desktop run font:probe` | `desktop/` -> `code/desktop/` | 旧目录不存在，索引无 `desktop` 跟踪项，字体探针通过 |
| Phase 5：重排历史文档 | 已完成 | `docs/archive/README.md` | 根目录文档、`docs/archive` | `docs/` 根只保留当前导航、长期背景和迁移规划；历史资料分三类归档 |
| Phase 6：治理大资源 | 已完成 | `docs/architecture/resources.md` | fonts、vendor、fixtures、敏感文件策略 | 依赖型大资源保留并登记策略；敏感/样例/图片移出索引并进入 `local-artifacts/` |
| Phase 7：根目录清理 | 已完成 | `docs/current/root-structure.md` | 临时碎片、最终上下文 | Git 跟踪的根入口只保留治理入口、`code/`、`docs/`；本地碎片进入 `local-artifacts/` |
| Phase 8：验证、收口和验收 | 已完成 | `docs/current/acceptance.md` | 测试、验收文档 | 自动化验收通过，人工页签冒烟建议已记录 |
| 迁移后规范检查 | 已完成 | `docs/current/session-log.md` | 活动文档、测试脚本 | 已修正过期事实和 noisy smoke 脚本，自动检查通过 |
| 迁移后本地构建垃圾清理 | 已完成 | `docs/current/root-structure.md` | 本地备份、构建产物、无引用探针 | 已物理删除约 21.6GB 忽略文件和旧产物；已从源码删除 3 个无引用历史探针/图片；保留运行必需的 `fonts/`、`vendor/`、`node_modules/` |
| GitHub 公开同步执行 | 已上线，已补齐 | `https://github.com/yinsheng508-byte/scene-image-tool` | 干净导出仓库、公开远端、Mac clone 验收、覆盖校验 | public 仓库已创建；`main` 和 `platform/macos-bootstrap` 保持同步；代码 hash 对比缺失 0、内容不一致 0；已补齐 40 份中文归档文档；public 源码文件数 157；不含字体二进制、Windows LibreOffice runtime、VC redist exe 和 `.bootstrap` |
| GitHub 同步与 macOS 准备 | 已上线，进入 macOS 开发前置 | `docs/current/github-sync-macos-plan.md` | GitHub 远端、历史大文件、资源外部化、macOS adapter | 已完成公开干净导出仓库上线；后续从 `platform/macos-bootstrap` 开始 macOS adapter 和打包配置开发 |
| Windows / macOS 并行开发方案 | 已完成 | `docs/current/win-mac-parallel-development.md` | 分支模型、平台 adapter、CI、GitHub Project、发布节奏 | 已写明共享核心 + 平台适配层 + 平台构建配置路线，供 GitHub 同步后两端并行开发 |
| macOS 开发落地指令 | 已完成 | `docs/current/mac-development-runbook.md` | Mac 环境、clone、启动、smoke、首批任务 | 已给出 Xcode CLT、Homebrew、Git LFS、Node 22、LibreOffice、Electron 开发启动和每日开发命令 |
| macOS 首次开发启动验证 | 已完成 | `~/dev/scene-image-tool` | Mac 环境、GitHub clone、`code/desktop/` 依赖安装、Electron 开发启动、拼图 smoke | 2026-08-28 已在 macOS clone `platform/macos-bootstrap`；Node 22/npm/git/git-lfs/LibreOffice 可用；`npm --prefix code/desktop ci` 通过；`npm exec electron .` 能打开 Electron 主界面；`puzzle:shadow:smoke` 和 `puzzle:text:smoke` 通过；未运行第一阶段禁跑命令 |
| macOS LibreOffice runtime 探测 | 已完成，PR #1 已合并 | `code/desktop/platform/darwin/libreoffice-runtime.js` | Darwin platform adapter、`main.js` runtime resolve、Node 兜底预检 | PR #1 已合并到 `platform/macos-bootstrap`；能识别 `/Applications/LibreOffice.app/Contents/MacOS/soffice`、`/opt/homebrew/bin/soffice`、`/usr/local/bin/soffice` 和 `LIBREOFFICE_PATH`；返回 `ok/platform/capability/source/path/version/warnings/errorCode/message/actions`；缺失和 embedded 模式不崩溃；Electron 启动自检已命中 `system_app` |
| macOS 主应用开发改造规划 | 已完成 | `docs/current/macos-main-app-development-requirements.md`、`docs/current/macos-main-app-task-cards.md` | Mac 主应用需求、platform adapter 架构、导出链路、打包、CI、资源治理、任务拆分 | 已拆出 M0-M11 阶段路线、Gate A-D 验收门禁、MAC-00 至 MAC-13 任务卡；后续从合并 PR #1 和 MAC-01 adapter 总壳开始 |
| 代码全面审查与文档校准 | 已完成 | `docs/current/macos-main-app-development-requirements.md`、`docs/current/macos-main-app-task-cards.md` | Mac 平台边界、Office COM 预检、LibreOffice 文案、打包资源、CI、IPC/cancel hardening | 已确认并写入文档：macOS Office engine 当前会进入 PowerShell 风险、LibreOffice UI 文案偏 Windows、`extraResources` 仍引用缺失 Windows runtime、`check:lo-runtime` 是 Windows-only、shell IPC 和网络取消需独立 hardening；基础校验通过 |
| MAC-01：platform adapter 总壳 | 已完成，待合并 | `code/desktop/platform/index.js`、`code/desktop/platform/common/capability-result.js` | 平台总入口、capability normalizer、`main.js` Darwin runtime 入口 | `main.js` 已通过 `currentPlatformAdapter.runtime.resolveLibreOffice()` 获取 macOS runtime；Windows runtime resolve 保持 legacy passthrough；node check、adapter 直接调用和 puzzle smoke 通过 |
