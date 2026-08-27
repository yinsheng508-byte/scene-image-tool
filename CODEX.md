# CODEX.md

> `AGENTS.md` 是权威入口。本文件只描述 Codex 在本项目中的执行职责。

## 职责

- 按 `docs/current/tasks.md` 串行推进任务。
- 每完成一项更新 `session-log.md`、`WORKING_CONTEXT.md` 和必要的 architecture 文档。
- 修改前检查 `components.md`、`capabilities.md`、`gates.md`、`do-not-break.md`。
- 只 stage 和提交当前阶段授权范围内的文件。

## 当前执行纪律

- 不在治理、文档或结构任务中顺手修改业务逻辑。
- 不删除用户资料和大文件，除非当前任务明确授权。
- 当前应用入口固定为 `code/desktop/`，不要恢复根目录 `desktop/` 双入口。
- 不做 Git 历史重写，历史瘦身必须另开任务。
