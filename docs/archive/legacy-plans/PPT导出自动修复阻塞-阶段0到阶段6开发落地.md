# PPT 导出自动修复阻塞 - 阶段0到阶段6开发落地

## 阶段0：基线与诊断口径

已落地：

1. 主进程导出入口记录关键参数：
   - `fileConcurrency`
   - `pageConcurrency`
   - `officeTimeoutMs`
   - `pptRetryCount`
2. 最终结果新增 `diagnostics.ppt` 汇总：
   - `total`
   - `repaired`
   - `retried`
   - `fallbackOpened`

代码位置：

- `desktop/main.js` `convert:documents` handler

---

## 阶段1：核心修复（OpenAndRepair）

已落地：

1. 单文件脚本 `ppt-to-pdf.ps1`：
   - 优先 `Open2007(..., OpenAndRepair=true)`
   - 回退 `Open(...)`
2. 批量脚本 `ppt-batch-to-pdf.ps1`：
   - 同样优先 `Open2007`，失败回退 `Open`

代码位置：

- `desktop/scripts/ppt-to-pdf.ps1`
- `desktop/scripts/ppt-batch-to-pdf.ps1`

---

## 阶段2：超时与重试（抗阻塞）

已落地：

1. PowerShell 调用层支持超时：
   - 超时后 `taskkill /T /F` 杀进程树
   - 返回 `PS_TIMEOUT`
2. 单文件 PPT 转换支持重试：
   - 按 `pptRetryCount` 执行
   - 仅重试可重试错误
3. 批量 PPT 失败项自动逐文件兜底重试：
   - 批量先跑
   - 失败项逐个走单文件重试策略

代码位置：

- `desktop/main.js`
  - `runPowerShellScript`
  - `runPptToPdfWithRetry`
  - `convertPptSourceToPdf`
  - `convert:documents` 内 PPT 批量兜底逻辑

---

## 阶段3：编码与错误语义

已落地：

1. 脚本输出统一 UTF-8：
   - `[Console]::OutputEncoding = UTF8`
2. 主进程解码兜底：
   - UTF-8 优先
   - `gb18030` 兜底
3. Office 错误码提取与映射：
   - 提取 `0xXXXXXXXX`
   - 映射友好提示（含 `0x80070570`, `0x80004005`, `PS_TIMEOUT` 等）

代码位置：

- `desktop/main.js`
- `desktop/scripts/ppt-to-pdf.ps1`
- `desktop/scripts/ppt-batch-to-pdf.ps1`

---

## 阶段4：可观测性增强

已落地：

1. 每个文件结果增加结构化字段：
   - `errorCode`
   - `conversionMeta`
   - `fileReports`
2. `conversionMeta` 关键字段：
   - `openMode`
   - `repaired`
   - `retries`
   - `durationMs`
   - `fallbackReason`
3. 前端日志补充 PPT 诊断汇总展示。

代码位置：

- `desktop/main.js`（返回结果与进度事件）
- `desktop/renderer/renderer.js`（日志与错误展示）

---

## 阶段5：兼容回退策略

已落地：

1. `Open2007` 不可用时自动 `Open` 回退。
2. 回退原因可观测：
   - `fallbackReason`
   - `openMode`
3. `ExportAsFixedFormat` 失败时自动 `SaveAs(PDF)` 回退。

代码位置：

- `desktop/scripts/ppt-to-pdf.ps1`
- `desktop/scripts/ppt-batch-to-pdf.ps1`

---

## 阶段6：回归脚本与发布前检查

已落地：

1. 新增 smoke 脚本：
   - `desktop/scripts/ppt-export-smoke.js`
2. 支持参数：
   - `--input <file-or-dir>`
   - `--timeout <ms>`
   - `--limit <n>`
   - `--report <json>`
3. `package.json` 新增命令：
   - `npm run ppt:smoke -- --input "<路径>"`

---

## 建议验收命令

1. 单文件验证：

```bash
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -File desktop\scripts\ppt-to-pdf.ps1 "<input.pptx>" "<output.pdf>"
```

2. 批量回归：

```bash
cd desktop
npm run ppt:smoke -- --input "D:\deptask\星河笔记内容\资料\四下英语\01 课件+教案+练习+学习任务单（更新中）" --report "..\docs\ppt-smoke-report.json"
```

3. 观察返回结果（主进程）：
   - `errors[].errorCode`
   - `fileReports[].conversionMeta`
   - `diagnostics.ppt`

---

## 回滚点

如需快速回滚到旧逻辑：

1. 仅保留脚本 `Open2007` 修复，不启用批量失败项逐文件兜底；
2. 将 `pptRetryCount` 设为 `0`；
3. 将 `SCENE_OFFICE_TIMEOUT_MS` 调大，避免误判超时。
