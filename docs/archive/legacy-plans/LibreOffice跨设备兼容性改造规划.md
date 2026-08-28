# LibreOffice 跨设备兼容性改造规划

> 版本：v1.1
> 日期：2026-03-15
> 适用范围：`desktop/`（Windows x64，Full 包）
> 目标：Full 包在 Win10 LTSC/企业版/精简版等苛刻环境下开箱可用

---

## 一、问题定位（事实基础）

### 1.1 报错现象

```
candidate_unusable:embedded:exit_3221225781:soffice.com
runtime.source=missing
score=60/100  block=true
```

**`0xC0000135` = `STATUS_DLL_NOT_FOUND`**——进程在启动阶段即崩溃，缺少依赖 DLL。

发生环境：Windows 10 企业版 LTSC 1809（截图中明确为 Build 17763，安装于 2025/12/28）。

---

### 1.2 关键代码事实（已逐行验证）

#### 事实 1：探测只跑 soffice.com，不回退 soffice.exe

`desktop/main.js:3194–3196`：

```js
const sofficeComPath = path.join(programDir, "soffice.com");
const probeBinaryPath = fs.existsSync(sofficeComPath) ? sofficeComPath : sofficePath;
```

`soffice.com` 存在时**直接用它探测，不再尝试 `soffice.exe`**。
`soffice.com` 是 Windows console wrapper，它自身的 DLL 依赖表与 `soffice.exe` **可以不同**。
若 `soffice.com` 崩溃（exit_3221225781），当前代码**不会回退 `soffice.exe`** 再试，直接将候选标记为 `candidate_unusable`。

`desktop/scripts/check-lo-runtime.js:81–82` 同逻辑，构建阶段也只跑 `soffice.com`（若存在）。

#### 事实 2：VC++ DLL 已内置，但从未被注入到进程 PATH

`desktop/vendor/libreoffice/System64/` 已包含（实际目录中验证）：

```
concrt140.dll  msvcp140.dll  msvcp140_1.dll  msvcp140_2.dll
msvcp140_atomic_wait.dll  msvcp140_codecvt_ids.dll
vccorlib140.dll  vcruntime140.dll  vcruntime140_1.dll  vcruntime140_threads.dll
```

**但 `mergeSpawnEnv()`（main.js:997）只继承 `process.env`，没有将 `System64/` 追加到 `PATH`**。

Windows DLL 搜索顺序：exe 所在目录 → KnownDLLs → System32 → PATH 中各目录……
`vendor/libreoffice/System64/` **不在任何默认搜索路径**上，也没有被 `spawnSync` 的 `env.PATH` 引入。
结果：这些内置 DLL **从未被 LibreOffice 进程加载过**，形同虚设。

#### 事实 3：NSIS 安装时没有处理 VC++ 依赖

`package.json` 的 `build.nsis` 当前只有：

```json
"nsis": {
  "oneClick": false,
  "perMachine": false,
  "allowToChangeInstallationDirectory": true
}
```

**没有 `include`（自定义安装脚本）**，也**没有 `requestExecutionLevel` 显式声明**。
安装过程不安装任何系统依赖，且提权级别依赖 electron-builder 默认行为（非显式保证）。

#### 事实 4：构建脚本在开发机成功 ≠ 用户机可用

`check-lo-runtime.js` 在开发/打包机上跑探测成功（开发机有 VC++），所以构建不报错。
用户机没有 VC++，运行时才崩溃——构建期检测无法发现这个问题。

#### 事实 5：suggestions 是 const 数组，不能整组重赋值

`main.js:3525`：`const suggestions = [];`

M4 中任何修改 suggestions 的逻辑**只能用 `unshift/push/splice`**，不能写 `suggestions = [...]`。

#### 事实 6：libreoffice-health-check.ps1 当前无 BOM，纯 ASCII

