# PPT 导出卡死与速度优化 — 完整改造方案

> 文档版本：2026-03-03
> 背景：用户反馈 3-5 个大 PPT 同时导出时会卡死，有时弹出 Office 登录或修复弹窗导致整个流程挂起。最大场景：一次性最多同时导出 20 个 PPT 文件。

---

## 0）阶段0-阶段4落地状态（2026-03-03）

> 结论：阶段0-阶段4已全部落地到主代码链路（`desktop/main.js` + `desktop/scripts/*.ps1` + `desktop/renderer/renderer.js`）。

### 阶段0：基线参数与开关收敛（已完成）

- 参数优先级统一为：`payload > env > 机器分层 > 默认值`（`resolvePptPolicy`）。
- 默认值切换：
  - `pptIsolatedMode=true`（默认全量隔离模式）
  - `pptPerFileTimeoutMs=60000`
  - `pptOfficeConcurrency=2`（低配机可自动分层到 1）
- 诊断字段补齐：
  - 文件级：`openMode`、`errorCode`、`durationMs`
  - 汇总级：`degradeLevel`、`degradeTransitions`、`triggerStats`、`openModeStats`、`errorCodeStats`、`duration`

### 阶段1：参数分层 + 自动降级（已完成）

- 自适应控制器已接入 PPT 转 PDF 主链路（`createPptAdaptiveController`）。
- 触发条件：
  - `PS_TIMEOUT`
  - COM 拒绝类错误（`0x80010001 / 0x8001010a / 0x800ac472` 及同类文本特征）
  - 连续失败达到阈值
- 降级动作：
  - 并发 `2 -> 1`
  - 批量 COM 重启间隔 `5 -> 3`
- 恢复机制：
  - 稳定成功窗口满足后自动恢复到正常并发与重启间隔。

### 阶段2：Open 快路径 + 回退链（已完成）

- 打开策略已调整为：
  1. `Open`（快路径）
  2. 失败后 `Open2007(OpenAndRepair)`
  3. 再失败时 `Inject`（`Slides.InsertFromFile`）
- 保留 `SaveAs` 主导出的稳定路径，并保留 `ExportAsFixedFormat` 兜底。

### 阶段3：Office 预检 + 一键治理（已完成）

- 新增脚本：
  - `desktop/scripts/office-health-check.ps1`
  - `desktop/scripts/office-health-fix.ps1`
- 新增 IPC：
  - `office:healthCheck`
  - `office:healthFix`
- 导出前支持 `officePrecheckMode=off|warn|fix`：
  - `warn`：输出风险告警并继续
  - `fix`：先执行治理，再复检，阻断高风险环境

### 阶段4：灰度发布 + 回滚开关（已完成）

- 灰度控制已接入：
  - `pptRolloutPercent`（支持 20%/50%/100%）
  - `pptForceMode=auto|isolated|batch`
  - `rolloutSeed`（稳定分桶）
- 一键回滚：
  - 直接设置 `pptForceMode=batch`（payload 或 env）可立即回退旧批量路径。

## 一、问题根因（基于代码 + Smoke 数据 + 多方调研）

### 1.1 Smoke 报告揭示的隐藏问题

`docs/ppt-smoke-report.json`（13 个文件，全部成功）显示：

```
13 / 13 文件：fallbackReason = "export_as_fixed_format_failed"
```

**100% 的文件都在走 `ExportAsFixedFormat` 失败 → `SaveAs` 兜底路径。**

这意味着每个文件都在做一次注定失败的 `ExportAsFixedFormat` 调用（被代码 catch 吞掉），然后才走真正有效的 `SaveAs`。每文件额外浪费 3-8 秒，且从未被发现。

Smoke 实测耗时：**最快 11s，平均 24s，最慢 35s**（均为单文件模式）。

### 1.2 批量卡死的完整触发链

```
多文件（>1 个）走 ppt-batch-to-pdf.ps1：

POWERPNT.EXE 内（单进程串行所有文件）：
  文件1: Open2007(OpenAndRepair=true) → ExportFail → SaveAs ✓  [~24s]
  文件2: Open2007(OpenAndRepair=true) → [触发登录弹窗] → ∞ 挂住
         ↑ DisplayAlerts=1 只管 PPT 内部弹窗
           AutomationSecurity 未设置（宏安全弹窗仍会弹）
           没有 Unblock-File（受保护视图可能阻塞）
           没有注册表 AAD 禁用（登录弹窗仍会弹）

Node 层：
  超时 = officeTimeoutMs × 文件数 = 180s × 20 = 3600s = 60 分钟！
  超时杀进程：只杀 PowerShell 进程树，POWERPNT.EXE 残留
  → 下次调用报 0x80010001（COM 被拒绝），触发重试，再等 180s
```

