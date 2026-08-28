# ai-project-template 项目结构迁移落地规划

> 日期：2026-08-26  
> 当前模式：写落地规划，不执行迁移  
> 参考脚手架：GitHub `yinsheng508-byte/ai-project-template`，当前分析到的模板提交为 `a6c6f62 重构模板：从流程治理转向 AI 长期记忆注入 + 两档工作流`  
> 当前项目：Electron 桌面应用 `流量蜂虚拟笔记工具` / 场景化图片工具

## 1. 迁移结论

当前项目的主要问题不是单个文件夹命名不合理，而是同时缺少三类边界：

1. **协作入口边界**：没有根 `AGENTS.md`、`README.md`、`docs/INDEX.md`、`docs/current/WORKING_CONTEXT.md`，后续 AI 或人工接手时只能在大量历史文档中猜当前事实。
2. **代码与资料边界**：真正可运行应用在 `desktop/`，但根目录混有历史方案、临时脚本碎片、样例文档、二维码、PPT、ZIP 备份等。
3. **源码与产物边界**：构建产物、运行时、字体、大型样例已经进入 Git 跟踪或工作区，导致检索、提交、迁移和协作成本都很高。

推荐采用 `ai-project-template` 的治理结构，但不要机械覆盖当前项目。迁移应分为三条线串行推进：

1. **先建治理脚手架**：建立根入口和 `docs/current`、`docs/architecture`，把当前真实模块地图写进去。
2. **再迁代码目录**：把 `desktop/` 收拢到 `code/desktop/`，保持 Electron 内部相对路径不变。
3. **最后治理大文件和历史**：先从当前索引移除构建产物，再决定字体、LibreOffice 运行时和历史大文件是否改用 Git LFS 或外部发布资产。

## 2. 迁移目标

### 2.1 必须达成

- 根目录只保留项目治理入口、代码目录、协作文档目录和必要配置。
- 所有可运行、可打包、可交付的应用主体统一进入 `code/desktop/`。
- `docs/` 只承载协作过程、架构记忆、任务、验收和历史归档。
- 建立 `AGENTS.md` 作为所有 agent 和开发者的唯一开工入口。
- 建立 `docs/current/WORKING_CONTEXT.md`，记录当前状态、风险、必读文件和禁区。
- 建立 `docs/architecture/*`，让后续开发先查模块、组件、能力、闸口、禁区。
- 补齐根 `.gitignore`，防止 `dist`、`dist2`、`node_modules`、备份包、临时文件继续进入 Git。
- 每个阶段原子提交，能通过 `git revert` 回滚，不做不可逆批量删除。

### 2.2 暂不达成

- 不在本轮迁移中重构 `main.js`、`renderer.js`、`puzzle/index.js` 的业务逻辑。
- 不在第一轮迁移中做 Git 历史重写。
- 不直接删除用户资料、样例文档、压缩包和备份目录。
- 不升级 Electron、electron-builder、sharp、skia-canvas 等依赖。
- 不改变应用功能、授权策略、导出策略、飞书接口、小红书下载流程。

## 3. 当前现状盘点

### 3.1 Git 状态

- 当前处于 detached HEAD。
- 当前 HEAD：`7dff90f fix: refine feishu note upload flow`。
- 工作区已有大量未提交改动，涉及：
  - `desktop/main.js`
  - `desktop/package.json`
  - `desktop/package-lock.json`
  - `desktop/preload.js`
  - `desktop/renderer/index.html`
  - `desktop/renderer/renderer.js`
  - `desktop/renderer/styles.css`
  - `desktop/renderer/puzzle/*`
  - `desktop/scripts/*`
  - `desktop/shared/text-layout.mjs`
- 工作区还有新增文件：
  - `desktop/renderer/puzzle/selection-controller.js`
  - `desktop/scripts/puzzle-text-baseline-regression.js`
  - `docs/文档一键导出双引擎模式需求与任务卡.md`
  - `docs/百变拼图-固定工作区居中缩放与画布外框选开发任务卡.md`
  - `desktop - 副本/`
  - `虚拟笔记工具箱 - 副本.zip`
- 多个已跟踪测试图片被删除，后续需要判断是有意删除还是误删。

**迁移含义**：第一步不能直接搬目录或清理文件，必须先保护当前工作区状态。

### 3.2 目录体量

| 路径 / 文件 | 现状 | 迁移判断 |
|---|---:|---|
| `desktop/` | 约 19.85GB，约 32,837 个文件 | 应迁入 `code/desktop/`，但要先处理忽略规则 |
| `desktop - 副本/` | 约 1.93GB | 本地备份，不应进入 Git |
| `虚拟笔记工具箱 - 副本.zip` | 约 1.08GB | 本地备份包，不应进入 Git |
| `desktop/dist2/` | Git 已跟踪约 1.15GB | 构建产物，应从 Git 索引移除并忽略 |
| `desktop/vendor/` | Git 已跟踪约 765MB | 运行时资源，需单独决策：Git LFS / 外部资产 / 保留 |
| `desktop/fonts/` | Git 已跟踪约 244MB | 字体资源，需结合许可证和可复现性决策 |
| `.git/objects` | 松散约 1.07GiB，pack 约 1.71GiB | 历史已被大文件污染，后续单独清理 |

### 3.3 当前代码形态

| 文件 | 行数 | 当前职责 |
|---|---:|---|
| `desktop/main.js` | 8308 | Electron 主进程、窗口、IPC、授权、设置、Office/LibreOffice、PDF 渲染、拼图导出、飞书上传、小红书下载 |
| `desktop/preload.js` | 78 | `contextBridge` 暴露 `appApi`、`licenseAPI`、日志和进度事件 |
| `desktop/renderer/index.html` | 1144 | 主界面 6 个页签和弹窗结构 |
| `desktop/renderer/renderer.js` | 3338 | 文档导出、飞书上传、小红书下载、全局 UI、设置页绑定 |
| `desktop/renderer/puzzle/index.js` | 7177 | 百变拼图编辑器主状态、画布、模板、多文件夹、预览、生成、快捷键 |
| `desktop/renderer/styles.css` | 2877 | 主界面样式 |
| `desktop/renderer/puzzle.css` | 1841 | 拼图编辑器样式 |

