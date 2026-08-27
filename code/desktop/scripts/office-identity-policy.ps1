param(
    [ValidateSet("disable", "restore")]
    [string]$Mode = "disable"
)

$ErrorActionPreference = "Stop"
$idPath = "HKCU:\SOFTWARE\Microsoft\Office\16.0\Common\Identity"

if (-not (Test-Path $idPath)) {
    New-Item $idPath -Force | Out-Null
}

if ($Mode -eq "disable") {
    Set-ItemProperty -Path $idPath -Name "DisableAADWAM" -Type DWord -Value 1
    Set-ItemProperty -Path $idPath -Name "EnableADAL" -Type DWord -Value 0
    Set-ItemProperty -Path $idPath -Name "DisableADALatopWAMOverride" -Type DWord -Value 1
    Write-Output "Office identity policy set to DISABLE prompt-oriented modern auth."
    exit 0
}

Remove-ItemProperty -Path $idPath -Name "DisableAADWAM" -ErrorAction SilentlyContinue
Remove-ItemProperty -Path $idPath -Name "EnableADAL" -ErrorAction SilentlyContinue
Remove-ItemProperty -Path $idPath -Name "DisableADALatopWAMOverride" -ErrorAction SilentlyContinue
Write-Output "Office identity policy restored."