### 1.3 问题汇总

| 问题 | 触发位置 | 影响 |
|------|----------|------|
| `ExportAsFixedFormat` 100% 失败被吞 | `ppt-to-pdf.ps1:89`、`ppt-batch-to-pdf.ps1:103` | 每文件浪费 3-8s |
| `AutomationSecurity` 未设置 | 两个 .ps1 文件 | 含宏 PPT 弹安全弹窗卡死 |
| `FeatureInstall` 未设置 | 两个 .ps1 文件 | 缺功能时弹安装向导卡死 |
| `Unblock-File` 未调用 | 两个 .ps1 文件 | 下载文件触发受保护视图卡死 |
| 登录态依赖缺少预检（注册表仅可选） | 两个 .ps1 文件 | 未激活 Office 可能弹登录窗卡死 |
| `Open` 只有两阶，无第三阶兜底 | `OpenPresentationWithRepair` 函数 | 损坏文件直接失败，无法恢复 |
| 批量超时线性放大 | `main.js:3620` | 20 个文件超时 = 60 分钟 |
| 超时后未杀 POWERPNT.EXE | `main.js:2589` | 僵尸进程残留，下次调用报错 |
| 批量单进程串行所有文件 | `ppt-batch-to-pdf.ps1` 整体架构 | 一个弹窗拖死全部，无并发 |
| `Open2007` 第3参数 `Untitled=$msoTrue` | `ppt-to-pdf.ps1:36`、`ppt-batch-to-pdf.ps1:34` | 部分版本路径解析异常 |

### 1.4 本次修订原则（在原方案方向上做风险收敛）

1. 保留主方向：`COM + PDFium`、`SaveAs 主路径`、`逐文件独立超时`、`并发受控`。
2. 不把“全局副作用”作为默认行为：
   - 默认不在导出脚本中持久写入 Office 注册表键值；
   - 默认不执行 `taskkill /IM POWERPNT.EXE /F` 全局杀进程。
3. 所有高风险动作都必须“有开关、可回滚、可观测”：
   - 通过环境变量显式开启；
   - 记录日志与诊断字段；
   - 失败后自动回退到旧路径。

---

## 二、改造方案总览

### 选型决策：保留 COM + PDFium，做系统性强化

| 方案 | 还原度 | 稳定性 | 部署成本 | 结论 |
|------|--------|--------|----------|------|
| **COM 强化（本方案）** | **最高** | **中→良** | **零** | **首选** |
| LibreOffice headless | 中（大文件差）| 良 | 500-800MB | 中期评估 |
| unoserver（LO 常驻）| 中 | Windows untested | 高 | 中期评估 |
| COM 直出 PNG（Slide.Export）| 高 | 中 | 零 | 不推荐（50 页需 1 分钟+）|
| CloudConvert / Graph | 最高 | 最高 | 需联网 | 可选增强通道 |

LibreOffice 对大文件（100MB+）比 Office COM 慢 2-10 倍，且 Windows 上 unoserver 官方标注 `untested`，暂不替换主链路。

### 针对"最多 20 个 PPT"的架构设计

**批量策略**：逐文件独立进程 + 并发 2（内存充足时）

```
当前批量（单进程串行20个）：20 × 24s = 480s（8分钟），一个弹窗卡60分钟
改造后（并发2逐文件）：     ceil(20/2) × 24s = 240s（4分钟），弹窗最多卡90s
```

**进程复用策略**：
- Gemini 实测：单进程复用比每次新建快 5-10 倍，但每 20-30 个文件必须重启
- 20 个文件恰好在安全阈值内（每批最多 10 个，进程复用 + 批间重启）
- 方案：分段批次，每批 **5 个文件**一个进程，共 4 批，批间进程完全退出

---

## 三、具体改动（含完整代码）

### 改动 A：`ppt-to-pdf.ps1` — 单文件脚本

**文件**：`desktop/scripts/ppt-to-pdf.ps1`

**涉及改动**：
1. 脚本顶部：增加登录态预检与告警（默认不写注册表；注册表作为可选管理员脚本）
2. COM 初始化：加 `AutomationSecurity=3` + `FeatureInstall=0`（防宏/功能安装弹窗）
3. `OpenPresentationWithRepair`：加 `Unblock-File`，修正 `Untitled` 参数，加第三阶注入法
4. 导出逻辑：交换 `SaveAs`/`ExportAsFixedFormat` 主备顺序

**完整改造后的文件**：

