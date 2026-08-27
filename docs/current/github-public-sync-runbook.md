# GitHub 公开同步执行手册

> 日期：2026-08-26
> 当前决策：公开 GitHub 仓库可以做，但只允许公开 GitHub-ready 干净导出仓库，不公开当前迁移仓库的 `.git` 历史。
> 本地导出目录：`D:\deptask\scene-image-tool-github-public`
> 本地状态：已生成并提交，等待 public 远端 URL 或 `gh` 登录后推送。

## 1. 当前不能直接推送的原因

当前迁移仓库的历史和当前树都不适合直接公开：

- GitHub 普通 Git 文件超过 100 MiB 会被阻止；当前跟踪文件中 `code/desktop/vendor/libreoffice/program/mergedlo.dll` 约 140.85 MiB。
- 历史中曾出现旧 LibreOffice MSI、历史 `dist2` 安装包、样例 PPT 等 100 MiB+ 对象。
- 历史中曾出现 `API_key.md` 和 `.claude/settings.local.json`，应按泄露处理并轮换旧密钥。
- macOS 开发不需要 Windows 内置 LibreOffice runtime，公开仓库不应携带 `code/desktop/vendor/libreoffice/`。

参考：

- [GitHub: About large files on GitHub](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)
- [GitHub: Repository limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits)
- [GitHub: About Git Large File Storage](https://docs.github.com/repositories/working-with-files/managing-large-files/about-git-large-file-storage)

## 2. 本轮采用的公开路线

采用“干净导出 + 新 Git 历史 + public 远端”的路线：

1. 保留当前迁移仓库作为 Windows 历史和本地备份。
2. 从当前工作树导出 GitHub-ready 目录，包含当前代码、文档和被引用的未跟踪业务文件。
3. 导出时排除 `.git/`、`node_modules/`、构建产物、本地备份、密钥、样例和 Windows runtime dump。
4. 在导出目录重新 `git init -b main`，生成公开仓库首个干净提交。
5. 用户在 GitHub 创建 public 空仓库后，把导出目录 push 到该远端。

## 3. 导出排除清单

不进入公开仓库：

- 当前 `.git/` 历史。
- `node_modules/`。
- `dist/`、`dist2/`、`out/`、`release/`。
- `.migration-backups/`、`local-artifacts/`、`desktop - 副本/`、压缩包备份。
- `API_key.md`、`.claude/settings.local.json`、`.env*`。
- `code/desktop/vendor/libreoffice/`。
- `code/desktop/vendor/redist/vc_redist.x64.exe`。
- 未脱敏的 Office 样例和本地临时输出。

公开首次线上基线保留：

- `code/desktop/fonts/README.md`：字体外部化说明。
- `code/desktop/vendor/redist/vc_redist.x64.exe.sha256`：只保留校验说明，不保留 exe。
- `docs/archive/`：作为历史参考保留，但不能作为当前事实入口。

公开首次线上基线不保留字体二进制。原因是字体约 244 MiB，会显著放大首次 push / clone 成本，且字体授权和分发边界需要独立确认。后续通过 GitHub Releases、artifact store 或 provisioning script 恢复。

## 4. Windows 侧推送命令

如果已经手动在 GitHub 创建 public 空仓库，例如 `https://github.com/yinsheng508-byte/scene-image-tool.git`，执行：

```powershell
cd D:\deptask\scene-image-tool-github-public
git remote add origin https://github.com/yinsheng508-byte/scene-image-tool.git
git push -u origin main
git switch -c platform/macos-bootstrap
git push -u origin platform/macos-bootstrap
git switch main
```

如果使用 GitHub CLI，先安装并登录：

```powershell
winget install --id GitHub.cli
gh auth login
cd D:\deptask\scene-image-tool-github-public
gh repo create yinsheng508-byte/scene-image-tool --public --source . --remote origin --push
git switch -c platform/macos-bootstrap
git push -u origin platform/macos-bootstrap
git switch main
```

当前机器尚未安装 `gh`，因此本轮不会自动创建 public repo。

## 5. 本地导出结果

本轮已完成：

- 导出目录：`D:\deptask\scene-image-tool-github-public`。
- 分支：`main`。
- 本地 Mac 开发分支：`platform/macos-bootstrap` 已创建。
- 新 Git 历史：只包含公开基线，不包含当前迁移仓库 `.git` 历史。
- 跟踪文件：144 个。
- 大文件扫描：源码线上基线无 95 MiB+ 文件；字体二进制不进入 public 首次基线。
- 敏感路径扫描：无实际 `API_key.md`、`.claude/settings.local.json`、`.env*` 文件。
- runtime 扫描：无 `code/desktop/vendor/libreoffice/`，无 `code/desktop/vendor/redist/vc_redist.x64.exe`。
- 本地验证：带本地字体的导出仓库中 `npm ci`、`font:probe`、`puzzle:shadow:smoke`、`puzzle:text:smoke` 通过；public 线上基线不包含字体二进制，`font:probe` 需等字体 provision 后再跑。
- 已知事项：`npm ci` 报告 21 个依赖漏洞，后续单独做依赖治理。

## 6. 推送后验收

首次 push 后，用一个全新目录做 clone 验收：

```powershell
git clone https://github.com/yinsheng508-byte/scene-image-tool.git D:\deptask\scene-image-tool-clone-check
cd D:\deptask\scene-image-tool-clone-check
git status --short --branch
Get-ChildItem -Recurse -File | Sort-Object Length -Descending | Select-Object -First 20 FullName,Length
npm --prefix code/desktop ci
npm --prefix code/desktop run puzzle:shadow:smoke
npm --prefix code/desktop run puzzle:text:smoke
```

验收标准：

- `git status` 干净。
- 普通 Git 当前树没有 100 MiB+ 文件。
- clone 中不存在 `code/desktop/vendor/libreoffice/`。
- clone 中不存在 `code/desktop/fonts/*.otf` 或 `code/desktop/fonts/*.ttf` 字体二进制。
- clone 中不存在 `code/desktop/vendor/redist/vc_redist.x64.exe`。
- 基础 npm 安装和共享 smoke 可以执行。

## 7. GitHub 仓库设置

公开仓库创建后建议立即设置：

- Default branch：`main`。
- Branch protection：`main` 禁止直接 push，要求 PR。
- Required checks：第一阶段先要求基础 JS / smoke；macOS 打包检查在 Phase M1 后再设为必需。
- Releases：Windows runtime、Windows 安装包、macOS dmg / zip 都走 Release 或外部 artifact，不提交到普通 Git。
- Secrets：不要把 API key 写入仓库；历史出现过的 key 需要轮换。

## 8. 当前阻塞

本地干净仓库可以生成并提交；真正推送到公开 GitHub 还需要以下二选一：

- 用户提供已创建的 public 空仓库 URL。
- 用户在当前 Windows 环境安装并登录 `gh`，再执行第 4 节命令。
