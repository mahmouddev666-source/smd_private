# ---------------------------------------------------------------------------
# SMD-HR — Phase 2 verification (ONLYOFFICE infrastructure).
#
# READ-ONLY: it never starts, stops, recreates or deletes anything. It only
# inspects the running stack and writes one report file you can send back.
#
# Usage (from any folder, on the machine that runs Docker):
#   powershell -ExecutionPolicy Bypass -File infra\scripts\verify-phase2.ps1
#
# Prerequisites: Docker Desktop/Engine with the stack already up:
#   docker compose up -d --build
# ---------------------------------------------------------------------------
#requires -Version 5.1

$ErrorActionPreference = 'Continue'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $repoRoot

$stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
$report = Join-Path $env:TEMP "smd-phase2-verification-$stamp.txt"
$lines  = New-Object System.Collections.Generic.List[string]

function Write-Raw {
    param([string]$Text = '')
    $lines.Add($Text) | Out-Null
    Write-Host $Text
}

function Write-Section {
    param([string]$Title)
    Write-Raw ''
    Write-Raw ('=' * 78)
    Write-Raw "## $Title"
    Write-Raw ('=' * 78)
}

# Runs a command, captures stdout+stderr, always returns the text (never throws).
function Invoke-Capture {
    param([string]$Command)
    try {
        $text = (Invoke-Expression $Command 2>&1 | Out-String).Trim()
        if ([string]::IsNullOrWhiteSpace($text)) { return '' }
        return $text
    } catch {
        return "ERROR: $($_.Exception.Message)"
    }
}

function Invoke-Check {
    param([string]$Title, [string]$Command)
    Write-Section $Title
    Write-Raw "> $Command"
    $result = Invoke-Capture $Command
    Write-Raw $(if ($result -eq '') { '(no output)' } else { $result })
    return $result
}

Write-Raw "SMD-HR — Phase 2 verification report"
Write-Raw "generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"
Write-Raw "folder   : $repoRoot"
Write-Raw "machine  : $env:COMPUTERNAME"

# ---------------------------------------------------------------------------
# 0) Environment
# ---------------------------------------------------------------------------
Invoke-Check '0.1 Docker client/server' 'docker version' | Out-Null
Invoke-Check '0.2 Docker Compose' 'docker compose version' | Out-Null
Invoke-Check '0.3 Repo revision' 'git rev-parse --short HEAD' | Out-Null

# ---------------------------------------------------------------------------
# 1) Compose model (syntax, interpolation, dependencies)
# ---------------------------------------------------------------------------
$composeOut = Invoke-Check '1.1 docker compose config' 'docker compose config --quiet'
$composeOk  = ([string]::IsNullOrWhiteSpace($composeOut))
Write-Raw $(if ($composeOk) { 'OK: compose model is valid' } else { 'FAILED: see output above' })

Invoke-Check '1.2 Services and state' 'docker compose ps' | Out-Null

# ---------------------------------------------------------------------------
# 2) Container health
# ---------------------------------------------------------------------------
$health = (Invoke-Capture "docker inspect --format '{{.State.Health.Status}}' smd-hr-onlyoffice").Trim()
$state  = (Invoke-Capture "docker inspect --format '{{.State.Status}}' smd-hr-onlyoffice").Trim()
Write-Section '2.1 onlyoffice state'
Write-Raw "state=$state  health=$health"

$insideHealth = ''
if ($health -ne 'healthy') {
    Invoke-Check '2.2 onlyoffice logs (last 40 lines)' 'docker compose logs --tail=40 onlyoffice' | Out-Null
    Write-Raw ''
    Write-Raw 'NOTE: container is not healthy yet. First start needs 2-5 minutes'
    Write-Raw '      (DS database init + font list generation). Re-run after it settles.'
} else {
    $insideHealth = (Invoke-Capture 'docker compose exec -T onlyoffice curl -fsS http://127.0.0.1/healthcheck').Trim()
    Write-Section '2.2 healthcheck inside the container'
    Write-Raw $(if ($insideHealth -eq '') { '(no output)' } else { $insideHealth })
}

# ---------------------------------------------------------------------------
# 3) Same-origin proxy through nginx (the browser path)
# ---------------------------------------------------------------------------
$proxyHealth = (Invoke-Capture 'curl.exe -fsS http://localhost/onlyoffice/healthcheck').Trim()
Write-Section '3.1 /onlyoffice/healthcheck via nginx'
Write-Raw $(if ($proxyHealth -eq '') { '(no output — is WEB_PORT 80?)' } else { $proxyHealth })

