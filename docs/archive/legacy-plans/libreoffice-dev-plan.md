# LibreOffice 引擎迁移 — 完整开发改造方案

> 版本：v1.0 | 日期：2026-03-12
> 项目：场景化图片工具（desktop/）
> 基准 commit：`d9a8d4010360a4df04aa88673d14693dca0f3ff6`（暂存修改-梳理 LibreOffice 完整改造规划）

---

## 一、改造背景

### 1.1 原始问题

当前基于 Microsoft Office COM 自动化的转换链路存在两类高频故障：

1. **Office 预检 block=true**：`POWERPNT.EXE` 未找到或 Office 缓存不可写，整批导出被拦截
2. **PS_TIMEOUT 超时**：大文件 COM 调用超过 60s，触发自适应降级，实际处理时间 135-195s/批

### 1.2 改造目标

| 维度 | 改造前 | 改造后 |
|------|--------|--------|
| 转换引擎 | Microsoft Office COM | LibreOffice CLI |
| Office 依赖 | 必须安装 Office | **不需要** |
| 进程模型 | 持久 COM 进程，需定期重启 | 每文件独立进程，天然隔离 |
| 超时控制 | COM 挂起难以强杀 | `killProcessTreeByPid` 精准终止 |
| 前端功能 | — | **完全不变** |
| IPC 契约 | — | **完全不变** |
| 部署方式 | 依赖系统 Office | 系统 LO（当前）→ 内置 LO 包（规划） |

### 1.3 不变的内容

- 前端交互：文件扫描、pageLimit、useSubfolder、scale(1/1.5/2/3x)、取消导出、日志导出
- 主流程：`Word/PPT/PDF → PDF → PNG`，仅替换"Office 文档 → PDF"引擎
- PDF → PNG 渲染层（PDFium + Sharp，`main.js:3483-3585`）**完全不改**
- IPC 入参/返回结构（`convert:documents`、`office:healthCheck`）

---

## 二、当前已完成进度（基于代码实际状态）

### 2.1 已完成项（基于 git diff 分析）

| 模块 | 状态 | 说明 |
|------|------|------|
| `resolveLibreOfficeRuntime()` | ✅ 已实现 | 统一运行时探测，8 路候选路径（内置→环境变量→注册表→系统路径） |
| `runLibreOfficeToPdf()` | ✅ 已实现 | 核心转换函数，含 profile 隔离、动态超时、完整错误码 |
| `calcLoTimeout()` | ✅ 已实现 | 动态超时：`base + sizeMB × 0.8s`，上下限保护 |
| `runPptToPdfWithRetry()` | ✅ 已集成 | 调用 `runLibreOfficeToPdf`，保留重试/降级逻辑 |
| `convertWordToImages()` | ✅ 已集成 | 调用 `runLibreOfficeToPdf`，保留 safe 路径处理 |
| `batchConvertToPdf()` | ✅ 已集成 | 小文件并发/大文件串行（阈值 100MB 可配） |
| 错误码常量 | ✅ 已更新 | `LO_MISSING_BINARY/TIMEOUT/NON_ZERO_EXIT/PROFILE_LOCK/OUTPUT_MISSING` |
| 健康检查脚本 | ✅ 已创建 | `libreoffice-health-check.ps1`，PS 5.1 兼容 |
| 前端 Modal JS 逻辑 | ✅ 已实现 | `openLibreOfficeModal()`、重检、下载按钮逻辑 |
| 进度跟踪 | ✅ 已实现 | `resetConvertProgressTracker()`、`updateConvertProgressByCompleted()` |
| card-desc 文案 | ✅ 已更新 | 说明已切换为 LibreOffice 引擎 |
| `activeLibreOfficePids` | ✅ 已添加 | 全局活跃 PID 集合，支持取消时 kill |
| 速度模式管理 | ✅ 已实现 | `libreOfficeSpeedState`，safe/boost/auto |
| 文档 | ✅ 已创建 | `libreoffice-migration.md`（v1.6）、`libreoffice-full-embedded-plan.md` |

### 2.2 未完成项（需本次完成）