### 3.4 当前用户功能入口

`desktop/renderer/index.html` 中已有 6 个主功能页签：

1. 文档一键导出
2. 场景化图片排版
3. 百变拼图排版
4. 飞书一键上传
5. 小红书商品下载
6. 设置 / 授权管理

这些应成为 `docs/architecture/map.md` 和 `docs/architecture/capabilities.md` 的初始骨架。

### 3.5 当前文档问题

现有文档主要是历史方案和开发规划，按功能自然堆叠，缺少权威导航：

- 根目录有 `需求文档.md`、`导出实现方案说明.md`、`文字功能开发方案.md`、`WECHAT_LOGIN_API.md`、`API_key.md` 等。
- `docs/` 下有导出、拼图、飞书、LibreOffice、授权、UI、回归报告等大量文档。
- 没有 `docs/INDEX.md`。
- 没有 `docs/current/WORKING_CONTEXT.md`。
- 没有 `docs/architecture/map.md`、`components.md`、`capabilities.md`、`gates.md`、`do-not-break.md`。

**迁移含义**：历史文档不能继续平铺。需要先提炼当前事实，再把历史文档归档，避免后续开发继续读过期方案。

## 4. 目标结构

迁移完成后的推荐结构：

```text
.
├── .gitignore
├── AGENTS.md
├── CLAUDE.md
├── CODEX.md
├── GEMINI.md
├── README.md
├── code/
│   ├── README.md
│   └── desktop/
│       ├── package.json
│       ├── package-lock.json
│       ├── main.js
│       ├── preload.js
│       ├── assets/
│       ├── build/
│       ├── fonts/
│       ├── renderer/
│       ├── scripts/
│       ├── shared/
│       └── vendor/
└── docs/
    ├── INDEX.md
    ├── context.md
    ├── architecture/
    │   ├── map.md
    │   ├── components.md
    │   ├── capabilities.md
    │   ├── gates.md
    │   └── do-not-break.md
    ├── current/
    │   ├── WORKING_CONTEXT.md
    │   ├── session-log.md
    │   ├── _dashboard.md
    │   ├── tasks.md
    │   └── acceptance.md
    ├── workflows/
    │   ├── quick-fix.md
    │   └── standard.md
    ├── templates/
    └── archive/
        ├── legacy-plans/
        └── reports/
```

## 5. 文件归位规则

### 5.1 放入 `code/desktop/`

满足以下任一条件，进入 `code/desktop/`：

- 应用运行需要。
- 应用打包需要。
- 本地开发、构建、测试需要。
- 影响交付复现。
- 是产品使用说明、接口接入说明、运行时许可证说明。

推荐归位：

| 当前路径 | 目标路径 | 说明 |
|---|---|---|
| `desktop/` | `code/desktop/` | Electron 应用主体 |
| `docs/用户说明书.md` | `code/desktop/docs/user-guide.md` | 用户交付说明，不应混在协作文档中 |
| `docs/libreoffice-third-party-licenses.md` | `code/desktop/docs/runtime/libreoffice-third-party-licenses.md` | 如果继续内置 LibreOffice，应随代码交付 |
| `docs/libreoffice-full-release-notes.md` | `code/desktop/docs/runtime/libreoffice-full-release-notes.md` | 发布说明可随运行时文档保留 |
| `飞书接口调用说明.md` | `code/desktop/docs/integrations/feishu-base-api.md` | 接口说明，需先脱敏检查 |
| `WECHAT_LOGIN_API.md` | `code/desktop/docs/integrations/wechat-login-api.md` | 授权登录接口说明，需先脱敏检查 |

### 5.2 放入 `docs/archive/legacy-plans/`

满足以下条件，归档为历史协作文档：

- 需求草案、开发方案、修复方案、阶段规划。
- 已完成或部分过期的技术方案。
- 只用于理解历史决策，不直接作为当前执行入口。

推荐归档分类：

```text
docs/archive/legacy-plans/
├── export/
├── puzzle/
├── feishu/
├── auth/
├── ui/
├── libreoffice/
├── compose/
└── misc/
```

示例归位：

| 当前文档 | 推荐归档 |
|---|---|
| `需求文档.md` | `docs/archive/legacy-plans/product/需求文档.md` |
| `导出实现方案说明.md`、`清晰度优化方案.md`、`最终优化方案.md`、`export_options_plan.md` | `docs/archive/legacy-plans/export/` |
| `PPT-Stitcher-*`、`百变拼图*`、`坑位图片裁剪功能规划.md`、`overlay-image-plan.md` | `docs/archive/legacy-plans/puzzle/` |
| `飞书一键上传*` | `docs/archive/legacy-plans/feishu/` |
| `强制更新功能改造方案.md`、`API密钥验证与版本更新功能规划文档.md` | `docs/archive/legacy-plans/auth/` |
| `UI_UX*`、`pickr-color-picker-fix-plan.md` | `docs/archive/legacy-plans/ui/` |
| `libreoffice-*`、`LibreOffice跨设备兼容性改造规划.md`、`PPT导出*` | `docs/archive/legacy-plans/libreoffice/` |

### 5.3 放入 `docs/archive/reports/`

- `docs/ppt-smoke-report*.json` 属于历史验证报告，推荐移动到 `docs/archive/reports/ppt/`。
- 后续新的验证报告不要直接提交到根或 `docs/` 根；按任务 slug 或 report 分类归档。

### 5.4 不进入 Git

以下默认不进入 Git：

- `desktop - 副本/`
- `虚拟笔记工具箱 - 副本.zip`
- `desktop/dist/`
- `desktop/dist2/`
- `desktop/node_modules/`
- `desktop/_tmp/`
- `desktop/_test_output/`
- `*.exe`
- `*.blockmap`
- `*.msi`
- `*.zip`
- `stdout`
- 根目录零字节临时碎片文件

### 5.5 需要人工确认后再处理

