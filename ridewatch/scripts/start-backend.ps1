[CmdletBinding()]
param()

$backendPath = Join-Path $PSScriptRoot "..\backend"
$pythonPath = Join-Path $backendPath ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $pythonPath -PathType Leaf)) {
    throw "Backend virtual environment missing. Follow the README local setup first."
}
. (Join-Path $PSScriptRoot "load-env.ps1")
Push-Location $backendPath
try {
    & $pythonPath -m uvicorn app.main:app --reload --port 8000
}
finally {
    Pop-Location
}
