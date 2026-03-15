<#
.SYNOPSIS
    End-to-end Vision UI review runner for Pill O-Clock.

.DESCRIPTION
    Orchestrates the full vision review workflow:
      1. Captures screenshots via ADB (or uses existing ones)
      2. Runs automated AI analysis + issue creation (-Auto)
         OR prints instructions for manual @vision-reviewer agent usage

    Modes:
      -Auto       Fully automated: captures, analyzes via GitHub Models API,
                  creates issues. Requires GITHUB_TOKEN env var.
      (default)   Captures screenshots and tells you to invoke @vision-reviewer
                  in Copilot Chat manually.

.PARAMETER ScreenshotDir
    Path to existing screenshots directory. If omitted, runs capture first.

.PARAMETER SkipCapture
    Skip the ADB capture step and use existing screenshots.

.PARAMETER Auto
    Run the fully automated pipeline via GitHub Models API (vision-review.mjs).
    Requires GITHUB_TOKEN environment variable with models:read + repo scopes.

.PARAMETER DryRun
    When used with -Auto, analyze but don't create GitHub issues.

.PARAMETER Model
    AI model ID for the GitHub Models API (default: openai/gpt-4.1).
    Use 'node scripts/vision-review.mjs --list-models' to see available models.

.PARAMETER Mode
    Theme mode: "light", "dark", or "both". Passed to capture script.

.PARAMETER SkipBuild
    Skip building and installing the app. Passed to capture script.

.PARAMETER SkipSeed
    Skip seed data import. Passed to capture script.

.PARAMETER SeedFile
    Path to a backup JSON file. Passed to capture script.

.EXAMPLE
    .\scripts\run-vision-review.ps1 -Auto
    .\scripts\run-vision-review.ps1 -Auto -SkipCapture -DryRun
    .\scripts\run-vision-review.ps1 -Auto -Model "openai/gpt-5-mini"
    .\scripts\run-vision-review.ps1 -Auto -SkipBuild -SkipSeed
    .\scripts\run-vision-review.ps1 -SkipCapture
#>

[CmdletBinding()]
param(
    [string]$ScreenshotDir,
    [switch]$SkipCapture,
    [switch]$SkipBuild,
    [switch]$SkipSeed,
    [string]$SeedFile,
    [switch]$Auto,
    [switch]$DryRun,
    [string]$Model,
    [ValidateSet("light", "dark", "both")]
    [string]$Mode = "both"
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$CaptureScript = Join-Path $ScriptDir "capture-screenshots.ps1"
$VisionScript = Join-Path $ScriptDir "vision-review.mjs"

$totalSteps = if ($Auto) { 3 } else { 2 }

Write-Host ""
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "  Pill O-Clock -- Vision UI Review Runner" -ForegroundColor Magenta
if ($Auto) {
    Write-Host "  Mode: FULLY AUTOMATED (GitHub Models API)" -ForegroundColor Cyan
} else {
    Write-Host "  Mode: MANUAL (use @vision-reviewer agent)" -ForegroundColor Yellow
}
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host ""

# --- Step 1: Capture screenshots ---

if (-not $SkipCapture) {
    Write-Host "[Step 1/$totalSteps] Capturing screenshots..." -ForegroundColor White

    if ([string]::IsNullOrWhiteSpace($ScreenshotDir)) {
        $timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
        $ScreenshotDir = Join-Path (Join-Path $ProjectRoot "screenshots") $timestamp
    }

    & $CaptureScript -OutputDir $ScreenshotDir -Mode $Mode -SkipBuild:$SkipBuild -SkipSeed:$SkipSeed -SeedFile $SeedFile

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Screenshot capture failed. You can run manually or use -SkipCapture with existing screenshots."
        exit 1
    }
}
else {
    Write-Host "[Step 1/$totalSteps] Skipping capture (using existing screenshots)" -ForegroundColor DarkGray

    if ([string]::IsNullOrWhiteSpace($ScreenshotDir)) {
        $screenshotsBase = Join-Path $ProjectRoot "screenshots"
        if (Test-Path $screenshotsBase) {
            $latest = Get-ChildItem -Path $screenshotsBase -Directory |
                Sort-Object Name -Descending |
                Select-Object -First 1
            if ($latest) {
                $ScreenshotDir = $latest.FullName
                Write-Host "  Using latest: $ScreenshotDir" -ForegroundColor Green
            }
        }

        if ([string]::IsNullOrWhiteSpace($ScreenshotDir) -or -not (Test-Path $ScreenshotDir)) {
            Write-Error "No screenshot directory found. Run without -SkipCapture or specify -ScreenshotDir."
            exit 1
        }
    }
}