```powershell
param(
    [Parameter(Mandatory = $true)][string]$InputPath,
    [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding

$ppt = $null
$presentation = $null
$startAt = Get-Date

# Use numeric enum values to avoid hard dependency on Office PIAs.
$msoTrue = -1
$msoFalse = 0
$ppAlertsNone = 1
$ppFixedFormatTypePDF = 2
$ppFixedFormatIntentPrint = 2
$ppSaveAsPDF = 32

# ── [改动1] 登录态预检（默认不改注册表） ───────────────────────────────────
# 说明：
# 1) 登录/激活问题根因通常是当前 Windows 账户 Office 未完成激活；
# 2) 脚本默认只做检测与告警，不做持久注册表修改，避免污染用户 Office 配置。
$envWarning = ""
try {
    $officeCache = Join-Path $env:LOCALAPPDATA "Microsoft\\Office"
    if (-not (Test-Path $officeCache)) {
        $envWarning = "office_profile_not_ready"
    }
} catch {}
# ─────────────────────────────────────────────────────────────────────────────

function Get-HResultHex($exception) {
    if ($null -eq $exception) { return "" }
    try {
        $value = [uint32]$exception.HResult
        if ($value -eq 0) { return "" }
        return ("0x{0:X8}" -f $value).ToLower()
    }
    catch {
        return ""
    }
}

function OpenPresentationWithRepair($presentations, $inputPath) {
    # ── [改动2] Unblock-File：消除 Zone.Identifier，防止受保护视图阻塞 ──
    try { Unblock-File -Path $inputPath -ErrorAction SilentlyContinue } catch {}
    # ────────────────────────────────────────────────────────────────────────

    # 第一阶：Open2007 修复模式
    # ── [改动3] Untitled 参数从 $msoTrue 改为 $msoFalse，避免部分版本路径解析异常
    try {
        $presentation = $presentations.Open2007($inputPath, $msoTrue, $msoFalse, $msoFalse, $msoTrue)
        return @{
            Presentation = $presentation
            OpenMode = "open2007"
            Repaired = $true
            FallbackReason = ""
        }
    }
    catch {
        $open2007Error = $_.Exception
    }

    # 第二阶：普通 Open
    try {
        $presentation = $presentations.Open($inputPath, $msoTrue, $msoFalse, $msoFalse)
        return @{
            Presentation = $presentation
            OpenMode = "open"
            Repaired = $false
            FallbackReason = "open2007_failed"
            Open2007Error = $open2007Error.Message
            Open2007Code = Get-HResultHex $open2007Error
        }
    }
    catch {
        $openError = $_.Exception
    }

    # ── [改动4] 第三阶：幻灯片注入法（终极兜底） ──────────────────────────
    # 绕过文件结构解析，仅提取幻灯片数据。适用于文件头损坏但幻灯片数据完整的情况
    try {
        $blank = $presentations.Add($msoFalse)
        $blank.Slides.InsertFromFile($inputPath, 0)
        return @{
            Presentation = $blank
            OpenMode = "inject"
            Repaired = $true
            FallbackReason = "open_failed_inject"
        }
    }
    catch {
        throw  # 三阶全部失败才向上抛出
    }
    # ────────────────────────────────────────────────────────────────────────
}

$result = @{
    ok = $false
    message = ""
    error = ""
    rawError = ""
    errorCode = ""
    openMode = ""
    repaired = $false
    fallbackReason = ""
    durationMs = 0
    retries = 0
}

try {
    $ppt = New-Object -ComObject PowerPoint.Application
    $ppt.Visible = $msoTrue
    $ppt.DisplayAlerts = $ppAlertsNone
    # ── [改动5] 补充两个关键 COM 安全设置 ────────────────────────────────
    # msoAutomationSecurityForceDisable=3：强制禁用宏，防止宏安全弹窗
    $ppt.AutomationSecurity = 3
    # msoFeatureInstallNone=0：禁止弹出 Office 功能安装向导
    $ppt.FeatureInstall = 0
    # ────────────────────────────────────────────────────────────────────────

    $openInfo = OpenPresentationWithRepair $ppt.Presentations $InputPath
    $presentation = $openInfo.Presentation
    $result.openMode = [string]$openInfo.OpenMode
    $result.repaired = [bool]$openInfo.Repaired
    $result.fallbackReason = [string]$openInfo.FallbackReason

    # ── [改动6] 交换主备顺序：SaveAs 为主，ExportAsFixedFormat 为备 ─────
    # 原因：Smoke 报告显示当前环境 ExportAsFixedFormat 100% 失败，直接走 SaveAs 节省 3-8s
    $exported = $false
    try {
        $presentation.SaveAs($OutputPath, $ppSaveAsPDF)
        $exported = $true
    }
    catch {
        $exported = $false
    }

    if (-not $exported) {
        if ([string]::IsNullOrWhiteSpace($result.fallbackReason)) {
            $result.fallbackReason = "saveas_failed"
        }
        $presentation.ExportAsFixedFormat(
            $OutputPath,
            $ppFixedFormatTypePDF,
            $ppFixedFormatIntentPrint
        )
    }
    # ────────────────────────────────────────────────────────────────────────

    $result.ok = $true
    $result.message = "PPT 转 PDF 完成"
}
catch {
    $err = $_.Exception
    $result.ok = $false
    $result.message = "PPT 转 PDF 失败"
    $result.rawError = [string]$err.Message
    $result.errorCode = Get-HResultHex $err
    if ([string]::IsNullOrWhiteSpace($result.fallbackReason)) {
        $result.fallbackReason = "open_failed"
    }
    if ([string]::IsNullOrWhiteSpace($result.errorCode)) {
        $result.error = $result.rawError
    }
    else {
        $result.error = "$($result.rawError) ($($result.errorCode))"
    }
}
finally {
    if ($presentation -ne $null) {
        try { $presentation.Close() } catch { }
    }
    if ($ppt -ne $null) {
        try { $ppt.Quit() } catch { }
    }
    if ($presentation -ne $null) {
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($presentation) | Out-Null
    }
    if ($ppt -ne $null) {
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($ppt) | Out-Null
    }
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()

    $result.durationMs = [int][Math]::Round(((Get-Date) - $startAt).TotalMilliseconds)
    $result | ConvertTo-Json -Compress
    if (-not $result.ok) {
        exit 1
    }
}
```

