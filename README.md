# 流量蜂虚拟笔记工具

Windows Electron 桌面应用，包含文档一键导出、场景化图片排版、百变拼图排版、飞书一键上传、小红书商品图片下载、授权和版本检查。

## 当前状态

项目已按 `ai-project-template` 治理结构完成迁移。

- 迁移规划：`docs/ai-project-template-项目结构迁移落地规划.md`
- 迁移验收：`docs/current/acceptance.md`
- 当前开工入口：`AGENTS.md`
- 当前工作状态：`docs/current/WORKING_CONTEXT.md`
- 当前可运行应用目录：`code/desktop/`
- GitHub 公开同步执行手册：`docs/current/github-public-sync-runbook.md`
- macOS 开发落地指令：`docs/current/mac-development-runbook.md`

开发命令从 `code/desktop/` 执行。

## 开发命令

```powershell
npm --prefix code/desktop install
npm --prefix code/desktop run font:probe
npm --prefix code/desktop run puzzle:shadow:smoke
npm --prefix code/desktop run puzzle:text:smoke
npm --prefix code/desktop run check:lo-runtime
npm --prefix code/desktop run dist:dev
```

## 目录导航

- `code/desktop/`：当前 Electron 应用主体。
- `docs/INDEX.md`：文档导航。
- `docs/architecture/`：模块、组件、能力、闸口和禁区。
- `docs/current/`：当前任务、上下文、日志和验收。
- `docs/archive/`：历史方案和验证报告归档目标。
- 本地临时资料默认不保留在项目根；确需短期放入工作区时使用被忽略的 `local-artifacts/`，交付或构建前清理。
