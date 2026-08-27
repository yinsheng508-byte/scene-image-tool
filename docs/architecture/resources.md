# 资源治理

> 记录应用资源、第三方运行时、样例资料和敏感文件的版本化策略。涉及打包、字体、LibreOffice、样例文档或本地密钥时必读。

## 当前资源策略

| 路径 | 当前状态 | Git 策略 | 原因 | 后续任务 |
|---|---|---|---|---|
| `code/desktop/assets/` | 应用图标、二维码等运行资源 | 保持跟踪 | `package.json`、渲染界面和打包配置直接引用 | 新增资源前确认是否真用于应用 |
| `code/desktop/fonts/` | 字体运行资源，29 个文件，约 244 MiB | 当前迁移仓库暂时保留；GitHub public 首次线上基线只保留 `README.md`，不提交字体二进制 | 字体会显著放大首次 push / clone 成本，且需要单独确认授权和分发边界 | 后续改为 GitHub Release / artifact / provisioning script |
| `code/desktop/fonts/README.md` | 字体外部化策略说明 | 保持跟踪 | public 仓库需要解释为什么没有内置字体二进制 | 随字体 artifact 策略更新 |
| `code/desktop/vendor/libreoffice/` | 内置 LibreOffice 运行时，14069 个跟踪文件，约 740 MiB | 当前迁移仓库暂时保留；GitHub-ready 公开仓库排除 | `package.json extraResources` 和运行时探测仍依赖本地 Windows runtime；公开仓库不能携带 100 MiB+ DLL | 后续改为 Release artifact / 外部下载 / 本机安装探测 |
| `code/desktop/vendor/redist/` | VC Redistributable 安装资源，2 个跟踪文件 | 公开仓库只保留 `.sha256` 和说明，不保留 `vc_redist.x64.exe` | exe 属于 Windows-only runtime artifact，不应进入 Mac 开发基线 | 后续改为 Release artifact 或安装脚本 |
| `code/desktop/vendor/README.md` | runtime 外部化策略说明 | 保持跟踪 | 公开仓库需要说明为什么没有内置 runtime | 随 runtime manifest 更新 |
| `local-artifacts/` | 已物理删除 | 不跟踪 | 本地敏感资料、样例和临时碎片不应作为项目常驻内容 | 如需团队共享，改为脱敏模板、密钥管理系统或 `code/desktop/test-fixtures/` |
| `code/desktop/test-fixtures/` | 当前不存在 | 可跟踪脱敏样例 | `.gitignore` 已对该目录放行 | 需要内置 smoke 样例时单独新增并脱敏 |
| `docs/archive/reference/场景化图片排版工具.html` | 历史单页工具 | 跟踪为归档参考 | 当前应用入口已在 `code/desktop/` | 不作为当前运行入口 |

## 约束

- 不直接删除当前迁移仓库中的 `code/desktop/fonts/` 或 `code/desktop/vendor/libreoffice/`。
- GitHub public 首次线上基线必须排除 `code/desktop/fonts/` 字体二进制，只保留 `code/desktop/fonts/README.md`。
- GitHub-ready 公开导出仓库必须排除 `code/desktop/vendor/libreoffice/` 和 `code/desktop/vendor/redist/vc_redist.x64.exe`。
- 不把本地样例、压缩备份、密钥文档提交到 Git。
- 需要提交测试样例时，必须先脱敏并放入 `code/desktop/test-fixtures/`。
- `local-artifacts/` 不作为常驻目录；临时生成后应在交付或构建验收前清理。
- 当前没有内置 PPT smoke fixture；`ppt:smoke` 需要显式传入外部或临时样例路径。
- GitHub 同步前必须处理 `code/desktop/vendor/libreoffice/program/mergedlo.dll` 这类 100 MiB+ 文件；macOS 开发基线不应携带 Windows LibreOffice runtime。
- 大资源历史瘦身属于独立任务，不能混入普通功能开发或结构迁移。
