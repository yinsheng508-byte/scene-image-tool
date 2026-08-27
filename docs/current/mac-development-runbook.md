# macOS 开发落地指令

> 日期：2026-08-26
> 目标：从公开 GitHub 仓库 clone 后，在 Mac 上先跑通开发启动和共享 smoke，再进入 macOS adapter / 打包任务。
> 当前限制：现有打包配置仍偏 Windows，`dist:mac:dir` 尚未实现；public 首次线上基线不包含字体二进制；Mac 第一阶段先运行开发模式，不执行 Windows full build。

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

将 `<OWNER>/<REPO>` 替换为公开仓库真实路径：

```bash
mkdir -p ~/dev
cd ~/dev
git clone https://github.com/<OWNER>/<REPO>.git
cd <REPO>
git switch -c platform/macos-bootstrap
npm --prefix code/desktop ci
cd code/desktop
npm exec electron .
```

开发模式能打开主界面后，回到仓库根目录先执行不依赖 bundled 字体的共享 smoke：

```bash
cd ~/dev/<REPO>
npm --prefix code/desktop run puzzle:shadow:smoke
npm --prefix code/desktop run puzzle:text:smoke
```

`font:probe` 需要 bundled fonts。public 首次线上基线不带字体二进制，等字体 artifact 或 provisioning script 落地后再执行：

```bash
npm --prefix code/desktop run font:probe
```

不要在 Mac 第一阶段执行：

```bash
npm --prefix code/desktop run dist
npm --prefix code/desktop run dist:full
npm --prefix code/desktop run dist:dev
npm --prefix code/desktop run check:lo-runtime
```

原因：这些命令当前仍依赖 Windows 打包资源、Windows 内置 LibreOffice runtime 或 Windows-specific 检查。

## 3. 每日开发指令

开始新任务：

```bash
cd ~/dev/<REPO>
git switch main
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

1. 新增 `code/desktop/platform/darwin/libreoffice-runtime.js`，识别 `/Applications/LibreOffice.app/Contents/MacOS/soffice`、`/opt/homebrew/bin/soffice`、`/usr/local/bin/soffice`。
2. 抽出 `code/desktop/platform/win32/*`，把 PowerShell、Office COM、`taskkill` 留在 Windows adapter。
3. 新增统一 capability 返回结构，让 UI 根据能力状态显示可用/不可用。
4. 新增 `dist:mac:dir`，先做 unsigned app bundle。
5. 增加 GitHub Actions matrix，让 Windows 和 macOS 基础 smoke 并行跑。

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