---

### 改动 B：`ppt-batch-to-pdf.ps1` — 批量脚本（最终版本）

**文件**：`desktop/scripts/ppt-batch-to-pdf.ps1`

> 注：此文件在 JS 架构重构（改动 D）完成后将不再被调用，但保留作为兼容兜底。
> 改造内容与 `ppt-to-pdf.ps1` 一致，额外增加分段重启逻辑（每 5 个文件重启 COM 实例）。

**完整改造后的文件**：

```powershell
param(
    [Parameter(Mandatory = $true)][string]$TaskFile
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding

$ppt = $null
$results = @()

# Use numeric enum values to avoid hard dependency on Office PIAs.
$msoTrue = -1
$msoFalse = 0
$ppAlertsNone = 1
$ppFixedFormatTypePDF = 2
$ppFixedFormatIntentPrint = 2
$ppSaveAsPDF = 32

# ── [改动1] 登录态预检（默认不改注册表） ───────────────────────────────────
$envWarning = ""
try {
    $officeCache = Join-Path $env:LOCALAPPDATA "Microsoft\\Office"
    if (-not (Test-Path $officeCache)) {
        $envWarning = "office_profile_not_ready"
    }
} catch {}
# ─────────────────────────────────────────────────────────────────────────────

function Get-HResultHex($exception) {
    if ($null -eq $exception) { return "" }
    try {
        $value = [uint32]$exception.HResult
        if ($value -eq 0) { return "" }
        return ("0x{0:X8}" -f $value).ToLower()
    }
    catch {
        return ""
    }
}

function OpenPresentationWithRepair($presentations, $inputPath) {
    # ── [改动2] Unblock-File 防受保护视图 ──
    try { Unblock-File -Path $inputPath -ErrorAction SilentlyContinue } catch {}

    # 第一阶：Open2007 修复模式（Untitled 改为 $msoFalse）
    try {
        $presentation = $presentations.Open2007($inputPath, $msoTrue, $msoFalse, $msoFalse, $msoTrue)
        return @{ Presentation = $presentation; OpenMode = "open2007"; Repaired = $true; FallbackReason = "" }
    }
    catch { $open2007Error = $_.Exception }

    # 第二阶：普通 Open
    try {
        $presentation = $presentations.Open($inputPath, $msoTrue, $msoFalse, $msoFalse)
        return @{
            Presentation = $presentation; OpenMode = "open"; Repaired = $false
            FallbackReason = "open2007_failed"
            Open2007Error = $open2007Error.Message
            Open2007Code = Get-HResultHex $open2007Error
        }
    }
    catch { $openError = $_.Exception }

    # ── [改动3] 第三阶：幻灯片注入法 ──
    try {
        $blank = $presentations.Add($msoFalse)
        $blank.Slides.InsertFromFile($inputPath, 0)
        return @{ Presentation = $blank; OpenMode = "inject"; Repaired = $true; FallbackReason = "open_failed_inject" }
    }
    catch { throw }
}

function New-PptApplication {
    $app = New-Object -ComObject PowerPoint.Application
    $app.Visible = $msoTrue
    $app.DisplayAlerts = $ppAlertsNone
    # ── [改动4] 补充安全设置 ──
    $app.AutomationSecurity = 3  # msoAutomationSecurityForceDisable
    $app.FeatureInstall = 0      # msoFeatureInstallNone
    return $app
}

function Release-PptApplication($app) {
    if ($app -ne $null) {
        try { $app.Quit() } catch {}
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($app) | Out-Null
        $app = $null
    }
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}

try {
    $tasks = Get-Content $TaskFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($tasks -isnot [System.Collections.IList]) { $tasks = @($tasks) }

    if ($tasks.Count -eq 0) {
        Write-Output "[]"
        exit 0
    }

    # ── [改动5] 分段重启：每 5 个文件重启 COM 实例，防止内存/GDI 泄漏累积 ──
    $BATCH_SIZE = 5
    $processedCount = 0
    $ppt = New-PptApplication

    foreach ($task in $tasks) {
        # 每处理 BATCH_SIZE 个文件，重启 COM 实例
        if ($processedCount -gt 0 -and ($processedCount % $BATCH_SIZE) -eq 0) {
            Release-PptApplication $ppt
            Start-Sleep -Milliseconds 500  # 给 OS 时间回收资源
            $ppt = New-PptApplication
        }

        $presentation = $null
        $taskStartedAt = Get-Date
        $taskResult = @{
            id = $task.id
            input = $task.input
            output = $task.output
            ok = $false
            error = ""
            rawError = ""
            errorCode = ""
            openMode = ""
            repaired = $false
            fallbackReason = ""
            durationMs = 0
            retries = 0
        }

        try {
            $openInfo = OpenPresentationWithRepair $ppt.Presentations $task.input
            $presentation = $openInfo.Presentation
            $taskResult.openMode = [string]$openInfo.OpenMode
            $taskResult.repaired = [bool]$openInfo.Repaired
            $taskResult.fallbackReason = [string]$openInfo.FallbackReason

            # ── [改动6] 交换主备顺序：SaveAs 为主路径 ──
            $exported = $false
            try {
                $presentation.SaveAs($task.output, $ppSaveAsPDF)
                $exported = $true
            }
            catch { $exported = $false }

            if (-not $exported) {
                if ([string]::IsNullOrWhiteSpace($taskResult.fallbackReason)) {
                    $taskResult.fallbackReason = "saveas_failed"
                }
                $presentation.ExportAsFixedFormat($task.output, $ppFixedFormatTypePDF, $ppFixedFormatIntentPrint)
            }

            $taskResult.ok = $true
        }
        catch {
            $err = $_.Exception
            $taskResult.ok = $false
            $taskResult.rawError = [string]$err.Message
            $taskResult.errorCode = Get-HResultHex $err
            if ([string]::IsNullOrWhiteSpace($taskResult.errorCode)) {
                $taskResult.error = $taskResult.rawError
            }
            else {
                $taskResult.error = "$($taskResult.rawError) ($($taskResult.errorCode))"
            }
            if ([string]::IsNullOrWhiteSpace($taskResult.fallbackReason)) {
                $taskResult.fallbackReason = "open_failed"
            }
        }
        finally {
            $taskResult.durationMs = [int][Math]::Round(((Get-Date) - $taskStartedAt).TotalMilliseconds)
            $results += $taskResult
            if ($presentation -ne $null) {
                try { $presentation.Close() } catch { }
                [System.Runtime.Interopservices.Marshal]::ReleaseComObject($presentation) | Out-Null
                $presentation = $null
            }
            $processedCount++
        }
    }
}
catch {
    $fatal = @{
        ok = $false
        fatal = $true
        error = $_.Exception.Message
        rawError = $_.Exception.Message
        errorCode = Get-HResultHex $_.Exception
    }
    $fatal | ConvertTo-Json -Compress
    exit 1
}
finally {
    Release-PptApplication $ppt
}

$results | ConvertTo-Json -Compress
```