| 模块 | 状态 | 优先级 |
|------|------|--------|
| index.html Modal HTML 结构 | ❌ 缺失 | P0（阻塞前端功能） |
| Modal CSS 样式 | ❌ 缺失 | P0 |
| COM 旧脚本清理/标记 deprecated | ❌ 未做 | P1 |
| `runOfficeHealthFix` 兼容壳 | ❌ 未做 | P1 |
| `pptAdaptiveController` → `docConvertAdaptiveController` 重命名 | ❌ 未做 | P2 |
| `triggerStats.com_reject` → `oom_crash` | ❌ 未做 | P2 |
| 诊断日志文案去 COM 化 | ❌ 未做 | P2 |
| `libreoffice-full-embedded-plan.md` 内置方案实施 | ❌ 规划中 | P3（独立里程碑） |

---

## 三、总体架构

### 3.1 转换流水线

```
用户点击「开始导出」
    │
    ▼
[前置] LibreOffice 健康检查（officeHealthCheck IPC）
    │  blockExport=true → 弹 LibreOffice 安装引导 Modal
    │  blockExport=false → 继续
    ▼
[调度] 文件按大小分两队列
    ├─ smallQueue（< 100MB）：按文件大小升序，并发 1-2
    └─ largeQueue（≥ 100MB）：串行，每文件最多 2 次尝试
    │
    ▼ 每个文件执行 convertAndRenderOneFile(task)
    │
[阶段 A] soffice --headless --convert-to pdf
    │  -env:UserInstallation=<独立 profile 目录>
    │  --outdir <独立 outdir>
    │  动态超时：60s + sizeMB × 0.8s（上限 20min）
    │  失败 → LO_* 错误码 → 可重试则重试，否则标记失败继续
    ▼
[阶段 B] PDF → PNG（PDFium + Sharp，完全不变）
    │  main.js:3483-3585
    │  pageLimit / scale / pageConcurrency 逻辑不变
    ▼
单文件结果立即落盘，进度事件推送前端
    │
返回完整结果（IPC 结构与现有完全兼容）
```

### 3.2 文件大小调度策略

```javascript
// 调度伪代码
const { smallQueue, largeQueue } = splitBySize(tasks, LARGE_FILE_THRESHOLD_MB);
smallQueue.sort((a, b) => a.sizeBytes - b.sizeBytes); // 小文件升序

// 先跑小文件（并发）
await runWithConcurrency(smallQueue, concurrency, convertAndRenderOneFile);

// 再跑大文件（串行，每文件最多 2 次）
for (const task of largeQueue) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await convertAndRenderOneFile(task);
      break;
    } catch (err) {
      killProcessTreeByPid(task.loProcessPid);  // 立即 kill
      if (attempt === 2) markFailed(task, err); // 不回滚已完成文件
    }
  }
}
```

### 3.3 LibreOffice 运行时查找优先级

```
1. resources/libreoffice/program/soffice.exe      内置包（当前未内置，自动跳过）
2. LIBREOFFICE_PATH 环境变量                       高级用户自定义
3. 注册表 HKCU\...\App Paths\soffice.exe          用户级安装
4. 注册表 HKLM\...\App Paths\soffice.exe          机器级安装
5. 注册表 HKLM\...\WOW6432Node\...\soffice.exe    32 位安装
6. where soffice.exe（PATH 搜索）                  PATH 中的 LO
7. C:\Program Files\LibreOffice\program\soffice.exe
8. C:\Program Files (x86)\LibreOffice\program\soffice.exe
```

---

## 四、待完成任务清单

> 以下为本次改造**剩余**需完成的工作，已完成项已在第二节列出。

---

### Task-01：index.html 安装引导 Modal HTML（P0）

**文件：** `desktop/renderer/index.html`

在 `#updateModal` 之后插入以下 HTML（JS 逻辑已在 renderer.js 中就绪，仅缺 HTML 结构）：

```html
<!-- LibreOffice 安装引导 Modal -->
<div id="libreofficeModal" class="modal-overlay" style="display:none;">
  <div class="modal-box lo-modal-box">
    <div class="modal-header">
      <span>需要 LibreOffice 运行时</span>
      <button id="libreofficeModalClose" class="modal-close-btn" type="button">×</button>
    </div>
    <div class="modal-body">
      <div id="libreofficeModalMessage" class="lo-modal-message"></div>
      <div id="libreofficeModalScore" class="lo-modal-score" style="display:none;"></div>
      <ul id="libreofficeModalSuggestions" class="lo-modal-suggestions"></ul>
    </div>
    <div class="modal-footer">
      <button id="libreofficeDownloadBtn" type="button" class="btn-primary">
        立即下载 LibreOffice
      </button>
      <button id="libreofficeRecheckBtn" type="button">
        我已安装，重新检测
      </button>
      <button id="libreofficeCancelBtn" type="button" class="btn-secondary">
        稍后再说
      </button>
    </div>
  </div>
</div>
```

