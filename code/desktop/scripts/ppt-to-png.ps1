param(
    [Parameter(Mandatory = $true)][string]$InputPath,
    [Parameter(Mandatory = $true)][string]$OutputDir,
    [float]$Scale = 1.0
)

$ppt = $null
$presentation = $null

# Use numeric enum values to avoid hard dependency on Office PIAs.
$msoTrue = -1
$msoFalse = 0
$ppAlertsNone = 1

try {
    if (-not (Test-Path $OutputDir)) {
        New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    }

    $ppt = New-Object -ComObject PowerPoint.Application
    $ppt.Visible = $msoTrue
    $ppt.DisplayAlerts = $ppAlertsNone

    $presentation = $ppt.Presentations.Open($InputPath, $msoTrue, $msoTrue, $msoFalse)
    
    # Calculate target dimensions based on Scale
    # Base DPI = 300 (as per optimization plan: 1x=300dpi, 1.5x=450dpi, 2x=600dpi, 3x=900dpi)
    $baseDpi = 300
    $targetDpi = $baseDpi * $Scale
    
    $slideWidthPoints = $presentation.PageSetup.SlideWidth
    $slideHeightPoints = $presentation.PageSetup.SlideHeight
    
    # Points to Pixels: points / 72 * dpi
    $targetWidth = [int][Math]::Round($slideWidthPoints / 72 * $targetDpi)
    $targetHeight = [int][Math]::Round($slideHeightPoints / 72 * $targetDpi)

    # Cap pixel count to reduce memory spikes (approx 60MP)
    $maxPixels = 60000000
    $pixelCount = $targetWidth * $targetHeight
    if ($pixelCount -gt $maxPixels) {
        $ratio = [Math]::Sqrt($maxPixels / $pixelCount)
        $targetWidth = [int][Math]::Round($targetWidth * $ratio)
        $targetHeight = [int][Math]::Round($targetHeight * $ratio)
    }
    
    Write-Host "Exporting PPT: $InputPath"
    Write-Host "Slide Size (Points): $slideWidthPoints x $slideHeightPoints"
    Write-Host "Target DPI: $targetDpi"
    Write-Host "Output Size (Px): $targetWidth x $targetHeight"

    $presentation.Export($OutputDir, "PNG", $targetWidth, $targetHeight)
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}
finally {
    if ($presentation -ne $null) {
        try {
            $presentation.Close()
        } catch {
            # Ignore close failures to avoid masking export errors.
        }
    }
    if ($ppt -ne $null) {
        try {
            $ppt.Quit()
        } catch {
            # Ignore quit failures during cleanup.
        }
    }
    
    # Cleanup COM objects to prevent memory leaks
    if ($presentation -ne $null) {
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($presentation) | Out-Null
    }
    if ($ppt -ne $null) {
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($ppt) | Out-Null
    }
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}
