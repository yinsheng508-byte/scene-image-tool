# GitHub 同步与 macOS 版本开发准备方案

> 日期：2026-08-26
> 当前模式：生产变更，必须完整备份
> 目标：把项目同步到 GitHub，并作为后续 macOS 版本开发基线。
> 结论先行：当前仓库不能直接推送 GitHub。用户已要求公开仓库，因此已公开 GitHub-ready 干净导出仓库，未公开当前 `.git` 历史。
> GitHub 仓库：`https://github.com/yinsheng508-byte/scene-image-tool`
> 并行开发方案：`docs/current/win-mac-parallel-development.md`。
> 公开执行手册：`docs/current/github-public-sync-runbook.md`。
> Mac 落地指令：`docs/current/mac-development-runbook.md`。

## 1. 当前审计结论

### 1.1 Git / 远端状态

| 项 | 结果 |
|---|---|
| 当前分支 | `codex/project-structure-template-migration` |
| 当前 HEAD | `13ac1b3 chore: remove local build clutter` |
| 当前迁移仓库 Git remote | 当前无 remote |
| public GitHub 远端 | `https://github.com/yinsheng508-byte/scene-image-tool` |
| GitHub CLI | 已安装并登录 `yinsheng508-byte` |
| Git LFS | 已安装，`git-lfs/3.7.0` |
| `git filter-repo` | 未安装 |
| Git 对象体量 | loose 约 1.07 GiB，pack 约 1.71 GiB |

### 1.2 当前不能直接 push 的硬阻断

GitHub 官方文档说明普通 Git 文件超过 100 MiB 会被阻止，推荐用 Git LFS 或 Release 分发大二进制；仓库也建议保持小体量，避免 clone 和维护成本过高。

参考：

