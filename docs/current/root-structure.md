# 根目录结构

> 当前根目录事实。新增文件前先确认是否应该进入 `code/`、`docs/` 或本地忽略目录。

## Git 跟踪的根入口

| 路径 | 用途 |
|---|---|
| `.gitignore` | 仓库忽略策略 |
| `.gitattributes` | GitHub / macOS 协作的换行和二进制文件策略 |
| `AGENTS.md` | Agent / 开发者开工入口 |
| `CLAUDE.md` | Claude 入口，转向 `AGENTS.md` |
| `CODEX.md` | Codex 入口，转向 `AGENTS.md` |
| `GEMINI.md` | Gemini 入口，转向 `AGENTS.md` |
| `README.md` | 项目说明和开发命令 |
| `code/` | 当前代码根目录 |
| `docs/` | 当前文档、架构记忆和历史归档 |

## 已清理的本地忽略项

以下路径曾为迁移过渡期、本地样例或构建输出。2026-08-26 已按用户清理要求物理删除；`.gitignore` 仍保留规则，防止再次生成后误入 Git。

| 路径 | 处理 |
|---|---|
| `.migration-backups/` | 已删除 |
| `local-artifacts/` | 已删除 |
| `desktop - 副本/` | 已删除 |
| `虚拟笔记工具箱 - 副本.zip` | 已删除 |
| `.claude/settings.local.json` | 已删除 |
| `code/desktop/dist/` | 已删除，构建时按需重建 |
| `code/desktop/dist2/` | 已删除 |
| `code/desktop/_tmp/` | 已删除 |
| `code/desktop/_test_output/` | 已删除 |

## 规则

- 根目录不要新增业务代码、历史方案、样例文件、临时脚本或输出。
- 业务代码进入 `code/desktop/`。
- 当前事实进入 `docs/current/` 或 `docs/architecture/`。
- 历史资料进入 `docs/archive/`。
- 本地敏感资料、样例和备份默认放在项目外；确需短期放入工作区时使用被忽略的 `local-artifacts/`，交付或构建前清理。
