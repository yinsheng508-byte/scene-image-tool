# LibreOffice 引擎迁移改造文档

> 版本：v1.6 | 日期：2026-03-11
> 适用项目：场景化图片工具（desktop/）

---

## 实施状态（2026-03-12）

基于 `docs/libreoffice-full-embedded-plan.md` 的 M1-M4 改造已落地到代码：

1. M1：主进程统一 `resolveLibreOfficeRuntime()`，预检与主流程同口径。
2. M2：新增 Full 打包链路（`dist:full`）与构建前运行时校验脚本。
3. M3：前端保留“下载 LibreOffice”并升级为备用修复语义，新增“复制诊断信息”。
4. M4：补充发布说明、回滚说明、许可证声明文档。

配套文档：

- `docs/libreoffice-full-embedded-plan.md`
- `docs/libreoffice-full-release-notes.md`
- `docs/libreoffice-full-rollback.md`
- `docs/libreoffice-third-party-licenses.md`
- `docs/libreoffice-full-regression-report.md`

---

## 一、背景与目标

### 问题根因

当前"文档一键导出"功能基于 Microsoft Office COM 自动化（PowerShell + `PowerPoint.Application` / `Word.Application`）。生产中出现两类高频故障：

1. **Office 预检 block=true**：`POWERPNT.EXE` 未找到、Office 缓存不可写，导致整批导出被拦截（得分 75/100，扣 25 分）。
2. **PS_TIMEOUT 超时**：大文件 COM 调用超过 60s，触发自适应降级（`level 0→1, reason=timeout`），并发降为 1，处理时间 135-195s/批。

### 改造目标

| 维度 | 改造前 | 改造后 |
|------|--------|--------|
| 转换引擎 | Microsoft Office COM | LibreOffice CLI |
| 是否需要安装 Office | 是 | **否** |
| 进程模型 | 持久 COM 进程，需定期重启 | 每文件独立进程，天然隔离 |
| 超时控制 | COM 挂起难以强杀 | `killProcessTreeByPid` 精准终止 |
| 前端功能 | 不变 | **完全不变** |
| IPC 契约 | `convert:documents` 入参/出参 | **完全不变** |
| 导出速度（稳定前提） | 超时后常降并发到 1，批量耗时抖动大 | 默认 `safe` 并发 1-2；满足条件可灰度升到 3，并支持快速回退 |

### 保持不变的部分

- 前端所有交互：文件扫描、pageLimit、useSubfolder、scale(1/1.5/2/3x)、取消导出、日志导出
- 主流程：`Word/PPT → PDF → PNG`，仅替换前半段引擎
- PDF → PNG 渲染层（PDFium + Sharp，`main.js:3483-3585`）**完全不动**
- IPC 入参/返回结构（`convert:documents`、`office:healthCheck`，`office:healthFix` 仅保留兼容壳）

### 稳定优先的提速原则（新增）

- 默认 `safe`：以成功率优先，避免复杂自适应策略
- 不做 PPT 缓存：保持现状，不新增中间缓存层
- 仅做三件事：`单文件流水线输出`、`小文件并发 + 大文件串行`、`失败重试 1 次并杀进程`
- 任何提速策略都不改变功能语义（pageLimit/scale/返回结构保持一致）

---

## 二、架构设计

### 转换流水线（改造后）

```
用户点击导出
    │
    ▼
[阶段 0] LibreOffice 健康检查（可选，libreoffice-health-check.ps1）
    │  blockExport=true → 弹安装引导 Modal，终止导出
    │  blockExport=false → 继续
    ▼
[阶段 A] 源文件 → PDF（安全并发 1-2，可灰度升至 3，动态超时）
    │  soffice --headless --convert-to pdf --outdir <tmpDir> <inputFile>
    │  每文件独立临时 profile：-env:UserInstallation=<perWorkerDir>
    │  失败 → LO_* 错误码 → 自适应降级 → 重试
    ▼
[阶段 B] PDF → PNG（现有 PDFium 渲染，不变）
    │  convertPdfBufferToImages（main.js:3483）
    │  pageLimit / scale / pageConcurrency 逻辑不变
    ▼
返回结果（结构与当前完全兼容）
```

### 调度模式（v1.5 简化版）

改为“单文件流水线”：

1. 每个任务改为 `convertAndRenderOneFile(task)`，单文件 `PPT/Word -> PDF` 完成后，立即进入该文件的 `PDF -> PNG` 并落盘。
2. 不再采用“全部转完 PDF 再统一渲染”的两段式调度。
3. 文件按大小分队列：
   - 小文件队列（`smallQueue`）：按文件大小升序并发执行（默认并发 2）
   - 大文件队列（`largeQueue`）：串行执行（阈值默认 `>100MB`，可配置）
4. 执行顺序固定：先 `smallQueue`，后 `largeQueue`，确保可见产出更快。

### 常驻 Worker 池兼容策略（简化版）

为兼容低内存/低 CPU，常驻池不默认强开，采用 `poolMode=auto`：

- `freeMem < 8GB` 或 `cpu < 4`：`pool=off`（退回非池化）
- `8GB <= freeMem < 16GB`：`poolSize=1`
- `freeMem >= 16GB` 且 `cpu >= 8`：`poolSize=2`（封顶）
- 任一 worker 连续超时/崩溃达到阈值：本批次退回 `pool=off`

说明：常驻池仅优化吞吐，不改变导出语义；大文件仍走串行队列。

### LibreOffice 进程隔离

每个 worker 使用独立 UserInstallation profile，防止多进程并发时 profile 锁：

```
-env:UserInstallation=file:///C:/Users/.../AppData/Local/Temp/scene-lo-profile-<uuid>
```

profile 目录在转换完成后删除。

---

## 三、文件变更清单

### 新建文件

| 文件 | 用途 |
|------|------|
| `desktop/scripts/libreoffice-health-check.ps1` | 替代 `office-health-check.ps1`，检测 LibreOffice 安装 |
| `desktop/renderer/libreoffice-modal.html` (片段) | 安装引导 Modal，内联到 `index.html` |

### 删除文件（建议延后）

| 文件 | 原因 |
|------|------|
| `desktop/scripts/ppt-to-pdf.ps1` | Phase 1 不删除，先转 `.deprecated` 观察一版后再删 |
| `desktop/scripts/ppt-batch-to-pdf.ps1` | 同上 |
| `desktop/scripts/word-to-pdf.ps1` | 同上 |
| `desktop/scripts/word-batch-to-pdf.ps1` | 同上 |
| `desktop/scripts/office-health-fix.ps1` | 可先保留兼容壳，最终删除 |
| `desktop/scripts/office-identity-policy.ps1` | Office 专用，迁移稳定后删除 |

### 修改文件

