# Current Dashboard

| slug | 类型 | 状态 | 当前阶段 | 分支 | 备注 |
|---|---|---|---|---|---|
| project-structure-template-migration | refactor | Complete | Done | `codex/project-structure-template-migration` | Phase 8 自动化验收通过；迁移后本地构建垃圾已物理清理，保留人工页签冒烟建议 |
| github-public-sync | release-prep | Deployed + Reconciled | G3 Done | `codex/project-structure-template-migration` | public 仓库已上线：`https://github.com/yinsheng508-byte/scene-image-tool`；`main` 和 `platform/macos-bootstrap` 保持同步；代码覆盖校验通过，40 份中文归档文档已补齐 |
| github-sync-macos | planning | Ready for MAC-01 | M0 Done | `platform/macos-bootstrap` | 已完成公开干净导出基线、Mac 首次启动和 Darwin runtime 探测；PR #1/#2 已合并，后续推进 adapter、CI 和打包 |
| win-mac-parallel-development | planning | Complete | Ready for GitHub | `codex/project-structure-template-migration` | 已形成 Windows / macOS 并行开发、CI、Project 看板和发布策略 |
| mac-development-runbook | docs | Complete | Ready for Mac | `platform/macos-bootstrap` | 已补齐真实 GitHub 地址、Mac 首次环境、clone、启动、smoke 和每日开发指令 |
| macos-main-app-development | planning | Merged | Ready for MAC-01 | `platform/macos-bootstrap` | Mac 主应用需求、架构改造路线、任务卡和验收门禁已合入基线；下一步串行推进 adapter |
| macos-adapter-boundary | platform | Merged | MAC-01 Done | `platform/macos-adapter-boundary` | PR #3 已合并，platform 总入口和 common capability helper 已进入 `platform/macos-bootstrap` |
| macos-process-adapter | platform | Merged | MAC-02 Done | `platform/process-adapter` | PR #4 已合并；跨平台进程终止 adapter 已进入 `platform/macos-bootstrap` |
| shared-capability-status | platform | Merged | MAC-03 Done | `feature/shared-capability-status` | PR #5 已合并；统一 health report、Office COM 非 Windows unsupported 早退和 `capability:getAll` IPC 已进入基线 |
| macos-export-preflight-ui | renderer | Merged | MAC-04 Done | `platform/macos-export-preflight-ui` | PR #6 已合并；macOS 导出预检文案和 Office unsupported 交互已进入基线 |
| macos-export-smoke | test | Merged | MAC-05 Done | `platform/macos-export-smoke` | PR #7 已合并；生成式 DOCX/PPTX LibreOffice fixture smoke 已进入 `platform/macos-bootstrap` |
| macos-package-dir | packaging | In Review | MAC-06 Done | `platform/macos-package-dir` | 已新增 unsigned macOS app bundle 配置；待 PR 合并到 `platform/macos-bootstrap` |