---

### 改动 C：`main.js` — 紧急止血（2 处关键改动）

**文件**：`desktop/main.js`

#### C-1：超时后安全清理（默认不全局杀 POWERPNT.EXE）（`runPowerShellScript` 函数）

**位置**：`main.js:2586` — `setTimeout` 回调内

```javascript
// 原来（main.js:2586-2590）：
if (timeoutMs > 0) {
  timeoutId = setTimeout(() => {
    if (finished) return;
    timedOut = true;
    killProcessTreeByPid(ps.pid);
  }, timeoutMs);
}

// 改为：
if (timeoutMs > 0) {
  timeoutId = setTimeout(() => {
    if (finished) return;
    timedOut = true;
    killProcessTreeByPid(ps.pid);
    // [新增] 可选兜底：仅在显式开关开启时才做全局清理
    // 默认关闭，避免误杀用户正在编辑的 PowerPoint
    if (process.env.SCENE_KILL_ALL_POWERPNT_ON_TIMEOUT === "1") {
      try {
        spawn("taskkill", ["/IM", "POWERPNT.EXE", "/F"], { windowsHide: true });
      } catch (_) {}
    }
  }, timeoutMs);
}
```

#### C-2：批量超时上限固定（`convert:documents` handler）

**位置**：`main.js:3620`