实际检测：文件首字节为 `70 61 72 61 6d 28 29 0a`（`param()\n`），**无 BOM，ASCII 编码**。
M5 新增中文字符串后，必须显式处理编码，否则 PowerShell 解析 JSON 时可能出现乱码。

#### 事实 7：vendor/redist 和 build/ 目录均不存在

`desktop/vendor/` 下只有 `libreoffice/`，**无 `redist/`**。
`desktop/build/` **不存在**。
M3 落地前必须先创建这两个目录并提交，否则 `npm run dist:full` 会因 `extraResources` 路径不存在而报错。

---

### 1.3 其他 AI 分析的误差

| 分析来源 | 结论 | 实际情况 |
|---------|------|---------|
| Codex / Gemini | "DLL 需要从外部安装 VC++" | 不完全准确：DLL 已内置在 `System64/`，真正缺的是进程启动时的 PATH 注入 |
| Gemini | "将 DLL 复制到 `program/` 目录" | 可行但不优雅；当前 DLL 在 `System64/` 里，PATH 注入是零成本首选 |
| 本次规划 | 区分"注入失效"与"系统级 DLL 缺失"两个独立问题，分层解决 | — |

---

## 二、改造目标

1. **P0**：让已内置的 `System64/` DLL 能被 LibreOffice 进程实际加载（修注入）。
2. **P1**：`soffice.com` 失败时自动回退 `soffice.exe`，消除误判 `runtime.source=missing`。
3. **P1**：NSIS 安装包静默安装 VC++ Redist，覆盖极端精简环境（无法靠内置 DLL 兜住的场景）。
4. **P2**：诊断提示精准化，`exit_3221225781` 场景不再误导用户"重装 Full 包"。
5. **P2**：健康检查脚本加入 DLL 存在性检测，提前预警。

---

## 三、分层改造方案

```
层次            说明                           解决的问题
─────────────────────────────────────────────────────────────
L1 进程启动层   PATH 注入 System64/            DLL 搜索路径缺失（根因）
L2 探测逻辑层   soffice.com 失败回退 .exe      候选误判 candidate_unusable
L3 安装包层     NSIS 静默安装 VC++ Redist      System64/ 也覆盖不了的极端场景
L4 诊断提示层   exit_3221225781 精准文案       用户可自助修复，不被误导
L5 预检层       PS1 脚本增加 DLL 检测          提前预警，诊断信息更完整
```

---

## 四、各模块详细设计

### M1：PATH 注入 System64/（P0，必做，零包体增量）

#### 问题

`vendor/libreoffice/System64/` 内有全套 VC++ DLL，但进程启动时 Windows 找不到它们。

#### 方案

在 `mergeSpawnEnv()` 的调用处，额外将 `<loRoot>/System64` 追加到 `PATH` 最前面。注入逻辑发生在两处：

**a) `probeLibreOfficeBinary()`（main.js:3197 的 spawnSync 前）**

从 `sofficePath` 推算 `loRootDir`（`program/` 的上级目录），构造注入后的 env：

```
loRoot = path.dirname(path.dirname(sofficePath))   // program/ 的上级
sys64  = path.join(loRoot, "System64")
// 仅当目录存在时注入
injectedPath = [sys64, process.env.PATH].filter(Boolean).join(";")
env = mergeSpawnEnv({ PATH: injectedPath })
```

**b) `runLibreOfficeToPdfOnce()`（main.js:3728 的 spawn 前）**

同上，对转换进程也注入相同 PATH。

#### Windows 编码注意

PATH 分隔符使用英文分号 `;`（Windows 规范）。
路径中如含中文/空格，Node.js 在 Windows 上拼接时无需额外转义，`spawn` 会正确处理。
`mergeSpawnEnv` 接收的 value 通过 `String(value)` 转换，无编码风险。

#### 为什么只注入 System64

