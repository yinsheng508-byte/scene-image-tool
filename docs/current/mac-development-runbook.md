# macOS 开发落地指令

> 日期：2026-08-26
> 目标：从公开 GitHub 仓库 clone 后，在 Mac 上先跑通开发启动和共享 smoke，再进入 macOS adapter / 打包任务。
> 当前限制：`dist:mac:dir` 已可生成 unsigned macOS app bundle；public 首次线上基线不包含字体二进制；`check:lo-runtime` 仍是 Windows embedded runtime 检查。Mac 第一阶段先运行开发模式，不执行 Windows full build。
> GitHub 仓库：`https://github.com/yinsheng508-byte/scene-image-tool`
> macOS 基线分支：`platform/macos-bootstrap`

## 1. Mac 首次环境准备

安装 Xcode Command Line Tools：

```bash
xcode-select --install
```

安装 Homebrew：

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

让当前 shell 识别 Homebrew。

Apple Silicon：

```bash
eval "$(/opt/homebrew/bin/brew shellenv)"
```

Intel Mac：

```bash
eval "$(/usr/local/bin/brew shellenv)"
```

安装 Git、Git LFS、Node.js LTS 线和 LibreOffice：

```bash
brew update
brew install git git-lfs node@22
export PATH="$(brew --prefix node@22)/bin:$PATH"
git lfs install
brew install --cask libreoffice
```

如果需要把 Node 22 固定到之后的终端：

```bash
echo 'export PATH="$(brew --prefix node@22)/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

验证环境：

```bash
git --version
git lfs version
node -v
npm -v
/Applications/LibreOffice.app/Contents/MacOS/soffice --headless --version
```

参考：

- [Homebrew Installation](https://docs.brew.sh/Installation)
- [Homebrew LibreOffice cask](https://formulae.brew.sh/cask/libreoffice)
- [Node.js downloads](https://nodejs.org/en/download)
- [npm: downloading and installing Node.js and npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm/)

## 2. Clone 和首次启动

```bash
mkdir -p ~/dev
cd ~/dev
git clone https://github.com/yinsheng508-byte/scene-image-tool.git
cd scene-image-tool
git switch --track origin/platform/macos-bootstrap
npm --prefix code/desktop ci
cd code/desktop
npm exec electron .
```

开发模式能打开主界面后，回到仓库根目录先执行不依赖 bundled 字体的共享 smoke：

```bash
cd ~/dev/scene-image-tool
npm --prefix code/desktop run puzzle:shadow:smoke
npm --prefix code/desktop run puzzle:text:smoke
```

`font:probe` 需要 bundled fonts。public 首次线上基线不带字体二进制，等字体 artifact 或 provisioning script 落地后再执行：

```bash
npm --prefix code/desktop run resources:check
npm --prefix code/desktop run resources:provision:dry-run -- --artifact-root /path/to/runtime-artifacts
npm --prefix code/desktop run font:probe
```

不要在 Mac 第一阶段执行：

```bash
npm --prefix code/desktop run dist
npm --prefix code/desktop run dist:full
npm --prefix code/desktop run dist:dev
npm --prefix code/desktop run check:lo-runtime
```

原因：这些命令当前仍依赖 Windows 打包资源、Windows 内置 LibreOffice runtime 或 Windows-specific 检查；macOS 系统 LibreOffice 探测使用 Darwin runtime adapter，不使用 `check:lo-runtime`。

## 3. 每日开发指令

开始新任务：

```bash
cd ~/dev/scene-image-tool
git switch platform/macos-bootstrap
git pull --ff-only
git switch -c platform/macos-<task-name>
npm --prefix code/desktop ci
```

提交前检查：

```bash
git status --short
npm --prefix code/desktop run puzzle:shadow:smoke
npm --prefix code/desktop run puzzle:text:smoke
git diff --check
```

提交和推送：

```bash
git add <changed-files>
git commit -m "feat: add macos runtime detection"
git push -u origin platform/macos-<task-name>
```

## 4. macOS 首批落地任务

建议按顺序做，不要一上来改大范围业务逻辑：

1. 已完成：合并 Darwin LibreOffice runtime detection PR，确认启动自检命中系统 LibreOffice。
2. 已完成：建立 `code/desktop/platform/index.js` 和 adapter 总壳。
3. 已完成：修正 macOS Office COM unsupported 早退，不能触发 PowerShell。
4. 已完成：新增统一 capability / health 返回结构，并在设置页显示平台能力状态。
5. 已完成：修正 macOS LibreOffice / Office 预检文案。
6. 已完成：GitHub Actions 基础 matrix 已增加，只跑 `npm ci` 和两个 puzzle smoke。
7. 已完成：`dist:mac:dir` unsigned app bundle 已可作为 macOS 打包 smoke；签名、公证和 dmg/zip 后置。
8. 已完成：MAC-09 设置页能力面板已通过 PR #11 合并到 `platform/macos-bootstrap`。
9. 已完成：MAC-10 settings service 已通过 PR #12 合并到 `platform/macos-bootstrap`，保持 IPC contract 和 userData `app-settings.json` 不变。
10. 已完成：MAC-11 runtime manifest 和 provisioning script 已通过 PR #13 合并；支持 `resources:check`、dry-run、本地 artifact root 和 sha256 mismatch 阻断。
11. 准备完成：MAC-12 已新增 macOS signing preflight、`dist:mac` signed build 入口、release workflow 和 runbook；真实签名公证等待 Apple Developer 证书和 notarization secrets。
12. 当前：进入 MAC-13 IPC shell 边界和长任务取消 hardening；继续保持 preload / contextBridge 安全边界。

## 5. Mac 常见问题

如果 `npm ci` 在 native dependency 上失败：

```bash
xcode-select -p
brew update
npm --prefix code/desktop rebuild
```

如果 LibreOffice 命令不存在：

```bash
brew install --cask libreoffice
/Applications/LibreOffice.app/Contents/MacOS/soffice --headless --version
```

如果 Electron 启动但导出能力不可用，先记录能力状态，不要绕过 Windows-only 逻辑。macOS 导出走后续 platform adapter 任务。