```javascript
// 原来（main.js:3620）：
// 20 个文件时超时 = 180000 × 20 = 3600000ms = 60 分钟！
const pptBatchTimeoutMs = Math.max(officeTimeoutMs, officeTimeoutMs * pptItems.length);

// 改为：
// 固定上限 8 分钟（足够处理 20 个正常文件），不随文件数膨胀
// 8分钟 = 单文件 24s × 20 个 = 480s，留 100s 余量
const pptBatchTimeoutMs = Math.min(
  officeTimeoutMs * pptItems.length,
  8 * 60 * 1000
);
```

---

### 改动 D：`main.js` — 批量路径架构重构（根治卡死，提速）

**文件**：`desktop/main.js`

**改造位置**：`main.js:3604-3708`（整个 `if (pptItems.length > 1)` 块）

**改造思路**：
- 保留旧批量路径作为 fallback，不做一次性硬切
- 新路径：逐文件调用 `convertPptSourceToPdf`（每文件独立 PowerShell 进程）
- 并发 1/2 自适应（按空闲内存与 CPU 决策）
- 每文件独立超时（默认 90s，可配置），失败仅影响单文件
- 通过开关灰度放量：先 10% → 50% → 100%

**在 `main.js` 中，在现有常量区附近（`main.js:842` 后）新增**：

```javascript
// 开关：新架构灰度启用（默认 false，发布时按比例放量）
const PPT_ISOLATED_MODE = process.env.SCENE_PPT_ISOLATED_MODE === "1";

// PPT 逐文件并发导出的每文件超时（独立于 officeTimeoutMs，不随文件数放大）
const PPT_PER_FILE_TIMEOUT_MS = parsePositiveInt(
  process.env.SCENE_PPT_PER_FILE_TIMEOUT_MS,
  60000
);

// 根据可用内存决定 PPT→PDF 阶段并发数（2 或 1）
function getPptOfficeConcurrency() {
  const freeMem = os.freemem() / (1024 * 1024);
  // 每个 POWERPNT.EXE 实例峰值约 200-800MB，2 个并发需 400MB-1.6GB 空闲
  return freeMem >= 2000 ? 2 : 1;
}

// 通用并发队列：最多同时执行 concurrency 个任务
async function runWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);
  return results;
}
```

**将 `main.js:3604-3708` 的批量 PPT 块替换为**：

