# Acceptance

## 当前状态

项目结构迁移已完成，Phase 8 自动化验收通过；迁移后本地构建垃圾清理和清理后自动验证已通过；GitHub public 首次上线、clone 验收和本地/远端覆盖校验已通过；macOS 首次 clone、`npm ci`、Electron 开发启动、Darwin LibreOffice runtime 探测和基础 puzzle smoke 已通过；页签级业务交互仍建议做人工冒烟。

## 最终验收范围

- 根目录结构。
- `code/desktop/` 运行入口。
- Electron 应用基础启动。
- 文档导出、百变拼图、飞书上传、小红书下载、设置/授权页签冒烟。
- 字体、拼图、LibreOffice / Office 相关最小自动化验证。
- Git 跟踪文件清单不包含明确构建产物。

## 验收记录

### 2026-08-28 macOS Bootstrap

| 验收项 | 命令 / 方法 | 结果 | 备注 |
|---|---|---|---|
| Mac 环境 | Xcode CLT、Homebrew、git、git-lfs、node@22、LibreOffice | 通过 | Node `v22.23.2`、npm `10.9.8`、git-lfs `3.7.1`、LibreOffice `26.8.0.3` |
| 公开 clone 依赖安装 | `npm --prefix code/desktop ci` | 通过，有告警 | 仍报告既有 21 个 npm audit 漏洞 |
| Electron 开发启动 | `cd code/desktop && npm exec electron .` | 通过 | 主界面可打开；runtime detection PR 后启动自检命中 `source=system_app` |
| macOS LibreOffice runtime 探测 | 直接调用 Darwin adapter + Electron 启动自检 | 通过 | 命中 `/Applications/LibreOffice.app/Contents/MacOS/soffice`，版本 `26.8.0.3`；缺失和 embedded mode 均返回结构化错误 |
| macOS LibreOffice 导出 fixture smoke | `npm --prefix code/desktop run export:fixture:smoke` | 通过 | 生成式 DOCX/PPTX fixture 2/2 通过；均完成 LibreOffice PDF 转换和 PDF 首页 PNG 渲染 |
| macOS LibreOffice 缺失模拟 | `npm --prefix code/desktop run export:fixture:smoke -- --runtime-mode embedded --output _test_output/export-fixture-smoke-missing` | 通过 | 返回 SKIP，`ok=false`、`skipped=true`、`errorCode=PLATFORM_UNSUPPORTED`，不误报 pass |
| macOS unsigned app bundle | `npm --prefix code/desktop run dist:mac:dir` | 通过 | 生成 `code/desktop/dist/mac-arm64/流量蜂虚拟笔记工具.app`；10 秒启动 smoke 通过，启动自检命中系统 LibreOffice |
| macOS app bundle 资源检查 | `find code/desktop/dist ...` + `asar list` + `git status --ignored --short code/desktop/dist` | 通过 | 包内 `app.asar` 包含 `platform/**`；Resources 下无 `libreoffice`、`redist`、`scripts`、`*.ps1`、`soffice.exe`、`vc_redist*`；`dist/` ignored |
| GitHub Actions 基础 CI matrix | PR #9 `Desktop CI` | 通过 | 最新 run：Windows job 57s、macOS job 31s；只运行 `npm ci`、两个 puzzle smoke 和 `git diff --check` |
| macOS native render fixture smoke | `npm --prefix code/desktop run render:fixture:smoke` | 通过 | Skia Canvas PNG、Sharp resize、PDFium PDF 渲染到 PNG 3/3 通过；PDFium PNG 960x540；PR #10 Desktop CI Windows 40s / macOS 25s |
| macOS Compose DOM smoke | Electron remote debugging + DOM file input + `window.appApi.saveImageFile()` | 通过 | 生成 `code/desktop/_test_output/compose-dom-smoke/skia-source_output.png`，1600x1000，非空，视觉检查正常 |
| macOS 平台能力设置页 | Electron remote debugging + `window.appApi.getCapabilities()` | 通过 | 设置页显示 LibreOffice、Office COM、PDF render、font、packaging 5 项；LibreOffice `system_app` 可用，Office COM `PLATFORM_UNSUPPORTED`；刷新按钮可恢复；无横向溢出、无元素重叠、无 Windows 修复词；PR #11 Desktop CI 通过：Windows 53s、macOS 32s |
| 拼图阴影回归 | `npm --prefix code/desktop run puzzle:shadow:smoke` | 通过 | 不依赖 bundled fonts |
| 拼图文字回归 | `npm --prefix code/desktop run puzzle:text:smoke` | 通过 | 不依赖 bundled fonts |
| 第一阶段禁跑命令 | 未执行 | 符合约束 | 未运行 `font:probe`、`check:lo-runtime`、`dist`、`dist:full`、`dist:dev` |