| 文件 / 目录 | 原因 | 默认动作 |
|---|---|---|
| `API_key.md` | 名称和内容疑似包含密钥、授权、接口凭据 | 先敏感信息审查；如含真实密钥，移出仓库并轮换 |
| 根目录 `.docx`、`.pptx` 样例 | 可能是用户资料或测试样例，体积大且可能含业务数据 | 不自动删除；必要时移入本地 ignored `fixtures/manual/` |
| `desktop/fonts/` | 打包和导出可能需要，且许可证要确认 | 先保留；后续决策 Git LFS 或外部资产 |
| `desktop/vendor/libreoffice/` | 打包 full 版可能需要，但体积巨大 | 单独评审运行时分发策略 |

## 6. 分阶段落地计划

### Phase 0：冻结和保护现场

**目标**：确认当前工作区状态，不丢失已有修改。

**操作**：

1. 创建迁移工作分支，避免继续在 detached HEAD 上推进。
2. 记录当前 Git 状态、已修改文件、未跟踪文件、大文件清单。
3. 导出当前二进制 diff 补丁作为保险。
4. 对未跟踪的大目录和大 ZIP 只记录清单，不压缩备份，避免再制造大文件。

**建议命令**：

```powershell
git switch -c codex/project-structure-template-migration
git -c core.quotePath=false status --short > migration-status-before.txt
git diff --binary > migration-worktree-before.patch
git ls-files --others --exclude-standard > migration-untracked-before.txt
git count-objects -vH > migration-git-size-before.txt
```

执行时建议把这些快照文件先放入临时备份目录，后续由 `.gitignore` 忽略，或归档到 `docs/current/<slug>/` 后再决定是否提交。

**验收**：

- 已在非 detached 的迁移分支上。
- 当前未提交业务改动没有被覆盖。
- 有迁移前状态快照。

**风险**：

- 当前已有业务改动较多，如果直接迁移目录，可能难以区分“原业务改动”和“结构迁移改动”。

**回滚**：

- 未提交前可停止迁移。
- 已提交后使用 `git revert <commit>`，不要使用 `git reset --hard`。

### Phase 1：安装 AI 协作治理脚手架

**目标**：先建立 `ai-project-template` 的项目治理入口，但不移动业务代码。

**新增 / 修改范围**：

```text
AGENTS.md
CLAUDE.md
CODEX.md
GEMINI.md
README.md
code/README.md
docs/INDEX.md
docs/context.md
docs/current/WORKING_CONTEXT.md
docs/current/session-log.md
docs/current/_dashboard.md
docs/current/tasks.md
docs/current/acceptance.md
docs/architecture/map.md
docs/architecture/components.md
docs/architecture/capabilities.md
docs/architecture/gates.md
docs/architecture/do-not-break.md
docs/workflows/quick-fix.md
docs/workflows/standard.md
docs/templates/*
```

**关键要求**：

- 不能只复制模板空文档，必须填入当前项目真实事实。
- `AGENTS.md` 要声明当前项目路径暂时仍是 `desktop/`，下一阶段才迁到 `code/desktop/`。
- `WORKING_CONTEXT.md` 要写明：
  - 当前阶段：Standard-Planning
  - 当前最高优先级任务：项目结构迁移
  - 当前禁区：不修改业务逻辑、不删除大文件、不清理历史
  - 已知风险：detached HEAD、工作区脏、大文件已入 Git
- `docs/architecture/map.md` 至少登记当前 6 个用户页签和主进程 / 渲染进程模块。
- `docs/architecture/gates.md` 至少登记授权、微信登录、导出预检、飞书上传、取消任务等闸口。
- `docs/architecture/do-not-break.md` 记录当前已知不可轻易改动的实现。

**初始 architecture 内容建议**：

模块地图：

| 模块 | 入口 | 当前职责 |
|---|---|---|
| Electron 主进程 | `desktop/main.js` | 窗口、IPC、设置、授权、导出、拼图生成、飞书、小红书 |
| 预加载桥 | `desktop/preload.js` | 暴露 `appApi`、`licenseAPI`、进度事件 |
| 主界面 Shell | `desktop/renderer/index.html`、`desktop/renderer/renderer.js` | 页签、文档导出、飞书、小红书、设置 |
| 授权模块 | `desktop/renderer/license/*`、`desktop/main.js` | 授权验证、更新检查、免费次数 |
| 场景化图片排版 | `desktop/renderer/compose.*` | 背景图、叠图、角点定位、导出 |
| 百变拼图编辑器 | `desktop/renderer/puzzle/*` | 模板、坑位、文字、贴图、裁剪、预览、批量生成 |
| 共享渲染规范 | `desktop/shared/*` | 字体配置、文字布局、拼图渲染规范 |
| 转换脚本 | `desktop/scripts/*` | Office / LibreOffice 检测、转换、回归 |

能力清单：

- 文档扫描与导出：`scan:documents`、`convert:documents`
- LibreOffice 运行时检测：`export:healthCheck` / `office:healthCheck`
- Microsoft Office 高保真转换：PowerShell 脚本和 COM 自动化
- PDF 渲染：`@hyzyla/pdfium`
- 拼图模板持久化：`puzzle:loadTemplates`、`puzzle:saveTemplates`
- 拼图导出预览与生成：`puzzle:renderExportPreview`、`puzzle:generate`
- 字体枚举和导出字体探针：`font:getSystemFonts`、`font-probe-test.js`
- 飞书 Base 附件上传：`feishu:uploadImages`、`feishu:scanNoteFolders`
- 小红书图片下载：`xhs:download`
- 授权和版本检查：`license:*`

禁区初稿：

- `BrowserWindow` 当前启用 `contextIsolation: true` 且 `nodeIntegration: false`，不要为方便调试打开 Node 集成。
- 渲染进程只能通过 `preload.js` 白名单调用主进程能力，不要直接引入 Electron。
- Office / LibreOffice 转换存在非 ASCII 路径兼容逻辑和 safe copy，不要直接删。
- 字体导出不能只看 `registerFont()` 是否成功，需要保留探针检测。
- 拼图阴影渲染已有共享规范和版本号，不要绕过 `shared/puzzle-render-spec.mjs`。
- 上传、导出、小红书下载都有取消状态，不要只改 UI 按钮状态。

**验收**：

- 根入口文档存在。
- `docs/INDEX.md` 能作为唯一导航入口。
- 后续开工只需按 `AGENTS.md` 指定顺序阅读，不需要在历史文档中搜索当前事实。
- 不改任何业务代码。