当前打包目标仅 x64，`soffice.com` / `soffice.exe` 也是 64 位程序。  
只注入 `System64/` 可以避免误加载 `System/`（x86）中的同名 DLL，降低 `STATUS_BAD_IMAGE_FORMAT` 风险。

#### DLL 版本冲突风险

Windows `KnownDLLs`（注册表 `HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\KnownDLLs`）中登记的 DLL 由系统直接提供，**PATH 中的同名 DLL 不会覆盖 KnownDLLs**。
典型 KnownDLLs 成员：`ntdll.dll`、`kernel32.dll` 等底层库，`msvcp140.dll` 通常**不在 KnownDLLs** 中，所以 PATH 注入有效，且不会干扰系统核心 DLL。

#### System64/ DLL 版本维护约束

每次升级内置 LibreOffice 版本时，**必须同步更新 `System64/` 下的 DLL**，确保版本与新版 LibreOffice 依赖一致。
建议在 `check-lo-runtime.js` 中增加 DLL 文件存在性校验（参考 M2 中 check 脚本的同步更新要求）。

---

### M2：soffice.com 失败回退 soffice.exe（P1，必做，零包体增量）

#### 问题

当前逻辑：`soffice.com` 存在 → 只用 `soffice.com` 探测 → 失败 → 整个候选标记 `candidate_unusable`。
`soffice.com` 与 `soffice.exe` 的导入表不同，一个失败不代表另一个也失败。

#### 方案

`probeLibreOfficeBinary()` 内，当 `soffice.com` 返回非零 exitCode（且非 timeout、非 spawn_error）时，**立即对 `soffice.exe` 再执行一次相同探测**，以第二次结果为准：

```
probe(soffice.com)  [已注入 System64 PATH]
  → ok:        return { ok: true, reason: "ok:soffice.com" }
  → exit ≠ 0:  probe(soffice.exe)  [同样注入 System64 PATH]
                 → ok:       return { ok: true, reason: "ok:soffice.exe:fallback_from_com",
                                      fallbackFromCom: true,
                                      comExitCode: <原exitCode> }
                 → exit ≠ 0: return { ok: false, reason: "exit_<code>:soffice.exe",
                                      comExitCode: <原exitCode> }
  → timeout / spawn_error: 不回退（回退无意义），直接返回原结果
```

`reason` 字段携带回退信息，方便诊断时区分"是 .com 崩溃还是整体失败"。

#### 同步更新 check-lo-runtime.js

`check-lo-runtime.js:80–95` 有完全相同的单探测逻辑，**必须同步修改**：
- `soffice.com` 探测失败时，回退到 `soffice.exe` 再探测一次
- 两次都失败才 `fail()` 退出

---

### M3：NSIS 静默安装 VC++ Redist（P1，+24 MB 包体）

#### 解决的场景

M1 PATH 注入只能覆盖"内置 `System64/` DLL 版本与系统兼容"的情况。
若目标机的 Windows 缺少 UCRT（`ucrtbase.dll`）或其他更底层依赖，还需系统级安装兜底。

#### 进入条件（落库前置检查，缺一不可）

在开始任何打包之前，必须先确认：

1. `desktop/vendor/redist/vc_redist.x64.exe` 已存在且 SHA-256 校验与微软官方一致
2. `desktop/build/installer.nsh` 已存在且语法正确（用 NSIS 工具本地验证）
3. `package.json` 中 `extraResources` 已加入 `redist` 条目（见下）
4. `package.json` 中 `nsis` 已加入 `include`（见下），并确认 `allowElevation=true`

**以上任何一项缺失，都不得发布含 M3 的版本。**

#### 文件准备

下载来源：`https://aka.ms/vs/17/release/vc_redist.x64.exe`（微软官方，VS2022，向后兼容 2015–2019）
放置路径：`desktop/vendor/redist/vc_redist.x64.exe`（约 24.3 MB）
**建议在仓库中存储 SHA-256 校验文件**（`desktop/vendor/redist/vc_redist.x64.exe.sha256`），CI 打包前自动校验。

