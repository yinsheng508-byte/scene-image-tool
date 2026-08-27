# LibreOffice Full 版回滚说明

> 日期：2026-03-12

## 回滚目标

在 Full 包出现运行时异常或发布风险时，快速回退到可运行状态，保证导出业务可用。

## 运行时回滚（最快）

1. 设置环境变量：`SCENE_LO_RUNTIME_MODE=system`
2. 重启应用。
3. 再次执行导出预检，确认 `runtime.source` 为 `env/registry/path/program_files` 之一。

说明：该方式不改包体，只改变运行时解析策略，优先用于应急恢复。

## 构建层回滚

1. 使用非 Full 构建命令：`npm run dist`
2. 临时移除/禁用 `extraResources` 中 `vendor/libreoffice` 注入配置。
3. 发布 system-only 包并在发布说明中标注“需系统 LibreOffice”。

## UI 层回滚

无需回滚。当前“下载 LibreOffice”按钮作为备用修复通道，可同时适用于 Full 与 system-only 包。

## 验证项

1. 导出主流程可用（至少验证 PPT/Word/PDF 各 1 个样本）。
2. 进度、失败清单、日志导出等交互无回归。
3. 日志可看到 `runtime.mode` 和 `runtime.source` 与回滚策略一致。