### 2026-08-28 GitHub 覆盖校验

| 验收项 | 命令 / 方法 | 结果 | 备注 |
|---|---|---|---|
| 远端状态 | GitHub API | 通过 | public，默认分支 `main`，`main` 与 `platform/macos-bootstrap` 保持同步 |
| 本地开发代码覆盖 | 本地 public-eligible 文件与远端 blob hash 对比 | 通过 | `code/desktop/` 缺失 0，内容不一致 0；本地 dirty 的 20 个开发文件均已上传且内容一致 |
| 文档覆盖 | 同一对比脚本 | 已修正 | 发现 40 份中文归档文档漏传，根因是前次导出时中文路径处理不完整；已补齐到 public 仓库 |
| 敏感信息扫描 | 高置信密钥 regex 扫描 | 通过 | 漏传文档中未发现高置信真实凭据；命中的 Authorization 字段为占位值或变量名 |
| 资源排除策略 | GitHub tree API | 通过 | 仍不含字体二进制、Windows LibreOffice runtime、VC redist exe 和 `.bootstrap` |
| public 文件数 | GitHub tree API | 通过 | 补齐后 public 源码 blob 数为 157 |

### 2026-08-27 GitHub public 首次上线

| 验收项 | 命令 / 方法 | 结果 | 备注 |
|---|---|---|---|
| public 仓库 | GitHub CLI / GitHub API | 通过 | `https://github.com/yinsheng508-byte/scene-image-tool`，visibility=`PUBLIC` |
| 远端分支 | GitHub ref API | 通过 | `main` 和 `platform/macos-bootstrap` 保持同步，当前 HEAD 以 GitHub refs 为准 |
| 远端禁止清单 | GitHub tree API | 通过 | 无 `.bootstrap`、字体二进制、`code/desktop/vendor/libreoffice/`、`code/desktop/vendor/redist/vc_redist.x64.exe` |
| clone 验收 | `git clone --depth 1 --branch platform/macos-bootstrap` | 通过 | clone 目录 `D:\deptask\scene-image-tool-clone-verify-20260827-163358`，tracked 文件数 117 |
| 公开 clone 依赖安装 | `npm --prefix code/desktop ci` | 通过，有告警 | 375 packages installed；仍有 21 个 npm audit 漏洞，后续独立治理 |
| 公开 clone 拼图阴影回归 | `npm --prefix code/desktop run puzzle:shadow:smoke` | 通过 | `failed=0` |
| 公开 clone 拼图文字回归 | `npm --prefix code/desktop run puzzle:text:smoke` | 通过 | `failed=0`，`previewExportMeanAlphaDiff=0.018467150054466232` |

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
- GitHub public 首次线上基线不包含字体二进制和 Windows LibreOffice runtime；严格字体探针和 Windows full build 需在本地资源或 artifact provisioning 完成后执行。
- `check:lo-runtime` 当前是 Windows embedded runtime 检查，不作为 macOS 系统 LibreOffice 验收命令。
- `dist:dev` 产物因 `asar=false` 不适用于严格 packaged 字体探针；正式 `dist:checked` 已验证 packaged 探针通过。
- 页签级业务交互未使用自动化工具点击验证；当前项目未引入 Playwright / Electron 自动化依赖。
- `local-artifacts/` 已删除；当前已有生成式 `export:fixture:smoke` 覆盖基础 DOCX/PPTX 导出，旧 `ppt:smoke` 仍需要外部样例路径。