#### package.json 修改

在 `build.extraResources` 新增：

```json
{
  "from": "vendor/redist",
  "to": "redist",
  "filter": ["vc_redist.x64.exe"]
}
```

在 `build.nsis` 新增 `include`，并显式保留 `allowElevation`：

```json
"nsis": {
  "oneClick": false,
  "perMachine": false,
  "allowToChangeInstallationDirectory": true,
  "allowElevation": true,
  "include": "build/installer.nsh"
}
```

说明：`requestExecutionLevel` 不是 `nsis` 段的有效配置键（当前 electron-builder 架构下）。  
若业务要求“强制管理员安装”，建议改为 `perMachine=true`（会强制安装到机器级）；否则维持 `perMachine=false + allowElevation=true`，在需要写系统目录时触发提权流程。

#### NSIS 脚本（desktop/build/installer.nsh）

**检测条件说明**：不能仅凭 `MSVCP140.dll` 存在就判断"已满足"。需检测关键文件组合，避免版本过旧/架构不匹配：

```nsis
!macro customInstall
  ; 检查核心 VC++ DLL 是否存在（三个都存在才算已满足）
  IfFileExists "$SYSDIR\MSVCP140.dll" check2 vcredist_install
  check2:
  IfFileExists "$SYSDIR\VCRUNTIME140.dll" check3 vcredist_install
  check3:
  IfFileExists "$SYSDIR\VCRUNTIME140_1.dll" vcredist_ok vcredist_install

  vcredist_install:
    DetailPrint "正在配置系统运行组件，请稍候..."
    ExecWait '"$INSTDIR\resources\redist\vc_redist.x64.exe" /quiet /norestart' $1
    ; 记录安装返回码到日志（0=成功, 1638=已是更新版, 3010=需重启）
    DetailPrint "VC++ Redist install result: $1"
    ; 不阻断主程序安装，即使 $1 != 0 也继续

  vcredist_ok:
!macroend
```

**关键修正（相较 v1.0）**：
- 检测从单一 DLL 改为三文件组合（`MSVCP140.dll` + `VCRUNTIME140.dll` + `VCRUNTIME140_1.dll`）
- 必须将 `ExecWait` 的返回码存入变量（`$1`）并输出到安装日志，**不能丢弃**
- 已知返回码：`0`=成功，`1638`=已安装更高版本无需操作，`3010`=需重启后生效
- 安装失败（其他非零码）不阻断主程序安装，但运行时应通过 M4 的精准提示引导用户

#### 企业机/受限账户的风险说明

在以下场景下，vc_redist 安装**可能失败**：

| 场景 | 原因 | 应对 |
|------|------|------|
| UAC 被 GPO 完全禁用 | NSIS 无法完成提权流程 | 安装失败时日志记录 `$1`，运行时弹窗引导手动安装 |
| 已安装更高版本 VC++ | 返回码 `1638` | 视为成功，正常继续 |
| 系统挂起等待重启 | 某些更新状态下拦截安装 | `/norestart` 不强制重启，安装返回 `3010` 时继续，运行时不受影响 |
| Portable 版 | 无 NSIS 流程 | 完全依赖 M1 的 PATH 注入兜底 |

**结论**：M3 是"尽力兜底"，不是"100% 保证"。M1 是主路径，M3 是补充。文档不应将 M3 写成"已解决所有场景"。

#### 关于 Portable 版

Portable 版无 NSIS 流程，M1 PATH 注入是唯一保障。
若 M1 注入后仍失败（`System64/` 版本不足，或系统缺 UCRT），此时需用户手动安装 VC++ Redist。
建议在 Portable 版的运行时弹窗中补充 VC++ 下载链接（M4 覆盖）。

---

### M4：诊断提示精准化（P2，零包体增量）

#### 涉及文件