- [GitHub: About large files on GitHub](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)
- [GitHub: Repository limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits)
- [GitHub: About Git Large File Storage](https://docs.github.com/repositories/working-with-files/managing-large-files/about-git-large-file-storage)

本项目当前命中：

| 类型 | 具体问题 | 影响 |
|---|---|---|
| 当前 HEAD 大文件 | `code/desktop/vendor/libreoffice/program/mergedlo.dll` 约 140.85 MiB | 普通 Git push 到 GitHub 会被拒绝 |
| 历史大文件 | 历史中存在 `desktop/_tmp/LibreOffice_26.2.1_Win_x86-64.msi` 约 355.36 MiB、`寻根之旅.pptx` 约 332.03 MiB、`desktop/dist2/*.exe` 约 201-281 MiB | 即使当前已删，完整历史 push 仍会失败或污染仓库 |
| 敏感历史 | 历史中出现过 `API_key.md`、`.claude/settings.local.json` | 不适合公开仓库；私有仓库也建议先清历史并轮换密钥 |
| 当前未提交业务改动 | 19 个已跟踪业务文件修改 + 1 个被引用的未跟踪 `selection-controller.js` | 同步前必须决定纳入、拆分提交或暂存，否则 GitHub 基线不清 |
| Windows 运行时入库 | `code/desktop/vendor/libreoffice/` 约 740 MiB，14068 个 tracked 文件 | Mac 开发不需要 Windows runtime，会严重拖慢 clone |

### 1.3 当前未提交业务改动

当前工作区仍有迁移前业务改动，主要集中在：

- `code/desktop/main.js`
- `code/desktop/preload.js`
- `code/desktop/package.json`
- `code/desktop/package-lock.json`
- `code/desktop/renderer/index.html`
- `code/desktop/renderer/renderer.js`
- `code/desktop/renderer/styles.css`
- `code/desktop/renderer/puzzle/*`
- `code/desktop/scripts/*`
- `code/desktop/shared/text-layout.mjs`
- `code/desktop/renderer/puzzle/selection-controller.js`：未跟踪，但已被 `puzzle/index.js` 引用，不能忽略。

同步前必须先审查这批业务改动。否则 GitHub 上的初始状态会和本地可运行状态不一致。

## 2. 推荐同步路线

### 推荐：新建 GitHub-ready 干净仓库

原因：

- 原历史已经包含 100 MiB+ 二进制和敏感路径。
- 当前仓库是迁移现场，保留本地历史有价值，但不适合作为 GitHub 首次公开/协作历史。
- macOS 开发不应从携带 Windows LibreOffice runtime 的仓库开始。

目标形态：

```text
scene-image-tool/
  .gitattributes
  .gitignore
  AGENTS.md
  README.md
  code/
    desktop/
      main.js
      preload.js
      package.json
      package-lock.json
      renderer/
      scripts/
      shared/
      assets/
      fonts/
        README.md             # public 首次线上基线只保留说明，不保留字体二进制
      vendor/
        libreoffice/          # 不进入 GitHub-ready 仓库，改为外部 artifact 或本机安装
        redist/               # Windows-only，后续放 Release artifact 或安装脚本
  docs/
```

策略：

1. 本地仓库继续保留为迁移和 Windows 历史备份。
2. 新建干净导出目录，重新 `git init`，只提交 GitHub-ready 文件。
3. 首次 GitHub 仓库按用户要求设为 public，但必须只推干净导出仓库，不推当前迁移历史。
4. 密钥按“已泄露历史”处理：轮换 `API_key.md` 中曾出现过的密钥，不把旧历史推上远端。
5. Windows runtime 不直接入库；后续通过 GitHub Release、对象存储或安装脚本下载。

### 备选：保留历史并做历史瘦身

仅在必须保留本地 commit 历史时使用。要求：

1. 先完成完整备份。
2. 提交或暂存当前业务改动。
3. 安装 `git filter-repo` 或使用 `git lfs migrate import`。
4. 从历史移除敏感路径：`API_key.md`、`.claude/settings.local.json`。
5. 从历史移除构建产物和样例大文件：`desktop/dist2/`、`desktop/_tmp/`、`寻根之旅.pptx` 等。
6. 当前 HEAD 的 `mergedlo.dll` 必须改为 LFS、Release artifact 或从 Git 移除。
7. 如果未来已有远端，需要协调 force push。

当前不建议走这条路线，因为本仓库还未绑定 remote，新建干净仓库成本更低、风险更小。

## 3. 分阶段落地计划

### Phase G0：同步决策冻结

状态：已完成。

已确认：

- GitHub 仓库名和归属：`yinsheng508-byte/scene-image-tool`。
- 仓库可见性：用户已要求 public。
- 历史策略：采用“干净仓库首次导入”，不公开原历史。
- 当前迁移前业务改动：导出仓库纳入当前工作树快照，当前迁移仓库不混入业务提交。

验收：

- 远端 URL 明确：`https://github.com/yinsheng508-byte/scene-image-tool`。
- 历史策略明确。
- 业务改动处理策略明确。
- 本地导出目录 `D:\deptask\scene-image-tool-github-public` 初始化成功。

### Phase G1：业务改动审查和提交

状态：本轮不在当前迁移仓库拆分提交；干净导出仓库纳入当前工作树快照。

执行：

- 审查当前 19 个 modified 文件和 `selection-controller.js`。
- 按功能拆分提交，至少拆成：
  - 版本与 LibreOffice runtime 配置。
  - Office / PPT / Word 兼容修复。
  - 拼图框选和文字布局改动。
  - UI / 样式改动。
- 每个提交跑对应最小验证。

验收：

- `git status --short` 只剩 GitHub 准备项或完全干净。
- `selection-controller.js` 被纳入正确业务提交。

### Phase G2：资源外部化

状态：导出层面执行；源码后续仍需做 runtime manifest 和平台 adapter。

执行：

- 从 GitHub-ready 仓库移除 `code/desktop/vendor/libreoffice/`。
- 从 GitHub-ready 仓库移除 Windows-only `code/desktop/vendor/redist/vc_redist.x64.exe`，保留 `.sha256` 或改为 manifest。
- 新增资源说明或 manifest，记录：
  - Windows LibreOffice runtime 版本和校验。
  - macOS 使用系统 LibreOffice 或后续 artifact。
  - redist 下载来源和校验。
- 调整 `check:lo-runtime`：本地没有 vendor runtime 时不能阻断普通开发安装；打包前再做平台-specific 检查。

验收：

- 当前 HEAD 无 100 MiB+ tracked 文件。
- `git ls-tree -r -l HEAD` 大文件扫描通过。
- Windows 本机仍能通过外部 runtime 或现有本地 runtime 构建。

### Phase G3：创建 GitHub-ready 仓库并首次推送

状态：已完成并上线。

执行：

具体过程见 `docs/current/github-public-sync-runbook.md`。当前保留两个本地导出目录：

```powershell
D:\deptask\scene-image-tool-github-public
D:\deptask\scene-image-tool-github-public-split
```

验收：

- GitHub 远端 `main` 首次上线成功。
- GitHub 远端 `platform/macos-bootstrap` 已创建。
- GitHub 页面不显示大文件警告。
- clone 到新目录后能 `npm --prefix code/desktop ci`。

已完成：

- `D:\deptask\scene-image-tool-github-public` 已初始化为 `main` 分支。
- `D:\deptask\scene-image-tool-github-public-split` 已作为 public 首次线上基线。
- public 远端 `main` 和 `platform/macos-bootstrap` 均指向 `e20a52dd1df9e6f632eee36946f34b7f9a80ee6b`。
- public 首次线上基线跟踪 117 个文件，不包含当前迁移仓库历史。
- public 首次线上基线无 95 MiB+ 文件。
- 未跟踪敏感文件路径。
- public 首次线上基线不包含字体二进制、`code/desktop/vendor/libreoffice/` 和 `code/desktop/vendor/redist/vc_redist.x64.exe`。
- 公开 clone 后 `npm ci`、`puzzle:shadow:smoke`、`puzzle:text:smoke` 已通过。

### Phase M0：macOS 技术基线拆分

状态：待执行。

执行：

- 建立平台边界：
  - Windows Office COM / PowerShell 保留为 Windows adapter。
  - LibreOffice 转换改为跨平台 Node spawn adapter。
  - macOS 禁用 Office COM 入口，只提供 LibreOffice / PDF 路径。
- 通用化 LibreOffice 查找：
  - Windows：内置 runtime、系统安装、注册表、`where soffice.exe`。
  - macOS：`/Applications/LibreOffice.app/Contents/MacOS/soffice`、`/opt/homebrew/bin/soffice`、`/usr/local/bin/soffice`、用户配置路径。
- 通用化路径和环境：
  - 使用 `path.delimiter`，不要写死 `;`。
  - 不在 macOS 调用 `taskkill`、PowerShell、COM。
  - 进程终止使用 Node 原生 `child.kill()` 和平台 adapter。

验收：

- 在 Windows 上现有导出链路不回退。
- 在 macOS 上应用能启动，文档导出入口给出明确 LibreOffice 缺失提示。

### Phase M1：macOS 打包配置

状态：待执行。

执行：

- 增加 `package.json` scripts：
  - `dist:mac:dir`
  - `dist:mac`
  - `check:runtime:mac`
- 增加 electron-builder `mac` 配置：
  - `target`: `dmg`、`zip`
  - `icon`: `assets/app-icon.icns`
  - `category`: `public.app-category.productivity`
- 准备 `.icns` 图标。
- notarization / signing 后置处理，先做 unsigned 开发包。

验收：

- macOS 本机 `npm ci` 成功。
- `npm --prefix code/desktop run dist:mac:dir` 成功。
- app 能打开主界面。

### Phase M2：GitHub CI

状态：待执行。

执行：

- 新增 GitHub Actions：
  - Windows job：`npm ci`、字体/拼图/LibreOffice 可选检查、`dist:dev`。
  - macOS job：`npm ci`、JS 语法、字体/拼图 smoke、`dist:mac:dir`。
- LibreOffice 相关 CI 分成 optional / required，避免没有 runtime 时阻断所有 PR。

验收：

- PR 上能看到 Windows / macOS 基础检查。
- macOS job 不依赖 Windows vendor runtime。
- 并行开发流程、分支模型和 GitHub Project 看板见 `docs/current/win-mac-parallel-development.md`。

## 4. GitHub 同步前检查命令

```powershell
git status --short --branch
git remote -v
git count-objects -vH
git ls-tree -r -l HEAD
git rev-list --objects --all
git lfs version
```

大文件扫描：

```powershell
git rev-list --objects --all |
  git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)'
```

当前 HEAD 大文件扫描：

```powershell
git ls-tree -r -l HEAD
```

敏感路径扫描：

```powershell
git rev-list --objects --all | Select-String -Pattern 'API_key|\.env|settings\.local'
```

## 5. 下一步建议

下一步不要直接 push 当前迁移历史。建议顺序：

1. Mac 端从 `https://github.com/yinsheng508-byte/scene-image-tool.git` clone。
2. 切到 `platform/macos-bootstrap`，先跑开发启动和共享 smoke。
3. 开始 macOS 平台 adapter 和打包配置改造。
4. 字体二进制、Windows LibreOffice runtime 和 redist 走后续 artifact / provisioning 任务，不回填到普通 Git。
5. 业务改动拆分审查留在 GitHub 后续 PR 中进行，避免污染当前迁移仓库历史。
