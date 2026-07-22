<#
.SYNOPSIS
    Screenshot capture wrapper for Pill O-Clock UI audits.

.DESCRIPTION
    Captures screenshots via ADB, then directs the user to invoke @ui-auditor
    or @vision-reviewer in Copilot Chat for AI-powered analysis.

    The -Auto flag is DEPRECATED. Analysis is now handled natively by
    @ui-auditor (view_image + Claude vision + GitHub MCP).

.PARAMETER ScreenshotDir
    Path to existing screenshots directory. If omitted, runs capture first.

.PARAMETER SkipCapture
    Skip the ADB capture step and use existing screenshots.

.PARAMETER Auto
    DEPRECATED. Kept for backward compatibility — prints a deprecation notice
    and proceeds with capture only.

.PARAMETER DryRun
    DEPRECATED (was used with -Auto). Ignored.

.PARAMETER Model
    DEPRECATED (was used with vision-review.mjs). Ignored.

.PARAMETER Mode
    Theme mode: "light", "dark", or "both". Passed to capture script.

.PARAMETER SkipBuild
    Skip building and installing the app. Passed to capture script.

.PARAMETER SkipSeed
    Skip seed data import. Passed to capture script.

.PARAMETER SeedFile
    Path to a backup JSON file. Passed to capture script.

.EXAMPLE
    .\scripts\run-vision-review.ps1
    .\scripts\run-vision-review.ps1 -SkipBuild -SkipSeed
    .\scripts\run-vision-review.ps1 -SkipCapture
    .\scripts\run-vision-review.ps1 -Mode light
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

if ($Auto) {
    Write-Host ""
    Write-Host "[DEPRECATED] The -Auto flag is deprecated." -ForegroundColor Yellow
    Write-Host "  Analysis is now handled by @ui-auditor in Copilot Chat." -ForegroundColor Yellow
    Write-Host "  Proceeding with capture only..." -ForegroundColor Yellow
    Write-Host ""
}

$totalSteps = 2

Write-Host ""
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "  Pill O-Clock -- Screenshot Capture" -ForegroundColor Magenta
Write-Host "  Analysis: invoke @ui-auditor in Copilot Chat" -ForegroundColor DarkGray
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

# --- Step 2: Print instructions for @ui-auditor ---

Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor Yellow
Write-Host "  NEXT: Run the UI Audit with @ui-auditor" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------" -ForegroundColor Yellow
Write-Host ""
Write-Host "  In Copilot Chat, invoke:" -ForegroundColor White
Write-Host '    @ui-auditor audit UI — use existing screenshots' -ForegroundColor Cyan
Write-Host ""
Write-Host "  Or for manual review:" -ForegroundColor DarkGray
Write-Host "    @vision-reviewer audit screenshots in $ScreenshotDir" -ForegroundColor DarkGray
Write-Host ""
Write-Host "PIPELINE_DONE:SUCCESS" -ForegroundColor Green