**关联 JS 变量（已在 renderer.js 中声明，确认 id 对齐）：**
- `libreofficeModal`、`libreofficeModalClose`、`libreofficeDownloadBtn`
- `libreofficeRecheckBtn`、`libreofficeCancelBtn`
- `libreofficeModalMessage`、`libreofficeModalScore`、`libreofficeModalSuggestions`

**验收：** 未安装 LO 时点击导出，Modal 正常弹出，显示分数和建议，「重新检测」按钮可用。

---

### Task-02：styles.css Modal 样式（P0）

**文件：** `desktop/renderer/styles.css`

新增以下样式（参考现有 `.modal-box` 类）：

```css
/* LibreOffice Modal */
.lo-modal-box {
  max-width: 480px;
}

.lo-modal-message {
  font-size: 14px;
  color: var(--text-primary, #333);
  line-height: 1.6;
  margin-bottom: 12px;
}

.lo-modal-score {
  font-size: 13px;
  color: var(--text-secondary, #666);
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 12px;
}

.lo-modal-score.lo-score-bad {
  color: #c0392b;
  background: #fdf2f2;
}

.lo-modal-suggestions {
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: 13px;
}

.lo-modal-suggestions li {
  padding: 6px 0;
  color: var(--text-secondary, #555);
  border-bottom: 1px solid var(--border-color, #eee);
}

.lo-modal-suggestions li:last-child {
  border-bottom: none;
}
```

**验收：** Modal 样式与现有 licenseModal 视觉风格一致，分数低时红色高亮。

---

### Task-03：`runOfficeHealthFix` 兼容壳（P1）

**文件：** `desktop/main.js`（`runOfficeHealthFix` 函数，约 L3035-3049）

当前函数调用旧 PS 脚本，改为直接返回 not-supported：

```javascript
async function runOfficeHealthFix(options = {}) {
  // LibreOffice 方案下不再需要 Office 注册表治理
  // 保留此函数作为向后兼容壳，避免旧调用报错
  return {
    ok: false,
    mode: options.mode || "safe",
    message: "LibreOffice 模式下无需执行 Office 治理",
    actions: [],
    warnings: []
  };
}
```

同步处理 `officePrecheckMode === "fix"` 分支（`main.js` 约 L4145-4154）：

```javascript
// 将 "fix" 分支改为降级为 "warn" 行为（记录日志，不阻断）
if (options.officePrecheckMode === "fix" && needsFix) {
  logToRenderer(2, "LibreOffice 模式下 fix 预检模式已降级为 warn，跳过自动治理");
  // 不调用 runOfficeHealthFix，直接继续
}
```

**验收：** `officePrecheckMode=fix` 时不报错，日志有提示，导出继续执行。

---

### Task-04：自适应控制器重命名（P2）

**文件：** `desktop/main.js`

**4.1 变量重命名**（约 L4114，共 ~8 处调用）：

```javascript
// 全文替换：
// pptAdaptiveController → docConvertAdaptiveController
```

**4.2 triggerStats key 更新**（L3327-3331）：

```javascript
// 改前：
triggerStats: { timeout: 0, com_reject: 0, consecutive_failures: 0 }

// 改后：
triggerStats: { timeout: 0, oom_crash: 0, consecutive_failures: 0 }
```

**4.3 classifyPptFailureTrigger 更新**（L3293-3307）：

```javascript
function classifyPptFailureTrigger(result) {
  if (!result || result.ok) return "";
  const errorCode = normalizeOfficeErrorCode(result.errorCode);
  if (errorCode === "LO_TIMEOUT" || errorCode === "PS_TIMEOUT") return "timeout";
  if (errorCode === "LO_NON_ZERO_EXIT" || errorCode === "LO_PROFILE_LOCK") return "oom_crash";
  return "";
}
```

**注意：** `diagnostics.ppt` 对外结构**保持不变**，避免前端日志解析失配。

