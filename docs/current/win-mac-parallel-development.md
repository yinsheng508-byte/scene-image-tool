# Windows / macOS 并行开发方案

> 日期：2026-08-26
> 目标：在同步到 GitHub 后，让 Windows 版本维护和 macOS 版本开发可以并行推进，避免互相阻塞。
> 当前前提：当前仓库仍不能直接 push 到 GitHub；用户已要求公开仓库，因此只公开 GitHub-ready 干净导出仓库，见 `docs/current/github-public-sync-runbook.md`。

## 1. 总体结论

Windows 和 macOS 不应各自复制一套应用。推荐采用“共享核心 + 平台适配层 + 平台构建配置”的并行模式：

```text
main
  shared app shell / renderer / puzzle / license / upload / xhs
  platform adapters
    win32: Office COM, PowerShell, embedded Windows LibreOffice, NSIS
    darwin: system LibreOffice, macOS app bundle, dmg/zip, no Office COM
  shared CI
    syntax / renderer / puzzle smoke
  platform CI
    Windows packaging
    macOS packaging
```

核心原则：

1. `main` 始终是 GitHub-ready 干净基线，不携带历史大文件和敏感历史。
2. Windows 继续保证现有用户能力不回退，尤其是 Office COM、LibreOffice、导出取消、飞书上传和拼图导出。
3. macOS 第一阶段先跑通应用启动、拼图、PDF/图片基础能力；Office COM 相关能力明确降级或隐藏。
4. 所有平台差异必须进入 adapter 或配置文件，不在业务 UI 里堆 `process.platform` 分支。
5. 两端并行开发时，先拆平台边界，再并行开发功能；不要让两个方向同时大改 `main.js`。

## 2. GitHub 基线策略

### 2.1 首次同步策略

仍采用 `docs/current/github-sync-macos-plan.md` 的推荐路线：新建 GitHub-ready 干净仓库，不推当前历史。

理由：

- 当前历史存在 100 MiB+ blob。
- 当前历史出现过 `API_key.md` 和 `.claude/settings.local.json`。
- macOS 开发不需要 Windows LibreOffice runtime。

### 2.2 首次 GitHub 目录目标

```text
.
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
      shared/
      scripts/
      assets/
      fonts/
  docs/
```

不进入 GitHub-ready 首次基线：

- `.git/` 当前历史。
- `node_modules/`。
- `dist/`、`dist2/`、`out/`、`release/`。
- `local-artifacts/`。
- `code/desktop/vendor/libreoffice/`。
- `code/desktop/vendor/redist/vc_redist.x64.exe`。
- 任何本地密钥、样例文档、历史安装包。

### 2.3 GitHub 仓库设置

| 项 | 建议 |
|---|---|
| 可见性 | public，但只允许公开干净导出仓库 |
| 默认分支 | `main` |
| 保护规则 | `main` 禁止直接 push，必须 PR |
| 必需检查 | GitHub Actions Windows / macOS 基础检查 |
| 大文件策略 | 普通 Git 当前树不得有 100 MiB+ 文件 |
| Release | Windows runtime、安装包、macOS dmg 走 Release 或外部 artifact |

## 3. 分支模型

推荐使用短生命周期分支，不维护长期 `win` / `mac` 两套主线。

| 分支 | 用途 | 规则 |
|---|---|---|
| `main` | GitHub-ready 稳定基线 | 只能通过 PR 合并 |
| `develop` | 可选集成分支 | 如果团队只有 1-2 人，可省略，直接 PR 到 `main` |
| `platform/win-*` | Windows 平台适配或修复 | 只改 Windows adapter、Windows 构建配置或相关测试 |
| `platform/macos-*` | macOS 平台适配或修复 | 只改 darwin adapter、macOS 构建配置或相关测试 |
| `feature/shared-*` | 跨平台共享功能 | 必须同时跑 Windows / macOS 基础检查 |
| `infra/github-*` | CI、GitHub、资源发布 | 不混入业务逻辑 |
| `docs/*` | 文档和任务卡 | 不混入业务逻辑 |

命名示例：

```text
platform/macos-runtime-detection
platform/win-runtime-artifact
feature/shared-export-adapter
infra/github-ci-matrix
docs/win-mac-dev-plan
```

## 4. 并行工作流

### 4.1 每日开发节奏

1. 所有人从最新 `main` 或 `develop` 拉分支。
2. 每个 PR 控制在一个明确主题内。
3. 每天至少一次从目标分支同步，避免长期漂移。
4. 涉及 `main.js`、`renderer.js`、`puzzle/index.js` 的 PR 必须提前标注冲突风险。
5. 每完成一个阶段，回写 `docs/current/tasks.md` 和 `docs/current/session-log.md`。

