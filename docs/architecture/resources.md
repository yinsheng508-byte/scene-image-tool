# 资源治理

> 记录应用资源、第三方运行时、样例资料和敏感文件的版本化策略。涉及打包、字体、LibreOffice、样例文档或本地密钥时必读。

## 当前资源策略

| 路径 | 当前状态 | Git 策略 | 原因 | 后续任务 |
|---|---|---|---|---|
| `code/desktop/assets/` | 应用图标、二维码等运行资源 | 保持跟踪 | `package.json`、渲染界面和打包配置直接引用 | 新增资源前确认是否真用于应用 |
| `code/desktop/fonts/` | 字体运行资源，29 个文件，约 244 MiB | 当前迁移仓库暂时保留；GitHub public 首次线上基线只保留 `README.md`，不提交字体二进制 | 字体会显著放大首次 push / clone 成本，且需要单独确认授权和分发边界 | 后续改为 GitHub Release / artifact / provisioning script |
| `code/desktop/fonts/README.md` | 字体外部化策略说明 | 保持跟踪 | public 仓库需要解释为什么没有内置字体二进制 | 随字体 artifact 策略更新 |
| `code/desktop/vendor/libreoffice/` | 内置 LibreOffice 运行时，14069 个跟踪文件，约 740 MiB；public clone 中不存在 | 当前迁移仓库暂时保留；GitHub-ready 公开仓库排除 | MAC-06 已把 Windows runtime 下沉到 `build.win.extraResources`；macOS package 不再读取该目录 | 后续改为 Release artifact / 外部下载 / 本机安装探测 |
| `code/desktop/vendor/redist/` | VC Redistributable 安装资源，2 个跟踪文件 | 公开仓库只保留 `.sha256` 和说明，不保留 `vc_redist.x64.exe` | exe 属于 Windows-only runtime artifact，不应进入 Mac 开发基线 | 后续改为 Release artifact 或安装脚本 |
| `code/desktop/vendor/README.md` | runtime 外部化策略说明 | 保持跟踪 | 公开仓库需要说明为什么没有内置 runtime | 随 runtime manifest 更新 |
| `code/desktop/resources/runtime-manifest.json` | runtime / 字体 artifact 清单 | 保持跟踪 | 新 clone 需要知道每类外部资源的 source、version、sha256 / checksum 状态和 target path | 随资源版本、checksum 和授权状态更新 |
| `code/desktop/scripts/provision-runtime-artifacts.js` | 本地 artifact provisioning 脚本 | 保持跟踪 | 从外部 artifact root 复制资源并校验 sha256；支持 dry-run 和 check-only | 不负责下载或上传未授权资源 |
| macOS 系统 LibreOffice | 通过 `code/desktop/platform/darwin/libreoffice-runtime.js` 探测 `/Applications/LibreOffice.app/Contents/MacOS/soffice`、`/opt/homebrew/bin/soffice`、`/usr/local/bin/soffice` 和 `LIBREOFFICE_PATH` | 不跟踪二进制 | macOS 开发基线依赖系统安装，不携带 runtime dump | 后续与统一 platform adapter / runtime manifest 对齐 |
| `local-artifacts/` | 已物理删除 | 不跟踪 | 本地敏感资料、样例和临时碎片不应作为项目常驻内容 | 如需团队共享，改为脱敏模板、密钥管理系统或 `code/desktop/test-fixtures/` |
| `code/desktop/test-fixtures/` | 已新增 `export-basic/` 生成式 DOCX/PPTX fixture manifest | 可跟踪脱敏样例，不跟踪运行生成的 Office/PDF/PNG 输出 | `.gitignore` 已对该目录放行；`export:fixture:smoke` 的实际输出进入 `code/desktop/_test_output/` | 后续新增 fixture 继续使用小型公开样例或生成式定义 |
| `docs/archive/reference/场景化图片排版工具.html` | 历史单页工具 | 跟踪为归档参考 | 当前应用入口已在 `code/desktop/` | 不作为当前运行入口 |

## 约束

- 不直接删除当前迁移仓库中的 `code/desktop/fonts/` 或 `code/desktop/vendor/libreoffice/`。
- GitHub public 首次线上基线必须排除 `code/desktop/fonts/` 字体二进制，只保留 `code/desktop/fonts/README.md`。
- GitHub-ready 公开导出仓库必须排除 `code/desktop/vendor/libreoffice/` 和 `code/desktop/vendor/redist/vc_redist.x64.exe`。
- 不把本地样例、压缩备份、密钥文档提交到 Git。
- 不把本地 artifact root 放进 Git；如临时放到 `code/desktop/resources/artifacts/`，该目录已被忽略，提交前仍需确认没有大文件 staged。
- 需要提交测试样例时，必须先脱敏并放入 `code/desktop/test-fixtures/`。
- `local-artifacts/` 不作为常驻目录；临时生成后应在交付或构建验收前清理。
- 当前已有 `export:fixture:smoke` 生成式 DOCX/PPTX fixture，用于 macOS LibreOffice 导出 smoke；旧 `ppt:smoke` 仍需要显式传入外部或临时样例路径。
- GitHub 同步前必须处理 `code/desktop/vendor/libreoffice/program/mergedlo.dll` 这类 100 MiB+ 文件；macOS 开发基线不应携带 Windows LibreOffice runtime。
- 大资源历史瘦身属于独立任务，不能混入普通功能开发或结构迁移。
- `npm --prefix code/desktop run check:lo-runtime` 当前只检查 Windows embedded LibreOffice runtime，不作为 macOS 系统 LibreOffice 探测命令；macOS 使用 `platform/darwin/libreoffice-runtime.js` 和后续 `check:runtime:mac`。
- `dist:mac:dir` 已实现为 macOS unsigned app bundle 验收命令；通用 `dist` / `dist:dev` 仍不作为 macOS 必需验收命令。

## Provisioning commands

检查当前平台资源状态，不复制文件：

```bash
npm --prefix code/desktop run resources:check
```

查看将要从本地 artifact root 准备哪些资源：

```bash
npm --prefix code/desktop run resources:provision:dry-run -- --artifact-root /path/to/runtime-artifacts
```

从本地 artifact root 复制并校验指定资源：

```bash
SCENE_RUNTIME_ARTIFACT_ROOT=/path/to/runtime-artifacts \
  npm --prefix code/desktop run resources:provision -- --platform win32 --artifact windows-vc-redist-x64
```

建议的 artifact root 结构：

```text
runtime-artifacts/
  fonts/
  windows/
    libreoffice/
    redist/
      vc_redist.x64.exe
```

`windows-vc-redist-x64` 已记录 sha256，校验不匹配会阻断复制。字体和 Windows LibreOffice runtime 的逐文件 checksum 仍需在授权和 artifact 存储确定后补齐；未补齐前，`--strict-checksums` 会把缺失 checksum 视为错误。