- `desktop/main.js`：`runOfficeHealthCheck()` 中 `suggestions` 生成（第 3582–3588 行）
- `desktop/renderer/renderer.js`：`openLibreOfficeModal()` 中主消息文案（第 1609–1616 行）

#### main.js 改动逻辑（已修正变量约束）

`suggestions` 声明为 `const`（main.js:3525），**不能整组重赋值**，必须用 `splice + unshift/push`：

```js
// runtime.ok === false 分支（main.js:3582 附近）
const hasDllCrash = (runtime.checkedCandidates || []).some(
  c => String(c.probeReason || "").includes("exit_3221225781")
);

if (hasDllCrash) {
  // 清空默认 suggestions，换成精准提示
  suggestions.splice(0, suggestions.length);
  suggestions.push("系统缺少 VC++ 运行时（错误码 0xC0000135），LibreOffice 无法启动。");
  suggestions.push("请下载安装 VC++ Redistributable: https://aka.ms/vs/17/release/vc_redist.x64.exe");
  suggestions.push("安装完成后点击\u300c重新检测\u300d。");
  // 注：上面最后一行用 Unicode 转义避免引号嵌套，实际写代码时可直接写中文直角引号
} else {
  // 保持原有 unshift/push 逻辑不变（main.js:3585-3587）
}
```

> **编码说明**：JavaScript 字符串中，中文引号「」直接写即可，Node.js 源文件为 UTF-8 无 BOM，无需额外处理。此处 `\u300c\u300d` 仅为文档内避免 Markdown 渲染混乱，实际代码中直接写 `「重新检测」`。

#### renderer.js 改动逻辑

`openLibreOfficeModal()`（renderer.js:1609）中，从 `report.warnings` 检测 `exit_3221225781`：

```js
const hasDllCrash = (report?.warnings || []).some(
  w => String(w).includes("exit_3221225781")
);
if (!runtime.ok) {
  libreofficeModalMessage.textContent = hasDllCrash
    ? "系统缺少 VC++ 运行时（0xC0000135），LibreOffice 启动失败。请安装 VC++ Redistributable 后重试。"
    : "未检测到可用 LibreOffice 运行时。Full 包建议先重装；也可用「下载 LibreOffice」作为备用修复。";
}
```

#### 下载按钮 URL 自动切换

`getLibreOfficeDownloadUrl()`（renderer.js:1519）已从 `suggestions` 数组提取第一个 `https?://` URL 作为下载链接。
M4 将 VC++ URL 写入 `suggestions[1]` 后，弹窗的「下载 LibreOffice」按钮会**自动切换到 VC++ 下载地址**，无需单独修改按钮逻辑。

---

### M5：健康检查增加 DLL 存在性检测（P2，零包体增量）

#### 涉及文件

`desktop/scripts/libreoffice-health-check.ps1`

#### 编码约束（必须遵守）

当前脚本：**无 BOM，纯 ASCII 内容**（验证：首字节 `70 61 72 61 6d 28 29 0a`）。

M5 新增检查建议默认使用 ASCII 文案（最稳妥），并遵守以下规则：

1. **保存为 UTF-8（建议加 BOM）**：`UTF-8 with BOM` 是 Windows PowerShell 5.1 的安全选择；PowerShell 7+ 默认 UTF-8 无 BOM 也可。**选定一种后不得混用**。
2. **`[Console]::OutputEncoding` 第 4 行已设置为 UTF-8 无 BOM**，新增内容与此一致。
3. **回归测试**：M5 合并后，必须在目标机上运行健康检查并验证 JSON 输出可稳定解析。具体验证方法：`main.js` 中 `parsePowerShellJsonOutput` 能正确解析 checks/warnings/suggestions 字段。

> **当前最安全方案**：新增 `$warnings/$suggestions` 全部使用 ASCII 文案（含 URL）。如需引入中文文案，必须先做编码回归测试并固定文件编码策略。

#### 新增检查块