### 4.2 PR 合并规则

| 改动类型 | 必跑检查 | 额外要求 |
|---|---|---|
| 纯文档 | Markdown / link 基础检查 | 更新导航 |
| Renderer / UI | JS 语法、基础启动、截图或人工冒烟 | 不改平台 adapter |
| 拼图 / Canvas | `puzzle:shadow:smoke`、`puzzle:text:smoke` | 保证预览/导出共享规范 |
| Windows 导出 | Windows runtime 检查、Office/LibreOffice smoke | 不影响 macOS 启动 |
| macOS 导出 | macOS runtime 检查、基础转换 smoke | Office COM 明确不可用 |
| 打包配置 | 对应平台 `dist:*:dir` | 不把 dist 产物提交 |
| 资源策略 | 大文件扫描 | 100 MiB+ 不进入普通 Git |

### 4.3 冲突控制

高冲突文件：

- `code/desktop/main.js`
- `code/desktop/renderer/renderer.js`
- `code/desktop/renderer/puzzle/index.js`
- `code/desktop/package.json`
- `code/desktop/package-lock.json`

控制方式：

1. 平台适配开始前，优先抽出 adapter 接口，减少多人同时改大文件。
2. 平台分支不直接改共享业务流程，除非先开任务卡说明影响面。
3. `package.json` 脚本和 build 配置集中由 infra 分支维护。
4. 对同一文件的大修改按顺序合并，不并行冲突式开发。

## 5. 平台架构目标

### 5.1 目录目标

第一阶段建议新增如下目录，但不要一次性大重构：

```text
code/desktop/
  platform/
    index.js
    common/
      process-utils.js
      path-utils.js
      runtime-result.js
    win32/
      powershell.js
      office-com.js
      libreoffice-runtime.js
      packaging.js
    darwin/
      libreoffice-runtime.js
      packaging.js
      system-open.js
```

落地顺序：

1. 先新增只读 adapter，不改业务行为。
2. 再把 `main.js` 中 PowerShell、taskkill、LibreOffice 查找拆到 adapter。
3. 最后把打包配置拆成平台配置。

### 5.2 Adapter 边界

| 能力 | Windows | macOS | 共享层要求 |
|---|---|---|---|
| 字体枚举 | PowerShell + `font-list` fallback | `font-list` 或系统字体 API | 输出统一 `{ family, displayName }` |
| Office 高保真导出 | PowerShell + Office COM | 不支持或后置 AppleScript/JXA 评估 | UI 必须显示平台能力状态 |
| LibreOffice 导出 | 内置或系统 `soffice.exe` | 系统 LibreOffice app / Homebrew `soffice` | 转换函数统一返回结构化结果 |
| PDF 渲染 | `@hyzyla/pdfium` + sharp/skia | 同一依赖但需 macOS install 验证 | 错误码跨平台统一 |
| 进程终止 | `taskkill /T /F` | `child.kill()` / process group | 取消语义一致 |
| 打包 | NSIS + portable | dmg + zip | build scripts 分平台 |
| VC runtime | Windows-only redist | 不适用 | 不进 macOS 包 |

### 5.3 统一返回结构

平台 adapter 不直接弹 UI，不直接写 DOM，只返回结构化结果：

```js
{
  ok: true,
  platform: "win32",
  capability: "libreoffice",
  source: "embedded",
  path: "D:\\...",
  version: "26.2.1.2",
  warnings: []
}
```

失败统一：

```js
{
  ok: false,
  platform: "darwin",
  capability: "office-com",
  errorCode: "PLATFORM_UNSUPPORTED",
  message: "Microsoft Office COM export is only available on Windows.",
  actions: ["Switch to LibreOffice export", "Install LibreOffice for macOS"]
}
```

## 6. 平台能力分级

### 6.1 Windows 能力等级

| 能力 | 等级 | 说明 |
|---|---|---|
| 应用启动 | P0 | 必须稳定 |
| 文档导出 PDF / 图片 | P0 | 当前核心能力 |
| Office COM 高保真导出 | P0 | Windows 保留 |
| LibreOffice 内置 runtime | P0 | 当前 Full 包能力 |
| 拼图 / 场景化图片 | P0 | 跨平台共享 |
| 飞书上传 / 小红书下载 | P1 | 依赖网络和本地文件系统 |
| 自动更新 / 签名 | P2 | GitHub 后续发行阶段处理 |

