# Firasa dev launcher
# Starts the FastAPI backend and Vite frontend in separate console windows.
# Usage: .\run_dev.ps1 [-Provider ollama|huggingface|openai|groq|deepseek|gemini|stub]

param(
    [ValidateSet("ollama", "huggingface", "openai", "groq", "deepseek", "gemini", "stub")]
    [string]$Provider = "stub"
)

$Root = $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"

function Import-EnvFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
        ,
        [switch]$OnlyIfMissing
    )

    if (-not (Test-Path $Path)) {
        return
    }

    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#")) {
            return
        }

        $eq = $line.IndexOf("=")
        if ($eq -lt 1) {
            return
        }

        $name = $line.Substring(0, $eq).Trim()
        $value = $line.Substring($eq + 1).Trim()

        if (
            $value.Length -ge 2 -and (
                ($value.StartsWith('"') -and $value.EndsWith('"')) -or
                ($value.StartsWith("'") -and $value.EndsWith("'"))
            )
        ) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        if ($OnlyIfMissing -and -not [string]::IsNullOrWhiteSpace([System.Environment]::GetEnvironmentVariable($name))) {
            return
        }

        [System.Environment]::SetEnvironmentVariable($name, $value)
    }
}

# Verify required tools.
foreach ($cmd in @("python", "npm")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Error "'$cmd' not found on PATH. Please install it and retry."
        exit 1
    }
}

# Load environment files first so the explicit -Provider flag always wins.
Import-EnvFile (Join-Path $Root ".env")
Import-EnvFile (Join-Path $Backend ".env")
Import-EnvFile (Join-Path $Root ".env.example") -OnlyIfMissing
Import-EnvFile (Join-Path $Backend ".env.example") -OnlyIfMissing
[System.Environment]::SetEnvironmentVariable("FIRASA_LLM_PROVIDER", $Provider)

$backendScript = Join-Path $env:TEMP "firasa_backend_$PID.ps1"
@"
Set-Location '$Backend'
`$env:FIRASA_LLM_PROVIDER = '$Provider'

function Import-EnvFile {
    param([string]`$Path, [switch]`$OnlyIfMissing)
    if (-not (Test-Path `$Path)) { return }
    Get-Content `$Path | ForEach-Object {
        `$line = `$_.Trim()
        if ([string]::IsNullOrWhiteSpace(`$line) -or `$line.StartsWith('#')) { return }
        `$eq = `$line.IndexOf('=')
        if (`$eq -lt 1) { return }
        `$name = `$line.Substring(0, `$eq).Trim()
        `$value = `$line.Substring(`$eq + 1).Trim()
        `$dq = [char]34
        `$sq = [char]39
        if (`$value.Length -ge 2 -and ((`$value[0] -eq `$dq -and `$value[-1] -eq `$dq) -or (`$value[0] -eq `$sq -and `$value[-1] -eq `$sq))) {
            `$value = `$value.Substring(1, `$value.Length - 2)
        }
        if (`$OnlyIfMissing -and -not [string]::IsNullOrWhiteSpace([System.Environment]::GetEnvironmentVariable(`$name))) { return }
        [System.Environment]::SetEnvironmentVariable(`$name, `$value)
    }
}

Import-EnvFile (Join-Path '$Backend' '..\\.env')
Import-EnvFile (Join-Path '$Backend' '.env')
Import-EnvFile (Join-Path '$Backend' '..\\.env.example') -OnlyIfMissing
Import-EnvFile (Join-Path '$Backend' '.env.example') -OnlyIfMissing
`$env:FIRASA_LLM_PROVIDER = '$Provider'

Write-Host '==> Backend starting (provider: $Provider)' -ForegroundColor Cyan
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
"@ | Set-Content -Path $backendScript -Encoding utf8

Start-Process powershell -ArgumentList "-NoExit", "-File", $backendScript

$frontendCmd = @"
cd '$Frontend'
Write-Host '==> Frontend starting' -ForegroundColor Cyan
npm run dev
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd

Write-Host ""
Write-Host "  Firasa dev servers launching..." -ForegroundColor Yellow
Write-Host "  Backend  ->  http://localhost:8000" -ForegroundColor Green
Write-Host "  Frontend ->  http://localhost:5173" -ForegroundColor Green
Write-Host "  LLM provider: $Provider" -ForegroundColor Cyan

switch ($Provider) {
    "groq" {
        if (-not ($env:FIRASA_GROQ_API_KEY -or $env:GROQ_API_KEY)) {
            Write-Host "  Warning: FIRASA_GROQ_API_KEY is missing." -ForegroundColor DarkYellow
        }
        Write-Host "  Groq endpoint: https://api.groq.com/openai/v1" -ForegroundColor DarkCyan
    }
    "openai" {
        if (-not ($env:FIRASA_OPENAI_API_KEY -or $env:OPENAI_API_KEY)) {
            Write-Host "  Warning: FIRASA_OPENAI_API_KEY is missing." -ForegroundColor DarkYellow
        }
        Write-Host "  OpenAI-compatible endpoint: from .env settings" -ForegroundColor DarkCyan
    }
    "deepseek" {
        if (-not $env:FIRASA_DEEPSEEK_API_KEY) {
            Write-Host "  Warning: FIRASA_DEEPSEEK_API_KEY is missing." -ForegroundColor DarkYellow
        }
        Write-Host "  DeepSeek endpoint: https://api.deepseek.com" -ForegroundColor DarkCyan
    }
    "huggingface" {
        if (-not $env:FIRASA_HF_TOKEN) {
            Write-Host "  Warning: FIRASA_HF_TOKEN is missing." -ForegroundColor DarkYellow
        }
        Write-Host "  Hugging Face Inference API is enabled." -ForegroundColor DarkCyan
    }
    "gemini" {
        if (-not $env:FIRASA_GEMINI_API_KEY) {
            Write-Host "  Warning: FIRASA_GEMINI_API_KEY is missing." -ForegroundColor DarkYellow
        }
        Write-Host "  Gemini API is enabled." -ForegroundColor DarkCyan
    }
    "ollama" {
        $ollamaHost = $env:FIRASA_OLLAMA_HOST
        if (-not $ollamaHost) {
            $ollamaHost = "http://localhost:11434"
        }
        Write-Host "  Ollama host: $ollamaHost" -ForegroundColor DarkCyan
    }
}

if (-not ($env:FIRASA_COHERE_API_KEY -or $env:COHERE_API_KEY)) {
    Write-Host "  Cohere embeddings: not configured, using local fallback when available." -ForegroundColor DarkYellow
} else {
    Write-Host "  Cohere embeddings: enabled." -ForegroundColor DarkCyan
}

Write-Host ""
Write-Host "  Close the two new PowerShell windows to stop the servers." -ForegroundColor DarkGray
Write-Host ""