| 文件 | 改动范围 |
|------|---------|
| `desktop/main.js` | 10 处定点修改，详见第四节 |
| `desktop/renderer/index.html` | L535：说明文案改为 LibreOffice；新增安装引导 Modal |
| `desktop/renderer/renderer.js` | L1612：诊断日志文案；L1621-1630：预检日志文案 |
| `desktop/preload.js` | 保留 `officeHealthCheck`/`officeHealthFix` 别名一版（向后兼容） |
| `desktop/package.json` | 若内置 LO，补充 `extraResources` |
| `docs/用户说明书.md` | "必须 Office" → "使用 LibreOffice 引擎" |

---

## 四、main.js 详细改造

### 4.1 新增：LibreOffice 查找函数（在 L3050 后插入）

```javascript
// ─── LibreOffice 运行时 ────────────────────────────────────────────────────

function getLibreOfficePath() {
  // 1. 内置 LO（打包在 app 内，优先）
  const bundledPath = path.join(process.resourcesPath || "", "libreoffice", "program", "soffice.exe");
  if (fs.existsSync(bundledPath)) return bundledPath;

  // 2. 环境变量覆盖
  const envPath = process.env.LIBREOFFICE_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  // 3. 系统标准安装路径
  const candidates = [
    "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
    "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
  ];
  return candidates.find(c => fs.existsSync(c)) || null;
}
```

### 4.2 新增：核心转换函数 `runLibreOfficeToPdf`（在 `getLibreOfficePath` 后）

**设计要点：**
- 每文件独立临时 profile 目录，防 profile 锁
- 每次转换使用独立 outdir 子目录，避免同名文件并发覆盖
- 动态超时：`base + sizeMB × factor`，并设上下限
- 验证 PDF 输出是否实际存在
- 精准错误码：`LO_MISSING_BINARY / LO_TIMEOUT / LO_NON_ZERO_EXIT / LO_PROFILE_LOCK / LO_OUTPUT_MISSING`