**建议提交**：

```text
docs: add ai project governance scaffold
```

### Phase 2：建立忽略规则和产物策略

**目标**：阻止新的构建产物、备份、临时文件继续进入 Git。

**新增 / 修改范围**：

```text
.gitignore
desktop/.gitignore 或 code/desktop/.gitignore
docs/architecture/do-not-break.md
docs/current/session-log.md
```

**根 `.gitignore` 建议规则**：

```gitignore
# dependencies
node_modules/
**/node_modules/

# build outputs
dist/
dist2/
out/
release/
**/dist/
**/dist2/
**/out/
**/release/
*.exe
*.blockmap
*.msi

# temporary outputs
_tmp/
_test_output/
**/_tmp/
**/_test_output/
*.log
stdout
*.tmp
*.bak

# archives and local backups
*.zip
*.7z
*.rar
desktop - 副本/
* - 副本/

# local migration snapshots
.migration-backups/
migration-*-before.txt
migration-*-before.patch

# OS/editor
.DS_Store
Thumbs.db
```

**注意**：

- `.gitignore` 不会自动移除已被 Git 跟踪的文件。
- `desktop/dist2/` 已经被跟踪，需要单独 `git rm --cached`。
- `desktop/vendor/libreoffice/` 和 `desktop/fonts/` 是否移除索引，要等 Phase 5 资源策略确定。

**验收**：

- 新增的构建产物不再显示为未跟踪。
- `git status --ignored` 能看到预期忽略项。
- 未误忽略源码、脚本、配置和文档。

**建议提交**：

```text
chore: add repository ignore policy
```

### Phase 3：从 Git 索引移除明确构建产物

**目标**：把确定不应版本化的构建产物从 Git 当前索引移除，但保留本地文件。

**优先处理**：

```text
desktop/dist2/
desktop/_tmp/
desktop/_test_output/
desktop/test_*.png
```

**建议命令**：

```powershell
git rm -r --cached -- desktop/dist2
git rm -r --cached -- desktop/_tmp desktop/_test_output
git rm --cached -- desktop/test_*.png
```

执行前必须确认这些文件没有被应用运行或回归测试直接依赖。如果测试图片仍是回归基准，应改放到明确的 `code/desktop/test-fixtures/`，并只保留必要小样本。

**验收**：

- `git ls-files desktop/dist2` 为空。
- 本地 `desktop/dist2/` 文件仍存在，但被忽略。
- `desktop/test_*.png` 的处理有明确结论：删除、归档或迁入 fixture。

**风险**：

- 如果某些 smoke 脚本依赖已删除测试图片，需要先迁入小型 fixtures。

**建议提交**：

```text
chore: stop tracking generated desktop artifacts
```

### Phase 4：迁移代码目录到 `code/desktop/`

**目标**：采用模板约定，把可运行主体放入 `code/`。

**操作策略**：

1. 确认 Phase 2 和 Phase 3 已完成。
2. 创建 `code/`。
3. 将整个 `desktop/` 移动为 `code/desktop/`。
4. 更新所有文档中的启动命令和路径。
5. 根 `README.md` 指向 `code/desktop/`。
6. 更新 `.gitignore` 中与 `desktop/` 强绑定的路径为 `code/desktop/`。

**路径兼容判断**：

迁移为 `code/desktop/` 后，Electron 内部大部分路径仍然可用，因为当前代码主要基于 `__dirname` 和 package 目录相对路径：

- `main.js` 加载 `renderer/index.html` 使用 `__dirname`。
- `preload.js` 路径由 `path.join(__dirname, "preload.js")` 生成。
- `package.json` 的 `build.files`、`extraResources` 相对 package 目录。
- `scripts/`、`shared/`、`fonts/`、`vendor/` 仍在 package 目录下。

**需要更新的位置**：

- 根 `README.md` 的启动命令。
- `AGENTS.md`、`WORKING_CONTEXT.md`、`architecture/*` 中的路径。
- 历史文档中可以不批量改路径，但 `docs/INDEX.md` 应声明归档文档中的旧路径以迁移前为准。

**建议命令**：

```powershell
New-Item -ItemType Directory -Force code
git mv desktop code/desktop
```

如果工作区中 `desktop/` 下存在大量 ignored 文件，`git mv desktop code/desktop` 可能触发整目录移动。由于同盘移动通常是重命名，成本可控，但执行前仍应确认：

```powershell
Resolve-Path desktop
Resolve-Path code
```

**验收**：

```powershell
Test-Path code/desktop/package.json
Test-Path code/desktop/main.js
npm --prefix code/desktop run font:probe
npm --prefix code/desktop run puzzle:shadow:smoke
```

如本机 Office / LibreOffice 环境可用，再执行：

```powershell
npm --prefix code/desktop run ppt:smoke
npm --prefix code/desktop run dist:dev
```

**建议提交**：

```text
chore: move desktop app into code directory
```

### Phase 5：重排历史文档

**目标**：把历史方案文档从根目录和 `docs/` 根移走，保留可读历史，但不再让它们冒充当前事实。

**操作**：

1. 创建归档目录：

```text
docs/archive/legacy-plans/
docs/archive/reports/
```

2. 按主题移动历史文档。
3. 在 `docs/INDEX.md` 建立归档索引。
4. 在 `docs/context.md` 提炼长期稳定事实，不复制整篇历史方案。
5. 在 `docs/architecture/do-not-break.md` 写入历史踩坑，而不是让后续开发读几十篇方案自己判断。

**推荐归档后 `docs/` 根只保留**：

```text
docs/INDEX.md
docs/context.md
docs/architecture/
docs/current/
docs/workflows/
docs/templates/
docs/archive/
```

**敏感文档处理**：

`API_key.md`、授权接口文档、微信登录接口文档迁移前必须先查：

- 是否包含真实 token / secret / app id / 私有接口密钥。
- 是否包含生产域名和不可公开参数。
- 是否需要改成 `.example.md` 或脱敏版本。
- 如果已提交真实密钥，需要走密钥轮换，不能只删除文件。

**验收**：

- 根目录不再平铺历史方案文档。
- `docs/INDEX.md` 能定位所有归档。
- 当前事实只出现在 `docs/current` 和 `docs/architecture`。