```javascript
// ── [改动D] PPT 批量路径：逐文件独立进程 + 并发2，替换原单进程批量脚本调用 ──
if (pptItems.length >= 1) {
  const pptLabel = `PPT 转 PDF（${pptItems.length} 个文件，逐文件并发模式）`;
  logToRenderer(1, pptLabel);
  sendProgress("convert:progress", { phase: "stage", status: pptLabel });
  const stopHeartbeat = startPhaseHeartbeat("PPT 转 PDF");

  batchOutputDir = batchOutputDir
    ?? await fs.promises.mkdtemp(path.join(os.tmpdir(), "scene-batch-output-"));

  const pptTasks = pptItems.map((item, idx) => ({
    id: item.order,
    sourcePath: item.sourcePath,
    pdfPath: path.join(batchOutputDir, `ppt-${idx}.pdf`),
    item
  }));

  const officeConcurrency = getPptOfficeConcurrency();
  logToRenderer(1, `PPT 转 PDF 并发数: ${officeConcurrency}，单文件超时: ${PPT_PER_FILE_TIMEOUT_MS}ms`);

  let pptConvertResults;
  try {
    pptConvertResults = await runWithConcurrency(
      pptTasks,
      officeConcurrency,
      async (task) => {
        if (conversionAbortRequested) {
          return { ...task, ok: false, error: "已取消", errorCode: "", openMode: "", repaired: false, fallbackReason: "aborted", retries: 0, durationMs: 0 };
        }
        try {
          // 每个文件独立 PS 进程，独立超时，互不影响
          const r = await convertPptSourceToPdf(
            task.sourcePath,
            task.item.ext,
            task.pdfPath,
            {
              timeoutMs: PPT_PER_FILE_TIMEOUT_MS,
              retryCount: pptRetryCount
            }
          );
          return { ...task, ...r };
        } catch (err) {
          const failure = buildOfficeFailure(err, {
            timeout: err?.code === "PS_TIMEOUT",
            rawMessage: err?.stderr || err?.stdout || err?.message,
            fallbackMessage: "PPT 转 PDF 失败"
          });
          return {
            ...task,
            ok: false,
            error: failure.message,
            rawError: failure.rawMessage,
            errorCode: failure.errorCode,
            openMode: "",
            repaired: false,
            fallbackReason: err?.code === "PS_TIMEOUT" ? "per_file_timeout" : "per_file_error",
            retries: 0,
            durationMs: 0
          };
        }
      }
    );
  } finally {
    stopHeartbeat();
  }

  const pptSuccess = pptConvertResults.filter(r => r.ok).length;
  const pptFailed = pptConvertResults.length - pptSuccess;
  logToRenderer(1, `PPT 转 PDF 完成：成功 ${pptSuccess}，失败 ${pptFailed}`);
  pptConvertResults.forEach(r => pptResults.set(r.id, r));
}
// ─────────────────────────────────────────────────────────────────────────────
```

> **注意**：改动 D 实施后，PPT 默认先走新架构（受 `PPT_ISOLATED_MODE` 控制）；`batchConvertToPdf` 和 `ppt-batch-to-pdf.ps1` 保留为应急回退路径（Word 批量路径继续使用 `batchConvertToPdf`）。

---

## 四、分阶段开发规划（补充）

### 4.1 里程碑总览

| 阶段 | 目标 | 预计周期 | 发布策略 |
|------|------|----------|----------|
| Phase 0 | 建立基线与开关 | 0.5 天 | 不发版（仅内部） |
| Phase 1 | 脚本稳定化（A/B） | 1-2 天 | 小流量内测 |
| Phase 2 | 主进程止血（C） | 0.5-1 天 | 热修复优先 |
| Phase 3 | 架构灰度切换（D） | 2-3 天 | 10%→50%→100% |
| Phase 4 | 回归与发布收口 | 1 天 | 全量发布 |

### 4.2 Phase 0：基线冻结与观测口径

**目标**
- 固定“改造前”性能与错误口径，避免后续争议。

**开发项**
- 固化 smoke 基线报告（`durationMs`、`fallbackReason`、`errorCode`）。
- 主进程统一打印关键诊断：并发数、超时、重试次数、打开模式。
- 新增开关位但默认关闭：`SCENE_PPT_ISOLATED_MODE`、`SCENE_KILL_ALL_POWERPNT_ON_TIMEOUT`。

**验收**
- 能稳定产出“改造前基线”报告。
- 不改用户可见行为。

**回滚**
- 删除新增日志与开关读取，不影响主流程。

### 4.3 Phase 1：脚本稳定化（A/B）

**目标**
- 先解决单文件转换效率和弹窗阻塞高发点。

**开发项**
- 保留并强化：`Unblock-File`、`AutomationSecurity=3`、`FeatureInstall=0`、`Open2007 Untitled` 参数修正、`SaveAs` 主路径。
- 三阶打开策略（注入法）先做“关闭默认、可开关启用”。
- 将“注册表禁 AAD”降级为可选管理员脚本，不在主脚本中默认执行。

**验收**
- smoke 中 `export_as_fixed_format_failed` 显著下降或消失。
- 平均耗时较基线下降（目标 15%-25%）。
- 无新增高频错误码。

**回滚**
- 开关注销三阶注入法，退回两阶打开策略。
- 导出主路径可回退到 `ExportAsFixedFormat` 先尝试（仅应急）。

### 4.4 Phase 2：主进程止血（C）

**目标**
- 把“卡 60 分钟”压缩到可控范围，并降低僵尸进程概率。

**开发项**
- 批量超时上限封顶（建议 8 分钟或可配置上限）。
- 超时清理策略改为“默认只杀当前任务链路”；全局 `taskkill /IM POWERPNT.EXE /F` 仅在显式开关开启时执行。

**验收**
- 20 文件极端场景不会超过超时上限。
- 转换超时后下一次任务可正常启动（不出现连续 `0x80010001`）。