```javascript
const LO_TIMEOUT_BASE_MS = 60_000;
const LO_TIMEOUT_PER_MB = 800;    // 每 MB 额外 0.8s
const LO_TIMEOUT_MIN_MS = 30_000;
const LO_TIMEOUT_MAX_MS = 20 * 60_000;

function calcLoTimeout(inputPath, overrideMs) {
  if (overrideMs > 0) return Math.min(overrideMs, LO_TIMEOUT_MAX_MS);
  try {
    const sizeMB = fs.statSync(inputPath).size / (1024 * 1024);
    const dynamic = LO_TIMEOUT_BASE_MS + Math.round(sizeMB * LO_TIMEOUT_PER_MB);
    return Math.max(LO_TIMEOUT_MIN_MS, Math.min(dynamic, LO_TIMEOUT_MAX_MS));
  } catch {
    return LO_TIMEOUT_BASE_MS;
  }
}

async function runLibreOfficeToPdf(inputPath, outputDir, options = {}) {
  const soffice = getLibreOfficePath();
  if (!soffice) {
    const e = new Error("未找到 LibreOffice，请安装后重试");
    e.code = "LO_MISSING_BINARY";
    throw e;
  }

  const timeoutMs = calcLoTimeout(inputPath, parsePositiveInt(options.timeoutMs, 0));

  // 独立 outdir（防并发同名覆盖）
  const taskOutDir = path.join(outputDir, `lo-out-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.promises.mkdir(taskOutDir, { recursive: true });

  // 独立 profile 目录（防并发 profile 锁）
  const profileDir = path.join(os.tmpdir(), `scene-lo-profile-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.promises.mkdir(profileDir, { recursive: true });

  const profileUri = "file:///" + profileDir.replace(/\\/g, "/");
  const args = [
    "--headless",
    "--norestore",
    "--nofirststartwizard",
    `-env:UserInstallation=${profileUri}`,
    "--convert-to", "pdf",
    "--outdir", taskOutDir,
    inputPath,
  ];

  const startedAt = Date.now();
  let finished = false;
  let timedOut = false;
  let loProcess = null;

  try {
    return await new Promise((resolve, reject) => {
      const stderrChunks = [];
      const stdoutChunks = [];

      loProcess = require("child_process").spawn(soffice, args, {
        windowsHide: true,
        env: { ...process.env },
      });

      if (loProcess.stdout) loProcess.stdout.on("data", c => stdoutChunks.push(Buffer.from(c)));
      if (loProcess.stderr) loProcess.stderr.on("data", c => stderrChunks.push(Buffer.from(c)));

      const timeoutId = setTimeout(() => {
        if (finished) return;
        timedOut = true;
        killProcessTreeByPid(loProcess.pid);
      }, timeoutMs);

      loProcess.on("error", err => {
        clearTimeout(timeoutId);
        if (finished) return;
        finished = true;
        const e = new Error(`LibreOffice 启动失败: ${err.message}`);
        e.code = "LO_MISSING_BINARY";
        reject(e);
      });

      loProcess.on("close", exitCode => {
        clearTimeout(timeoutId);
        if (finished) return;
        finished = true;

        const durationMs = Date.now() - startedAt;
        const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
        const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();

        if (timedOut) {
          const e = new Error(`LibreOffice 转换超时（>${timeoutMs}ms）`);
          e.code = "LO_TIMEOUT";
          e.durationMs = durationMs;
          e.timeoutMs = timeoutMs;
          return reject(e);
        }

        if (exitCode !== 0) {
          const combined = `${stderr} ${stdout}`.toLowerCase();
          let code = "LO_NON_ZERO_EXIT";
          if (combined.includes("profile") && combined.includes("lock")) code = "LO_PROFILE_LOCK";
          const e = new Error(stderr || stdout || `LibreOffice 退出码 ${exitCode}`);
          e.code = code;
          e.exitCode = exitCode;
          e.durationMs = durationMs;
          return reject(e);
        }

        // 验证输出是否存在
        const stem = path.basename(inputPath, path.extname(inputPath));
        const expectedPdf = path.join(taskOutDir, `${stem}.pdf`);
        if (!fs.existsSync(expectedPdf)) {
          const e = new Error("LibreOffice 未生成 PDF");
          e.code = "LO_OUTPUT_MISSING";
          e.durationMs = durationMs;
          return reject(e);
        }

        resolve({ pdfPath: expectedPdf, durationMs, timeoutMs });
      });
    });
  } finally {
    // 清理 profile 目录
    fs.promises.rm(profileDir, { recursive: true, force: true }).catch(() => {});
    // 清理任务 outdir（成功 rename 后通常为空；失败时也一并回收）
    fs.promises.rm(taskOutDir, { recursive: true, force: true }).catch(() => {});
  }
}
```

### 4.3 修改：常量块（L870-929）

**替换** `RETRYABLE_OFFICE_ERROR_CODES` 和 `OFFICE_ERROR_HINTS`，**删除** `FORCE_KILL_ALL_POWERPNT_ON_TIMEOUT`：

```javascript
// 删除：const FORCE_KILL_ALL_POWERPNT_ON_TIMEOUT = ...（L921）

const RETRYABLE_OFFICE_ERROR_CODES = new Set([
  "LO_TIMEOUT",       // 超时，重试有意义
  "LO_NON_ZERO_EXIT", // 非零退出（可能是临时资源问题）
  "LO_PROFILE_LOCK",  // profile 锁（换 profile 后重试）
  "LO_OUTPUT_MISSING",// 输出缺失（偶发 IO/并发时可重试）
]);

const OFFICE_ERROR_HINTS = new Map([
  ["LO_MISSING_BINARY", "未找到 LibreOffice，请安装后重试"],
  ["LO_TIMEOUT",        "LibreOffice 转换超时，文件可能过大，请重试"],
  ["LO_NON_ZERO_EXIT",  "LibreOffice 转换失败，请重试"],
  ["LO_PROFILE_LOCK",   "LibreOffice profile 冲突，请重试"],
  ["LO_OUTPUT_MISSING", "LibreOffice 未生成 PDF，文件可能已损坏"],
  ["PS_TIMEOUT",        "转换超时，请重试"],
]);
```

### 4.4 修改：`normalizeOfficeErrorCode`（L992-998）

```javascript
function normalizeOfficeErrorCode(code) {
  if (!code) return "";
  const s = String(code).toUpperCase();
  if (s === "PS_TIMEOUT") return "PS_TIMEOUT";
  if (s.startsWith("LO_")) return s;          // 新增：LO_ 直接透传
  const match = String(code).match(/0x[0-9a-fA-F]{8}/);
  return match ? match[0].toLowerCase() : "";
}
```

### 4.5 修改：`classifyPptFailureTrigger`（L3293-3307）

```javascript
function classifyPptFailureTrigger(result) {
  if (!result || result.ok) return "";
  const errorCode = normalizeOfficeErrorCode(result.errorCode);
  // 超时 → timeout 触发降级
  if (errorCode === "LO_TIMEOUT" || errorCode === "PS_TIMEOUT") return "timeout";
  // 非零退出/profile 锁 → oom_crash 触发降级（替代原 com_reject）
  if (errorCode === "LO_NON_ZERO_EXIT" || errorCode === "LO_PROFILE_LOCK") return "oom_crash";
  return "";
}
```

`triggerStats` 中 `com_reject` → `oom_crash` 的实际修改在 4.13 节统一处理。

### 4.6 修改：健康检查脚本名（L3020）

```javascript
// 改前：
const stdout = await runPowerShellWithOutput("office-health-check.ps1", [], { timeoutMs });
// 改后：
const stdout = await runPowerShellWithOutput("libreoffice-health-check.ps1", [], { timeoutMs });
```

其余解析逻辑不变（JSON shape 完全相同）。

### 4.7 调整：`runOfficeHealthFix`（L3035-3049）

LibreOffice 方案下不再需要 Office 注册表治理。  
建议做法：
1. `runOfficeHealthFix` 保留兼容壳实现，直接返回 `{ ok: false, message: "not supported" }`
2. `ipcMain.handle("office:healthFix", ...)` 保留（避免旧前端或脚本调用报 IPC 不存在）
3. `officePrecheckMode === "fix"` 分支改为“记录提示并按 warn 继续”，不再执行真实修复

### 4.8 修改：`runPptToPdfWithRetry`（L3625-3644）

替换 `runPowerShellWithOutput("ppt-to-pdf.ps1", ...)` 调用：

```javascript
// 替换原来的 PS 调用部分：
const tempOutDir = path.dirname(pdfPath);
const loResult = await runLibreOfficeToPdf(inputPath, tempOutDir, {
  timeoutMs,
});
// LO 输出文件名由 stem 决定，需 rename 到期望路径
if (loResult.pdfPath !== pdfPath) {
  await fs.promises.rename(loResult.pdfPath, pdfPath);
}
// 构造兼容原有结构的返回值
const scriptResult = {
  ok: true,
  openMode: "libreoffice",
  repaired: false,
  fallbackReason: "",
  envWarning: "",
  durationMs: loResult.durationMs,
  timeoutMs: loResult.timeoutMs,
};
```

`catch` 块保持不变（`buildOfficeFailure` 已接受 `error.code`）。

### 4.9 修改：`convertWordToImages`（L3762）

```javascript
// 替换 runPowerShell("word-to-pdf.ps1", ...) 为：
const tempOutDir = path.dirname(pdfPath);
const loResult = await runLibreOfficeToPdf(safeInput.path, tempOutDir, {
  timeoutMs: wordTimeoutMs,
});
if (loResult.pdfPath !== pdfPath) {
  await fs.promises.rename(loResult.pdfPath, pdfPath);
}
```

### 4.10 重写：`batchConvertToPdf`（L3822-3916）

删除 PS 批量脚本调用，改为 `smallQueue + largeQueue + convertAndRenderOneFile`。  
**本节实现口径以第十章 4 条硬约束为准，不再引入 `safe/boost` 双档逻辑。**

```javascript
async function batchConvertToPdf(type, tasks, options = {}) {
  if (!tasks.length) return [];

  const thresholdMb = Number(options.largeFileThresholdMb || 100);
  const smallConcurrency = Math.max(1, Number(options.concurrency) || 2);
  const { smallQueue, largeQueue } = splitBySize(tasks, thresholdMb);

  // smallQueue: 小文件按大小升序并发
  smallQueue.sort((a, b) => a.sizeBytes - b.sizeBytes);
  const smallResults = await runWithConcurrency(
    smallQueue,
    smallConcurrency,
    (task) => convertAndRenderOneFile(task, { large: false })
  );

  // largeQueue: 大文件串行 + 每文件最多 2 次尝试
  const largeResults = [];
  for (const task of largeQueue) {
    const r = await convertAndRenderOneFileLarge(task, {
      maxAttempts: 2,
      onAttemptFailed: async (worker) => {
        await killWorker(worker);
        await rebuildWorker(task);
      },
    });
    largeResults.push(r);
  }

  return [...smallResults, ...largeResults];
}
```

实现约束（必须满足）：

- 不做 PPT 缓存（仅临时文件，不做跨任务复用）
- 单文件完成转换后立即渲染、立即落盘
- 执行顺序固定：先 `smallQueue`，后 `largeQueue`
- 大文件失败仅影响当前文件：已完成文件不回滚，失败文件标记后继续下一个

### 4.11 修改：PPT/Word 批量调度（L4325-4680）

**Phase 1 不合并现有分支结构**，保持 `pptIsolatedMode`、PPT 失败项兜底、现有进度/日志语义不变。  
只在以下位置替换底层转换调用：

1. `runPptToPdfWithRetry` 内改用 `runLibreOfficeToPdf`
2. `convertWordToImages` 内改用 `runLibreOfficeToPdf`
3. `batchConvertToPdf` 内改用 `runLibreOfficeToPdf + runWithConcurrency`

这样可以最大限度复用现有稳定逻辑（降级、重试、阶段日志、返回结构），降低一次性重构风险。  
`getPptBatchEnv()` 在 Phase 2 再删除，Phase 1 可先保留但不再使用。

### 4.12 修改：取消导出（L4966-4972）

保留 IPC 契约不变（`convert:cancel` 仍只设置 `conversionAbortRequested=true`），并建议做一处增强：  
在 `runLibreOfficeToPdf` 内把当前 `soffice` pid 注册到局部活跃集合，收到取消后主动 `killProcessTreeByPid(pid)`。  
这样无需改前端交互，也能显著缩短“取消等待时间”。

```javascript
// IPC 入口保持不变：
ipcMain.handle("convert:cancel", async () => {
  conversionAbortRequested = true;
  return { ok: true };
});
```

### 4.13 重命名：自适应控制器（L4114）

可选改名：`pptAdaptiveController` → `docConvertAdaptiveController`。  
无论是否改名，**对外诊断结构保持 `diagnostics.ppt` 不变**，避免前端日志解析与历史导出日志工具失配。

```javascript
// 改前：
const pptAdaptiveController = createPptAdaptiveController({ ... });

// 改后：
const docConvertAdaptiveController = createPptAdaptiveController({ ... });
```

同步将 `state.triggerStats` 初始化（L3327-3331）中 `com_reject` 改为 `oom_crash`（仅内部统计字段）：

```javascript
triggerStats: {
  timeout: 0,
  oom_crash: 0,         // 原 com_reject
  consecutive_failures: 0
}
```

全文替换 `pptAdaptiveController` → `docConvertAdaptiveController`（共约 8 处调用）。

---

## 五、libreoffice-health-check.ps1 设计

输出 JSON 结构与原 `office-health-check.ps1` **完全相同**，`runOfficeHealthCheck()` 无需修改。

> 说明：脚本语法按 Windows PowerShell 5.1 兼容编写，不使用 PS7 才支持的三元运算符。

```powershell
param()

$score = 100
$blockExport = $false
$checks = @()
$warnings = @()
$suggestions = @()

function Add-Check($name, $ok, $severity, $detail, $penalty) {
    $script:checks += @{ name = $name; ok = $ok; severity = $severity; detail = $detail }
    if (-not $ok) { $script:score -= $penalty }
}

# 1. 查找 soffice.exe
$sofficePath = $env:LIBREOFFICE_PATH
if (-not $sofficePath) {
    $candidates = @(
        "C:\Program Files\LibreOffice\program\soffice.exe",
        "C:\Program Files (x86)\LibreOffice\program\soffice.exe"
    )
    $sofficePath = ($candidates | Where-Object { Test-Path $_ } | Select-Object -First 1)
}
$hasBinary = -not [string]::IsNullOrWhiteSpace($sofficePath)
if ($hasBinary) {
    $binaryDetail = $sofficePath
} else {
    $binaryDetail = "soffice.exe 未找到"
}
Add-Check "libreoffice_binary" $hasBinary "high" $binaryDetail 50
if (-not $hasBinary) {
    $blockExport = $true
    $suggestions += "请从 https://www.libreoffice.org/ 下载安装 LibreOffice"
}

# 2. 版本检查
if ($hasBinary) {
    try {
        $versionOutput = & $sofficePath --version 2>&1 | Out-String
        $versionMatch = [regex]::Match($versionOutput, 'LibreOffice (\d+)\.(\d+)')
        $versionOk = $versionMatch.Success
        $majorVersion = if ($versionMatch.Success) { [int]$versionMatch.Groups[1].Value } else { 0 }
        Add-Check "libreoffice_version" ($versionOk -and $majorVersion -ge 7) "medium" $versionOutput.Trim() 10
        if ($versionOk -and $majorVersion -lt 7) {
            $warnings += "LibreOffice 版本较旧（$($versionMatch.Value)），建议升级到 7.0+"
        }
    } catch {
        Add-Check "libreoffice_version" $false "medium" "版本检测失败: $_" 10
    }
}

# 3. 临时目录可写
$tempWritable = $false
try {
    $probe = Join-Path $env:TEMP "scene-lo-probe-$([System.Guid]::NewGuid().ToString('N')).tmp"
    "ok" | Out-File $probe -Encoding ascii
    Remove-Item $probe -Force
    $tempWritable = $true
} catch {}
if ($tempWritable) {
    $tempDetail = $env:TEMP
} else {
    $tempDetail = "TEMP 目录不可写"
}
Add-Check "temp_dir_writable" $tempWritable "high" $tempDetail 30
if (-not $tempWritable) {
    $blockExport = $true
    $suggestions += "临时目录 $env:TEMP 不可写，请检查磁盘空间和权限"
}

# 4. 用户 profile 目录
$profileOk = Test-Path $env:USERPROFILE
Add-Check "user_profile_path" $profileOk "low" $env:USERPROFILE 5

# 输出 JSON
@{
    ok          = (-not $blockExport)
    blockExport = $blockExport
    score       = [Math]::Max(0, $score)
    checks      = $checks
    warnings    = $warnings
    suggestions = $suggestions
    actions     = @()
} | ConvertTo-Json -Depth 5
```

---

## 六、前端改造

### 6.1 index.html：说明文案（L535）

```html
<!-- 改前 -->
<span class="card-desc">选择文件后将自动扫描并导出 PNG，支持放大与裁剪。注意：请先安装并激活 Microsoft Office（建议登录 Office 账号），否则无法正常导出。</span>

<!-- 改后 -->
<span class="card-desc">选择文件后将自动扫描并导出 PNG，支持放大与裁剪。注意：需要安装 <a id="loDownloadLink" href="#" style="color:inherit;">LibreOffice</a>，首次使用时将自动检测。</span>
```

### 6.2 index.html：新增安装引导 Modal

参考现有 `#licenseModal` 结构新增（在 `#updateModal` 后）：

```html
<div id="libreofficeModal" class="modal-overlay" style="display:none;">
  <div class="modal-box">
    <div class="modal-header">需要安装 LibreOffice</div>
    <div class="modal-body">
      <p>文档导出功能需要 LibreOffice 运行时。LibreOffice 是免费开源软件，安装后即可使用。</p>
      <ol style="margin: 12px 0; padding-left: 20px; line-height: 2;">
        <li>点击下载，前往官网下载安装包（约 300MB）</li>
        <li>安装完成后，点击「我已安装，重新检测」</li>
      </ol>
      <div id="loDetectResult" style="display:none; margin-top:8px; font-size:13px;"></div>
    </div>
    <div class="modal-footer">
      <button id="loDownloadBtn" type="button" class="btn-primary">立即下载</button>
      <button id="loRedetectBtn" type="button">我已安装，重新检测</button>
      <button id="loSkipBtn" type="button" class="btn-secondary">稍后再说</button>
    </div>
  </div>
</div>
```

### 6.3 renderer.js：安装引导逻辑

在 `handleConvert()` 函数起始处添加 LibreOffice 检查：

```javascript
async function checkLibreOfficeBeforeExport() {
  // 若之前已检测通过，跳过（session 内缓存）
  if (window._loCheckPassed) return true;

  const resp = await window.appApi.officeHealthCheck({ timeoutMs: 15000 });
  const report = resp?.result || null;
  if (resp?.ok && report && !report.blockExport) {
    window._loCheckPassed = true;
    return true;
  }

  // blockExport=true → 显示安装引导 Modal
  return new Promise((resolve) => {
    const modal = document.getElementById("libreofficeModal");
    modal.style.display = "flex";

    document.getElementById("loDownloadBtn").onclick = () => {
      // 复用现有 bridge（当前 openExternal 在 licenseAPI 下）
      window.licenseAPI?.openExternal("https://www.libreoffice.org/download/download-libreoffice/");
    };

    document.getElementById("loRedetectBtn").onclick = async () => {
      const btn = document.getElementById("loRedetectBtn");
      const resultEl = document.getElementById("loDetectResult");
      btn.textContent = "检测中...";
      btn.disabled = true;
      const recheckResp = await window.appApi.officeHealthCheck({ timeoutMs: 15000 });
      const recheck = recheckResp?.result || null;
      btn.textContent = "我已安装，重新检测";
      btn.disabled = false;
      if (recheckResp?.ok && recheck && !recheck.blockExport) {
        window._loCheckPassed = true;
        modal.style.display = "none";
        resolve(true);
      } else {
        resultEl.style.display = "block";
        resultEl.style.color = "#e74c3c";
        resultEl.textContent = "未检测到 LibreOffice，请确认已安装完成";
      }
    };

    document.getElementById("loSkipBtn").onclick = () => {
      modal.style.display = "none";
      resolve(false);
    };
  });
}

// 在 handleConvert() 开头调用：
async function handleConvert() {
  const loReady = await checkLibreOfficeBeforeExport();
  if (!loReady) return;
  // ... 原有导出逻辑
}
```

### 6.4 renderer.js：诊断日志文案（L1610-1630）

```javascript
// L1612 PPT 诊断日志：删除 COM 专有字段
appendLog({
  level: 1,
  message: `文档转换诊断：总计 ${ppt.total || 0}，重试 ${ppt.retried || 0}，` +
           `降级级别 ${ppt.degradeLevel || 0}，并发 ${ppt.currentConcurrency || 1}，` +
           `平均耗时 ${durationAvgMs}ms，最大耗时 ${durationMaxMs}ms，` +
           `主错误码 ${topErrorCode ? `${topErrorCode[0]}(${topErrorCode[1]})` : "none"}`
});

// L1627 预检日志文案：
message: `引擎预检：mode=${precheck.mode || "unknown"} score=${finalReport.score || 0}/100 block=${finalReport.blockExport ? "true" : "false"}`
```

---

## 七、边界场景处理

### 7.1 大文件（几百 MB PPT）

| 措施 | 实现位置 |
|------|---------|
| 不做 PPT 缓存（保留现状） | 调度层不引入缓存命中/复用逻辑 |
| 大文件阈值默认 `>100MB`（可配置） | 队列拆分器 `classifyByFileSize` |
| 大文件只进入 `largeQueue` 串行执行 | `processLargeQueueSerially` |
| 每个大文件最多 2 次尝试（首次 + 1 次重试） | `convertAndRenderOneFileLarge` |
| 每次失败立即 kill 当前 worker 并重建 | `recreateWorkerAfterFailure` |
| 已完成文件不回滚，失败文件标记后继续下一个 | 结果聚合器 `resultCollector` |

### 7.2 20 文件同时导出

| 措施 | 实现位置 |
|------|---------|
| 先按大小分队列，小文件优先 | `smallQueue` + `largeQueue` |
| `smallQueue` 按大小升序并发（默认并发 2） | `processSmallQueueWithConcurrency` |
| `largeQueue` 串行执行 | `processLargeQueueSerially` |
| 单文件流水线：每文件转完立即渲染、立即落盘 | `convertAndRenderOneFile(task)` |
| 某文件失败不阻塞整批；已产出结果保留 | `resultCollector` |
| 每文件独立 profile 防锁 | `runLibreOfficeToPdf` 中 `profileDir` |

### 7.3 pageLimit（只导前几页）

**行为与现有完全一致**，无需修改：
- 先完整转换 PDF（LibreOffice 不支持只导出前 N 页 PDF）
- PDFium 渲染时按 `pageLimit` 截取（`main.js:3495-3501`）
- `totalPages < pageLimit` → 跳过该文件

### 7.4 3x 分辨率

保持现有清晰度策略，同时补一条高分辨率保护：
- `getTargetShortSide(3)` → 4800px（`main.js:3161`）
- 60MP 像素上限 cap（`main.js:3489`）
- `scale >= 3` 时额外将 `pageConcurrency` 降为 1（在 `convert:documents` 组装 options 时做保护，而不是改 `getMaxConcurrency`）
- `scale >= 3` 时转换并发不升档，仍使用 `smallQueue` 的安全并发

### 7.5 组合边界场景（新增）

| 场景 | 设计行为（功能不变） |
|------|------------------|
| 1 个 300MB PPT + 19 个小文件 | 先跑 `smallQueue`（并发），后跑 `largeQueue`（串行）；小文件先出结果 |
| 20 文件 + `pageLimit=3` | 仍需完整转 PDF，再在渲染阶段截取前 3 页；`pageLimit` 不影响转 PDF 开销 |
| 20 文件 + `scale=3` | 渲染并发固定 1；转换仍按 small/large 队列执行，避免 CPU/内存峰值叠加 |
| 20 文件 + 中文名/超长路径/同名文件 | 继续使用 `ensureSafeInputPath` + 独立 outdir/profile，确保不冲突不覆盖 |
| 低内存/低 CPU 机器 | `poolMode=auto` 自动退化：`pool=off` 或 `poolSize=1`，保证可运行 |

---

## 八、新错误码体系

| 错误码 | 触发条件 | 可重试 | 自适应降级触发器 |
|--------|---------|--------|----------------|
| `LO_MISSING_BINARY` | soffice.exe 未找到 | 否 | 无 |
| `LO_TIMEOUT` | 进程超时被 kill | 是 | `timeout` → 降并发 |
| `LO_NON_ZERO_EXIT` | 非零退出码 | 是 | `oom_crash` → 降并发 |
| `LO_PROFILE_LOCK` | profile 目录锁冲突 | 是 | `oom_crash` → 降并发 |
| `LO_OUTPUT_MISSING` | PDF 未生成 | 是 | 连续失败计数 |
| `PS_TIMEOUT` | 健康检查 PS 脚本超时 | 否（健康检查不重试） | 无 |

---

## 九、LibreOffice 部署方案

### 方案 A：系统安装（已落地）

用户自行安装 LibreOffice，应用检测系统路径。
- 优点：安装包体积不增加
- 缺点：需要用户操作，首次使用有安装摩擦（由安装引导 Modal 缓解）
- 当前稳定版本默认采用该方案

### 方案 B：内置 LO Full 包（已进入实施规划）

将 LibreOffice 精简版打包进 `resources/libreoffice/`，用户开箱即用。
- 优点：无安装摩擦
- 缺点：安装包增加约 250-300MB
- `getLibreOfficePath()` 已预留内置路径检测逻辑（优先级最高）
- 完整改造计划见：`docs/libreoffice-full-embedded-plan.md`

### 安装检测优先级

```
1. resources/libreoffice/program/soffice.exe  （内置路径优先检查；当前若未内置会自动跳过）
2. LIBREOFFICE_PATH 环境变量                  （高级用户自定义）
3. C:\Program Files\LibreOffice\...           （系统安装标准路径）
4. C:\Program Files (x86)\LibreOffice\...     （32 位系统路径）
```

---

## 十、分阶段实施清单

### 10.0 本轮硬约束（必须全部满足）

1. **不做 PPT 缓存**：保留现状，不引入中间缓存策略。
2. **一转完就渲染**：每个任务走 `convertAndRenderOneFile(task)`，单文件完成后立即落盘。
3. **小文件并发 / 大文件串行**：
   - 阈值默认 `100MB`（PPT），支持配置。
   - `smallQueue`：按文件大小升序并发执行。
   - `largeQueue`：串行执行。
   - 执行顺序：先 `smallQueue`，后 `largeQueue`。
4. **大文件失败处理**：
   - 每个大文件最多 2 次尝试（首次 + 1 次重试）。
   - 每次失败立即 kill 当前 worker 进程并重建 worker。
   - 已完成文件不回滚，失败文件标记失败并继续下一个。

### 10.1 里程碑与建议排期（可执行）

| 里程碑 | 预计工期 | 范围 | 进入条件 | 退出条件 |
|--------|---------|------|---------|---------|
| M1 | 3-5 天 | Phase 1 核心调度替换 | 分支创建完成，测试素材齐备（含 300MB PPT、20 文件批量、3x、pageLimit） | 4 条硬约束全部落地，T1-T6 通过 |
| M2 | 2-3 天 | Phase 2 Worker 与失败治理 | M1 稳定（建议观察 2-3 天） | 大文件 2 次尝试 + kill/rebuild 生效，T7-T9 通过 |
| M3 | 1-2 天 | Phase 3 前端与文档对齐 | M2 稳定 | 安装引导、日志文案、用户文档更新完成 |
| M4 | 3-5 天 | Phase 4 稳定提速灰度 | M3 稳定，已有 `safe` 基线数据 | T10 通过，低配机器兼容性达标，可灰度放量 |

### 10.2 Phase 1：核心调度替换（M1）

| ID | 任务 | 涉及文件 | DoD |
|----|------|---------|-----|
| P1-01 | 新增阈值配置 `LARGE_FILE_THRESHOLD_MB=100`（可配） | `desktop/main.js` | 阈值可通过配置覆盖，默认 100MB |
| P1-02 | 新增队列拆分与排序：`smallQueue` 升序、`largeQueue` 串行 | `desktop/main.js` | 同批任务可复现“先小后大”执行顺序 |
| P1-03 | 新增 `convertAndRenderOneFile(task)`，替代两阶段屏障 | `desktop/main.js` | 任一文件 PDF 完成后立即进入渲染并落盘 |
| P1-04 | 移除“先全量转 PDF 再统一渲染”路径 | `desktop/main.js` | 主流程无全局 PDF barrier |
| P1-05 | 明确不做 PPT 缓存（仅过程临时文件） | `desktop/main.js` | 无缓存命中逻辑、无缓存目录治理逻辑 |

### 10.3 Phase 2：Worker 与失败治理（M2）

| ID | 任务 | 涉及文件 | DoD |
|----|------|---------|-----|
| P2-01 | 大文件执行器：`convertAndRenderOneFileLarge(task)` | `desktop/main.js` | 每大文件最多 2 次尝试 |
| P2-02 | 失败即 kill + rebuild worker | `desktop/main.js` | 每次失败后旧 worker 被销毁，新 worker 再重试 |
| P2-03 | 单文件结果即时提交，不回滚已完成文件 | `desktop/main.js` | 批次失败时已导出文件仍保留 |
| P2-04 | 失败文件仅标记失败并继续后续任务 | `desktop/main.js` | 批量任务不中断，最终汇总失败清单 |
| P2-05 | 取消导出时安全收敛（不产生僵尸进程） | `desktop/main.js` | 取消后 worker 可在可控时间内退出 |

### 10.4 Phase 3：前端与文档对齐（M3）

| ID | 任务 | 涉及文件 | DoD |
|----|------|---------|-----|
| P3-01 | 导出日志新增队列与执行信息（small/large、attempt） | `desktop/renderer/renderer.js` | 用户可看到“先小后大 + 重试次数” |
| P3-02 | 安装引导文案与错误提示保持 LibreOffice 口径 | `desktop/renderer/index.html`, `desktop/renderer/renderer.js` | 未安装时提示明确，已安装可重检通过 |
| P3-03 | 用户文档更新（新调度规则与边界说明） | `docs/用户说明书.md` | 文档与实际行为一致 |

### 10.5 Phase 4：稳定提速灰度（M4）

| ID | 任务 | 涉及文件 | DoD |
|----|------|---------|-----|
| P4-01 | 常驻 worker 池 `poolMode=auto` 落地 | `desktop/main.js` | 低配自动退化，高配有限启用 |
| P4-02 | 低资源护栏：`freeMem<8GB` 或 `cpu<4` 时 `pool=off` | `desktop/main.js` | 低配机器不因池化导致不可用 |
| P4-03 | 中高配护栏：`8~16GB` 用 `poolSize=1`，`>=16GB && cpu>=8` 用 `poolSize=2` | `desktop/main.js` | 池大小有上限，不引入复杂策略 |
| P4-04 | 连续超时/崩溃触发本批次回退 `pool=off` | `desktop/main.js` | 出现异常时自动回到最稳模式 |
| P4-05 | 灰度放量（5%→20%→全量） | 发布配置/运维 | 指标稳定后再扩大流量 |

### 10.6 关键执行伪代码（统一实现口径）

```javascript
async function runBatch(tasks) {
  const { smallQueue, largeQueue } = splitBySize(tasks, thresholdMb /* default=100 */);
  smallQueue.sort((a, b) => a.size - b.size);

  // 1) 小文件先并发，单文件转完立即渲染并落盘
  await runWithConcurrency(smallQueue, smallConcurrency, (task) =>
    convertAndRenderOneFile(task)
  );

  // 2) 大文件后串行，失败最多重试 1 次
  for (const task of largeQueue) {
    await convertAndRenderOneFileLarge(task); // 内部执行 kill + rebuild
  }
}

async function convertAndRenderOneFileLarge(task) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const worker = await getOrCreateWorker(task);
    try {
      await convertAndRenderOneFile(task, worker); // 成功立即落盘并提交结果
      return;
    } catch (err) {
      await killWorker(worker);
      await rebuildWorker(task);
      if (attempt === 2) markFailed(task, err); // 不回滚已完成文件
    }
  }
}
```

### 10.7 阶段门禁（Go / No-Go）

| 指标 | Go 条件 | No-Go 处理 |
|------|---------|-----------|
| 功能正确性 | 4 条硬约束全部通过 | 阶段冻结，修复后重测 |
| 稳定性 | 失败率不高于基线 +1% | 暂停放量，回到最稳并发 |
| 超时率 | `LO_TIMEOUT` 不高于基线 +1% | 降并发或关闭池化 |
| 资源占用 | 低配机无持续高压（CPU/内存可恢复） | `pool=off` + 降并发 |
| 可恢复性 | kill/rebuild 后任务可继续推进 | 禁止进入下一里程碑 |

### 10.8 四点开发任务详单（可直接排期）

#### 10.8.1 需求点 A：不做 PPT 缓存（保留现状）

| 任务 ID | 开发项 | 代码落点 | 预计工时 | 完成标准 |
|--------|--------|----------|---------|---------|
| A-01 | 明确关闭缓存策略（配置与默认值） | `desktop/main.js`（导出配置组装） | 0.5 天 | 导出路径中无 cache hit/cache restore 分支 |
| A-02 | 清理潜在缓存读写逻辑（如存在历史残留） | `desktop/main.js`（批处理主流程） | 0.5 天 | 仅保留临时文件目录，不新增缓存目录 |
| A-03 | 临时文件生命周期治理（单文件结束即释放） | `runLibreOfficeToPdf`、`convertAndRenderOneFile` | 0.5 天 | 无跨任务复用文件，异常路径可清理 |
| A-04 | 诊断日志补充 `cacheMode=off` | `desktop/renderer/renderer.js` | 0.5 天 | 用户日志可确认“无缓存模式”生效 |

#### 10.8.2 需求点 B：一转完就渲染（`convertAndRenderOneFile(task)`）

| 任务 ID | 开发项 | 代码落点 | 预计工时 | 完成标准 |
|--------|--------|----------|---------|---------|
| B-01 | 新增 `convertAndRenderOneFile(task)` 函数签名与上下文 | `desktop/main.js` | 0.5 天 | 单函数内串联 `源文件->PDF->PNG->落盘` |
| B-02 | 主流程改造为“文件级流水线” | `convert:documents` 调度段 | 1.0 天 | 首个文件完成后立即可见产出，不等全量 PDF |
| B-03 | 进度事件与日志改为“文件粒度” | `desktop/main.js` + `renderer.js` | 0.5 天 | 前端可看到每文件“转换中/渲染中/完成” |
| B-04 | 取消导出语义对齐流水线 | `convert:cancel` + worker 终止逻辑 | 0.5 天 | 已完成文件保留，未启动文件不执行 |

#### 10.8.3 需求点 C：小文件并发 / 大文件串行（100MB 可配）

| 任务 ID | 开发项 | 代码落点 | 预计工时 | 完成标准 |
|--------|--------|----------|---------|---------|
| C-01 | 新增阈值配置项（默认 100MB，可覆盖） | `desktop/main.js`（配置解析） | 0.5 天 | 支持 `options/env` 覆盖，默认值稳定 |
| C-02 | 队列拆分器 `splitBySize` | `desktop/main.js` | 0.5 天 | 正确输出 `smallQueue` 与 `largeQueue` |
| C-03 | `smallQueue` 按大小升序并发执行 | `runWithConcurrency` 调度段 | 1.0 天 | 执行顺序和并发数符合预期 |
| C-04 | `largeQueue` 串行执行（在 small 后） | 主调度循环 | 0.5 天 | 严格“先 small 后 large”，大文件不并发 |
| C-05 | 3x / pageLimit 与队列调度兼容校验 | 现有渲染参数拼装处 | 0.5 天 | 功能语义不变（仅调度变化） |
| C-06 | 队列诊断字段（queueType/queueIndex） | `diagnostics` + 前端日志 | 0.5 天 | 用户可追踪任务来自 small/large 队列 |

#### 10.8.4 需求点 D：大文件失败处理（2 次尝试 + kill/rebuild）

| 任务 ID | 开发项 | 代码落点 | 预计工时 | 完成标准 |
|--------|--------|----------|---------|---------|
| D-01 | 新增 `convertAndRenderOneFileLarge(task)` 重试封装 | `desktop/main.js` | 0.5 天 | 每大文件最多 2 次尝试 |
| D-02 | 失败后立即 kill 当前 worker 进程树 | `killProcessTreeByPid` 调用链 | 0.5 天 | 失败后旧 worker 不复用 |
| D-03 | 重建 worker 并执行第 2 次尝试 | worker 管理器 | 0.5 天 | 第 2 次尝试使用新 worker/profile |
| D-04 | 二次失败标记失败并继续下一个 | 任务结果聚合器 | 0.5 天 | 批量不中断，失败项进入失败清单 |
| D-05 | 已完成文件不回滚策略落地 | 结果提交与落盘路径 | 0.5 天 | 失败不影响已导出文件 |
| D-06 | 故障注入测试（timeout/non-zero/profile lock） | 测试脚本与样本集 | 1.0 天 | 失败路径可重复、行为符合预期 |

#### 10.8.5 跨点公共任务（建议并行）

| 任务 ID | 开发项 | 代码落点 | 预计工时 | 完成标准 |
|--------|--------|----------|---------|---------|
| X-01 | 指标与日志统一（attempt/workerRebuild/queueType） | `desktop/main.js` + `renderer.js` | 0.5 天 | 关键行为可观测可排障 |
| X-02 | 低配兼容护栏接入（`poolMode=auto`） | `desktop/main.js` | 0.5 天 | 低内存低 CPU 自动退化可运行 |
| X-03 | 回归测试矩阵执行（T1-T10） | 测试资产与日志导出 | 1.0 天 | 全量用例通过并有记录 |
| X-04 | 回滚开关与发布说明 | 配置文档 + 发布脚本 | 0.5 天 | 异常可快速回到稳定模式 |

#### 10.8.6 建议执行顺序（最小风险）

1. A-01~A-04（先锁定“无缓存”边界）
2. B-01~B-04（先跑通单文件流水线）
3. C-01~C-06（再引入 small/large 队列）
4. D-01~D-06（最后接入大文件失败治理）
5. X-01~X-04（全程穿插，发布前收口）

#### 10.8.7 总工时评估（单人）

| 范围 | 预计工时 |
|------|---------|
| A + B + C + D 核心开发 | 10.0~12.0 天 |
| X 公共任务 + 回归 + 灰度准备 | 2.5~3.0 天 |
| 总计 | 12.5~15.0 天 |

---

## 十一、验收测试用例

### T1：基础功能

| # | 场景 | 期望结果 |
|---|------|---------|
| T1-1 | 单个 .pptx 导出，scale=1 | PNG 生成正确，日志 `openMode: libreoffice` |
| T1-2 | 单个 .docx 导出 | PNG 生成正确 |
| T1-3 | .pdf 直接导出（不经 LibreOffice）| PDFium 渲染正常 |
| T1-4 | 混合 doc/docx/ppt/pptx/pdf 各 1 个 | 全部成功，无报错 |

### T2：不做缓存与单文件流水线

| # | 场景 | 期望结果 |
|---|------|---------|
| T2-1 | 连续两次导出同一 300MB .pptx | 第二次不依赖缓存命中，行为与首次一致 |
| T2-2 | 批量导出中观察首个文件完成时间 | 第一个文件转完即渲染并落盘，不等待全体 PDF |
| T2-3 | 导出中途取消 | 已完成文件保留，未开始文件不执行 |

### T3：小文件并发 / 大文件串行

| # | 场景 | 期望结果 |
|---|------|---------|
| T3-1 | 20 文件（含大小混合） | 执行顺序先 `smallQueue` 后 `largeQueue` |
| T3-2 | `smallQueue` 内文件大小 5/10/20MB | 按大小升序开始执行 |
| T3-3 | `smallQueue` 并发设 2 | 任一时刻小文件在跑任务数不超过 2 |
| T3-4 | `largeQueue` 包含 2 个 300MB 文件 | 串行执行，不并发 |

### T4：大文件失败处理

| # | 场景 | 期望结果 |
|---|------|---------|
| T4-1 | 人为注入首次 `LO_TIMEOUT` | 第 1 次失败后立即 kill worker 并重建 |
| T4-2 | 第二次再次失败 | 该文件标记失败并继续下一个文件 |
| T4-3 | 批量中某大文件失败 | 之前已完成文件不回滚，结果文件仍保留 |

### T5：pageLimit

| # | 场景 | 期望结果 |
|---|------|---------|
| T5-1 | pageLimit=5，文件 3 页 | 跳过（页数不足），日志显示 skipped |
| T5-2 | pageLimit=5，文件 10 页 | 仅输出 5 张 PNG |
| T5-3 | pageLimit=null | 输出全部页 |

### T6：3x 分辨率

| # | 场景 | 期望结果 |
|---|------|---------|
| T6-1 | scale=3，正常 PPT | 目标短边 4800px，无崩溃 |
| T6-2 | scale=3，超大尺寸页面 | 60MP cap 生效，像素不超限 |

### T7：路径与文件名

| # | 场景 | 期望结果 |
|---|------|---------|
| T7-1 | 文件名含中文（非 ASCII） | `ensureSafeInputPath` copy 后转换成功 |
| T7-2 | 超长路径（>200 字符） | 安全路径处理后成功 |
| T7-3 | 同名文件平铺输出（`useSubfolder=false`） | 自动加序号，不覆盖 |
| T7-4 | `~$` 锁文件存在 | 跳过，不报错 |

### T8：LibreOffice 未安装/健康检查

| # | 场景 | 期望结果 |
|---|------|---------|
| T8-1 | LO 已安装，运行健康检查 | score=100，blockExport=false |
| T8-2 | LO 未安装 | score 低于阈值，blockExport=true，suggestions 含下载链接 |
| T8-3 | TEMP 不可写（模拟） | blockExport=true，错误详情定位到 `temp_dir_writable` |

### T9：低资源兼容性（Worker 池）

| # | 场景 | 期望结果 |
|---|------|---------|
| T9-1 | `freeMem < 8GB` 或 `cpu < 4` | 自动 `pool=off`，仍可完成导出 |
| T9-2 | `8GB <= freeMem < 16GB` | `poolSize=1`，无明显资源抖动 |
| T9-3 | `freeMem >= 16GB && cpu >= 8` | `poolSize=2`，吞吐提升且稳定 |
| T9-4 | 连续超时/崩溃注入 | 本批次自动回退 `pool=off` 并继续处理 |

### T10：端到端压力场景（上线门）

| # | 场景 | 期望结果 |
|---|------|---------|
| T10-1 | `1 x 300MB PPT + 19 x 小文件`，`pageLimit=3`，`scale=1` | 小文件先完成；大文件串行；结果正确 |
| T10-2 | `20 文件`，`scale=3` | 渲染并发受控，任务全程无崩溃 |
| T10-3 | 批量中随机 2 个大文件失败 | 失败文件被标记，其他文件正常完成 |

---

## 附录：不变的代码区域（不要碰）

| 函数/区域 | 文件:行号 | 说明 |
|----------|----------|------|
| `convertPdfBufferToImages` | main.js:3483-3580 | PDFium 渲染，完全不变 |
| `convertPdfFileToImages` | main.js:3582-3585 | 同上 |
| `getTargetShortSide` | main.js:3159-3165 | scale → 短边像素，不变 |
| `getMaxConcurrency` | main.js:3167-3174 | page/file 并发，不变 |
| `ensureSafeInputPath` | main.js:3144-3157 | 非 ASCII 路径处理，不变 |
| `createPptAdaptiveController` | main.js:3308-3410 | 自适应控制器函数体不变，仅改调用处变量名和 triggerStats key |
| `convert:documents` IPC 入参/出参 | main.js:4033/4953 | IPC 契约，不变 |
| renderer.js 前端交互逻辑 | renderer.js:1414-1511 | 扫描/导出触发，不变 |
| preload.js API 桥接 | preload.js:11-61 | IPC 桥接，基本不变 |