**建议提交**：

```text
docs: archive legacy planning documents
```

### Phase 6：治理大资源

**目标**：明确字体、LibreOffice、VC redist、样例文件的版本化策略。

#### 6.1 构建产物

| 资源 | 策略 | 原因 |
|---|---|---|
| `dist/` | 不跟踪 | 构建产物，可重建 |
| `dist2/` | 不跟踪 | 约 1.15GB，明确是历史打包输出 |
| `*.exe`、`*.blockmap` | 不跟踪 | 发布产物应走 release 或外部存储 |

#### 6.2 LibreOffice 运行时

可选策略：

| 策略 | 优点 | 缺点 | 建议 |
|---|---|---|---|
| 继续普通 Git 跟踪 | clean clone 直接可打包 | 仓库巨大，历史污染持续扩大 | 不推荐 |
| Git LFS | 保留版本化，clone 可控 | 需要团队配置 LFS，GitHub 带宽和存储受限 | 可作为短期方案 |
| 外部资产 + 校验脚本 | 仓库轻，发布资产清晰 | 新机器需拉取运行时 | 推荐中长期 |
| 只依赖系统 LibreOffice | 仓库最轻 | 用户环境不可控，打包 full 版受影响 | 不适合作为唯一方案 |

推荐：

1. 短期保留本地 `code/desktop/vendor/libreoffice/`，但不新增更多运行时产物。
2. 新增 `code/desktop/docs/runtime/libreoffice-setup.md`，写清运行时来源、版本、校验、放置路径。
3. 中期把运行时改为外部 release asset 或内部制品库，通过脚本下载并校验。

#### 6.3 字体资源

字体影响拼图和导出的一致性，不能简单删除。

推荐：

1. 保留 `fonts/LICENSE.txt`。
2. 确认 PingFang、SourceHan、AlibabaPuHuiTi、KaiTi 的授权边界。
3. 如允许随应用分发，可迁入 Git LFS 或外部资产。
4. 如不允许分发，移除对应字体，改为安装说明或系统字体探测。

#### 6.4 样例 Office 文件

根目录 PPT / DOCX 不应默认跟踪。

推荐：

```text
fixtures/
└── manual/
```

该目录默认 ignored。只有脱敏、小体积、自动化测试必要的 fixture 才可进入 Git。

**验收**：

- 大资源策略记录在 `docs/architecture/do-not-break.md` 和 `code/desktop/docs/runtime/`。
- `git ls-files` 中不再出现明确构建产物。
- 对 `vendor/libreoffice`、`fonts` 是否继续跟踪有明确决策。

### Phase 7：根目录清理

**目标**：清理根目录临时碎片，让根目录成为项目入口。

**候选清理对象**：

- `__tmp.js`
- `__showlines.js`
- `stdout`
- `console.log((i+1)+'`
- `String(i+1).padStart(4`
- `0`
- `{if(...`
- 其他零字节临时碎片
- 根目录二维码重复文件
- 根目录 HTML 原型

**规则**：

- 已跟踪且明确无用：`git rm`。
- 未跟踪且明确无用：移动到 ignored 本地备份目录或删除，但删除前列清单让用户确认。
- 可能是原型或资料：归档到 `docs/archive/legacy-assets/` 或 `fixtures/manual/`。

**验收**：

根目录最终只保留：

```text
.git/
.gitignore
AGENTS.md
CLAUDE.md
CODEX.md
GEMINI.md
README.md
code/
docs/
```

### Phase 8：验证、收口和后续拆分

**目标**：确认迁移没有破坏应用，并给后续代码重构留下明确路线。

**最小验证**：

```powershell
git diff --check
npm --prefix code/desktop run font:probe
npm --prefix code/desktop run puzzle:shadow:smoke
npm --prefix code/desktop run puzzle:text:smoke
```

**环境验证**：

```powershell
npm --prefix code/desktop run check:lo-runtime
npm --prefix code/desktop run ppt:smoke
npm --prefix code/desktop run dist:dev
```

**人工冒烟路径**：

1. 启动 Electron 应用。
2. 切换 6 个页签。
3. 文档导出页能选择文件、扫描、预检。
4. 百变拼图页能加载模板、上传背景、编辑坑位、预览。
5. 飞书页能切换分模块上传 / 按笔记上传。
6. 设置页授权弹窗和版本检查入口仍可打开。

**后续拆分建议**：

迁移完成后再启动代码级重构，优先级如下：

1. 从 `main.js` 拆出 `main/ipc/*`、`main/export/*`、`main/puzzle/*`、`main/integrations/*`。
2. 从 `renderer/renderer.js` 拆出 `renderer/export/*`、`renderer/upload/*`、`renderer/xhs/*`、`renderer/settings/*`。
3. 从 `renderer/puzzle/index.js` 拆出状态、模板、多文件夹、预览、快捷键、画布布局。
4. 为 `shared/*` 增加纯函数回归测试。

这些不是结构迁移第一轮任务，避免把“目录治理”和“业务重构”耦合。

## 7. 推荐提交序列

```text
docs: add ai template migration plan
docs: add ai project governance scaffold
chore: add repository ignore policy
chore: stop tracking generated desktop artifacts
chore: move desktop app into code directory
docs: archive legacy planning documents
docs: document runtime asset policy
chore: clean root temporary files
```

每个提交必须满足：

- 只做一个阶段目标。
- 提交前 `git status --short` 可解释。
- 提交信息写业务意图，不写 `update`。
- 验证结果写入 `docs/current/session-log.md`。

## 8. Git 历史瘦身策略

第一轮迁移不做历史重写。当前 Git 历史已经包含大文件，直接重写会影响所有协作者和远端仓库。

建议在结构迁移稳定后单独开任务：

1. 打 tag：

```powershell
git tag before-history-cleanup-2026-08-26
```

2. 确认远端、分支、协作者状态。
3. 列出历史大文件：

```powershell
git rev-list --objects --all |
  Sort-Object |
  Out-File history-objects.txt
```

4. 使用 `git filter-repo` 或 BFG 清理历史中的：
   - `desktop/dist2/**`
   - `*.exe`
   - `*.blockmap`
   - `*.zip`
   - 大型 PPT / DOCX 样例
   - 若已改外部资产分发，则包括 `vendor/libreoffice/**`
