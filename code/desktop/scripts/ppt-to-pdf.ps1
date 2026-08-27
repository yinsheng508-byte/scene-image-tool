param(
    [Parameter(Mandatory = $true)][string]$InputPath,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [string]$PidFile = ""
)

$ErrorActionPreference = "Stop"
try {
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
    $OutputEncoding = [Console]::OutputEncoding
}
catch {}

$ppt = $null
$presentation = $null
$startAt = Get-Date
$enableInjectFallback = ($env:SCENE_PPT_ENABLE_INJECT_FALLBACK -eq "1")

# Use numeric enum values to avoid hard dependency on Office PIAs.
$msoTrue = -1
$msoFalse = 0
$ppAlertsNone = 1
$ppFixedFormatTypePDF = 2
$ppFixedFormatIntentPrint = 2
$ppSaveAsPDF = 32

function Get-HResultHex($exception) {
    if ($null -eq $exception) { return "" }
    try {
        $rawValue = [int64]$exception.HResult
        $value = [uint32]($rawValue -band 0xffffffffL)
        if ($value -eq 0) { return "" }
        return ("0x{0:X8}" -f $value).ToLower()
    }
    catch {
        return ""
    }
}

function Get-ProcessIdSnapshot {
    param([string]$Name)
    try {
        return @(Get-Process -Name $Name -ErrorAction SilentlyContinue | ForEach-Object { [int]$_.Id })
    }
    catch {
        return @()
    }
}

function Write-NewProcessIds {
    param(
        [string]$Name,
        [int[]]$BeforeIds,
        [string]$TargetFile
    )
    try {
        $afterIds = Get-ProcessIdSnapshot $Name
        $newIds = @($afterIds | Where-Object { $BeforeIds -notcontains $_ })
        if ($newIds.Count -gt 0 -and -not [string]::IsNullOrWhiteSpace($TargetFile)) {
            $dir = Split-Path -Parent $TargetFile
            if (-not [string]::IsNullOrWhiteSpace($dir)) {
                New-Item -Path $dir -ItemType Directory -Force | Out-Null
            }
            $newIds | ForEach-Object { [string]$_ } | Set-Content -Path $TargetFile -Encoding ASCII
        }
        return @($newIds)
    }
    catch {
        return @()
    }
}

function Stop-NewProcessIds {
    param(
        [int[]]$Ids,
        [string]$ExpectedName
    )
    foreach ($id in @($Ids)) {
        try {
            $process = Get-Process -Id $id -ErrorAction Stop
            if ([string]$process.ProcessName -eq $ExpectedName) {
                Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
            }
        }
        catch {}
    }
}

function OpenPresentationWithRepair($presentations, $inputPath, $enableInjectFallback) {
    try { Unblock-File -Path $inputPath -ErrorAction SilentlyContinue } catch {}
    $openError = $null
    $open2007Error = $null

    try {
        $presentation = $presentations.Open($inputPath, $msoTrue, $msoFalse, $msoFalse)
        return @{
            Presentation = $presentation
            OpenMode = "open"
            Repaired = $false
            FallbackReason = ""
        }
    }
    catch {
        $openError = $_.Exception
        try {
            $presentation = $presentations.Open2007($inputPath, $msoTrue, $msoFalse, $msoFalse, $msoTrue)
            return @{
                Presentation = $presentation
                OpenMode = "open2007"
                Repaired = $true
                FallbackReason = "open_failed"
                OpenError = $openError.Message
                OpenCode = Get-HResultHex $openError
            }
        }
        catch {
            $open2007Error = $_.Exception
        }
    }

    if ($enableInjectFallback) {
        try {
            $blank = $presentations.Add($msoFalse)
            $blank.Slides.InsertFromFile($inputPath, 0)
            return @{
                Presentation = $blank
                OpenMode = "inject"
                Repaired = $true
                FallbackReason = "open_open2007_failed_inject"
            }
        }
        catch {
            $injectError = $_.Exception
            if ($injectError -ne $null) {
                throw $injectError
            }
        }
    }

    if ($open2007Error -ne $null) {
        throw $open2007Error
    }
    if ($openError -ne $null) {
        throw $openError
    }
    throw "ppt_open_failed"
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
    envWarning = ""
    durationMs = 0
    retries = 0
}

try {
    $officeCache = Join-Path $env:LOCALAPPDATA "Microsoft\Office"
    if (-not (Test-Path $officeCache)) {
        $result.envWarning = "office_profile_not_ready"
    }
}
catch {}

try {
    $beforePids = Get-ProcessIdSnapshot "POWERPNT"
    $ppt = New-Object -ComObject PowerPoint.Application
    $newPowerPointPids = @(Write-NewProcessIds "POWERPNT" $beforePids $PidFile)
    $ppt.Visible = $msoTrue
    $ppt.DisplayAlerts = $ppAlertsNone
    try { $ppt.AutomationSecurity = 3 } catch {}
    try { $ppt.FeatureInstall = 0 } catch {}

    $openInfo = OpenPresentationWithRepair $ppt.Presentations $InputPath $enableInjectFallback
    $presentation = $openInfo.Presentation
    $result.openMode = [string]$openInfo.OpenMode
    $result.repaired = [bool]$openInfo.Repaired
    $result.fallbackReason = [string]$openInfo.FallbackReason

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

    $result.ok = $true
    $result.message = "ppt_to_pdf_completed"
}
catch {
    $err = $_.Exception
    $result.ok = $false
    $result.message = "ppt_to_pdf_failed"
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
        if ((@($newPowerPointPids).Count -gt 0) -or (@($beforePids).Count -eq 0)) {
            try { $ppt.Quit() } catch { }
            Start-Sleep -Milliseconds 500
            Stop-NewProcessIds -Ids $newPowerPointPids -ExpectedName "POWERPNT"
        }
    }
    if ($presentation -ne $null) {
        try { [System.Runtime.Interopservices.Marshal]::ReleaseComObject($presentation) | Out-Null } catch {}
    }
    if ($ppt -ne $null) {
        try { [System.Runtime.Interopservices.Marshal]::ReleaseComObject($ppt) | Out-Null } catch {}
    }
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()

    $result.durationMs = [int][Math]::Round(((Get-Date) - $startAt).TotalMilliseconds)
    $result | ConvertTo-Json -Compress
    if (-not $result.ok) {
        exit 1
    }
}
