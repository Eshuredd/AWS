# Dot-source this script: . .\scripts\load-env.ps1
[CmdletBinding()]
param(
    [string]$EnvFile = (Join-Path $PSScriptRoot "..\backend\.env")
)

if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
    throw "Environment file not found: $EnvFile. Copy backend/.env.example to backend/.env first."
}

foreach ($line in Get-Content -LiteralPath $EnvFile -Encoding UTF8) {
    if ($line -match '^\s*(#|$)') { continue }
    if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') {
        throw "Invalid environment entry. Expected KEY=value."
    }
    $key = $Matches[1]
    $value = $Matches[2].Trim()
    if ($value.Length -ge 2 -and (
        ($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'"))
    )) {
        $value = $value.Substring(1, $value.Length - 2)
    }
    # Process environment updates persist when this helper is dot-sourced.
    [Environment]::SetEnvironmentVariable($key, $value, 'Process')
}