5. force push 前必须确认所有协作者重新 clone。

**历史清理验收**：

- `git count-objects -vH` 明显下降。
- fresh clone 后能按 `README.md` 和运行时说明恢复开发环境。
- 所有需要的运行时、字体、fixture 都有明确来源。

## 9. 风险清单

| 风险 | 影响 | 防控 |
|---|---|---|
| detached HEAD 上继续开发 | 后续提交归属不清，容易丢分支 | Phase 0 先建迁移分支 |
| 工作区已有业务改动 | 结构迁移和业务改动混淆 | 先记录快照，阶段性提交 |
| 直接移动 `desktop/` | ignored/untracked 文件路径变化 | 先建忽略规则和清单 |
| `.gitignore` 误伤资源 | clean clone 缺少运行所需文件 | 每条 ignore 规则都跑 `git check-ignore` 抽查 |
| 历史文档归档后找不到 | 后续无法追溯决策 | `docs/INDEX.md` 建归档索引 |
| `API_key.md` 含真实密钥 | 删除文件也不能消除泄露 | 先审查、轮换、再决定历史清理 |
| 移除 `vendor/libreoffice` 后无法打包 | full 版打包失败 | 先建立下载/校验/放置说明 |
| 字体处理错误 | 拼图导出字体回退或侵权 | 先确认授权和探针验证 |
| Git 历史重写 | 协作者本地仓库失效 | 独立任务，强确认后执行 |

## 10. 回滚策略

### 10.1 普通阶段回滚

每个阶段独立提交后，使用：

```powershell
git revert <commit>
```

不使用：

```powershell
git reset --hard
```

原因：当前工作区可能包含用户未提交改动，硬重置会破坏现场。

### 10.2 目录迁移回滚

如果 `desktop/` 移到 `code/desktop/` 后启动失败：

1. 先记录失败命令和错误。
2. 检查是否只是命令路径未更新。
3. 如必须回滚，revert 目录迁移提交。
4. 不手工把部分文件移回，避免形成半迁移状态。

### 10.3 大资源策略回滚

- `git rm --cached` 还没提交：使用 `git restore --staged <path>`。
- 已提交：`git revert <commit>`。
- 已做历史清理：只能用清理前 tag / remote backup 恢复，因此历史清理必须单独审批。

## 11. 最终验收标准

迁移完成必须同时满足：

- 根目录结构清晰，只有治理入口、`code/`、`docs/` 和必要配置。
- `code/desktop/package.json` 是唯一应用启动入口。
- `README.md` 能指导新开发者启动、验证、打包。
- `AGENTS.md` 能指导 Codex / Claude / Gemini 读取上下文和写回文档。
- `docs/INDEX.md` 能索引当前文档、架构记忆、历史归档。
- `docs/current/WORKING_CONTEXT.md` 与真实状态一致。
- `docs/architecture/map.md` 覆盖现有 6 个功能入口和主要模块。
- `docs/architecture/gates.md` 覆盖授权、登录、导出、上传、取消等关键闸口。
- `docs/architecture/do-not-break.md` 记录已知兼容逻辑和历史坑。
- `git ls-files` 不再包含明确构建产物。
- `npm --prefix code/desktop run font:probe` 通过。
- 拼图和文档导出的最小 smoke 验证通过，或明确记录环境限制。
- 所有未处理的大文件、敏感文档和样例资料都有明确后续任务。

## 12. 当前推进位置

截至 2026-08-26，Phase 0 到 Phase 8 已完成。迁移结论和测试结果见 `docs/current/acceptance.md`；后续工作应转入人工页签冒烟、迁移前业务改动审查、字体/LibreOffice 大资源外部化评审。

## 13. 执行记录

### 2026-08-26 Phase 0：冻结和保护现场

状态：已完成。

执行内容：

- 已从 detached HEAD 创建迁移分支：`codex/project-structure-template-migration`。
- 已创建本地快照目录：`.migration-backups/`。
- 已记录迁移前工作区状态：`.migration-backups/phase0-status-before.txt`。
- 已记录迁移前未跟踪文件清单：`.migration-backups/phase0-untracked-before.txt`。
- 已记录迁移前 Git 对象体量：`.migration-backups/phase0-git-size-before.txt`。
- 已记录迁移前二进制 diff：`.migration-backups/phase0-worktree-before.patch`。

验证结果：

- 当前分支：`codex/project-structure-template-migration`。
- `phase0-status-before.txt` 记录 50 行状态。
- `phase0-untracked-before.txt` 记录 14175 行未跟踪文件。
- Git 对象体量快照：松散对象约 1.07GiB，pack 约 1.71GiB。

风险记录：

- `git diff --binary` 时出现 CRLF 提示，说明当前工作区已有换行符规范风险；本阶段未修改业务文件，不处理该问题。
- 快照目录当前未被忽略，Phase 2 需要通过根 `.gitignore` 排除 `.migration-backups/`。

### 2026-08-26 Phase 1：安装 AI 协作治理脚手架

状态：已完成。

执行内容：

- 已新增根入口：`AGENTS.md`、`CLAUDE.md`、`CODEX.md`、`GEMINI.md`、`README.md`。
- 已新增目标代码目录说明：`code/README.md`。
- 已新增文档导航：`docs/INDEX.md`。
- 已新增长期背景：`docs/context.md`。
- 已新增当前任务文档：`docs/current/WORKING_CONTEXT.md`、`session-log.md`、`_dashboard.md`、`tasks.md`、`acceptance.md`。
- 已新增架构记忆：`docs/architecture/map.md`、`components.md`、`capabilities.md`、`gates.md`、`do-not-break.md`。
- 已新增工作流和模板：`docs/workflows/*`、`docs/templates/*`。

验证结果：

- 已复核 24 个治理文件全部存在。
- 已检查 `AGENTS.md`、`README.md`、`docs/INDEX.md`、`WORKING_CONTEXT.md`、`map.md`、`gates.md`、`do-not-break.md` 的标题结构。
- Git 状态显示本阶段只新增治理文件；迁移前已有业务改动仍保持未提交状态。

