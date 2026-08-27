param(
    [string]$RequiredApps = "",
    [switch]$Light
)

$ErrorActionPreference = "Stop"
try {
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
    $OutputEncoding = [Console]::OutputEncoding
}
catch {}

$checks = New-Object System.Collections.ArrayList
$warnings = New-Object System.Collections.ArrayList
$suggestions = New-Object System.Collections.ArrayList
$actions = New-Object System.Collections.ArrayList
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

function Normalize-AppList {
    param([string]$Raw)
    $items = New-Object System.Collections.ArrayList
    if ([string]::IsNullOrWhiteSpace($Raw)) {
        return @()
    }
    foreach ($part in ($Raw -split ",")) {
        $name = ([string]$part).Trim().ToLowerInvariant()
        if ($name -eq "doc" -or $name -eq "word") { $name = "word" }
        elseif ($name -eq "ppt" -or $name -eq "powerpoint") { $name = "powerpoint" }
        else { $name = "" }
        if ($name -and -not $items.Contains($name)) {
            $items.Add($name) | Out-Null
        }
    }
    return @($items)
}

function Get-HResultHex {
    param($Exception)
    if ($null -eq $Exception) { return "" }
    try {
        $rawValue = [int64]$Exception.HResult
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

function Get-NewProcessIds {
    param(
        [string]$Name,
        [int[]]$BeforeIds
    )
    try {
        $afterIds = Get-ProcessIdSnapshot $Name
        return @($afterIds | Where-Object { $BeforeIds -notcontains $_ })
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

function Test-RegistryKey {
    param([string]$Path)
    try {
        return Test-Path -LiteralPath $Path
    }
    catch {
        return $false
    }
}

function Get-RegistryDefaultValue {
    param([string]$Path)
    try {
        $key = Get-Item -LiteralPath $Path -ErrorAction Stop
        return [string]$key.GetValue("")
    }
    catch {
        return ""
    }
}

function Get-RegistryViews {
    $views = New-Object System.Collections.ArrayList
    try {
        if ([Environment]::Is64BitOperatingSystem) {
            $views.Add([Microsoft.Win32.RegistryView]::Registry64) | Out-Null
            $views.Add([Microsoft.Win32.RegistryView]::Registry32) | Out-Null
        }
        else {
            $views.Add([Microsoft.Win32.RegistryView]::Registry32) | Out-Null
        }
    }
    catch {}
    try { $views.Add([Microsoft.Win32.RegistryView]::Default) | Out-Null } catch {}
    return @($views)
}

function Resolve-RegistryHive {
    param([string]$Hive)
    $text = ([string]$Hive).Trim().ToUpperInvariant()
    if ($text -eq "HKCR" -or $text -eq "HKEY_CLASSES_ROOT") {
        return @{
            hive = [Microsoft.Win32.RegistryHive]::ClassesRoot
            name = "HKCR"
        }
    }
    if ($text -eq "HKLM" -or $text -eq "HKEY_LOCAL_MACHINE") {
        return @{
            hive = [Microsoft.Win32.RegistryHive]::LocalMachine
            name = "HKLM"
        }
    }
    if ($text -eq "HKCU" -or $text -eq "HKEY_CURRENT_USER") {
        return @{
            hive = [Microsoft.Win32.RegistryHive]::CurrentUser
            name = "HKCU"
        }
    }
    return $null
}

function Read-RegistryValueAcrossViews {
    param(
        [string]$Hive,
        [string]$SubKey,
        [string]$ValueName = ""
    )
    $items = New-Object System.Collections.ArrayList
    $hiveInfo = Resolve-RegistryHive $Hive
    if ($null -eq $hiveInfo) {
        return @()
    }
    foreach ($view in @(Get-RegistryViews)) {
        $baseKey = $null
        $key = $null
        try {
            $baseKey = [Microsoft.Win32.RegistryKey]::OpenBaseKey($hiveInfo.hive, $view)
            $key = $baseKey.OpenSubKey($SubKey)
            if ($null -eq $key) {
                continue
            }
            $rawValue = $key.GetValue($ValueName)
            $value = ""
            if ($null -ne $rawValue) {
                $value = [string]$rawValue
            }
            $items.Add(@{
                hive = [string]$hiveInfo.name
                subKey = [string]$SubKey
                valueName = [string]$ValueName
                value = $value
                view = [string]$view
                path = ([string]$hiveInfo.name + "\" + [string]$SubKey)
                exists = $true
            }) | Out-Null
        }
        catch {}
        finally {
            if ($key -ne $null) {
                try { $key.Close() } catch {}
            }
            if ($baseKey -ne $null) {
                try { $baseKey.Close() } catch {}
            }
        }
    }
    return @($items)
}

function Find-RegistryValue {
    param(
        [object[]]$Candidates,
        [string]$ValueName = ""
    )
    foreach ($candidate in @($Candidates)) {
        $hive = [string]$candidate.hive
        $subKey = [string]$candidate.subKey
        foreach ($hit in @(Read-RegistryValueAcrossViews -Hive $hive -SubKey $subKey -ValueName $ValueName)) {
            if (-not [string]::IsNullOrWhiteSpace([string]$hit.value)) {
                return $hit
            }
        }
    }
    return $null
}

function Add-UniqueText {
    param(
        [System.Collections.ArrayList]$List,
        [string]$Text
    )
    if ([string]::IsNullOrWhiteSpace($Text)) {
        return
    }
    $value = $Text.Trim()
    if (-not $List.Contains($value)) {
        $List.Add($value) | Out-Null
    }
}

function Get-VersionedProgIds {
    param([string]$ProgId)
    $items = New-Object System.Collections.ArrayList
    Add-UniqueText -List $items -Text $ProgId
    $versions = @("16", "15", "14", "12", "11")
    foreach ($version in $versions) {
        Add-UniqueText -List $items -Text ([string]$ProgId + "." + [string]$version)
    }
    return @($items)
}

function Get-AppPathBinary {
    param([string]$ExeName)
    $candidates = @(
        @{ hive = "HKCU"; subKey = "SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\$ExeName" },
        @{ hive = "HKLM"; subKey = "SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\$ExeName" },
        @{ hive = "HKLM"; subKey = "SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\$ExeName" }
    )
    $hit = Find-RegistryValue -Candidates $candidates -ValueName ""
    if ($null -ne $hit -and -not [string]::IsNullOrWhiteSpace([string]$hit.value)) {
        return $hit
    }
    return $null
}

function Get-ClickToRunRoots {
    $roots = New-Object System.Collections.ArrayList
    $candidates = @(
        @{ hive = "HKLM"; subKey = "SOFTWARE\Microsoft\Office\ClickToRun\Configuration" },
        @{ hive = "HKLM"; subKey = "SOFTWARE\WOW6432Node\Microsoft\Office\ClickToRun\Configuration" }
    )
    foreach ($name in @("InstallationPath", "ClientFolder")) {
        foreach ($hit in @(Read-RegistryValueAcrossViews -Hive "HKLM" -SubKey "SOFTWARE\Microsoft\Office\ClickToRun\Configuration" -ValueName $name)) {
            if (-not [string]::IsNullOrWhiteSpace([string]$hit.value)) {
                Add-UniqueText -List $roots -Text ([string]$hit.value)
            }
        }
        foreach ($hit in @(Read-RegistryValueAcrossViews -Hive "HKLM" -SubKey "SOFTWARE\WOW6432Node\Microsoft\Office\ClickToRun\Configuration" -ValueName $name)) {
            if (-not [string]::IsNullOrWhiteSpace([string]$hit.value)) {
                Add-UniqueText -List $roots -Text ([string]$hit.value)
            }
        }
    }
    return @($roots)
}

function Get-OfficeBinaryCandidates {
    param([string]$ExeName)
    $paths = New-Object System.Collections.ArrayList

    $appPath = Get-AppPathBinary $ExeName
    if ($null -ne $appPath) {
        Add-UniqueText -List $paths -Text ([string]$appPath.value)
    }

    foreach ($root in @(Get-ClickToRunRoots)) {
        foreach ($version in @("Office16", "Office15", "Office14", "Office12", "Office11")) {
            Add-UniqueText -List $paths -Text (Join-Path (Join-Path $root "root") (Join-Path $version $ExeName))
            Add-UniqueText -List $paths -Text (Join-Path $root (Join-Path $version $ExeName))
        }
    }

    $baseDirs = New-Object System.Collections.ArrayList
    Add-UniqueText -List $baseDirs -Text $env:ProgramFiles
    Add-UniqueText -List $baseDirs -Text ${env:ProgramFiles(x86)}
    foreach ($baseDir in @($baseDirs)) {
        foreach ($version in @("Office16", "Office15", "Office14", "Office12", "Office11")) {
            Add-UniqueText -List $paths -Text (Join-Path $baseDir (Join-Path "Microsoft Office\root" (Join-Path $version $ExeName)))
            Add-UniqueText -List $paths -Text (Join-Path $baseDir (Join-Path "Microsoft Office" (Join-Path $version $ExeName)))
        }
    }

    try {
        $whereOutput = & where.exe $ExeName 2>$null
        foreach ($line in @($whereOutput)) {
            Add-UniqueText -List $paths -Text ([string]$line)
        }
    }
    catch {}

    $existing = New-Object System.Collections.ArrayList
    foreach ($candidate in @($paths)) {
        try {
            if (-not [string]::IsNullOrWhiteSpace([string]$candidate) -and (Test-Path -LiteralPath ([string]$candidate))) {
                Add-UniqueText -List $existing -Text ([string]$candidate)
            }
        }
        catch {}
    }
    return @($existing)
}

function Get-BinaryFromLocalServer {
    param([string]$Value)
    $text = ([string]$Value).Trim()
    if ([string]::IsNullOrWhiteSpace($text)) {
        return ""
    }
    if ($text.StartsWith('"')) {
        $endQuote = $text.IndexOf('"', 1)
        if ($endQuote -gt 1) {
            return $text.Substring(1, $endQuote - 1)
        }
    }
    $exeIndex = $text.ToLowerInvariant().IndexOf(".exe")
    if ($exeIndex -ge 0) {
        return $text.Substring(0, $exeIndex + 4).Trim()
    }
    return $text
}

function Test-ComRegistration {
    param(
        [string]$ProgId,
        [string]$ExeName
    )
    $progIds = New-Object System.Collections.ArrayList
    foreach ($item in @(Get-VersionedProgIds $ProgId)) {
        Add-UniqueText -List $progIds -Text ([string]$item)
    }
    foreach ($curVerHit in @(Read-RegistryValueAcrossViews -Hive "HKCR" -SubKey ([string]$ProgId + "\CurVer") -ValueName "")) {
        Add-UniqueText -List $progIds -Text ([string]$curVerHit.value)
    }
    foreach ($curVerHit in @(Read-RegistryValueAcrossViews -Hive "HKLM" -SubKey ("SOFTWARE\Classes\" + [string]$ProgId + "\CurVer") -ValueName "")) {
        Add-UniqueText -List $progIds -Text ([string]$curVerHit.value)
    }
    foreach ($curVerHit in @(Read-RegistryValueAcrossViews -Hive "HKCU" -SubKey ("Software\Classes\" + [string]$ProgId + "\CurVer") -ValueName "")) {
        Add-UniqueText -List $progIds -Text ([string]$curVerHit.value)
    }

    $clsid = ""
    $progIdPath = ""
    $progIdView = ""
    $resolvedProgId = ""
    foreach ($candidateProgId in @($progIds)) {
        $progIdCandidates = @(
            @{ hive = "HKCR"; subKey = ([string]$candidateProgId + "\CLSID") },
            @{ hive = "HKLM"; subKey = ("SOFTWARE\Classes\" + [string]$candidateProgId + "\CLSID") },
            @{ hive = "HKCU"; subKey = ("Software\Classes\" + [string]$candidateProgId + "\CLSID") },
            @{ hive = "HKLM"; subKey = ("SOFTWARE\WOW6432Node\Classes\" + [string]$candidateProgId + "\CLSID") }
        )
        $hit = Find-RegistryValue -Candidates $progIdCandidates -ValueName ""
        if ($null -ne $hit) {
            $clsid = ([string]$hit.value).Trim()
            $progIdPath = [string]$hit.path
            $progIdView = [string]$hit.view
            $resolvedProgId = [string]$candidateProgId
            break
        }
    }

    $serverPath = ""
    $serverView = ""
    if (-not [string]::IsNullOrWhiteSpace($clsid)) {
        $serverCandidates = @(
            @{ hive = "HKCR"; subKey = ("CLSID\" + [string]$clsid + "\LocalServer32") },
            @{ hive = "HKLM"; subKey = ("SOFTWARE\Classes\CLSID\" + [string]$clsid + "\LocalServer32") },
            @{ hive = "HKCU"; subKey = ("Software\Classes\CLSID\" + [string]$clsid + "\LocalServer32") },
            @{ hive = "HKLM"; subKey = ("SOFTWARE\WOW6432Node\Classes\CLSID\" + [string]$clsid + "\LocalServer32") }
        )
        $serverHit = Find-RegistryValue -Candidates $serverCandidates -ValueName ""
        if ($null -ne $serverHit) {
            $serverPath = ([string]$serverHit.value).Trim()
            $serverView = [string]$serverHit.view
        }
    }

    $binaryCandidates = New-Object System.Collections.ArrayList
    $serverBinary = Get-BinaryFromLocalServer $serverPath
    if (-not [string]::IsNullOrWhiteSpace($serverBinary)) {
        Add-UniqueText -List $binaryCandidates -Text $serverBinary
    }
    foreach ($binary in @(Get-OfficeBinaryCandidates $ExeName)) {
        Add-UniqueText -List $binaryCandidates -Text ([string]$binary)
    }
    $binary = ""
    foreach ($candidate in @($binaryCandidates)) {
        try {
            if (-not [string]::IsNullOrWhiteSpace([string]$candidate) -and (Test-Path -LiteralPath ([string]$candidate))) {
                $binary = [string]$candidate
                break
            }
        }
        catch {}
    }

    return @{
        ok = -not [string]::IsNullOrWhiteSpace($clsid)
        progId = $ProgId
        resolvedProgId = $resolvedProgId
        clsid = $clsid
        progIdPath = $progIdPath
        progIdView = $progIdView
        localServer32 = $serverPath
        localServerView = $serverView
        defaultBinary = [string]$binary
        binaryCandidates = @($binaryCandidates)
    }
}

function Test-ComActivation {
    param(
        [string]$ProgId,
        [string]$Label,
        [string]$ProcessName
    )
    $app = $null
    $beforeIds = Get-ProcessIdSnapshot $ProcessName
    $newIds = @()
    $result = @{
        ok = $false
        detail = ""
        error = ""
        errorCode = ""
        createdProcess = $false
    }
    try {
        $app = New-Object -ComObject $ProgId
        $newIds = @(Get-NewProcessIds -Name $ProcessName -BeforeIds $beforeIds)
        $result.ok = $true
        $result.detail = ("COM activation succeeded for " + $ProgId)
        $result.createdProcess = (@($newIds).Count -gt 0)
        try { $app.DisplayAlerts = 0 } catch {}
    }
    catch {
        $err = $_.Exception
        $result.ok = $false
        $result.error = [string]$err.Message
        $result.errorCode = Get-HResultHex $err
        if ([string]::IsNullOrWhiteSpace($result.error)) {
            $result.error = ("COM activation failed for " + $ProgId)
        }
    }
    finally {
        if ($app -ne $null) {
            if ((@($newIds).Count -gt 0) -or (@($beforeIds).Count -eq 0)) {
                try { $app.Quit() } catch {}
                Start-Sleep -Milliseconds 500
                Stop-NewProcessIds -Ids $newIds -ExpectedName $ProcessName
            }
            try { [System.Runtime.Interopservices.Marshal]::ReleaseComObject($app) | Out-Null } catch {}
        }
        [System.GC]::Collect()
        [System.GC]::WaitForPendingFinalizers()
    }
    return $result
}

function Get-DwordOrNull {
    param(
        [string]$Path,
        [string]$Name
    )
    try {
        $value = (Get-ItemProperty -Path $Path -Name $Name -ErrorAction Stop).$Name
        if ($null -eq $value) { return $null }
        return [int]$value
    }
    catch {
        return $null
    }
}

$requiredRaw = @(Normalize-AppList $RequiredApps)
$required = New-Object System.Collections.ArrayList
foreach ($name in $requiredRaw) {
    $text = ([string]$name).Trim().ToLowerInvariant()
    if ($text -and -not $required.Contains($text)) {
        $required.Add($text) | Out-Null
    }
}
$requiredLookup = @{}
foreach ($name in $required) {
    $requiredLookup[$name] = $true
}

$definitions = @(
    @{
        key = "word"
        label = "Word"
        progId = "Word.Application"
        exeName = "WINWORD.EXE"
        processName = "WINWORD"
        addinsPath = "HKCU:\SOFTWARE\Microsoft\Office\Word\Addins"
        protectedViewPath = "HKCU:\SOFTWARE\Microsoft\Office\16.0\Word\Security\ProtectedView"
    },
    @{
        key = "powerpoint"
        label = "PowerPoint"
        progId = "PowerPoint.Application"
        exeName = "POWERPNT.EXE"
        processName = "POWERPNT"
        addinsPath = "HKCU:\SOFTWARE\Microsoft\Office\PowerPoint\Addins"
        protectedViewPath = "HKCU:\SOFTWARE\Microsoft\Office\16.0\PowerPoint\Security\ProtectedView"
    }
)

$apps = @{}

try {
    foreach ($definition in $definitions) {
        $key = [string]$definition.key
        $label = [string]$definition.label
        $progId = [string]$definition.progId
        $exeName = [string]$definition.exeName
        $processName = [string]$definition.processName
        $isRequired = $requiredLookup.ContainsKey($key)
        $probe = Test-ComRegistration -ProgId $progId -ExeName $exeName
        $activation = @{
            ok = $false
            detail = ""
            error = ""
            errorCode = ""
        }
        if (-not $probe.ok -and $isRequired) {
            $activation = Test-ComActivation -ProgId $progId -Label $label -ProcessName $processName
        }

        $comOk = ([bool]$probe.ok) -or ([bool]$activation.ok)
        if ($probe.ok) {
            $detail = "progId=" + [string]$probe.progId + " resolvedProgId=" + [string]$probe.resolvedProgId + " clsid=" + [string]$probe.clsid + " progIdView=" + [string]$probe.progIdView + " server=" + [string]$probe.localServer32 + " serverView=" + [string]$probe.localServerView
        }
        elseif ($activation.ok) {
            $detail = "registry missing, activation ok: " + [string]$activation.detail
        }
        else {
            $detail = "COM unavailable for " + [string]$probe.progId
            if (-not [string]::IsNullOrWhiteSpace([string]$activation.error)) {
                $detail = $detail + " activationError=" + [string]$activation.error
                if (-not [string]::IsNullOrWhiteSpace([string]$activation.errorCode)) {
                    $detail = $detail + " (" + [string]$activation.errorCode + ")"
                }
            }
        }

        $severity = "medium"
        $penalty = 0
        if ($isRequired) {
            $severity = "high"
            $penalty = 45
        }
        Add-Check ($key + "_com_available") $comOk $severity $detail $penalty
        if (-not $comOk) {
            if ($isRequired) {
                $blockExport = $true
                if (@($probe.binaryCandidates).Count -gt 0) {
                    $suggestions.Add(("office_binary_found_com_unavailable:" + $label)) | Out-Null
                }
                else {
                    $suggestions.Add(("office_install_or_repair:" + $label)) | Out-Null
                }
            }
            else {
                $warnings.Add(("office_app_missing_optional:" + $label)) | Out-Null
            }
        }
        elseif (-not $probe.ok -and $activation.ok) {
            $warnings.Add(("office_registry_missing_activation_ok:" + $label)) | Out-Null
        }

        $processCount = 0
        try {
            $processCount = @(Get-Process -Name $processName -ErrorAction SilentlyContinue).Count
        }
        catch {
            $processCount = 0
        }
        $processOk = $processCount -lt 8
        Add-Check ($key + "_process_pressure") $processOk "low" ("running_processes=" + [string]$processCount) 5
        if (-not $processOk) {
            $warnings.Add(("office_process_pressure:" + $label)) | Out-Null
        }

        $addinCount = 0
        $addinsPath = [string]$definition.addinsPath
        if (Test-Path $addinsPath) {
            try {
                $addinCount = (Get-ChildItem -Path $addinsPath -ErrorAction Stop | Measure-Object).Count
            }
            catch {
                $addinCount = 0
            }
        }
        $addinsSafe = $addinCount -lt 8
        Add-Check ($key + "_addins_count") $addinsSafe "medium" ("registered_addins=" + [string]$addinCount) 8
        if (-not $addinsSafe) {
            $warnings.Add(("office_addins_pressure:" + $label)) | Out-Null
            $suggestions.Add(("office_disable_unneeded_addins:" + $label)) | Out-Null
        }

        $pvPath = [string]$definition.protectedViewPath
        $pvInternet = Get-DwordOrNull -Path $pvPath -Name "DisableInternetFilesInPV"
        $pvUnsafe = Get-DwordOrNull -Path $pvPath -Name "DisableUnsafeLocationsInPV"
        $pvOutlook = Get-DwordOrNull -Path $pvPath -Name "DisableAttachmentsInPV"
        Add-Check ($key + "_protected_view_policy") $true "low" ("internet=" + [string]$pvInternet + " unsafe=" + [string]$pvUnsafe + " outlook=" + [string]$pvOutlook) 0

        $apps[$key] = @{
            required = $isRequired
            ok = [bool]$comOk
            label = $label
            progId = $progId
            resolvedProgId = [string]$probe.resolvedProgId
            clsid = [string]$probe.clsid
            progIdPath = [string]$probe.progIdPath
            progIdView = [string]$probe.progIdView
            localServer32 = [string]$probe.localServer32
            localServerView = [string]$probe.localServerView
            defaultBinary = [string]$probe.defaultBinary
            binaryCandidates = @($probe.binaryCandidates)
            activationOk = [bool]$activation.ok
            activationDetail = [string]$activation.detail
            activationError = [string]$activation.error
            activationErrorCode = [string]$activation.errorCode
            activationCreatedProcess = [bool]$activation.createdProcess
            runningProcesses = $processCount
            addinsCount = $addinCount
        }
    }

    $officeCache = Join-Path $env:LOCALAPPDATA "Microsoft\Office"
    $cacheExists = Test-Path $officeCache
    $cacheDetail = "Office cache directory is missing"
    if ($cacheExists) {
        $cacheDetail = [string]$officeCache
    }
    Add-Check "office_cache_exists" $cacheExists "medium" $cacheDetail 5
    if (-not $cacheExists) {
        $warnings.Add("office_cache_missing") | Out-Null
        $suggestions.Add("office_first_run_required") | Out-Null
    }

    if ($required.Count -eq 0) {
        $actions.Add("office_required_apps_empty_light_check") | Out-Null
    }
    elseif (-not $blockExport) {
        $actions.Add("office_required_apps_ok") | Out-Null
    }
}
catch {
    $warnings.Add($_.Exception.Message) | Out-Null
    $score = [Math]::Max(0, $score - 20)
}

if ($score -lt 35 -and $required.Count -gt 0) {
    $blockExport = $true
}

$result = @{
    ok = -not $blockExport
    engine = "office"
    blockExport = $blockExport
    score = $score
    requiredApps = $required
    light = [bool]$Light
    apps = $apps
    checks = $checks
    warnings = $warnings
    suggestions = $suggestions
    actions = $actions
}

$result | ConvertTo-Json -Compress -Depth 8
