# AGENTS.md

> 唯一权威入口。所有 agent / 开发者开工前必读。  
> 本项目已迁移到 `ai-project-template` 治理结构；以本文件和 `docs/current/WORKING_CONTEXT.md` 为当前事实来源。

## 开工必读顺序

每次开工按顺序阅读：

1. `AGENTS.md`
2. `docs/current/WORKING_CONTEXT.md`
3. `docs/architecture/map.md`

按任务类型追加阅读：

- 新增或调整 UI：`docs/architecture/components.md`
- 新增能力或模块：`docs/architecture/capabilities.md`
- 修改现有代码：`docs/architecture/do-not-break.md`
- 涉及授权、登录、导出、上传、取消任务：`docs/architecture/gates.md`
- 涉及字体、LibreOffice、样例资料、敏感文件或本地资源：`docs/architecture/resources.md`
- 需要历史背景：`docs/context.md`

## 当前结构状态

当前结构迁移已完成：

- 当前可运行应用主体：`code/desktop/`
- 当前协作文档入口：`docs/INDEX.md`
- 迁移验收记录：`docs/current/acceptance.md`

后续开发命令和路径以 `code/desktop/` 为准。

## 任务模式

开工第一步必须声明模式：

| 模式 | 适用场景 |
|---|---|
| 只梳理，不修改 | 只做现状分析 |
| 深度分析，给方案 | 输出方案，不落地代码 |
| 写任务卡，不开发 | 拆解任务，等确认 |
| 直接开发，逐项验收 | 按任务卡串行执行 |
| Quick Fix，直接修复 | 小范围明确修复 |
| review，先找问题 | 只读审查 |
| 生产变更，必须完整备份 | 涉及生产配置、发布或数据 |

当前任务模式：`直接开发，逐项验收`。

## Git 纪律

- 当前迁移分支：`codex/project-structure-template-migration`。
- 当前工作区包含大量迁移前已有改动，提交时必须只 stage 本阶段授权文件。
- 不使用 `git reset --hard`。
- 不用模板覆盖业务文件。
- 不提交 `node_modules/`、`dist/`、`dist2/`、备份压缩包、临时快照。
- 每个阶段一个原子提交，提交前验证并回写 `docs/current/session-log.md`。

## 工作流

### Quick Fix

适用于 1-3 个文件的小修复。必须：

1. 读开工必读文件和相关源码。
2. 说明影响范围。
3. 修改并做最小验证。
4. 写入 `docs/current/session-log.md`。

### Standard

适用于跨模块、结构迁移、完整功能和多阶段任务。必须：

1. 在 `docs/current/tasks.md` 维护任务状态。
2. 每完成一个阶段更新 `docs/current/WORKING_CONTEXT.md`。
3. 新增模块、能力、组件、闸口和禁区时更新 `docs/architecture/`。
4. 最终写入 `docs/current/acceptance.md`。

## 文档写回规则

| 变更类型 | 写回位置 |
|---|---|
| 阶段推进 | `docs/current/tasks.md`、`docs/current/session-log.md`、`docs/current/WORKING_CONTEXT.md` |
| 模块或目录变化 | `docs/architecture/map.md` |
| 新增 UI 组件 | `docs/architecture/components.md` |
| 新增可复用能力 | `docs/architecture/capabilities.md` |
| 授权、登录、导出、上传等统一入口 | `docs/architecture/gates.md` |
| 不能破坏的兼容逻辑 | `docs/architecture/do-not-break.md` |
| 字体、运行时、样例、敏感文件和本地资源 | `docs/architecture/resources.md` |
| 长期背景和术语 | `docs/context.md` |

## 禁止事项

- 不读 `WORKING_CONTEXT.md` 就修改代码。
- 不查 `do-not-break.md` 就重构现有逻辑。
- 不查 `gates.md` 就绕过授权、登录、导出预检、上传和取消任务入口。
- 在治理或结构任务中顺手修改业务逻辑。
- 删除或覆盖迁移前已有未提交业务改动。
- 把历史方案文档当成当前事实，当前事实必须以 `docs/current` 和 `docs/architecture` 为准。
