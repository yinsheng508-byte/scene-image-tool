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

$word = $null
$doc = $null
$startAt = Get-Date

$wdExportFormatPDF = 17
$wdExportOptimizeForPrint = 0
$wdAlertsNone = 0

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
    try { Unblock-File -Path $InputPath -ErrorAction SilentlyContinue } catch {}

    $beforePids = Get-ProcessIdSnapshot "WINWORD"
    $word = New-Object -ComObject Word.Application
    $newWordPids = @(Write-NewProcessIds "WINWORD" $beforePids $PidFile)
    $word.Visible = $false
    $word.DisplayAlerts = $wdAlertsNone
    try { $word.AutomationSecurity = 3 } catch {}
    try { $word.FeatureInstall = 0 } catch {}

    $doc = $word.Documents.Open($InputPath, $false, $true)
    $result.openMode = "open"

    $doc.ExportAsFixedFormat($OutputPath, $wdExportFormatPDF, $false, $wdExportOptimizeForPrint)

    $result.ok = $true
    $result.message = "word_to_pdf_completed"
}
catch {
    $err = $_.Exception
    $result.ok = $false
    $result.message = "word_to_pdf_failed"
    $result.rawError = [string]$err.Message
    $result.errorCode = Get-HResultHex $err
    if ([string]::IsNullOrWhiteSpace($result.fallbackReason)) {
        $result.fallbackReason = "open_or_export_failed"
    }
    if ([string]::IsNullOrWhiteSpace($result.errorCode)) {
        $result.error = $result.rawError
    }
    else {
        $result.error = "$($result.rawError) ($($result.errorCode))"
    }
}
finally {
    if ($doc -ne $null) {
        try { $doc.Close($false) } catch {}
    }
    if ($word -ne $null) {
        if ((@($newWordPids).Count -gt 0) -or (@($beforePids).Count -eq 0)) {
            try { $word.Quit() } catch {}
            Start-Sleep -Milliseconds 500
            Stop-NewProcessIds -Ids $newWordPids -ExpectedName "WINWORD"
        }
    }
    if ($doc -ne $null) {
        try { [System.Runtime.Interopservices.Marshal]::ReleaseComObject($doc) | Out-Null } catch {}
    }
    if ($word -ne $null) {
        try { [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null } catch {}
    }
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()

    $result.durationMs = [int][Math]::Round(((Get-Date) - $startAt).TotalMilliseconds)
    $result | ConvertTo-Json -Compress
    if (-not $result.ok) {
        exit 1
    }
}