### 6.2 macOS 能力等级

| 能力 | 等级 | 第一阶段策略 |
|---|---|---|
| 应用启动 | P0 | 必须跑通 |
| 拼图 / 场景化图片 | P0 | 优先跑通，复用 renderer 和 shared |
| PDF 渲染到图片 | P0 | 验证 native dependency |
| LibreOffice 文档导出 | P1 | 使用系统 LibreOffice，缺失时给明确提示 |
| Office 高保真导出 | P2 | 先禁用，不承诺 COM 等价 |
| 飞书上传 / 小红书下载 | P1 | 先验证网络、文件选择和输出目录 |
| dmg / zip 打包 | P1 | unsigned 开发包先跑通 |
| 签名 / notarization | P2 | 有 Apple Developer 账号后处理 |

## 7. CI 设计

GitHub 官方支持 workflow matrix，可用同一 job 定义在多个 OS 上运行；GitHub-hosted runners 支持 Windows 和 macOS；`actions/setup-node` 支持 Node 安装和 npm cache。

参考：

- [GitHub Actions matrix strategy](https://docs.github.com/actions/writing-workflows/choosing-what-your-workflow-does/running-variations-of-jobs-in-a-workflow)
- [GitHub-hosted runners](https://docs.github.com/actions/using-github-hosted-runners/about-github-hosted-runners)
- [actions/setup-node](https://github.com/actions/setup-node)

### 7.1 第一阶段 CI

先做基础检查，不直接发布安装包：

```yaml
name: desktop-ci

on:
  pull_request:
  push:
    branches: [main]

jobs:
  desktop:
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: windows-latest
            platform: win32
          - os: macos-latest
            platform: darwin
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: code/desktop/package-lock.json
      - run: npm --prefix code/desktop ci
      - run: npm --prefix code/desktop run puzzle:shadow:smoke
      - run: npm --prefix code/desktop run puzzle:text:smoke
      - run: git diff --check
```

注意：

- `dist:mac:dir` 当前尚未实现，Phase M1 再新增。
- 第一版 required CI 不运行 `dist:dev`、`dist:mac:dir`、`font:probe`、`check:lo-runtime`。
- LibreOffice smoke 不应在第一版 CI 中作为必需检查，除非 runner 上已明确安装 runtime。
- macOS 签名和 notarization 不进入第一阶段 CI。

### 7.2 第二阶段 CI

拆成 required / optional：

| job | 平台 | 是否必需 | 内容 |
|---|---|---|---|
| `lint-syntax` | Windows + macOS | 必需 | JS 语法、文档检查 |
| `renderer-smoke` | Windows + macOS | 必需 | 拼图、文本、字体基础 smoke |
| `package-dir` | Windows + macOS | 可选，等平台构建配置稳定后再升 required | `dist:win:dir` / `dist:mac:dir` |
| `office-windows` | Windows | 可选或 nightly | Office COM / PowerShell smoke |
| `libreoffice-export` | Windows + macOS | 可选或 nightly | 外部 runtime 准备好后跑 |
| `release-build` | Windows + macOS | tag 才跑 | NSIS / portable / dmg / zip |

## 8. GitHub Project 看板

建议创建一个 GitHub Project，看板字段如下：

| 字段 | 值 |
|---|---|
| Status | Backlog / Ready / In Progress / Review / Blocked / Done |
| Platform | Shared / Windows / macOS / Infra / Docs |
| Risk | Low / Medium / High |
| Area | Export / Puzzle / Compose / Upload / XHS / License / Packaging / CI |
| Milestone | GitHub-ready / macOS Bootstrap / Cross-platform Export / Release |

首批任务卡：

| 标题 | Platform | Milestone | 验收 |
|---|---|---|---|
| 审查并提交迁移前业务改动 | Shared | GitHub-ready | `git status` 干净或只剩明确 GitHub 准备项 |
| 创建 GitHub-ready 干净仓库 | Infra | GitHub-ready | public repo 首次 push 成功 |
| 移除 Windows runtime 入库依赖 | Infra | GitHub-ready | 当前树无 100 MiB+ 文件 |
| 抽出平台 adapter 接口 | Shared | macOS Bootstrap | Windows 行为不回退 |
| macOS LibreOffice runtime 探测 | macOS | macOS Bootstrap | 能识别 app / Homebrew 路径 |
| macOS unsigned app 启动 | macOS | macOS Bootstrap | `dist:mac:dir` 可打开主界面 |
| Windows 构建资源 artifact 化 | Windows | Cross-platform Export | 本地 Windows 构建仍可通过 |
| CI matrix 基础检查 | Infra | GitHub-ready | PR 同时跑 Windows / macOS 基础 job |

## 9. 资源和发布策略

### 9.1 Runtime

| 资源 | Windows | macOS | Git 策略 |
|---|---|---|---|
| LibreOffice runtime | 短期本地保留，GitHub-ready 不入库 | 第一阶段依赖系统安装 | 外部 artifact / Release |
| VC Redistributable | Windows-only | 不适用 | Release artifact 或安装脚本 |
| fonts | 短期保留 | 复用同一 bundled fonts | 后续评估 LFS / artifact |
| install packages | NSIS / portable | dmg / zip | Release，不提交 Git |

### 9.2 Manifest

后续可新增：

```text
code/desktop/resources/runtime-manifest.json
```

示例：

```json
{
  "libreoffice": {
    "windows": {
      "version": "26.2.1.2",
      "source": "release-asset",
      "sha256": "<sha256>"
    },
    "darwin": {
      "version": "system",
      "paths": [
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        "/opt/homebrew/bin/soffice",
        "/usr/local/bin/soffice"
      ]
    }
  }
}
```

## 10. 开发阶段划分

### Stage 0：GitHub-ready

目标：能安全上传 GitHub。

任务：

- 审查并提交迁移前业务改动。
- 新建干净仓库。
- 移除敏感历史和 100 MiB+ 当前树文件。
- 建立 `main` 保护规则和基础标签。

验收：

- GitHub public repo push 成功。
- 新 clone 不含 Windows runtime 大文件。
- `npm --prefix code/desktop ci` 可执行。

### Stage 1：平台边界

目标：把 Windows-only 逻辑从共享业务里隔离出来。

任务：

- 新增 platform adapter 目录。
- 抽出 PowerShell、taskkill、Office COM、LibreOffice 查找。
- UI 只消费统一 capability 结果。

验收：

- Windows 现有 smoke 通过。
- macOS 至少能启动并显示平台能力状态。

### Stage 2：macOS Bootstrap

目标：macOS 应用可运行。

任务：

- 新增 macOS runtime detection。
- 修正 Office COM 在 macOS 的 unsupported 早退，不能触发 PowerShell。
- 新增 `dist:mac:dir`。
- 准备 `.icns`。
- PDF、拼图、图片导出先跑通。

验收：

- macOS 本机 app 可打开。
- 拼图 smoke 通过。
- LibreOffice 缺失时提示明确，不崩溃。

### Stage 3：跨平台导出

目标：文档导出在两端都有可解释行为。

任务：

- Windows：保留 Office COM 和内置/外部 LibreOffice。
- macOS：优先支持系统 LibreOffice。
- 统一错误码、进度、取消和日志。

验收：

- Windows 导出能力不回退。
- macOS LibreOffice 安装后能完成 doc/ppt 到 PDF 或图片的基础 smoke。

### Stage 4：并行发布

目标：Windows / macOS 独立构建、独立发布。

任务：

- Windows tag 构建 NSIS / portable。
- macOS tag 构建 dmg / zip。
- Release notes 按平台分区。
- 签名 / notarization 后置接入。

验收：

- 同一 tag 下有 Windows 和 macOS artifacts。
- Release 不包含源码仓库中的本地 runtime dump。

## 11. 当前立即下一步

执行顺序：

1. 先合并 `platform/macos-runtime-detection` / PR #1，让 Darwin LibreOffice runtime 探测进入 `platform/macos-bootstrap`。
2. 合并或重建 Mac 主应用规划文档 PR，确保任务卡与最新代码审查结论一致。
3. 按 `MAC-01` 建立 platform adapter 总壳，不在 UI 层堆平台分支。
4. 按 `MAC-03` 先修正 macOS Office COM unsupported 早退，避免触发 PowerShell。
5. 按 `MAC-07` 增加基础 CI，只跑 `npm ci` 和 puzzle smoke。
6. 等平台构建资源拆分后，再按 `MAC-06` 启用 `dist:mac:dir` unsigned app bundle。

## 12. 禁止事项

- 不直接 push 当前历史到 GitHub。
- 不把 Windows runtime、安装包、样例文档和密钥放进 GitHub-ready 当前树。
- 不在 macOS 分支里修改 Windows Office COM 行为，除非任务卡明确要求。
- 不让 `main.js` 长期成为所有平台改动的唯一入口。
- 不把 `dist/`、`release/`、`node_modules/`、本地 smoke 输出提交到 Git。
- 不用 macOS 的系统字体结果改变 Windows 导出默认字体映射。
