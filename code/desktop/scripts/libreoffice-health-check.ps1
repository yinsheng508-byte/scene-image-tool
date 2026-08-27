param()

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding

$checks = New-Object System.Collections.Generic.List[object]
$warnings = New-Object System.Collections.Generic.List[string]
$suggestions = New-Object System.Collections.Generic.List[string]
$actions = New-Object System.Collections.Generic.List[string]
$score = 100
$blockExport = $false

function Add-Check {
    param(
        [string]$Name,
        [bool]$Ok,
        [string]$Severity,
        [string]$Detail,
        [int]$Penalty = 0
    )
    $checks.Add(@{
        name = $Name
        ok = $Ok
        severity = $Severity
        detail = $Detail
    }) | Out-Null
    if (-not $Ok -and $Penalty -gt 0) {
        $script:score = [Math]::Max(0, $script:score - $Penalty)
    }
}

# Runtime path discovery is handled in main.js. This script only checks environment health.

$tempWritable = $false
$tempDetail = ""
try {
    $probe = Join-Path $env:TEMP ("scene-lo-probe-" + [System.Guid]::NewGuid().ToString("N") + ".tmp")
    "ok" | Out-File -FilePath $probe -Encoding ascii -Force
    Remove-Item -Path $probe -Force -ErrorAction SilentlyContinue
    $tempWritable = $true
    $tempDetail = [string]$env:TEMP
}
catch {
    $tempWritable = $false
    $tempDetail = "TEMP directory is not writable"
}
Add-Check "temp_dir_writable" $tempWritable "high" $tempDetail 35
if (-not $tempWritable) {
    $blockExport = $true
    $suggestions.Add("Please check TEMP directory permissions and free disk space.") | Out-Null
}

$userProfileOk = $false
$userProfileDetail = ""
try {
    $userProfile = [string]$env:USERPROFILE
    $userProfileOk = (-not [string]::IsNullOrWhiteSpace($userProfile)) -and (Test-Path -LiteralPath $userProfile)
    $userProfileDetail = if ($userProfileOk) { $userProfile } else { "USERPROFILE is unavailable" }
}
catch {
    $userProfileOk = $false
    $userProfileDetail = "USERPROFILE is unavailable"
}
Add-Check "user_profile_path" $userProfileOk "medium" $userProfileDetail 20
if (-not $userProfileOk) {
    $blockExport = $true
    $suggestions.Add("Please make sure current account has a valid user profile directory.") | Out-Null
}

$tempSpaceOk = $true
$tempSpaceDetail = ""
try {
    $tempRoot = [System.IO.Path]::GetPathRoot($env:TEMP)
    $drive = Get-PSDrive -Name $tempRoot.Substring(0, 1)
    $freeMb = [math]::Round($drive.Free / 1MB, 0)
    $tempSpaceOk = $freeMb -ge 1024
    $tempSpaceDetail = "TEMP free space: ${freeMb}MB"
}
catch {
    $tempSpaceOk = $false
    $tempSpaceDetail = "Failed to inspect TEMP disk space"
}
Add-Check "temp_disk_space" $tempSpaceOk "medium" $tempSpaceDetail 15
if (-not $tempSpaceOk) {
    $warnings.Add("Low TEMP free space may fail large file export.") | Out-Null
    $suggestions.Add("Please free at least 2GB TEMP disk space before export.") | Out-Null
}

$loProcessCount = 0
try {
    $loProcessCount = @(Get-Process -Name "soffice*" -ErrorAction SilentlyContinue).Count
}
catch {
    $loProcessCount = 0
}
$processOk = $loProcessCount -lt 8
Add-Check "libreoffice_process_pressure" $processOk "low" ("Running LibreOffice processes: " + $loProcessCount) 5
if (-not $processOk) {
    $warnings.Add("Too many LibreOffice processes are running; close stale processes first.") | Out-Null
}

$vcDllsOk = $true
$vcDllsDetail = ""
try {
    $sys32 = [System.Environment]::GetFolderPath("System")
    $vcDlls = @("MSVCP140.dll", "VCRUNTIME140.dll", "VCRUNTIME140_1.dll")
    $missingVcDlls = @()
    foreach ($dll in $vcDlls) {
        $dllPath = Join-Path $sys32 $dll
        if (-not (Test-Path -LiteralPath $dllPath)) {
            $missingVcDlls += $dll
        }
    }
    $vcDllsOk = $missingVcDlls.Count -eq 0
    if ($vcDllsOk) {
        $vcDllsDetail = "VC++ Runtime DLLs present in System32"
    } else {
        $vcDllsDetail = "Missing from System32: " + ($missingVcDlls -join ", ")
        $warnings.Add("VC++ Runtime DLLs missing: " + ($missingVcDlls -join ", ")) | Out-Null
        $suggestions.Add("Install VC++ Redistributable: https://aka.ms/vs/17/release/vc_redist.x64.exe") | Out-Null
    }
}
catch {
    $vcDllsOk = $false
    $vcDllsDetail = "Failed to inspect VC++ runtime DLLs in System32"
}
Add-Check "vcruntime_dlls" $vcDllsOk "high" $vcDllsDetail 0

$windowsEditionOk = $true
$windowsEditionDetail = ""
try {
    $osInfo = Get-WmiObject -Class Win32_OperatingSystem -ErrorAction Stop
    $osBuild = [string]$osInfo.BuildNumber
    $osCaption = [string]$osInfo.Caption
    $windowsEditionDetail = "Build=" + $osBuild + " Edition=" + $osCaption
    if ($osCaption -match "LTSC|LTSB|Server") {
        $warnings.Add("LTSC/Server edition detected (Build " + $osBuild + "). Verify VC++ runtime is installed.") | Out-Null
    }
}
catch {
    $windowsEditionOk = $false
    $windowsEditionDetail = "Cannot read Windows version"
}
Add-Check "windows_edition" $windowsEditionOk "low" $windowsEditionDetail 0

if ($score -lt 40) {
    $blockExport = $true
}

if (-not $blockExport) {
    $actions.Add("Environment checks passed. Export can start.") | Out-Null
}

$result = @{
    ok = (-not $blockExport)
    blockExport = $blockExport
    score = $score
    checks = $checks
    warnings = $warnings
    suggestions = $suggestions
    actions = $actions
}

$result | ConvertTo-Json -Compress
