# Current Dashboard

| slug | 类型 | 状态 | 当前阶段 | 分支 | 备注 |
|---|---|---|---|---|---|
| project-structure-template-migration | refactor | Complete | Done | `codex/project-structure-template-migration` | Phase 8 自动化验收通过；迁移后本地构建垃圾已物理清理，保留人工页签冒烟建议 |
| github-public-sync | release-prep | Deployed + Reconciled | G3 Done | `codex/project-structure-template-migration` | public 仓库已上线：`https://github.com/yinsheng508-byte/scene-image-tool`；`main` 和 `platform/macos-bootstrap` 保持同步；代码覆盖校验通过，40 份中文归档文档已补齐 |
| github-sync-macos | planning | Ready for macOS Work | M0 Partial | `platform/macos-bootstrap` | 已完成公开干净导出基线、Mac 首次启动和 Darwin runtime 探测；后续先合并 PR #1，再推进 adapter、CI 和打包 |
| win-mac-parallel-development | planning | Complete | Ready for GitHub | `codex/project-structure-template-migration` | 已形成 Windows / macOS 并行开发、CI、Project 看板和发布策略 |
| mac-development-runbook | docs | Complete | Ready for Mac | `platform/macos-bootstrap` | 已补齐真实 GitHub 地址、Mac 首次环境、clone、启动、smoke 和每日开发指令 |
| macos-main-app-development | planning | Calibrated | Code Review + Task Cards | `docs/macos-main-app-plan` | 已按代码审查校准 Mac 主应用需求、架构改造路线、任务卡和验收门禁；需先合并 PR #1，再串行推进 adapter |