在现有 4 项检查后、`$result = @{...}` 前，增加：

```powershell
# VC++ Runtime DLL check
$vcDlls = @("MSVCP140.dll", "VCRUNTIME140.dll", "VCRUNTIME140_1.dll")
$sys32 = [System.Environment]::GetFolderPath("System")
$missingDlls = $vcDlls | Where-Object { -not (Test-Path (Join-Path $sys32 $_)) }
$vcOk = ($missingDlls.Count -eq 0)
$vcDetail = if ($vcOk) { "VC++ Runtime DLLs present in System32" } `
            else { "Missing from System32: " + ($missingDlls -join ", ") }
Add-Check "vcruntime_dlls" $vcOk "high" $vcDetail 0   # penalty=0，不扣分，仅记录
if (-not $vcOk) {
    $warnings.Add("VC++ Runtime DLLs missing: " + ($missingDlls -join ", ")) | Out-Null
    $suggestions.Add("Install VC++ Redistributable: https://aka.ms/vs/17/release/vc_redist.x64.exe") | Out-Null
}

# Windows edition check
try {
    $osInfo = Get-WmiObject -Class Win32_OperatingSystem -ErrorAction Stop
    $osBuild = [string]$osInfo.BuildNumber
    $osCaption = [string]$osInfo.Caption
    $isSpecial = $osCaption -match "LTSC|LTSB|Server"
    Add-Check "windows_edition" $true "low" ("Build=" + $osBuild + " Edition=" + $osCaption) 0
    if ($isSpecial) {
        $warnings.Add("LTSC/Server edition detected (Build " + $osBuild + "). Verify VC++ runtime is installed.") | Out-Null
    }
} catch {
    Add-Check "windows_edition" $false "low" "Cannot read Windows version" 0
}
```

**编码说明**：以上片段全部使用 ASCII 字符串，无中文，与现有脚本编码风格一致，可安全合并。

#### 不扣分的设计理由

DLL 检测仅作预警：M1 的 PATH 注入机制可能已让内置 `System64/` DLL 被加载，此时 System32 里没有这些 DLL 也完全正常。
真正的运行时阻断由 `libreoffice_runtime=fail`（main.js 注入，score -= 40，block=true）触发，不依赖此检查。

---

## 五、各方案能力覆盖对比

| 场景 | 现状 | +M1 PATH注入 | +M2 .com回退 | +M3 NSIS | 完整改造 |
|------|------|-------------|-------------|---------|---------|
| Win10 22H2 全新安装 | ✅ | ✅ | ✅ | ✅ | ✅ |
| Win10 LTSC 1809（有VC++） | ✅ | ✅ | ✅ | ✅ | ✅ |
| Win10 LTSC 1809（无VC++，安装版）| ❌ 0xC0000135 | ✅ System64注入 | ✅ | ✅ | ✅ |
| Win10 精简版（无VC++，安装版）| ❌ 0xC0000135 | ✅ System64注入 | ✅ | ✅ | ✅ |
| Portable版/无VC++ | ❌ 0xC0000135 | ✅ System64注入 | ✅ | ❌ 无NSIS | ✅（M1主路径） |
| 极端精简（无UCRT，安装版）| ❌ | ❌ System64无UCRT | ❌ | ✅ NSIS兜底 | ✅ |
| 企业机/UAC禁用（安装版）| ❌ | ✅ | ✅ | ⚠️ vc_redist可能失败 | ✅（M1主路径） |
| Win Server（安装版）| ❌ | ✅（概率高） | ✅ | ✅ | ✅ |
| soffice.com崩溃但.exe正常 | ❌ 误判missing | ❌ | ✅ 回退探测 | ✅ | ✅ |
| 诊断提示不明确 | ❌ | ❌ | ❌ | ❌ | ✅（M4） |

---

## 六、里程碑与实施顺序

```
M1（PATH 注入）      ← 零成本，解决根因，优先实施
  ↓
