param(
    [ValidateSet("safe", "restore")]
    [string]$Mode = "safe"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding

$actions = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]
$ok = $true
$message = ""

try {
    if ($Mode -eq "safe") {
        $officeCache = Join-Path $env:LOCALAPPDATA "Microsoft\Office"
        if (-not (Test-Path $officeCache)) {
            New-Item -Path $officeCache -ItemType Directory -Force | Out-Null
            $actions.Add("Created Office cache directory") | Out-Null
        }
        else {
            $actions.Add("Office cache directory already exists") | Out-Null
        }

        $identityScript = Join-Path $PSScriptRoot "office-identity-policy.ps1"
        if (Test-Path $identityScript) {
            try {
                & $identityScript -Mode "disable" | Out-Null
                $actions.Add("Applied Office identity safe policy (disable prompt-oriented modern auth)") | Out-Null
            }
            catch {
                $warnings.Add("Failed to apply Office identity safe policy: $($_.Exception.Message)") | Out-Null
            }
        }
        else {
            $warnings.Add("office-identity-policy.ps1 not found") | Out-Null
        }

        $message = "safe fix completed"
    }
    else {
        $identityScript = Join-Path $PSScriptRoot "office-identity-policy.ps1"
        if (Test-Path $identityScript) {
            try {
                & $identityScript -Mode "restore" | Out-Null
                $actions.Add("Restored Office identity policy") | Out-Null
            }
            catch {
                $warnings.Add("Failed to restore Office identity policy: $($_.Exception.Message)") | Out-Null
            }
        }
        else {
            $warnings.Add("office-identity-policy.ps1 not found") | Out-Null
        }
        $message = "restore completed"
    }
}
catch {
    $ok = $false
    $message = $_.Exception.Message
    $warnings.Add($_.Exception.Message) | Out-Null
}

$result = @{
    ok = $ok
    mode = $Mode
    message = $message
    actions = $actions
    warnings = $warnings
}

$result | ConvertTo-Json -Compress