**验收：** 全文搜索 `pptAdaptiveController` 返回 0 个结果；`triggerStats` 无 `com_reject` 字段。

---

### Task-05：诊断日志文案去 COM 化（P2）

**文件：** `desktop/renderer/renderer.js`（L1610-1630）

```javascript
// 改前（L1612）：
message: `PPT诊断：总计 ${ppt.total || 0}，OpenAndRepair生效 ${ppt.repaired || 0}，
  重试 ${ppt.retried || 0}，Open兜底(Open2007/Inject) ${ppt.fallbackOpened || 0}，...`

// 改后：
message: `文档转换诊断：总计 ${ppt.total || 0}，` +
  `重试 ${ppt.retried || 0}，` +
  `降级级别 ${ppt.degradeLevel || 0}，并发 ${ppt.currentConcurrency || 1}，` +
  `平均耗时 ${durationAvgMs}ms，最大耗时 ${durationMaxMs}ms，` +
  `主错误码 ${topErrorCode ? `${topErrorCode[0]}(${topErrorCode[1]})` : "none"}`
```

```javascript
// 改前（L1627）：
message: `Office预检：mode=${precheck.mode} score=${finalReport.score}/100 ...`

// 改后：
message: `引擎预检：mode=${precheck.mode || "unknown"} score=${finalReport.score || 0}/100 block=${finalReport.blockExport ? "true" : "false"}`
```

**验收：** 日志中无"Office"/"COM"/"PPT诊断"等旧文案；"文档转换诊断"字样出现。

---

### Task-06：旧 COM 脚本标记 deprecated（P1）

**操作：** 不立即删除，重命名加后缀便于识别，Phase 2 稳定后删除。

```bash
# 在 desktop/scripts/ 目录下重命名：
ppt-to-pdf.ps1            → ppt-to-pdf.ps1.deprecated
ppt-batch-to-pdf.ps1      → ppt-batch-to-pdf.ps1.deprecated
word-to-pdf.ps1           → word-to-pdf.ps1.deprecated
word-batch-to-pdf.ps1     → word-batch-to-pdf.ps1.deprecated
office-health-fix.ps1     → office-health-fix.ps1.deprecated
office-identity-policy.ps1 → office-identity-policy.ps1.deprecated
```

**验收：** `desktop/scripts/` 中无 `.ps1`（非 deprecated）的旧 Office 脚本；构建包中不再包含旧脚本。

---

### Task-07：`docs/用户说明书.md` 更新（P2）

将"必须安装 Microsoft Office"相关说明改为 LibreOffice，包括：
- 环境要求章节
- 导出功能说明
- 常见问题（Office 相关错误 → LibreOffice 相关错误）

---

## 五、内置 LO 方案（独立里程碑，参考 libreoffice-full-embedded-plan.md）

### 5.1 背景

当前方案 A（系统安装）需用户手动安装 LibreOffice，存在首次使用摩擦。
`libreoffice-full-embedded-plan.md` 已规划方案 B（内置 LO 包），本节为摘要，**不在本次主线范围内**。

### 5.2 内置方案核心变更

**新增文件结构：**
```
desktop/
├── vendor/
│   └── libreoffice/          # LibreOffice Full 精简包（仅 Impress/Writer + PDF 模块）
│       ├── program/
│       │   ├── soffice.exe
│       │   ├── soffice.bin
│       │   └── *.dll
│       └── share/
└── scripts/
    └── check-lo-runtime.js   # 构建前验证脚本
```

**package.json 变更：**
```json
{
  "build": {
    "extraResources": [
      {
        "from": "vendor/libreoffice",
        "to": "libreoffice",
        "filter": ["**/*"]
      }
    ]
  },
  "scripts": {
    "dist:full": "electron-builder --config electron-builder-full.yml",
    "check:lo-runtime": "node scripts/check-lo-runtime.js"
  }
}
```

**`resolveLibreOfficeRuntime()` 已预留内置路径**（优先级最高，`main.js` 已实现，当前内置路径不存在时自动跳过）。

### 5.3 内置方案里程碑

| 里程碑 | 任务 | 工期 |
|--------|------|------|
| M-Embed-1 | 获取/精简 LO 包，放入 vendor/ | 2-3 天 |
| M-Embed-2 | 构建配置（extraResources、full 构建命令）| 1-2 天 |
| M-Embed-3 | 前端引导：检测到内置 LO 时不弹安装 Modal | 1 天 |
| M-Embed-4 | 回归测试 + 包体积验证（目标 < 350MB 增量）| 2-3 天 |