M2（探测回退）       ← 消除误判，与 M1 一起做
  ↓
M3（NSIS + redist）  ← 极端场景兜底，需先落库文件（前置条件见 § M3 进入条件）
  ↓
M4（精准提示）       ← 依赖 M1/M2 后 warning 结构稳定
  ↓
M5（预检检测）       ← 独立可做，但需编码回归测试
```

| 编号 | 模块 | 优先级 | 包体变化 | 涉及文件 | 前置条件 |
|------|------|--------|---------|---------|---------|
| M1 | PATH 注入 System64/ | P0 | 0 | main.js（2处spawn） | 无 |
| M2 | soffice.com 失败回退 .exe | P1 | 0 | main.js、check-lo-runtime.js | 无 |
| M3 | NSIS + vc_redist.x64.exe | P1 | +24 MB | package.json、build/installer.nsh | vendor/redist/ 和 build/ 目录需先创建；SHA-256 校验通过 |
| M4 | 精准错误提示 | P2 | 0 | main.js、renderer/renderer.js | M1+M2 稳定后 |
| M5 | 预检 DLL + Win 版本检测 | P2 | 0 | scripts/libreoffice-health-check.ps1 | 编码回归测试通过 |

---

## 七、验收矩阵

### 7.1 必测环境

| 系统 | 环境条件 | 验收内容 |
|------|---------|---------|
| Win10 LTSC 1809 | 无 VC++ Redist，安装版 | 启动 → 导出 1 页 PPT 成功，日志无 `candidate_unusable` |
| Win10 LTSC 1809 | 企业策略机，无 VC++ | 启动 → 导出成功；若 M3 vc_redist 安装失败，验证 M1 自行兜住 |
| Win10 21H2 | 全新安装 | 无回归，正常导出 |
| Win10 22H2 | 全新安装 | 无回归，正常导出 |
| Win11 23H2 | 全新安装 | 无回归，正常导出 |
| Portable 版 | Win10 LTSC，无 VC++ | 启动后导出成功（靠 M1，不靠 M3） |
| 任意系统 | 健康检查 JSON 解析 | M5 合并后：`parsePowerShellJsonOutput` 无乱码，中文/ASCII warnings 正确 |

### 7.2 验收指标

| 指标 | 当前 | 目标 |
|------|------|------|
| LTSC 无 VC++ 首次导出成功率 | 0% | ≥ 95% |
| `candidate_unusable` 误判率（.com 崩溃但 .exe 可用时）| 100% | 0%（M2 后） |
| 弹窗出现"重装 Full 包"在 DLL 场景的误引导概率 | 100% | 0%（M4 后） |
| 健康检查提前发现 DLL 缺失准确率 | 无 | ≥ 90%（M5 后） |
| M3 NSIS vc_redist 安装返回码记录到日志 | 不适用 | 100% 记录（`$1`，不得丢弃） |

### 7.3 冒烟用例

```
用例 1：LTSC 干净机 + Full 安装包（验证 M1+M3）
  前提：全新 LTSC 1809 VM，无任何 VC++ Redist
  步骤：
    1. 安装 Full 包
    2. 启动软件，进入"文档一键导出"
    3. 选择 10 页 PPT，导出 2x
  预期：全部成功，运行日志无 candidate_unusable，
        安装日志中有 "VC++ Redist install result: <code>"，且 `<code>` 属于 `0/1638/3010`

用例 2：LTSC + Portable 版（验证 M1 独立有效）
  前提：LTSC 1809，无 VC++，使用 Portable 版（无 NSIS 流程）
  步骤：
    1. 解压 Portable 包并运行
    2. 导出 1 页 PPT
  预期：导出成功，runtime.source=embedded

用例 3：soffice.com 崩溃但 soffice.exe 正常（验证 M2）
  前提：替换 soffice.com 为损坏版（强制 exit_3221225781）
  步骤：
    1. 启动软件，点击"重新检测"
    2. 尝试导出
  预期：健康检查通过，runtime.source=embedded，
        日志中出现 "ok:soffice.exe:fallback_from_com"

