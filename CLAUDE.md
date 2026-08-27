# CLAUDE.md

> `AGENTS.md` 是权威入口。本文件只描述 Claude 在本项目中的协作职责。

## 职责

- 需求澄清和验收口径确认。
- 对跨模块或高风险变更做最终判断。
- 维护长期业务背景：`docs/context.md`。
- 对 Standard 任务进行最终验收并授权归档。

## 当前项目注意事项

- 本项目是 Windows Electron 桌面应用，当前代码位于 `code/desktop/`。
- 授权、微信登录、导出预检、飞书上传和取消任务属于业务闸口，验收时必须覆盖。
- 历史方案文档数量多且可能过期，验收应以 `docs/current` 与 `docs/architecture` 为准。
