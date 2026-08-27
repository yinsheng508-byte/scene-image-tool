param(
    [Parameter(Mandatory = $true)][string]$TaskFile
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding

$ppt = $null
$results = @()
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
        $value = [uint32]$exception.HResult
        if ($value -eq 0) { return "" }
        return ("0x{0:X8}" -f $value).ToLower()
    }
    catch {
        return ""
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

function New-PptApplication {
    $app = New-Object -ComObject PowerPoint.Application
    $app.Visible = $msoTrue
    $app.DisplayAlerts = $ppAlertsNone
    try { $app.AutomationSecurity = 3 } catch {}
    try { $app.FeatureInstall = 0 } catch {}
    return $app
}

function Release-PptApplication($app) {
    if ($app -ne $null) {
        try { $app.Quit() } catch { }
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($app) | Out-Null
    }
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}

$batchSize = 5
try {
    $batchSizeValue = [int]$env:SCENE_PPT_BATCH_COM_RESTART_SIZE
    if ($batchSizeValue -gt 0) {
        $batchSize = $batchSizeValue
    }
}
catch {}

$envWarning = ""
try {
    $officeCache = Join-Path $env:LOCALAPPDATA "Microsoft\Office"
    if (-not (Test-Path $officeCache)) {
        $envWarning = "office_profile_not_ready"
    }
}
catch {}

try {
    $tasks = Get-Content $TaskFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($tasks -isnot [System.Collections.IList]) {
        $tasks = @($tasks)
    }

    if ($tasks.Count -eq 0) {
        Write-Output "[]"
        exit 0
    }

    $processedCount = 0
    $ppt = New-PptApplication

    foreach ($task in $tasks) {
        if ($processedCount -gt 0 -and ($processedCount % $batchSize) -eq 0) {
            Release-PptApplication $ppt
            Start-Sleep -Milliseconds 500
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
            envWarning = $envWarning
            durationMs = 0
            retries = 0
        }

        try {
            $openInfo = OpenPresentationWithRepair $ppt.Presentations $task.input $enableInjectFallback
            $presentation = $openInfo.Presentation
            $taskResult.openMode = [string]$openInfo.OpenMode
            $taskResult.repaired = [bool]$openInfo.Repaired
            $taskResult.fallbackReason = [string]$openInfo.FallbackReason

            $exported = $false
            try {
                $presentation.SaveAs($task.output, $ppSaveAsPDF)
                $exported = $true
            }
            catch {
                $exported = $false
            }

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
            }
            $processedCount += 1
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