用例 4：精准提示（验证 M4）
  前提：测试机上临时重命名安装目录内
        `resources/libreoffice/System64/MSVCP140.dll` 与 `VCRUNTIME140.dll`
        （仅测试副本，测试后恢复）
  步骤：
    1. 触发健康检查
    2. 弹窗弹出
  预期：
    主消息含 "VC++ 运行时（0xC0000135）"，不出现 "重装 Full 包"
    下载按钮指向 https://aka.ms/vs/17/release/vc_redist.x64.exe

用例 5：健康检查 JSON 编码（验证 M5 编码安全）
  前提：任意 Windows 系统
  步骤：
    1. 触发健康检查
    2. 查看运行日志中 checks/warnings 字段
  预期：所有字段可正确解析，无 ? 或乱码
```

---

## 八、风险汇总与应对

| 风险 | 级别 | 应对 |
|------|------|------|
| M3 vc_redist 在企业机/UAC 禁用时无法提权安装 | 高 | `allowElevation=true` + 安装失败靠 M1+M4 兜底；安装结果必须记录到日志（`$1`） |
| M3 单 DLL 检测误判"已满足" | 高 | 检测三文件组合（`MSVCP140.dll` + `VCRUNTIME140.dll` + `VCRUNTIME140_1.dll`）才算通过 |
| M4 伪代码引号嵌套/const 重赋值 | 中 | 用 `splice(0, suggestions.length)` 清空再 push；字符串用直角引号「」，不嵌套英文引号 |
| M5 脚本编码不一致导致 JSON 解析异常 | 中 | 新增 `$warnings/$suggestions` 默认全 ASCII；固定编码策略（UTF-8 with BOM 或 UTF-8 无 BOM 二选一）；合并后做编码回归测试 |
| M3 落库前置资产缺失（vendor/redist、build/ 不存在）| 中 | M3 有显式进入条件检查清单，缺任何一项不发版 |
| M1 PATH 注入被 KnownDLLs 覆盖 | 低 | `msvcp140.dll` 不在 KnownDLLs，PATH 注入有效；底层系统 DLL（ntdll/kernel32）不受影响 |
| System64/ DLL 版本滞后于新版 LibreOffice | 中 | 升级 LibreOffice 时必须同步更新 `System64/`；在 check-lo-runtime.js 中增加 DLL 存在性检查 |
| M2 回退探测小幅增加首次检测延迟 | 低 | 回退仅在 .com 失败时触发，正常机器不触发；超时参数不变 |

---

## 九、包体影响

| 方案 | 增量 | 说明 |
|------|------|------|
| M1 | 0 MB | DLL 已存在，只改代码逻辑 |
| M2 | 0 MB | 只改代码逻辑 |
| M3 | +24 MB | `vendor/redist/vc_redist.x64.exe` 打包进 `resources/redist/` |
| M4 | 0 MB | 只改代码逻辑 |
| M5 | 0 MB | 只改 .ps1 脚本（已在 `extraResources/scripts` 中） |
| **合计** | **+24 MB** | Full 包体积增加约 24 MB |

---

## 十、不纳入本次范围

1. **灰度发布体系**：本次属于兼容性修复，风险低，建议直接全量发布。
2. **Win7 支持**：Win7 缺 UCRT 且微软已停止支持，不投入适配成本，说明书标注为不支持。
3. **运行时触发 vc_redist 安装按钮**：M3 覆盖安装期场景后，运行时修复入口优先级低，列后续迭代。
4. **增量更新 vc_redist**：24 MB 一次性开销可接受，暂不做增量包机制。
5. **x86/32 位兼容**：`package.json` 只打 x64，`System/`（32 位 DLL）保留不移除，但不需要专门测试。