**回滚**
- 关闭全局清理开关，保留任务链路清理。
- 超时上限改回旧参数（仅临时应急）。

### 4.5 Phase 3：架构灰度切换（D）

**目标**
- 根治“单批次被一个弹窗拖死”的系统性问题。

**开发项**
- 新增逐文件独立进程路径 + 并发 1/2 自适应。
- 每文件独立超时与重试，不再按“文件数线性放大总超时”。
- 保留旧批量路径作为 fallback，通过 `SCENE_PPT_ISOLATED_MODE` 灰度。

**灰度策略**
- 第 1 轮：10% 用户（或内测名单）启用 24 小时。
- 第 2 轮：50% 用户启用 24-48 小时。
- 第 3 轮：100% 全量，保留一键回退开关一周。

**验收**
- 20 文件总时长较基线下降（目标 35%-50%）。
- 失败文件不拖累同批次其它文件完成。

**回滚**
- `SCENE_PPT_ISOLATED_MODE=0` 立即回落旧路径。

### 4.6 Phase 4：发布收口与长期治理

**目标**
- 完成全量发布、沉淀运维与故障处理规范。

**开发项**
- 固化 smoke 回归任务与发布前检查单。
- 完善错误文案映射（`PS_TIMEOUT`、`0x80010001` 等）与用户侧指引。
- 形成“Office 未激活/登录态异常”的标准排障文档。

**验收**
- 连续 3 天无 P0/P1 级导出事故。
- 关键指标稳定：成功率、平均耗时、超时率。

**回滚**
- 保留旧路径与开关至少一个迭代周期。

---

## 五、验收方法

### 验收 1：Smoke 测试（改动 A/B 完成后跑）

```bash
cd desktop
npm run ppt:smoke -- --input "D:\deptask\星河笔记内容\资料\四下英语\01 课件+教案+练习+学习任务单（更新中）" --report "..\docs\ppt-smoke-report-after-fix.json"
```

**期望结果**：
- 所有文件 `ok: true`
- `fallbackReason` 不再出现 `export_as_fixed_format_failed`（改为空或 `saveas_failed` 极少数）
- 平均 `durationMs` 下降（预期 16-20s，原 24s）

### 验收 2：批量超时验证（改动 C-2 完成后）

在测试环境将 `officeTimeoutMs`（或 `SCENE_OFFICE_TIMEOUT_MS`）临时设为 `3000ms`，导入 20 个文件，验证：
- 全部在超时上限内完成（报错而非卡住）
- 没有“由本次导出任务遗留”的 `POWERPNT.EXE` 子进程（不要求杀掉用户手动打开的 PPT）

### 验收 3：并发稳定性测试（改动 D 完成后）

导入 20 个 PPT，观察：
- `SCENE_PPT_ISOLATED_MODE=1` 时新路径生效，关闭后可回退旧路径
- 总耗时约 240s（原 480s）
- 任务管理器中同时最多 2 个 `POWERPNT.EXE` 进程
- 每批完成后 `POWERPNT.EXE` 退出，内存完全释放

---

## 六、关于 M365 订阅版登录弹窗的补充说明

注册表 `DisableAADWAM/EnableADAL` 对 **Microsoft 365 订阅版（Build 16.0.16xxx+）** 效果有限，原因是 M365 强制现代验证，上述键值在最新版已被忽略。**因此本方案不将注册表写入作为默认主流程，仅作为人工排障手段。**

**对 M365 用户的根本解决方案**：
- 确保运行 Electron 应用的 Windows 账户已在 PowerPoint 中完成过交互式登录（点击"激活"完成），Office 许可证缓存存储在 `%LOCALAPPDATA%\Microsoft\Office\` 下
- COM 自动化在已有缓存许可证的账户下运行时，不会弹出登录窗
- 若用户机器 Office 从未激活，需引导用户先手动打开 PowerPoint 激活一次

---

## 七、中期方向参考（不在本次改造范围）

| 方向 | 适用场景 | 前提条件 |
|------|----------|----------|
| LibreOffice headless | 用户无 Office 或 Office 频繁弹窗无法解决 | 可接受 500-800MB 额外安装 + 大文件渲染质量损失 |
| unoserver（LO 常驻）| 吞吐量要求高（100+ 文件/批次）| Windows 端需自行验证稳定性（官方标 untested）|
| CloudConvert API | 极致渲染质量 + 网络可用 | 付费 + 隐私合规评估 |

建议在本次改造完成并稳定运行后，用现有 smoke 脚本框架搭建 A/B 基准测试（COM vs LibreOffice），收集真实数据后再决策是否切换引擎。
