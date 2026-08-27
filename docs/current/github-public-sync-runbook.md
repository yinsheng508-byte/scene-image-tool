# GitHub 公开同步执行手册

> 日期：2026-08-27
> 当前决策：公开 GitHub 仓库可以做，但只允许公开 GitHub-ready 干净导出仓库，不公开当前迁移仓库的 `.git` 历史。
> GitHub 仓库：`https://github.com/yinsheng508-byte/scene-image-tool`
> 本地导出目录：`D:\deptask\scene-image-tool-github-public`
> 实际上线目录：`D:\deptask\scene-image-tool-github-public-split`
> 线上状态：public 仓库已创建并完成 `main` / `platform/macos-bootstrap` 基线写入。

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
5. 创建 public GitHub 仓库，把公开基线写入 `main`，再创建 `platform/macos-bootstrap` 作为 Mac 开发起点。

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

## 4. Windows 侧执行结果

本轮已完成：

- 安装并登录 GitHub CLI。
- 创建 public 仓库：`https://github.com/yinsheng508-byte/scene-image-tool`。
- 由于当前 Windows 环境普通 Git HTTPS push 多次出现 HTTP 408 / TLS EOF，未继续依赖 `git push`。
- 改用 GitHub REST Git Database API：先创建临时 `.bootstrap`，再上传 Git archive 导出的真实 Git blob，最终创建完整 tree / commit / ref。
- 源码基线提交为 `e20a52dd1df9e6f632eee36946f34b7f9a80ee6b`；文档状态回写后，远端 `main` 和 `platform/macos-bootstrap` 保持同步，当前 HEAD 以 GitHub refs 为准。
- 最终远端 HEAD 不包含临时 `.bootstrap`。

普通网络环境下的等价手工命令如下，仅作为后续参考：

```powershell
cd D:\deptask\scene-image-tool-github-public
git remote add origin https://github.com/yinsheng508-byte/scene-image-tool.git
git push -u origin main
git switch -c platform/macos-bootstrap
git push -u origin platform/macos-bootstrap
git switch main
```

如果使用 GitHub CLI 新建仓库，等价命令如下：

```powershell
winget install --id GitHub.cli
gh auth login
cd D:\deptask\scene-image-tool-github-public
gh repo create yinsheng508-byte/scene-image-tool --public --source . --remote origin --push
git switch -c platform/macos-bootstrap
git push -u origin platform/macos-bootstrap
git switch main
```

## 5. 本地导出结果

本轮已完成：

- 导出目录：`D:\deptask\scene-image-tool-github-public`。
- 实际 public split 目录：`D:\deptask\scene-image-tool-github-public-split`。
- 远端 URL：`https://github.com/yinsheng508-byte/scene-image-tool`。
- 分支：`main` 和 `platform/macos-bootstrap`。
- 新 Git 历史：只包含公开基线，不包含当前迁移仓库 `.git` 历史。
- 本地带字体导出仓库跟踪文件：144 个。
- public 首次线上基线跟踪文件：117 个。
- 源码基线 commit：`e20a52dd1df9e6f632eee36946f34b7f9a80ee6b`。
- 当前远端 HEAD commit：以 GitHub refs 为准，文档内不固化动态 HEAD。
- 大文件扫描：源码线上基线无 95 MiB+ 文件；字体二进制不进入 public 首次基线。
- 敏感路径扫描：无实际 `API_key.md`、`.claude/settings.local.json`、`.env*` 文件。
- runtime 扫描：无 `code/desktop/vendor/libreoffice/`，无 `code/desktop/vendor/redist/vc_redist.x64.exe`。
- 本地验证：带本地字体的导出仓库中 `npm ci`、`font:probe`、`puzzle:shadow:smoke`、`puzzle:text:smoke` 通过；public 线上基线不包含字体二进制，`font:probe` 需等字体 provision 后再跑。
- 已知事项：`npm ci` 报告 21 个依赖漏洞，后续单独做依赖治理。

## 6. 推送后验收

首次 push 后，用一个全新目录做 clone 验收。本轮已在 Windows 本机执行并通过：

```powershell
git clone --depth 1 --branch platform/macos-bootstrap https://github.com/yinsheng508-byte/scene-image-tool.git D:\deptask\scene-image-tool-clone-verify-20260827-163358
cd D:\deptask\scene-image-tool-clone-verify-20260827-163358
git status --short --branch
npm --prefix code/desktop ci
npm --prefix code/desktop run puzzle:shadow:smoke
npm --prefix code/desktop run puzzle:text:smoke
```

本轮已完成的远端验收：

- `main` 和 `platform/macos-bootstrap` 指向同一提交。
- clone `platform/macos-bootstrap` 成功。
- clone 后 Git 跟踪文件数为 117。
- 远端 HEAD 不存在 `.bootstrap`。
- 远端 HEAD 不存在 `code/desktop/fonts/*.otf` 或 `code/desktop/fonts/*.ttf`。
- 远端 HEAD 不存在 `code/desktop/vendor/libreoffice/`。
- 远端 HEAD 不存在 `code/desktop/vendor/redist/vc_redist.x64.exe`。
- `README.md` 和 `code/desktop/fonts/README.md` 均存在。

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

## 8. 当前后续

GitHub public 首次上线已完成。后续不要再推当前迁移仓库历史，按以下路线继续：

- Mac 端从 `https://github.com/yinsheng508-byte/scene-image-tool.git` clone。
- Mac 端切到 `platform/macos-bootstrap`。
- 第一阶段只跑开发启动、`puzzle:shadow:smoke`、`puzzle:text:smoke`。
- 字体二进制和 Windows runtime 走后续 artifact / provisioning 任务，不回填到普通 Git。
