# Exam Solver AI Gateway - Build Script
# Creates a distributable package (portable folder)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$BuildDir = Join-Path $ProjectRoot "dist"
$OutputDir = Join-Path $BuildDir "exam-solver-gateway"
$Version = (Get-Content (Join-Path $ProjectRoot "package.json") | ConvertFrom-Json).version

Write-Host ""
Write-Host "  Building Exam Solver AI Gateway v$Version" -ForegroundColor Cyan
Write-Host ""

# Step 1: Clean previous build
Write-Host "  [1/5] Cleaning previous build..." -ForegroundColor Yellow
if (Test-Path $BuildDir) { Remove-Item -Recurse -Force $BuildDir }

# Step 2: Build Next.js (already built, skip if .next exists)
$nextDir = Join-Path $ProjectRoot ".next"
if (-not (Test-Path (Join-Path $nextDir "standalone"))) {
    Write-Host "  [2/5] Building Next.js (standalone)..." -ForegroundColor Yellow
    Push-Location $ProjectRoot
    $env:NODE_ENV = "production"
    npm run build 2>&1 | Out-Null
    Pop-Location
    Write-Host "  OK - Next.js build complete" -ForegroundColor Green
} else {
    Write-Host "  [2/5] Next.js build already exists, skipping..." -ForegroundColor Green
}

# Step 3: Assemble distribution folder
Write-Host "  [3/5] Assembling distribution folder..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

# Copy standalone server
Copy-Item -Path (Join-Path $ProjectRoot ".next\standalone\*") -Destination $OutputDir -Recurse -Force

# Copy static files
$staticSrc = Join-Path $ProjectRoot ".next\static"
$staticDest = Join-Path $OutputDir ".next\static"
if (Test-Path $staticSrc) {
    New-Item -ItemType Directory -Path $staticDest -Force | Out-Null
    Copy-Item -Path "$staticSrc\*" -Destination $staticDest -Recurse -Force
}

# Copy public folder
$publicSrc = Join-Path $ProjectRoot "public"
$publicDest = Join-Path $OutputDir "public"
if (Test-Path $publicSrc) {
    New-Item -ItemType Directory -Path $publicDest -Force | Out-Null
    Copy-Item -Path "$publicSrc\*" -Destination $publicDest -Recurse -Force
}

# Copy server-entry.js and package.json
Copy-Item -Path (Join-Path $ProjectRoot "server-entry.js") -Destination $OutputDir -Force
Copy-Item -Path (Join-Path $ProjectRoot "package.json") -Destination $OutputDir -Force

# Copy .env
$envFile = Join-Path $ProjectRoot ".env"
if (Test-Path $envFile) {
    Copy-Item -Path $envFile -Destination (Join-Path $OutputDir ".env") -Force
}

# Create data directory
New-Item -ItemType Directory -Path (Join-Path $OutputDir "data") -Force | Out-Null

Write-Host "  OK - Distribution folder assembled" -ForegroundColor Green

# Step 4: Create launcher .bat
Write-Host "  [4/5] Creating launcher..." -ForegroundColor Yellow

@"
@echo off
title Exam Solver AI Gateway v$Version
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please install from https://nodejs.org/
    pause
    exit /b 1
)
node server-entry.js %*
"@ | Set-Content -Path (Join-Path $OutputDir "ExamSolverGateway.bat") -Encoding ASCII

Write-Host "  OK - Launcher created" -ForegroundColor Green

# Step 5: Create ZIP archive
Write-Host "  [5/5] Creating ZIP archive..." -ForegroundColor Yellow
$zipPath = Join-Path $BuildDir "exam-solver-gateway-v${Version}-win-x64.zip"
Compress-Archive -Path $OutputDir -DestinationPath $zipPath -Force
$zipSize = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
Write-Host "  OK - ZIP created: $zipPath (${zipSize}MB)" -ForegroundColor Green

# Done
Write-Host ""
Write-Host "  BUILD COMPLETE!" -ForegroundColor Green
Write-Host "  Output: $OutputDir" -ForegroundColor White
Write-Host "  ZIP:    $zipPath" -ForegroundColor White
Write-Host ""