---

## 六、文件变更全量清单

### 6.1 已变更（git working tree 中）

| 文件 | 变更类型 | 主要内容 |
|------|---------|---------|
| `desktop/main.js` | 修改（+2277 行） | LO 运行时、转换函数、错误码、调度逻辑、健康检查 |
| `desktop/renderer/renderer.js` | 修改 | Modal JS 逻辑、进度跟踪、诊断日志（部分） |
| `desktop/renderer/index.html` | 修改 | card-desc 文案（Modal HTML 仍缺失） |
| `desktop/renderer/styles.css` | 修改 | 样式更新（Modal 样式仍缺失） |
| `desktop/preload.js` | 修改 | IPC 桥接更新 |
| `desktop/package.json` | 修改 | 版本 1.3.1 → 1.3.2 |
| `docs/用户说明书.md` | 修改 | 部分更新 |

### 6.2 新建文件（untracked）

| 文件 | 状态 |
|------|------|
| `desktop/scripts/libreoffice-health-check.ps1` | ✅ 已创建 |
| `docs/libreoffice-full-embedded-plan.md` | ✅ 已创建 |
| `docs/libreoffice-migration.md` | ✅ 已创建（v1.6） |

### 6.3 待处理文件

| 文件 | 操作 |
|------|------|
| `desktop/scripts/ppt-to-pdf.ps1` | 重命名为 `.deprecated` |
| `desktop/scripts/ppt-batch-to-pdf.ps1` | 同上 |
| `desktop/scripts/word-to-pdf.ps1` | 同上 |
| `desktop/scripts/word-batch-to-pdf.ps1` | 同上 |
| `desktop/scripts/office-health-fix.ps1` | 同上 |
| `desktop/scripts/office-identity-policy.ps1` | 同上 |

---

## 七、核心代码参考（已实现，不要改动）

### 7.1 `resolveLibreOfficeRuntime()` — 运行时解析（main.js:3129）

统一入口，所有 LO 路径查找都通过这里。支持 `mode=embedded|system|auto`，返回结构化结果。

### 7.2 `runLibreOfficeToPdf()` — 核心转换（main.js:3376）

```javascript
// 调用方式：
const loResult = await runLibreOfficeToPdf(inputPath, targetOutDir, {
  timeoutMs,  // 可选，默认走 calcLoTimeout 动态计算
  env: {}     // 可选额外环境变量
});
// 返回：{ pdfPath, durationMs, timeoutMs }
// 失败：抛出 Error，error.code 为 LO_* 错误码
```

**内部行为：**
- 创建独立 `taskOutDir`（防并发同名覆盖）
- 创建独立 `profileDir`（防 profile 锁）
- 注册 pid 到 `activeLibreOfficePids`（支持取消时 kill）
- finally 块清理 outdir 和 profileDir

### 7.3 `calcLoTimeout()` — 动态超时（main.js 已实现）

```javascript
// 动态超时：base(60s) + sizeMB × 0.8s，下限 30s，上限 20min
const timeoutMs = calcLoTimeout(inputPath, explicitOverrideMs);
```

### 7.4 `batchConvertToPdf()` — 批量调度（main.js:4353）

```javascript
// 内部实现 small/large 队列调度
// small（<100MB）：升序并发，默认 concurrency=2
// large（≥100MB）：串行，每文件最多 2 次尝试
const results = await batchConvertToPdf("ppt", pptTasks, {
  concurrency: docConvertAdaptiveController.getConcurrency(),
  timeoutMs: pptBatchTimeoutCapMs,
  largeFileThresholdMb: 100
});
```

### 7.5 不变的代码区域（禁止修改）

| 函数 | 位置 | 说明 |
|------|------|------|
| `convertPdfBufferToImages` | main.js:3483-3580 | PDFium 渲染 |
| `convertPdfFileToImages` | main.js:3582-3585 | 同上 |
| `getTargetShortSide` | main.js:3159-3165 | scale → 短边像素 |
| `getMaxConcurrency` | main.js:3167-3174 | page/file 并发 |
| `ensureSafeInputPath` | main.js:3144-3157 | 非 ASCII 路径处理 |
| `createPptAdaptiveController` | main.js:3308-3410 | 自适应控制器（函数体） |
| `convert:documents` IPC 契约 | main.js:4033/4953 | 入参/出参结构 |

