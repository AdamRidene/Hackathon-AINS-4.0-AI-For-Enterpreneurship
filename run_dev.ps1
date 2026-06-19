# Firasa — dev launcher
# Starts the FastAPI backend and Vite frontend in separate console windows.
# Usage: .\run_dev.ps1 [-Provider ollama|huggingface|stub]

param(
    [ValidateSet("ollama","huggingface","stub")]
    [string]$Provider = "stub"
)

$Root    = $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"

# ── Verify required tools ────────────────────────────────────────────────────

foreach ($cmd in @("python","npm")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Error "'$cmd' not found on PATH. Please install it and retry."
        exit 1
    }
}

# ── Backend window ───────────────────────────────────────────────────────────

$backendCmd = @"
cd '$Backend'
`$env:FIRASA_LLM_PROVIDER = '$Provider'
if (Test-Path '.env') { Get-Content '.env' | ForEach-Object { if (`$_ -match '^([^#=]+)=(.*)') { [System.Environment]::SetEnvironmentVariable(`$matches[1].Trim(), `$matches[2].Trim()) } } }
Write-Host '==> Backend starting (provider: $Provider)' -ForegroundColor Cyan
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd

# ── Frontend window ──────────────────────────────────────────────────────────

$frontendCmd = @"
cd '$Frontend'
Write-Host '==> Frontend starting' -ForegroundColor Cyan
npm run dev
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd

# ── Summary ──────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  Firasa dev servers launching..." -ForegroundColor Yellow
Write-Host "  Backend  →  http://localhost:8000" -ForegroundColor Green
Write-Host "  Frontend →  http://localhost:5173" -ForegroundColor Green
Write-Host "  LLM provider: $Provider" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Close the two new PowerShell windows to stop the servers." -ForegroundColor DarkGray
Write-Host ""
