[CmdletBinding()]
param([string]$Python)
$ErrorActionPreference = "Stop"
if (-not $Python) {
    $Python = Join-Path $PSScriptRoot "..\backend\.venv\Scripts\python.exe"
    if (-not (Test-Path -LiteralPath $Python)) { $Python = "python" }
}
& $Python (Join-Path $PSScriptRoot "build_lambda.py")
if ($LASTEXITCODE -ne 0) { throw "Lambda packaging failed. No deployment was attempted." }