风险记录：

- Phase 1 文档中的代码路径仍以 `desktop/` 为准；Phase 4 迁移后必须统一更新为 `code/desktop/`。
- 当前历史方案仍平铺在根目录和 `docs/` 根，Phase 5 前不要把历史方案当成当前事实。

### 2026-08-26 Phase 2：建立忽略规则和产物策略

状态：已完成。

执行内容：

- 已新增根 `.gitignore`。
- 已忽略依赖目录、Electron 构建产物、临时输出、本地迁移快照、压缩包、备份目录、样例 Office 文档和本地环境文件。
- 已保留 `code/desktop/test-fixtures/**` 与 `desktop/test-fixtures/**` 作为未来可提交测试样例的例外路径。

验证结果：

- `git check-ignore` 抽查确认 `.migration-backups/phase0-status-before.txt` 被 `.migration-backups/` 规则忽略。
- 根目录 `虚拟笔记工具箱 - 副本.zip` 被 `*.zip` 规则忽略。
- `desktop - 副本/main.js` 被 `* - 副本/` 规则忽略。
- `desktop/node_modules/.package-lock.json` 被既有 `desktop/.gitignore` 的 `node_modules/` 规则忽略。
- 抽查 `desktop/main.js`、`desktop/renderer/puzzle/index.js`、`docs/current/tasks.md`、`code/README.md` 未被忽略。

风险记录：

- `.gitignore` 不会移除已跟踪文件；当前 `git ls-files desktop/dist2` 仍有 111 个条目，Phase 3 需要使用 `git rm --cached` 保留本地文件但移出索引。
- 本阶段新增了 `*.docx`、`*.pptx` 等默认忽略规则；如果后续需要提交脱敏小样例，必须放入 `test-fixtures` 例外目录。

### 2026-08-26 Phase 3：从索引移除明确构建产物

状态：已完成。

执行内容：

- 已使用 `git rm --cached` 从索引移除 `desktop/dist2/`。
- 已使用 `git rm --cached` 从索引移除 `desktop/_tmp/`。
- 已使用 `git rm --cached` 从索引移除 `desktop/test_*.png`。
- 本阶段未删除本地 `desktop/dist2/` 和 `desktop/_tmp/` 文件。

验证结果：

- `git ls-files desktop/dist2 desktop/_tmp 'desktop/test_*.png'` 无输出。
- `Test-Path desktop\dist2` 返回 `True`。
- `Test-Path desktop\dist2\builder-debug.yml` 返回 `True`。
- `Test-Path desktop\_tmp\msiexec_help.txt` 返回 `True`。
- `git diff --cached --stat` 显示本阶段主要为 137 个历史产物条目的索引删除。

风险记录：

- 本阶段只影响当前索引，不会缩小既有 Git 历史体量。
- `desktop/test_*.png` 迁移前已经在工作区显示为删除；本阶段将其作为生成/探针输出从索引移除，不作为长期测试 fixture 保留。

### 2026-08-26 Phase 4：迁移代码目录到 `code/desktop/`

状态：已完成。

执行内容：

- 已使用 `git mv desktop code/desktop` 迁移被跟踪应用主体。
- 已更新 `AGENTS.md`、`README.md`、`code/README.md`、`docs/context.md` 和 `docs/current/*` 中的当前路径事实。
- 已更新 `docs/architecture/*` 中的模块、能力、组件、闸口和禁区路径。
- 已移除根 `.gitignore` 中迁移前 `desktop/test-fixtures/**` 例外，仅保留 `code/desktop/test-fixtures/**`。

验证结果：

- `Test-Path desktop` 返回 `False`。
- `Test-Path code\desktop\package.json` 返回 `True`。
- `Test-Path code\desktop\main.js` 返回 `True`。
- `Test-Path code\desktop\renderer\index.html` 返回 `True`。
- `git ls-files desktop` 无输出。
- `git ls-files code/desktop/package.json` 返回 `code/desktop/package.json`。
- `npm --prefix code/desktop run font:probe` 通过，结果为 `registered=10/10`、`faces=19`、`failed=0`。

风险记录：

- 迁移前已有未提交业务改动在 `git status` 中继续表现为 `RM` / 未暂存修改；Phase 4 提交只能包含目录重命名和文档回写，不能混入这些业务修改。
- `font:probe` 会在 `code/desktop/dist/font-probe-report.json` 生成本地报告，该目录已被忽略，不应提交。

### 2026-08-26 Phase 5：重排历史文档

状态：已完成。

执行内容：

- 已新增归档索引：`docs/archive/README.md`。
- 已将历史方案、任务卡、需求和改造规划迁入 `docs/archive/legacy-plans/`。
- 已将历史烟测、回归、实施报告和发布记录迁入 `docs/archive/reports/`。
- 已将用户说明、接口说明、许可证和回滚说明迁入 `docs/archive/reference/`。
- 已更新 `docs/INDEX.md`、`docs/current/WORKING_CONTEXT.md`、`docs/current/tasks.md`、`docs/current/session-log.md`。

验证结果：

- `docs/archive/legacy-plans/` 当前 41 个文件。
- `docs/archive/reports/` 当前 9 个文件。
- `docs/archive/reference/` 当前 6 个文件。
- `docs/` 根目录只保留 `INDEX.md`、`context.md` 和 `ai-project-template-项目结构迁移落地规划.md`。

风险记录：

- `API_key.md` 暂未移动，留到 Phase 6 做敏感文件治理。
- 根目录图片、HTML、Office 样例和脚本碎片暂未处理，留到 Phase 6 / Phase 7。

### 2026-08-26 Phase 6：治理大资源

状态：已完成。

执行内容：

- 已新增资源治理文档：`docs/architecture/resources.md`。
- 已将 `场景化图片排版工具.html` 归档到 `docs/archive/reference/`。
- 已从 Git 索引移除根目录 `API_key.md`，本地文件移动到 `local-artifacts/secrets/API_key.md`。
- 已从 Git 索引移除根目录图片 `image.png`、`qrcode.jpg`、`wechat-qrcode.jpg`，本地文件移动到 `local-artifacts/assets/`。
- 已从 Git 索引移除根目录 Office 样例文档，本地文件移动到 `local-artifacts/samples/`。
- 已在 `.gitignore` 中忽略 `local-artifacts/` 和根目录 `API_key.md`。

