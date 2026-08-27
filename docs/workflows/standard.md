# Standard 工作流

适用：跨模块变更、结构迁移、完整功能、多阶段任务。

## 流程

```text
注册任务 -> 任务拆分 -> 逐项执行 -> 阶段验证 -> 文档写回 -> review/验收 -> 归档
```

## 执行要求

- 任务写入 `docs/current/tasks.md`。
- 当前状态写入 `docs/current/WORKING_CONTEXT.md`。
- 每完成一项写入 `docs/current/session-log.md`。
- 新增模块、组件、能力、闸口、禁区时更新 `docs/architecture/`。
- 最终验收写入 `docs/current/acceptance.md`。

## 分支规则

默认在当前任务分支串行执行。需要拆分长期开发时，再创建 `codex/<slug>` 子分支。