Invoke-Check '3.2 /onlyoffice without trailing slash' 'curl.exe -sSI http://localhost/onlyoffice | Select-Object -First 3' | Out-Null
Invoke-Check '3.3 editor API asset headers' 'curl.exe -sSI http://localhost/onlyoffice/web-apps/apps/api/documents/api.js | Select-Object -First 8' | Out-Null
Invoke-Check '3.4 editor example page status' 'curl.exe -sS -o NUL -w "HTTP %{http_code}" http://localhost/onlyoffice/example/' | Out-Null

# ---------------------------------------------------------------------------
# 4) Arabic fonts inside the DS image
# ---------------------------------------------------------------------------
$cairoList = (Invoke-Capture "docker compose exec -T onlyoffice fc-list | Select-String -Pattern 'Cairo'").Trim()
Write-Section '4.1 fontconfig Cairo faces'
Write-Raw $(if ($cairoList -eq '') { '(none found)' } else { $cairoList })

$allFonts = (Invoke-Capture 'docker compose exec -T onlyoffice sh -lc "grep -c -i cairo /var/www/onlyoffice/documentserver/sdkjs/common/AllFonts.js || true"').Trim()
Write-Section '4.2 Cairo entries in AllFonts.js'
Write-Raw $(if ($allFonts -eq '') { '(no output)' } else { $allFonts })

# ---------------------------------------------------------------------------
# 5) Isolation (no published port, internal network, DNS reachability)
# ---------------------------------------------------------------------------
$published = (Invoke-Capture 'docker compose port onlyoffice 80').Trim()
Write-Section '5.1 published ports for onlyoffice'
Write-Raw $(if ($published -eq '') { '(none — expected)' } else { $published })

Invoke-Check '5.2 container port mappings' "docker inspect --format '{{json .NetworkSettings.Ports}}' smd-hr-onlyoffice" | Out-Null
$networkInternal = (Invoke-Capture "docker network inspect smd-hr_office_internal --format '{{.Internal}}'").Trim()
Write-Section '5.3 office_internal.Internal'
Write-Raw $(if ($networkInternal -eq '') { '(network not found)' } else { $networkInternal })

$apiDns = (Invoke-Capture 'docker compose exec -T onlyoffice getent hosts api').Trim()
$dbDns  = (Invoke-Capture 'docker compose exec -T onlyoffice getent hosts db').Trim()
Write-Section '5.4 DNS from the editor container'
Write-Raw "api → $(if ($apiDns -eq '') { '(not resolved — BAD)' } else { $apiDns })"
Write-Raw "db  → $(if ($dbDns  -eq '') { '(not resolved — expected)' } else { "$dbDns  ← UNEXPECTED" })"

# ---------------------------------------------------------------------------
# 6) Optional visual check reminder
# ---------------------------------------------------------------------------
Write-Section '6. Manual check required (not scriptable)'
Write-Raw 'Open http://localhost/onlyoffice/example/ in a browser and confirm the'
Write-Raw 'ONLYOFFICE samples page renders fully (no blank page, no 404s for'
Write-Raw 'assets under /onlyoffice/...). Attach a screenshot to the report.'

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
$checks = [ordered]@{
    'compose model valid'            = $composeOk
    'onlyoffice healthy'             = ($health -eq 'healthy')
    'healthcheck inside container'   = ($insideHealth -eq 'true')
    'healthcheck via nginx'          = ($proxyHealth -eq 'true')
    'Cairo in fc-list'               = ($cairoList -match 'Cairo:style=')
    'Cairo in AllFonts.js'           = (($allFonts -match '^\d+$') -and ([int]$allFonts -gt 0))
    'no published port'              = ($published -eq '')
    'office_internal internal=true'  = ($networkInternal -eq 'true')
    'api resolvable from editor'     = ($apiDns -match '\d+\.\d+\.\d+\.\d+')
    'db NOT resolvable from editor'  = ($dbDns -eq '')
}

Write-Section 'SUMMARY'
foreach ($key in $checks.Keys) {
    $mark = if ($checks[$key]) { 'PASS' } else { 'FAIL' }
    Write-Raw ("[{0}] {1}" -f $mark, $key)
}
$passed = @($checks.Values | Where-Object { $_ }).Count
Write-Raw ''
Write-Raw ("RESULT: {0}/{1} automated checks passed" -f $passed, $checks.Count)

Set-Content -Path $report -Value $lines -Encoding UTF8
Write-Host ''
Write-Host "Report written to: $report"
Write-Host 'Send this file back (it contains no secrets, only status output).'
