param(
    [Parameter(Mandatory = $true)][string]$TaskFile
)

$word = $null
$results = @()

try {
    $tasks = Get-Content $TaskFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($tasks -isnot [System.Collections.IList]) {
        $tasks = @($tasks)
    }

    if ($tasks.Count -eq 0) {
        Write-Output "[]"
        exit 0
    }

    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0

    foreach ($task in $tasks) {
        $doc = $null
        try {
            $doc = $word.Documents.Open($task.input, $false, $true)
            $doc.ExportAsFixedFormat($task.output, 17, $false, 0)
            $results += @{ id = $task.id; input = $task.input; ok = $true; error = "" }
        }
        catch {
            $results += @{ id = $task.id; input = $task.input; ok = $false; error = $_.Exception.Message }
        }
        finally {
            if ($doc -ne $null) {
                try { $doc.Close($false) } catch { }
                [System.Runtime.Interopservices.Marshal]::ReleaseComObject($doc) | Out-Null
            }
        }
    }
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}
finally {
    if ($word -ne $null) {
        try { $word.Quit() } catch { }
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
    }
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}

$results | ConvertTo-Json -Compress