---

## 八、错误码体系

| 错误码 | 触发条件 | 可重试 | 降级触发 |
|--------|---------|--------|---------|
| `LO_MISSING_BINARY` | soffice.exe 未找到 | 否 | 无（直接报错） |
| `LO_BINARY_UNEXECUTABLE` | soffice.exe 不可执行 | 否 | 无 |
| `LO_TIMEOUT` | 进程超时被 kill | 是 | `timeout` → 降并发 |
| `LO_NON_ZERO_EXIT` | 非零退出码 | 是 | `oom_crash` → 降并发 |
| `LO_PROFILE_LOCK` | profile 目录锁冲突 | 是 | `oom_crash` → 降并发 |
| `LO_OUTPUT_MISSING` | PDF 未生成 | 是 | 连续失败计数 |
| `PS_TIMEOUT` | 健康检查 PS 超时 | 否 | 无 |

**自适应降级规则（`docConvertAdaptiveController`）：**
- `timeout` 或 `oom_crash` → 立即降级（并发 2→1）
- 连续失败 ≥ `degradeFailStreak`（默认 2）→ 降级
- 连续成功 ≥ `recoverSuccessWindow`（默认 6）→ 恢复

---

## 九、验收测试用例

### T1：基础功能

| # | 场景 | 期望结果 |
|---|------|---------|
| T1-1 | 单个 .pptx 导出，scale=1 | PNG 生成正确，日志 `openMode: libreoffice` |
| T1-2 | 单个 .docx 导出 | PNG 生成正确 |
| T1-3 | .pdf 直接导出（不经 LibreOffice）| PDFium 渲染正常，不调用 LO |
| T1-4 | 混合 doc/docx/ppt/pptx/pdf 各 1 个 | 全部成功，无报错 |

### T2：单文件流水线与无缓存

| # | 场景 | 期望结果 |
|---|------|---------|
| T2-1 | 连续两次导出同一文件 | 两次行为完全一致，无缓存命中 |
| T2-2 | 批量 5 文件，观察首个完成时间 | 第一个文件渲染完立即落盘，不等全体 PDF |
| T2-3 | 导出中途取消 | 已完成文件保留，未开始文件不执行 |

### T3：小文件并发/大文件串行

| # | 场景 | 期望结果 |
|---|------|---------|
| T3-1 | 文件 5MB/20MB/50MB/200MB 混合 | 执行顺序先 smallQueue 后 largeQueue |
| T3-2 | smallQueue 并发设 2 | 任一时刻并发任务数不超过 2 |
| T3-3 | largeQueue 2 个 200MB 文件 | 串行执行，不并发 |

### T4：大文件失败处理

| # | 场景 | 期望结果 |
|---|------|---------|
| T4-1 | 注入首次 `LO_TIMEOUT` | kill worker，新 worker 重试 |
| T4-2 | 两次均失败 | 该文件标记失败，继续下一个，已完成文件不回滚 |

### T5：pageLimit

| # | 场景 | 期望结果 |
|---|------|---------|
| T5-1 | pageLimit=5，文件 3 页 | 跳过，日志 skipped |
| T5-2 | pageLimit=5，文件 10 页 | 仅输出 5 张 PNG |
| T5-3 | pageLimit=null | 输出全部页 |

### T6：scale 分辨率

| # | 场景 | 期望结果 |
|---|------|---------|
| T6-1 | scale=3，正常 PPT | 短边 4800px，无崩溃 |
| T6-2 | scale=3，超大页面 | 60MP cap 生效，不 OOM |

### T7：路径边界

| # | 场景 | 期望结果 |
|---|------|---------|
| T7-1 | 文件名含中文 | ensureSafeInputPath 处理后成功 |
| T7-2 | 路径长度 > 200 字符 | 安全路径处理后成功 |
| T7-3 | 同名文件平铺输出 | 自动加序号，不覆盖 |
| T7-4 | ~$ 锁文件 | 跳过，不报错 |

### T8：LibreOffice 安装引导

