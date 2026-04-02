# Exam Solver AI Gateway - Desktop Build Script
# Creates a Windows installer (.exe) using Electron Builder

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$Version = (Get-Content (Join-Path $ProjectRoot "package.json") | ConvertFrom-Json).version

Write-Host ""
Write-Host "  Building Exam Solver Gateway Desktop v$Version" -ForegroundColor Cyan
Write-Host ""

# ─── Step 1: Build Next.js ────────────────────────────────────
$nextDir = Join-Path $ProjectRoot ".next"
$standaloneDir = Join-Path $nextDir "standalone"

if (-not (Test-Path $standaloneDir)) {
    Write-Host "  [1/3] Building Next.js (standalone)..." -ForegroundColor Yellow
    Push-Location $ProjectRoot
    $env:NODE_ENV = "production"
    npm run build 2>&1 | Out-Null
    Pop-Location
    
    if (-not (Test-Path $standaloneDir)) {
        Write-Host "  FAIL - Next.js build failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "  OK - Next.js build complete" -ForegroundColor Green
} else {
    Write-Host "  [1/3] Next.js standalone build exists, skipping..." -ForegroundColor Green
}

# ─── Step 2: Verify required files ───────────────────────────
Write-Host "  [2/3] Verifying files..." -ForegroundColor Yellow

$requiredFiles = @(
    "electron-main.js",
    "electron-preload.js",
    "package.json",
    "assets/icon.png"
)

foreach ($file in $requiredFiles) {
    $filePath = Join-Path $ProjectRoot $file
    if (-not (Test-Path $filePath)) {
        Write-Host "  FAIL - Missing: $file" -ForegroundColor Red
        exit 1
    }
}

# Verify standalone has server.js
$serverJs = Join-Path $standaloneDir "server.js"
if (-not (Test-Path $serverJs)) {
    Write-Host "  FAIL - Missing: .next/standalone/server.js" -ForegroundColor Red
    exit 1
}

Write-Host "  OK - All files verified" -ForegroundColor Green

# ─── Step 3: Build Electron ──────────────────────────────────
Write-Host "  [3/3] Building Electron installer..." -ForegroundColor Yellow
Write-Host "         This may take a few minutes..." -ForegroundColor DarkGray

Push-Location $ProjectRoot

# Set GH_TOKEN for auto-update publish (required for --publish always)
# Usage: $env:GH_TOKEN = "your_github_pat"; .\build-desktop.ps1
if (-not $env:GH_TOKEN) {
    Write-Host "  WARNING: GH_TOKEN not set. Run: `$env:GH_TOKEN = 'your_token'" -ForegroundColor Yellow
    Write-Host "           Build will continue but won't publish to GitHub." -ForegroundColor DarkGray
}

# Run electron-builder
npx electron-builder --win --publish always 2>&1

Pop-Location

# ─── Done ────────────────────────────────────────────────────
$outputDir = Join-Path $ProjectRoot "dist\desktop"
if (Test-Path $outputDir) {
    Write-Host ""
    Write-Host "  BUILD COMPLETE!" -ForegroundColor Green
    Write-Host ""
    
    # List output files
    Get-ChildItem -Path $outputDir -Filter "*.exe" | ForEach-Object {
        $sizeMB = [math]::Round($_.Length / 1MB, 1)
        Write-Host "  EXE: $($_.FullName) (${sizeMB}MB)" -ForegroundColor White
    }
    
    Get-ChildItem -Path $outputDir -Filter "*.yml" | ForEach-Object {
        Write-Host "  YML: $($_.FullName)" -ForegroundColor DarkGray
    }
    
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "  Build may have failed - check output above" -ForegroundColor Yellow
    Write-Host ""
}
