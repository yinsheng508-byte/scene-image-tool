# Acceptance

## 当前状态

项目结构迁移已完成，Phase 8 自动化验收通过；迁移后本地构建垃圾清理和清理后自动验证已通过；页签级业务交互仍建议做人工冒烟。

## 最终验收范围

- 根目录结构。
- `code/desktop/` 运行入口。
- Electron 应用基础启动。
- 文档导出、百变拼图、飞书上传、小红书下载、设置/授权页签冒烟。
- 字体、拼图、LibreOffice / Office 相关最小自动化验证。
- Git 跟踪文件清单不包含明确构建产物。

## 验收记录

### 2026-08-26 Phase 8

| 验收项 | 命令 / 方法 | 结果 | 备注 |
|---|---|---|---|
| LibreOffice 运行时 | `npm --prefix code/desktop run check:lo-runtime` | 通过 | version=`26.2.1.2`，probe=`soffice.com` |
| 开发字体探针 | `npm --prefix code/desktop run font:probe` | 通过 | `registered=10/10`，`faces=19`，`failed=0` |
| 系统字体枚举 | `npm --prefix code/desktop run font:enum:smoke` | 通过，有告警 | `powershell.exe` PATH 调用失败，绝对路径枚举成功：337 个字体族，中文显示名 27 个 |
| 拼图阴影回归 | `npm --prefix code/desktop run puzzle:shadow:smoke` | 通过 | `pipelineVersion=2`，`failed=0` |
| 拼图文字回归 | `npm --prefix code/desktop run puzzle:text:smoke` | 通过 | `failed=0`，`previewExportMeanAlphaDiff=0.018467150054466232` |
| PPT 导出 smoke | `npm --prefix code/desktop run ppt:smoke -- --input local-artifacts/samples --limit 2 --report code/desktop/dist/ppt-smoke-phase8.json` | 通过 | 2/2 通过，耗时约 50.8s 和 10.1s |
| 开发目录构建 | `npm --prefix code/desktop run dist:dev` | 通过 | 生成 `code/desktop/dist/win-unpacked` |
| 正式构建和 packaged 字体探针 | `npm --prefix code/desktop run dist:checked` | 通过 | NSIS、portable、packaged font probe 均通过 |
| Electron 基础启动 | 启动 `code/desktop/dist/win-unpacked/流量蜂虚拟笔记工具.exe` 并等待 10 秒 | 通过 | 进程存活 10 秒后关闭，无残留进程 |
| 关键 JS 语法 | `node --check` 检查 `main.js`、`preload.js`、`renderer.js`、`puzzle/index.js` | 通过 | 无语法错误 |
| Git 禁止清单 | `git ls-files` + forbidden pattern 扫描 | 通过 | 无 `desktop/`、`dist2/`、根密钥、根样例、根临时碎片跟踪项 |
| 忽略规则 | `git check-ignore` 抽查 | 通过 | `code/desktop/dist/*`、`local-artifacts/*` 均被忽略 |

### 2026-08-26 本地构建垃圾清理

| 验收项 | 命令 / 方法 | 结果 | 备注 |
|---|---|---|---|
| 根目录物理结构 | `Get-ChildItem -Force` | 通过 | 根目录只剩 `.git`、`code/`、`docs/` 和入口文档/配置 |
| 删除目标不存在 | `Test-Path` 抽查清理目标 | 通过 | `.claude/`、`.migration-backups/`、`desktop - 副本/`、根备份 ZIP、`local-artifacts/`、`code/desktop/dist*`、`_tmp`、`_test_output` 均不存在 |
| Git 跟踪清单 | `git ls-files` 抽查清理目标 | 通过 | 本地备份、构建产物和 artifacts 无跟踪项 |
| 无引用历史探针 | `rg` 引用扫描 + `git diff --name-status` | 通过 | 删除 `probe_test1.js`、`probe_test2.js`、`未命名 (1).png` 和未引用 baseline 脚本；保留被业务引用的 `selection-controller.js` |
| LibreOffice 运行时 | `npm --prefix code/desktop run check:lo-runtime` | 通过 | version=`26.2.1.2` |
| 开发字体探针 | `npm --prefix code/desktop run font:probe` | 通过 | `registered=10/10`，`faces=19`，`failed=0` |
| 系统字体枚举 | `npm --prefix code/desktop run font:enum:smoke` | 通过 | 绝对路径 PowerShell 枚举成功，337 个字体族 |
| 拼图阴影回归 | `npm --prefix code/desktop run puzzle:shadow:smoke` | 通过 | `failed=0` |
| 拼图文字回归 | `npm --prefix code/desktop run puzzle:text:smoke` | 通过 | `failed=0` |
| 关键 JS 语法 | `node --check` 扫描非 vendor / 非 dist JS | 通过 | `checked=47` |
| 开发目录构建 | `npm --prefix code/desktop run dist:dev` | 通过 | 清理后可重新生成 `dist/win-unpacked` |
| 构建产物内容 | `Test-Path` 抽查 unpacked 包 | 通过 | 已删除探针/图片未进入包；被引用的 `selection-controller.js` 正常进入包 |
| Electron 基础启动 | 启动 `dist/win-unpacked/流量蜂虚拟笔记工具.exe` 并等待 10 秒 | 通过 | 进程存活 10 秒后关闭，无残留进程 |
| 验证后产物清理 | 删除验证生成的 `code/desktop/dist/` 后复查 | 通过 | 最终工作区不保留构建产物 |
| PPT 导出 smoke | 未复跑 | 不适用 | 本地样例 `local-artifacts/samples/` 已按清理要求删除；后续需外部样例路径或脱敏 fixture |

## 已知残余

- 迁移前已有 `code/desktop` 业务改动仍保留在工作区，未纳入本次结构迁移提交。
- `code/desktop/fonts/` 和 `code/desktop/vendor/libreoffice/` 仍保留在当前 Git 索引，历史瘦身需后续独立任务。
- `dist:dev` 产物因 `asar=false` 不适用于严格 packaged 字体探针；正式 `dist:checked` 已验证 packaged 探针通过。
- 页签级业务交互未使用自动化工具点击验证；当前项目未引入 Playwright / Electron 自动化依赖。
- `local-artifacts/` 已删除，当前没有内置 PPT smoke fixture；需要常规复跑时应新增脱敏的 `code/desktop/test-fixtures/`。