| # | 场景 | 期望结果 |
|---|------|---------|
| T8-1 | LO 未安装，点击导出 | 安装引导 Modal 弹出，含下载链接 |
| T8-2 | Modal 中「重新检测」，LO 已安装 | Modal 关闭，导出自动继续 |
| T8-3 | Modal 中「稍后再说」 | Modal 关闭，导出取消 |
| T8-4 | LO 已安装 | 健康检查 score≥60，直接进入导出 |

### T9：错误与降级

| # | 场景 | 期望结果 |
|---|------|---------|
| T9-1 | 设 `SCENE_OFFICE_TIMEOUT_MS=1` | LO_TIMEOUT，重试 1 次，最终报错有提示 |
| T9-2 | 连续 2 次超时 | 自适应控制器降级，并发降为 1，日志有降级记录 |
| T9-3 | 6 次连续成功 | 自适应控制器恢复，并发回到正常值 |

### T10：端到端压力（上线门）

| # | 场景 | 期望结果 |
|---|------|---------|
| T10-1 | 1×300MB PPT + 19×小文件，pageLimit=3，scale=1 | 小文件先出；大文件串行；结果正确 |
| T10-2 | 20 文件，scale=3 | 渲染并发 1，全程无崩溃 |
| T10-3 | 批量中 2 个大文件故意失败 | 失败文件标记，其他正常完成 |

---

## 十、实施顺序与排期建议

### 10.1 本次主线（可立即开始）

| 顺序 | Task | 预计工时 | 阻塞关系 |
|------|------|---------|---------|
| 1 | Task-01：Modal HTML | 0.5 天 | 阻塞 T8 测试 |
| 2 | Task-02：Modal CSS | 0.5 天 | 依赖 Task-01 |
| 3 | Task-03：HealthFix 兼容壳 | 0.5 天 | 独立 |
| 4 | Task-04：控制器重命名 | 0.5 天 | 独立 |
| 5 | Task-05：日志文案 | 0.5 天 | 独立 |
| 6 | Task-06：旧脚本标记 deprecated | 0.5 天 | 独立 |
| 7 | Task-07：用户说明书 | 0.5 天 | 独立 |
| — | T1-T10 全量测试 | 1.5 天 | 所有 Task 完成后 |
| **合计** | | **~5 天** | |

### 10.2 下一阶段（内置 LO 包，独立排期）

参见 `docs/libreoffice-full-embedded-plan.md`，预计 7-10 天。

### 10.3 回滚方案

- **代码回滚：** `git checkout d9a8d40 -- desktop/main.js`（恢复到 Office COM 版本）
- **功能开关：** `LIBREOFFICE_PATH` 指向不存在路径 → 健康检查 blockExport=true → 提示用户
- **紧急回滚脚本：** `.deprecated` 文件还在，去掉后缀即可恢复旧 PS 脚本

---

## 附录 A：相关文档索引

| 文档 | 路径 | 说明 |
|------|------|------|
| 迁移改造文档（v1.6） | `docs/libreoffice-migration.md` | 完整架构设计与代码改造细节 |
| 内置 LO 方案 | `docs/libreoffice-full-embedded-plan.md` | 方案 B 独立里程碑规划 |
| 用户说明书 | `docs/用户说明书.md` | 用户可见文档（需同步更新） |

## 附录 B：关键 main.js 行号参考

| 函数/区域 | 行号 | 说明 |
|----------|------|------|
| `resolveLibreOfficeRuntime` | 3129 | 运行时解析入口 |
| `getLibreOfficePath` | 3343 | 简单适配器 |
| `runLibreOfficeToPdf` | 3376 | 核心转换函数 |
| `calcLoTimeout` | ~3340 | 动态超时计算 |
| `runPptToPdfWithRetry` | 4127 | PPT 单文件+重试 |
| `convertWordToImages` | 4234 | Word 转换 |
| `batchConvertToPdf` | 4353 | 批量调度 |
| `runOfficeHealthCheck` | 3233 | 健康检查 |
| `runOfficeHealthFix` | ~3035 | 待改为兼容壳 |
| `createPptAdaptiveController` | 3308 | 自适应控制器 |
| `convertPdfBufferToImages` | 3483 | PDFium 渲染（勿改） |
| `convert:documents` handler | 4033 | IPC 入口 |
| `RETRYABLE_OFFICE_ERROR_CODES` | 932 | 可重试错误码集合 |
| `OFFICE_ERROR_HINTS` | ~943 | 错误提示文案 |