验证结果：

- `git ls-files` 不再返回根目录 `API_key.md`、根目录图片和根目录 Office 样例。
- `git check-ignore` 确认 `local-artifacts/secrets/API_key.md`、`local-artifacts/samples/寻根之旅.pptx`、`local-artifacts/assets/image.png` 被忽略。
- `code/desktop/fonts/` 当前 29 个文件，约 244 MiB，保留并登记后续授权/外部化任务。
- `code/desktop/vendor/libreoffice/` 当前 14069 个跟踪文件，约 740 MiB，保留并登记后续 artifact / Git LFS 任务。
- `docs/archive/reference/` 当前 7 个文件，包含历史单页工具。

风险记录：

- 当前提交不会清理 Git 历史中的既有大对象。
- `code/desktop/fonts/` 和 `code/desktop/vendor/libreoffice/` 仍是仓库体量主要来源，后续需要独立评审。

### 2026-08-26 Phase 7：根目录清理

状态：已完成。

执行内容：

- 已新增根目录结构说明：`docs/current/root-structure.md`。
- 已从 Git 索引移除根目录临时脚本碎片和 `stdout`，本地文件移动到 `local-artifacts/scratch/`。
- 已从 Git 索引移除 `.claude/settings.local.json`，保留本地配置并加入 `.gitignore`。
- 已更新 `docs/INDEX.md`、`docs/current/WORKING_CONTEXT.md`、`docs/current/tasks.md`、`docs/current/session-log.md`。

验证结果：

- `git ls-files` 根目录只返回 `.gitignore`、`AGENTS.md`、`CLAUDE.md`、`CODEX.md`、`GEMINI.md`、`README.md`。
- 物理根目录只剩当前入口、`code/`、`docs/`、`.claude/`、`.migration-backups/`、`local-artifacts/`、`desktop - 副本/` 和备份 ZIP。
- 根目录临时碎片已位于 `local-artifacts/scratch/`。

风险记录：

- `.migration-backups/`、`desktop - 副本/`、备份 ZIP 和 `local-artifacts/` 是本地忽略项，不随 Git 分发。
- Phase 8 已集中验收，结果见 `docs/current/acceptance.md`。

### 2026-08-26 Phase 8：验证、收口和验收

状态：已完成。

执行内容：

- 已运行自动化验收脚本和构建验证。
- 已执行 Electron unpacked 可执行文件基础启动检查。
- 已更新 `docs/current/acceptance.md`。
- 已更新当前上下文、任务表、看板和阶段日志。

验证结果：

- `npm --prefix code/desktop run check:lo-runtime` 通过，LibreOffice version=`26.2.1.2`。
- `npm --prefix code/desktop run font:probe` 通过，`registered=10/10`、`faces=19`、`failed=0`。
- `npm --prefix code/desktop run font:enum:smoke` 返回 0；PATH 方式调用 `powershell.exe` 失败，但绝对路径枚举成功。
- `npm --prefix code/desktop run puzzle:shadow:smoke` 通过。
- `npm --prefix code/desktop run puzzle:text:smoke` 通过。
- `npm --prefix code/desktop run ppt:smoke -- --input local-artifacts/samples --limit 2` 通过，2/2 成功。
- `npm --prefix code/desktop run dist:dev` 通过。
- `npm --prefix code/desktop run dist:checked` 通过，packaged 字体探针通过。
- `node --check` 检查关键 JS 文件通过。
- Git 禁止清单扫描通过，忽略规则抽查通过。
- `code/desktop/dist/win-unpacked/流量蜂虚拟笔记工具.exe` 启动后存活 10 秒，关闭后无残留进程。

风险记录：

- 页签级业务交互仍建议人工冒烟。
- 迁移前已有业务改动仍未提交，未纳入结构迁移提交。
- 大资源历史瘦身和字体/LibreOffice 外部化是后续独立任务。

### 2026-08-26 迁移后本地构建垃圾清理

状态：已完成。

执行内容：

- 已按用户要求物理删除根目录本地杂项：`.claude/`、`.migration-backups/`、`desktop - 副本/`、`虚拟笔记工具箱 - 副本.zip`、`local-artifacts/`。
- 已物理删除旧构建产物和临时输出：`code/desktop/dist/`、`code/desktop/dist2/`、`code/desktop/_tmp/`、`code/desktop/_test_output/`。
- 已从源码删除无引用历史探针和占位图片：`code/desktop/probe_test1.js`、`code/desktop/probe_test2.js`、`code/desktop/未命名 (1).png`。
- 已删除未跟踪且无引用、会被 `scripts/**` 打包规则复制进安装资源的 `code/desktop/scripts/puzzle-text-baseline-regression.js`。
- 已保留运行和构建必需资源：`code/desktop/fonts/`、`code/desktop/vendor/`、`code/desktop/node_modules/`。
- 已保留 `code/desktop/renderer/puzzle/selection-controller.js`，因为当前 `puzzle/index.js` 已引用该模块，属于迁移前业务改动而非垃圾文件。

验证结果：

- 清理后根目录只剩 `.git`、`code/`、`docs/` 和入口文档/配置。
- `Test-Path` 确认上述本地备份、artifacts、旧构建产物和临时目录均不存在。
- `git ls-files` 抽查确认本地备份、构建产物和 artifacts 无跟踪项。
- `npm --prefix code/desktop run check:lo-runtime`、`font:probe`、`font:enum:smoke`、`puzzle:shadow:smoke`、`puzzle:text:smoke`、`dist:dev` 均通过。
- 47 个非 vendor / 非 dist JS 文件 `node --check` 通过。
- Electron unpacked 可执行文件启动后存活 10 秒，关闭后无残留进程。
- 验证期间生成的 `code/desktop/dist/` 已再次删除，最终工作区不保留构建产物。

风险记录：

- `local-artifacts/` 已删除，PPT smoke 如需复跑必须传入外部样例路径或新增脱敏 `code/desktop/test-fixtures/`。
- 迁移前已有 `code/desktop` 业务改动仍未提交，后续需要独立审查。