# --- Step 2: List screenshots ---

$stepNum = 2
Write-Host ""
Write-Host "[Step $stepNum/$totalSteps] Preparing audit..." -ForegroundColor White

$screenshots = Get-ChildItem -Path $ScreenshotDir -Recurse -Filter "*.png" | Sort-Object FullName
$count = ($screenshots | Measure-Object).Count

if ($count -eq 0) {
    Write-Error "No PNG screenshots found in $ScreenshotDir"
    exit 1
}

Write-Host "  Found $count screenshots:" -ForegroundColor Green
foreach ($img in $screenshots) {
    $relativePath = $img.FullName.Replace($ProjectRoot, "").TrimStart("\", "/")
    Write-Host "    - $relativePath" -ForegroundColor DarkGray
}

# --- Step 3: Run automated pipeline or print manual instructions ---

if ($Auto) {
    Write-Host ""
    Write-Host "[Step 3/$totalSteps] Running automated AI analysis..." -ForegroundColor White

    # Validate GITHUB_TOKEN — load from .env.local if not in environment
    if ([string]::IsNullOrWhiteSpace($env:GITHUB_TOKEN)) {
        $envFile = Join-Path $ProjectRoot ".env.local"
        if (Test-Path $envFile) {
            $tokenLine = Get-Content $envFile | Where-Object { $_ -match "^GITHUB_TOKEN=" }
            if ($tokenLine) {
                $env:GITHUB_TOKEN = ($tokenLine -replace "^GITHUB_TOKEN=", "").Trim()
                Write-Host "  Loaded GITHUB_TOKEN from .env.local" -ForegroundColor DarkGray
            }
        }
    }
    if ([string]::IsNullOrWhiteSpace($env:GITHUB_TOKEN)) {
        Write-Error "GITHUB_TOKEN environment variable is required for -Auto mode."
        Write-Host '  Set it with: $env:GITHUB_TOKEN = "ghp_..."' -ForegroundColor Yellow
        Write-Host "  Or add GITHUB_TOKEN=... to .env.local" -ForegroundColor Yellow
        Write-Host "  Required scopes: models:read, repo" -ForegroundColor Yellow
        exit 1
    }

    # Build node command arguments
    $nodeArgs = @($VisionScript, $ScreenshotDir)
    if ($DryRun) { $nodeArgs += "--dry-run" }
    if (-not [string]::IsNullOrWhiteSpace($Model)) { $nodeArgs += @("--model", $Model) }

    & node @nodeArgs

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Automated analysis failed. Check the output above for details."
        Write-Host "PIPELINE_DONE:FAILURE" -ForegroundColor Red
        exit 1
    }

    Write-Host ""
    Write-Host "PIPELINE_DONE:SUCCESS" -ForegroundColor Green
}
else {
    Write-Host ""
    Write-Host "------------------------------------------------------------" -ForegroundColor Yellow
    Write-Host "  NEXT: Choose how to run the audit" -ForegroundColor Yellow
    Write-Host "------------------------------------------------------------" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Option A: Fully automated (add -Auto flag)" -ForegroundColor White
    Write-Host '    .\scripts\run-vision-review.ps1 -Auto -SkipCapture' -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Option B: Manual with @vision-reviewer agent" -ForegroundColor White
    Write-Host "    1. Open Copilot Chat in VS Code" -ForegroundColor DarkGray
    Write-Host "    2. Select the @vision-reviewer agent" -ForegroundColor DarkGray
    Write-Host "    3. Attach the screenshots from:" -ForegroundColor DarkGray
    Write-Host "       $ScreenshotDir" -ForegroundColor Cyan
    Write-Host "    4. Type: audit these screenshots" -ForegroundColor DarkGray
    Write-Host ""
}
