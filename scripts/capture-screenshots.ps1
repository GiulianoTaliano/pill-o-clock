<#
.SYNOPSIS
    Captures screenshots from Pill O-Clock running on an Android emulator/device via ADB.

.DESCRIPTION
    Navigates through all main screens of the app using Expo deep links and
    captures a screenshot at each stop. Supports both light and dark mode passes.

    If no emulator is running, the script will automatically boot the specified
    AVD (defaults to Pixel_9) and wait for it to be ready.

    Prerequisites:
      - ADB in PATH (Android SDK platform-tools)
      - emulator command in PATH (Android SDK emulator)
      - Pill O-Clock dev build installed on the target device

.PARAMETER OutputDir
    Directory to save screenshots. Defaults to ./screenshots/<timestamp>.

.PARAMETER Mode
    Theme mode to capture: "light", "dark", or "both". Defaults to "both".

.PARAMETER DelayMs
    Milliseconds to wait after navigating to let the screen render. Defaults to 2500.

.PARAMETER Avd
    Name of the AVD to boot if no emulator is running. Defaults to "Pixel_9".
    Use 'emulator -list-avds' to see available AVDs.

.PARAMETER Serial
    ADB serial of a specific device to target (e.g., "emulator-5556").
    If omitted, the script auto-detects the running emulator.

.PARAMETER SkipBuild
    Skip the build+install step and assume the app is already installed.

.PARAMETER SkipSeed
    Skip the seed data import step.

.PARAMETER SeedFile
    Path to a backup JSON file to use as seed data. If omitted, generates
    fresh date-relative seed data using generate-seed-data.mjs.

.EXAMPLE
    .\scripts\capture-screenshots.ps1
    .\scripts\capture-screenshots.ps1 -Mode light -DelayMs 3000
    .\scripts\capture-screenshots.ps1 -OutputDir ./my-screenshots -Mode dark
    .\scripts\capture-screenshots.ps1 -Avd Medium_Phone
    .\scripts\capture-screenshots.ps1 -SkipBuild -SkipSeed
#>

[CmdletBinding()]
param(
    [string]$OutputDir,
    [ValidateSet("light", "dark", "both")]
    [string]$Mode = "both",
    [int]$DelayMs = 2500,
    [string]$Avd = "Pixel_9",
    [string]$Serial,
    [switch]$SkipBuild,
    [switch]$SkipSeed,
    [string]$SeedFile
)

# --- Configuration ---

$APP_PACKAGE = "com.pilloclock.app"
$DEEP_LINK_SCHEME = "pilloclock"

# Screen definitions: [name, deep-link path, description]
$SCREENS = @(
    @{ Name = "home";              Path = "/";                  Desc = "Today's doses (home)" }
    @{ Name = "medications";       Path = "/medications";       Desc = "Medications list" }
    @{ Name = "calendar";          Path = "/calendar";          Desc = "Calendar / appointments" }
    @{ Name = "health";            Path = "/health";            Desc = "Health measurements" }
    @{ Name = "history";           Path = "/history";           Desc = "Adherence history" }
    @{ Name = "settings";          Path = "/settings";          Desc = "Settings" }
    @{ Name = "medication-new";    Path = "/medication/new";    Desc = "New medication form" }
    @{ Name = "alarm";             Path = "/alarm";             Desc = "Alarm screen" }
    @{ Name = "onboarding";        Path = "/onboarding";       Desc = "Onboarding slides" }
)

# Screens to capture in empty state (before seed data import)
$EMPTY_SCREENS = @(
    @{ Name = "home-empty";         Path = "/";              Desc = "Home (empty state)" }
    @{ Name = "medications-empty";  Path = "/medications";   Desc = "Medications (empty)" }
    @{ Name = "calendar-empty";     Path = "/calendar";      Desc = "Calendar (empty)" }
    @{ Name = "health-empty";       Path = "/health";        Desc = "Health (empty)" }
    @{ Name = "history-empty";      Path = "/history";       Desc = "History (empty)" }
    @{ Name = "settings-empty";     Path = "/settings";      Desc = "Settings (empty)" }
)

# --- Helpers ---

# Metro dev server port (must match the --port used when starting expo)
$METRO_PORT = 8081

# Global: ADB args prefix for targeting a specific device
$script:ADB_TARGET = @()
# Track whether we've backed up MMKV for theme switching
$script:MMKV_BACKED_UP = $false

function Set-AdbTarget {
    param([string]$DeviceSerial)
    if (-not [string]::IsNullOrWhiteSpace($DeviceSerial)) {
        $script:ADB_TARGET = @("-s", $DeviceSerial)
    }
}

function Invoke-Adb {
    # Runs an ADB command with the target device prefix
    param([string[]]$AdbArgs)
    $allArgs = $script:ADB_TARGET + $AdbArgs
    & adb @allArgs 2>&1
}

function Test-MetroRunning {
    # Checks if Metro/Expo dev server is serving on METRO_PORT.
    # Returns $true if reachable, $false otherwise.
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:${METRO_PORT}/status" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        if ($response.StatusCode -eq 200) { return $true }
    }
    catch { }
    return $false
}

function Start-MetroIfNeeded {
    if (Test-MetroRunning) {
        Write-Host "  Metro dev server already running on port $METRO_PORT" -ForegroundColor Green
        return $true
    }

    Write-Host "  Metro not detected. Starting 'npx expo start --port $METRO_PORT' ..." -ForegroundColor Cyan
    $projectRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
    Start-Process -FilePath "npx" -ArgumentList "expo", "start", "--port", $METRO_PORT -WorkingDirectory $projectRoot -WindowStyle Minimized

    # Wait for Metro to become responsive (max 90s)
    $maxWait = 90
    $elapsed = 0
    $interval = 3
    while ($elapsed -lt $maxWait) {
        Start-Sleep -Seconds $interval
        $elapsed += $interval
        if (Test-MetroRunning) {
            Write-Host "  Metro ready after ${elapsed}s" -ForegroundColor Green
            return $true
        }
        Write-Host "    Waiting for Metro... (${elapsed}s)" -ForegroundColor DarkGray
    }

    Write-Error "Metro dev server did not start within ${maxWait}s. Start it manually: npx expo start --port $METRO_PORT"
    return $false
}

function Dismiss-DevWarnings {
    # Dismiss the LogBox "Open debugger to view warnings" banner by tapping outside it.
    # This sends a tap to the top-center of the screen which is always safe.
    Invoke-Adb "shell", "input", "tap", "540", "300" | Out-Null
    Start-Sleep -Milliseconds 300
}

function Wait-AppForeground {
    # Waits until Pill O-Clock is the top Activity.  Returns $true if it
    # appears within the timeout, $false otherwise.  Used before each
    # screenshot to avoid capturing the launcher or another app.
    param([int]$MaxWaitSec = 10)
    $elapsed = 0
    while ($elapsed -lt $MaxWaitSec) {
        $top = Invoke-Adb "shell", "dumpsys", "activity", "top" 2>$null |
            Select-String "ACTIVITY $APP_PACKAGE" -SimpleMatch
        if ($top) { return $true }
        Start-Sleep -Seconds 1
        $elapsed++
    }
    return $false
}

function Start-EmulatorIfNeeded {
    param([string]$AvdName)

    # Check if any device is already connected and responsive
    $devices = & adb devices 2>&1
    $ready = ($devices | Select-String "device$" | Measure-Object).Count
    if ($ready -gt 0) {
        Write-Host "  Emulator already running ($ready device(s))" -ForegroundColor Green
        return $true
    }

    # Verify the AVD exists
    $avds = & emulator -list-avds 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "emulator command not found. Ensure Android SDK emulator/ is in PATH."
        return $false
    }
    $avdExists = $avds | Where-Object { $_.Trim() -eq $AvdName }
    if (-not $avdExists) {
        Write-Error "AVD '$AvdName' not found. Available: $($avds -join ', ')"
        return $false
    }

    # Boot the emulator in the background
    Write-Host "  Booting AVD: $AvdName ..." -ForegroundColor Cyan
    Start-Process -FilePath "emulator" -ArgumentList "-avd", $AvdName, "-no-snapshot-load" -WindowStyle Minimized

    # Wait for the device to come online (max 120s)
    $maxWait = 120
    $elapsed = 0
    $interval = 3
    while ($elapsed -lt $maxWait) {
        Start-Sleep -Seconds $interval
        $elapsed += $interval

        $bootComplete = & adb shell getprop sys.boot_completed 2>&1
        if ($bootComplete -match "^1") {
            Write-Host "  Emulator ready after ${elapsed}s" -ForegroundColor Green
            # Extra settle time for launcher
            Start-Sleep -Seconds 3
            return $true
        }
        Write-Host "    Waiting for boot... (${elapsed}s)" -ForegroundColor DarkGray
    }

    Write-Error "Emulator did not boot within ${maxWait}s."
    return $false
}

function Find-DeviceSerial {
    # Finds the serial of the first responsive device
    $lines = & adb devices 2>&1
    foreach ($line in $lines) {
        if ($line -match "^(emulator-\d+|[\w.:]+)\s+device$") {
            return $Matches[1]
        }
    }
    return $null
}

function Test-AdbConnection {
    $devices = & adb devices 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "ADB not found. Ensure Android SDK platform-tools is in PATH."
        return $false
    }
    $connected = ($devices | Select-String "device$" | Measure-Object).Count
    if ($connected -eq 0) {
        Write-Error "No Android device/emulator connected. Run 'adb devices' to check."
        return $false
    }
    Write-Host "  Connected devices: $connected" -ForegroundColor Green
    return $true
}

function Test-AppInstalled {
    $result = Invoke-Adb "shell", "pm", "list", "packages" | Select-String $APP_PACKAGE
    if (-not $result) {
        Write-Error "App '$APP_PACKAGE' is not installed. Run 'npx expo run:android' first."
        return $false
    }
    return $true
}

function Uninstall-App {
    Write-Host "  Uninstalling existing app..." -ForegroundColor Cyan
    Invoke-Adb "shell", "pm", "uninstall", $APP_PACKAGE | Out-Null
    Start-Sleep -Seconds 2
    Write-Host "  Uninstalled." -ForegroundColor Green
}

function Test-AppRunning {
    $result = Invoke-Adb "shell", "pidof", $APP_PACKAGE
    if ([string]::IsNullOrWhiteSpace($result)) {
        Write-Warning "App '$APP_PACKAGE' is not in the foreground."
        Write-Host "    Launching app..." -ForegroundColor Cyan
        Invoke-Adb "shell", "monkey", "-p", $APP_PACKAGE, "-c", "android.intent.category.LAUNCHER", "1" | Out-Null
        Start-Sleep -Milliseconds 3000
        return $true
    }
    return $true
}

function Backup-MmkvIfNeeded {
    # Backs up the MMKV storage files once so the user's original theme
    # preference can be restored at the end of the capture session.
    if ($script:MMKV_BACKED_UP) { return }
    Write-Host "    Backing up MMKV storage..." -ForegroundColor DarkGray
    Invoke-Adb "shell", "am", "force-stop", $APP_PACKAGE | Out-Null
    Invoke-Adb "shell", "run-as", $APP_PACKAGE, "sh", "-c",
        "cp files/mmkv/pilloclock files/mmkv/pilloclock.capture_bak 2>/dev/null; cp files/mmkv/pilloclock.crc files/mmkv/pilloclock.crc.capture_bak 2>/dev/null" | Out-Null
    $script:MMKV_BACKED_UP = $true
}

function Restore-Mmkv {
    # Restores the original MMKV files from the backup created by Backup-MmkvIfNeeded.
    if (-not $script:MMKV_BACKED_UP) { return }
    Write-Host "  Restoring original MMKV storage..." -ForegroundColor Cyan
    Invoke-Adb "shell", "am", "force-stop", $APP_PACKAGE | Out-Null
    Invoke-Adb "shell", "run-as", $APP_PACKAGE, "sh", "-c",
        "cp files/mmkv/pilloclock.capture_bak files/mmkv/pilloclock; cp files/mmkv/pilloclock.crc.capture_bak files/mmkv/pilloclock.crc; rm -f files/mmkv/pilloclock.capture_bak files/mmkv/pilloclock.crc.capture_bak" | Out-Null
    $script:MMKV_BACKED_UP = $false
}

function Set-ThemeMode {
    param([string]$ThemeMode)

    # The app stores a theme override in MMKV (via Appearance.setColorScheme).
    # To reliably switch themes we must:
    #   1. Force-stop the app
    #   2. Delete MMKV (so the app defaults to "system" theme on next launch)
    #   3. Set the Android system night mode and wait for propagation
    #   4. Restart the app and bypass onboarding (MMKV was wiped)

    Backup-MmkvIfNeeded

    Write-Host "  Switching to $ThemeMode mode (force-restart)..." -ForegroundColor Cyan

    # Force-stop and wipe MMKV so theme_mode defaults to "system"
    Invoke-Adb "shell", "am", "force-stop", $APP_PACKAGE | Out-Null
    Invoke-Adb "shell", "run-as", $APP_PACKAGE, "sh", "-c",
        "rm -f files/mmkv/pilloclock files/mmkv/pilloclock.crc" | Out-Null

    # Wake screen and dismiss keyguard (prevents black screenshots on idle emulator)
    Invoke-Adb "shell", "input", "keyevent", "KEYCODE_WAKEUP" | Out-Null
    Invoke-Adb "shell", "input", "keyevent", "82" | Out-Null

    # Set Android system dark mode
    if ($ThemeMode -eq "dark") {
        Invoke-Adb "shell", "cmd", "uimode", "night", "yes" | Out-Null
    }
    else {
        Invoke-Adb "shell", "cmd", "uimode", "night", "no" | Out-Null
    }

    # Wait for uimode to fully propagate through the system.
    # 500ms was too short — React Native's Appearance API can read stale values
    # if polled before the configuration change settles.
    Start-Sleep -Seconds 3

    # Restart app (will show onboarding since MMKV was cleared)
    Invoke-Adb "shell", "am", "start", "-n", "$APP_PACKAGE/.MainActivity" | Out-Null

    # Wait for the app to finish loading the JS bundle.
    # On a cold Metro start (first run), the bundle transform can take 15-30s.
    # On warm Metro (cached), it loads in 2-3s.
    # Poll until the app's Activity is in the foreground.
    Write-Host "    Waiting for app to load..." -ForegroundColor DarkGray
    $maxWait = 45
    $elapsed = 0
    while ($elapsed -lt $maxWait) {
        Start-Sleep -Seconds 2
        $elapsed += 2
        $topActivity = Invoke-Adb "shell", "dumpsys", "activity", "top" 2>$null |
            Select-String "ACTIVITY $APP_PACKAGE" -SimpleMatch
        if ($topActivity) {
            # Activity is in foreground — give React Native extra time to mount
            Start-Sleep -Seconds 4
            break
        }
    }
    Write-Host "    App ready after ${elapsed}s" -ForegroundColor DarkGray

    # Send a deep link to bypass onboarding and land on the home tab
    Invoke-Adb "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "${DEEP_LINK_SCHEME}:///", $APP_PACKAGE | Out-Null
    Start-Sleep -Seconds 3
}

function Invoke-DeepLink {
    param([string]$RoutePath)

    $uri = "${DEEP_LINK_SCHEME}://${RoutePath}"
    Write-Host "    Navigating: $uri" -ForegroundColor DarkGray
    # Use -n to force the intent to our Activity. Without it, a bare package
    # name is silently ignored by newer Android versions and the system may
    # resolve the VIEW intent to another app (e.g., Google Calendar for
    # pilloclock:///calendar) when Pill O-Clock has crashed or isn't running.
    Invoke-Adb "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", $uri, "-n", "$APP_PACKAGE/.MainActivity" | Out-Null
}

function Save-Screenshot {
    param([string]$FileName, [string]$DestDir)

    $devicePath = "/sdcard/screenshot_temp.png"
    $localPath = Join-Path $DestDir "$FileName.png"

    Invoke-Adb "shell", "screencap", "-p", $devicePath | Out-Null
    Invoke-Adb "pull", $devicePath, $localPath | Out-Null
    Invoke-Adb "shell", "rm", $devicePath | Out-Null

    if (Test-Path $localPath) {
        Write-Host "    Saved: $localPath" -ForegroundColor Green
        return $localPath
    }
    else {
        Write-Warning "    Failed to save screenshot: $localPath"
        return $null
    }
}

function Invoke-CapturePass {
    param([string]$ThemeMode, [string]$BaseDir)

    $passDir = Join-Path $BaseDir $ThemeMode
    New-Item -ItemType Directory -Path $passDir -Force | Out-Null

    Set-ThemeMode -ThemeMode $ThemeMode
    $captured = 0

    foreach ($screen in $SCREENS) {
        $name = $screen.Name
        $path = $screen.Path
        $desc = $screen.Desc

        Write-Host "  [$ThemeMode] $desc" -ForegroundColor Yellow
        Invoke-DeepLink -RoutePath $path
        Start-Sleep -Milliseconds $DelayMs
        if (-not (Wait-AppForeground -MaxWaitSec 8)) {
            Write-Warning "    App not in foreground, retrying deep link..."
            Invoke-DeepLink -RoutePath $path
            Start-Sleep -Milliseconds $DelayMs
        }
        Dismiss-DevWarnings

        $fileName = "${ThemeMode}_${name}"
        $result = Save-Screenshot -FileName $fileName -DestDir $passDir
        if ($result) { $captured++ }
    }

    return $captured
}

# ─── Empty State Captures ────────────────────────────────────────

function Invoke-EmptyCapturePass {
    param([string]$ThemeMode, [string]$BaseDir)

    $passDir = Join-Path $BaseDir $ThemeMode
    New-Item -ItemType Directory -Path $passDir -Force | Out-Null

    Set-ThemeMode -ThemeMode $ThemeMode
    $captured = 0

    foreach ($screen in $EMPTY_SCREENS) {
        $name = $screen.Name
        $path = $screen.Path
        $desc = $screen.Desc

        Write-Host "  [$ThemeMode] $desc" -ForegroundColor Yellow
        Invoke-DeepLink -RoutePath $path
        Start-Sleep -Milliseconds $DelayMs
        if (-not (Wait-AppForeground -MaxWaitSec 8)) {
            Write-Warning "    App not in foreground, retrying deep link..."
            Invoke-DeepLink -RoutePath $path
            Start-Sleep -Milliseconds $DelayMs
        }
        Dismiss-DevWarnings

        $fileName = "${ThemeMode}_${name}"
        $result = Save-Screenshot -FileName $fileName -DestDir $passDir
        if ($result) { $captured++ }
    }

    return $captured
}

# ─── UI Interaction Captures ────────────────────────────────────

function Invoke-InteractionCaptures {
    param([string]$ThemeMode, [string]$BaseDir)

    $passDir = Join-Path $BaseDir $ThemeMode
    $captured = 0

    # Ensure correct theme is active
    Set-ThemeMode -ThemeMode $ThemeMode

    # Helper: tap at coordinates
    function Invoke-Tap {
        param([int]$X, [int]$Y)
        Invoke-Adb "shell", "input", "tap", "$X", "$Y" | Out-Null
        Start-Sleep -Milliseconds 800
    }

    # Helper: type text
    function Invoke-TypeText {
        param([string]$Text)
        # ADB input text doesn't handle spaces well, replace them with %s
        $escaped = $Text -replace ' ', '%s'
        Invoke-Adb "shell", "input", "text", $escaped | Out-Null
        Start-Sleep -Milliseconds 500
    }

    # Helper: scroll down
    function Invoke-ScrollDown {
        Invoke-Adb "shell", "input", "swipe", "540", "1500", "540", "600", "300" | Out-Null
        Start-Sleep -Milliseconds 800
    }

    # Helper: press back
    function Invoke-Back {
        Invoke-Adb "shell", "input", "keyevent", "KEYCODE_BACK" | Out-Null
        Start-Sleep -Milliseconds 600
    }

    # --- 1. Home screen with dose card interactions ---
    # Tap on a dose card to see the action sheet/modal
    Write-Host "  [$ThemeMode] Dose card interaction" -ForegroundColor Yellow
    Invoke-DeepLink -RoutePath "/"
    Start-Sleep -Milliseconds $DelayMs
    Dismiss-DevWarnings
    # Tap the first dose card (approximately center of first card)
    Invoke-Tap -X 540 -Y 600
    Start-Sleep -Milliseconds 1000
    $result = Save-Screenshot -FileName "${ThemeMode}_home-dose-tap" -DestDir $passDir
    if ($result) { $captured++ }
    Invoke-Back

    # --- 2. Medications list with a medication detail ---
    Write-Host "  [$ThemeMode] Medication detail view" -ForegroundColor Yellow
    Invoke-DeepLink -RoutePath "/medications"
    Start-Sleep -Milliseconds $DelayMs
    Dismiss-DevWarnings
    # Tap first medication in the list
    Invoke-Tap -X 540 -Y 450
    Start-Sleep -Milliseconds 1500
    $result = Save-Screenshot -FileName "${ThemeMode}_medication-detail" -DestDir $passDir
    if ($result) { $captured++ }
    Invoke-Back

    # --- 3. New medication form partially filled ---
    Write-Host "  [$ThemeMode] Medication form (filled)" -ForegroundColor Yellow
    Invoke-DeepLink -RoutePath "/medication/new"
    Start-Sleep -Milliseconds $DelayMs
    Dismiss-DevWarnings
    # Tap the name field and type
    Invoke-Tap -X 540 -Y 400
    Start-Sleep -Milliseconds 500
    Invoke-TypeText -Text "Metformina"
    # Dismiss keyboard
    Invoke-Adb "shell", "input", "keyevent", "KEYCODE_ESCAPE" | Out-Null
    Start-Sleep -Milliseconds 500
    # Scroll down to reveal more fields
    Invoke-ScrollDown
    Start-Sleep -Milliseconds 500
    $result = Save-Screenshot -FileName "${ThemeMode}_medication-form-filled" -DestDir $passDir
    if ($result) { $captured++ }

    # --- 4. Calendar with appointments visible ---
    Write-Host "  [$ThemeMode] Calendar with appointment detail" -ForegroundColor Yellow
    Invoke-DeepLink -RoutePath "/calendar"
    Start-Sleep -Milliseconds $DelayMs
    Dismiss-DevWarnings
    # Tap a day dot that should have an appointment
    Invoke-Tap -X 540 -Y 600
    Start-Sleep -Milliseconds 1000
    $result = Save-Screenshot -FileName "${ThemeMode}_calendar-detail" -DestDir $passDir
    if ($result) { $captured++ }

    # --- 5. Health screen scrolled to chart ---
    Write-Host "  [$ThemeMode] Health chart view" -ForegroundColor Yellow
    Invoke-DeepLink -RoutePath "/health"
    Start-Sleep -Milliseconds $DelayMs
    Dismiss-DevWarnings
    Invoke-ScrollDown
    $result = Save-Screenshot -FileName "${ThemeMode}_health-scrolled" -DestDir $passDir
    if ($result) { $captured++ }

    # --- 6. History screen scrolled ---
    Write-Host "  [$ThemeMode] History scrolled" -ForegroundColor Yellow
    Invoke-DeepLink -RoutePath "/history"
    Start-Sleep -Milliseconds $DelayMs
    Dismiss-DevWarnings
    Invoke-ScrollDown
    $result = Save-Screenshot -FileName "${ThemeMode}_history-scrolled" -DestDir $passDir
    if ($result) { $captured++ }

    # --- 7. Settings screen scrolled ---
    Write-Host "  [$ThemeMode] Settings scrolled" -ForegroundColor Yellow
    Invoke-DeepLink -RoutePath "/settings"
    Start-Sleep -Milliseconds $DelayMs
    Dismiss-DevWarnings
    Invoke-ScrollDown
    $result = Save-Screenshot -FileName "${ThemeMode}_settings-scrolled" -DestDir $passDir
    if ($result) { $captured++ }

    return $captured
}

# ─── Build & Install ────────────────────────────────────────

function Install-AppBuild {
    $projectRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)

    Write-Host "  Building and installing app..." -ForegroundColor Cyan

    # Always use --device when $Serial is available to prevent interactive
    # device-selection prompts that block non-interactive / background runs.
    # Expo CLI expects the device *name* (e.g. AVD name), not the ADB serial.
    $deviceArgs = @()
    if (-not [string]::IsNullOrWhiteSpace($Serial)) {
        $deviceName = $null
        # For emulators, query the AVD name via the emulator console
        if ($Serial -match '^emulator-') {
            $avdOutput = Invoke-Adb "emu", "avd", "name" 2>$null
            if ($avdOutput) {
                # The command returns the AVD name on the first line, "OK" on the second
                $deviceName = ($avdOutput | Select-Object -First 1).Trim()
            }
        }
        # Fallback: use the product model name (physical devices / older emulators)
        if ([string]::IsNullOrWhiteSpace($deviceName)) {
            $deviceName = (Invoke-Adb "shell", "getprop", "ro.product.model" 2>$null | Out-String).Trim()
        }
        if (-not [string]::IsNullOrWhiteSpace($deviceName)) {
            $deviceArgs = @("--device", $deviceName)
        }
    }

    Write-Host "  Running 'npx expo run:android --no-bundler $deviceArgs' ..." -ForegroundColor DarkGray

    $buildResult = & npx expo run:android --no-bundler @deviceArgs 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "  Build+install failed (exit code $LASTEXITCODE). Output:`n$($buildResult | Select-Object -Last 30 | Out-String)"
        return $false
    }

    Write-Host "  Build installed successfully." -ForegroundColor Green
    return $true
}

# ─── Seed Data ───────────────────────────────────────────────

function Import-SeedData {
    param([string]$SeedFilePath)

    $scriptDir = Split-Path -Parent $PSCommandPath

    if ([string]::IsNullOrWhiteSpace($SeedFilePath)) {
        # Generate fresh date-relative seed data
        Write-Host "  Generating fresh seed data..." -ForegroundColor Cyan
        $generatorScript = Join-Path $scriptDir "generate-seed-data.mjs"
        $SeedFilePath = Join-Path $scriptDir "seed-data.json"
        & node $generatorScript --output $SeedFilePath
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "  Seed data generation failed. Continuing without seed data."
            return
        }
    }

    if (-not (Test-Path $SeedFilePath)) {
        Write-Warning "  Seed file not found: $SeedFilePath. Continuing without seed data."
        return
    }

    Write-Host "  Pushing seed data to device..." -ForegroundColor Cyan
    $pushArgs = @($SeedFilePath)
    if (-not [string]::IsNullOrWhiteSpace($Serial)) {
        $pushArgs += @("--serial", $Serial)
    }
    & node (Join-Path $scriptDir "push-seed-data.mjs") @pushArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "  Seed data push failed. Screenshots will use existing app data."
    }
    else {
        Write-Host "  Seed data loaded successfully." -ForegroundColor Green
    }
}

# --- Main ---

$totalSteps = 12
if ($SkipBuild) { $totalSteps-- }
if ($SkipSeed) { $totalSteps -= 2 }  # skip both empty-state capture and seed import

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  Pill O-Clock -- Screenshot Capture Tool" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""

$step = 0

# Step: Ensure emulator is running
$step++
Write-Host "[$step/$totalSteps] Ensuring emulator is running (AVD: $Avd)..." -ForegroundColor White
if (-not (Start-EmulatorIfNeeded -AvdName $Avd)) { exit 1 }

# Step: Resolve device serial
$step++
Write-Host "[$step/$totalSteps] Resolving target device..." -ForegroundColor White
if ([string]::IsNullOrWhiteSpace($Serial)) {
    $Serial = Find-DeviceSerial
    if (-not $Serial) {
        Write-Error "Could not find a responsive device."
        exit 1
    }
}
Set-AdbTarget -DeviceSerial $Serial
Write-Host "  Target: $Serial" -ForegroundColor Green

# Step: Ensure Metro dev server is running (required for dev builds)
$step++
Write-Host "[$step/$totalSteps] Checking Metro dev server..." -ForegroundColor White
if (-not (Start-MetroIfNeeded)) { exit 1 }

# Step: Check app installation and build/install as needed
$step++
Write-Host "[$step/$totalSteps] Checking app installation..." -ForegroundColor White
$appInstalled = (Invoke-Adb "shell", "pm", "list", "packages" | Select-String $APP_PACKAGE) -ne $null

if (-not $SkipBuild) {
    if ($appInstalled) {
        Write-Host "  App is installed. Uninstalling for a clean install..." -ForegroundColor Yellow
        Uninstall-App
    } else {
        Write-Host "  App not installed. Will build and install fresh." -ForegroundColor Yellow
    }

    $step++
    Write-Host "[$step/$totalSteps] Building and installing app..." -ForegroundColor White
    if (-not (Install-AppBuild)) {
        Write-Error "Build and install failed."
        exit 1
    }
} else {
    Write-Host "  Skipping build (using existing installation)" -ForegroundColor DarkGray
    if (-not $appInstalled) {
        Write-Error "App '$APP_PACKAGE' is not installed and -SkipBuild was specified. Install the app first or remove -SkipBuild."
        exit 1
    }
}

# Step: Validate app is installed
$step++
Write-Host "[$step/$totalSteps] Validating app is installed..." -ForegroundColor White
if (-not (Test-AppInstalled)) { exit 1 }

# Step: Set up output directory
$step++
if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
    $OutputDir = Join-Path (Join-Path (Get-Location) "screenshots") $timestamp
}
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
Write-Host "[$step/$totalSteps] Output directory: $OutputDir" -ForegroundColor White

# Step: Pre-warm the app and import seed data
$step++
Write-Host "[$step/$totalSteps] Preparing app (pre-warm)..." -ForegroundColor White

# Keep screen on during capture to prevent black screenshots
Invoke-Adb "shell", "svc", "power", "stayon", "usb" | Out-Null
Invoke-Adb "shell", "input", "keyevent", "KEYCODE_WAKEUP" | Out-Null

$totalCaptured = 0

# Pre-warm: launch the app once so Metro caches the JS bundle.
# Without this, the first cold start takes 15-30s and screenshots are black.
Write-Host "  Pre-warming app (first Metro bundle load)..." -ForegroundColor DarkGray
Invoke-Adb "shell", "am", "start", "-n", "$APP_PACKAGE/.MainActivity" | Out-Null
$warmMaxWait = 45
$warmElapsed = 0
while ($warmElapsed -lt $warmMaxWait) {
    Start-Sleep -Seconds 3
    $warmElapsed += 3
    $topCheck = Invoke-Adb "shell", "dumpsys", "activity", "top" 2>$null |
        Select-String "ACTIVITY $APP_PACKAGE" -SimpleMatch
    if ($topCheck) {
        Start-Sleep -Seconds 5
        break
    }
    Write-Host "    Bundling JS... (${warmElapsed}s)" -ForegroundColor DarkGray
}
Write-Host "  Bundle cached after ${warmElapsed}s" -ForegroundColor Green
Invoke-Adb "shell", "am", "force-stop", $APP_PACKAGE | Out-Null

# Step: Capture empty state screenshots (before importing any data)
if (-not $SkipSeed) {
    $step++
    Write-Host "[$step/$totalSteps] Capturing empty state screenshots (mode: $Mode, delay: ${DelayMs}ms)..." -ForegroundColor White
    Write-Host ""

    if ($Mode -eq "both" -or $Mode -eq "light") {
        $totalCaptured += Invoke-EmptyCapturePass -ThemeMode "light" -BaseDir $OutputDir
    }
    if ($Mode -eq "both" -or $Mode -eq "dark") {
        $totalCaptured += Invoke-EmptyCapturePass -ThemeMode "dark" -BaseDir $OutputDir
    }
}

# Step: Import seed data into the database (after empty captures)
if (-not $SkipSeed) {
    $step++
    Write-Host "[$step/$totalSteps] Importing seed data..." -ForegroundColor White
    Import-SeedData -SeedFilePath $SeedFile
}

# Step: Capture base screenshots (all screens, now with data)
$step++
Write-Host "[$step/$totalSteps] Capturing base screenshots (mode: $Mode, delay: ${DelayMs}ms)..." -ForegroundColor White
Write-Host ""

if ($Mode -eq "both" -or $Mode -eq "light") {
    $totalCaptured += Invoke-CapturePass -ThemeMode "light" -BaseDir $OutputDir
}

if ($Mode -eq "both" -or $Mode -eq "dark") {
    $totalCaptured += Invoke-CapturePass -ThemeMode "dark" -BaseDir $OutputDir
}

# Step: Capture interaction screenshots (modals, filled forms, scrolled views)
$step++
Write-Host ""
Write-Host "[$step/$totalSteps] Capturing interaction screenshots..." -ForegroundColor White

if ($Mode -eq "both" -or $Mode -eq "light") {
    $totalCaptured += Invoke-InteractionCaptures -ThemeMode "light" -BaseDir $OutputDir
}

if ($Mode -eq "both" -or $Mode -eq "dark") {
    $totalCaptured += Invoke-InteractionCaptures -ThemeMode "dark" -BaseDir $OutputDir
}

# Restore original MMKV preferences and system light mode
Restore-Mmkv
Invoke-Adb "shell", "cmd", "uimode", "night", "no" | Out-Null
Invoke-Adb "shell", "svc", "power", "stayon", "false" | Out-Null

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  Done! Captured $totalCaptured screenshots" -ForegroundColor Green
Write-Host "  Location: $OutputDir" -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""

# Generate a manifest file listing all captured screenshots
$manifest = @{
    CapturedAt   = (Get-Date -Format "o")
    Mode         = $Mode
    DelayMs      = $DelayMs
    Screens      = $SCREENS | ForEach-Object { $_.Name }
    EmptyScreens = if (-not $SkipSeed) { $EMPTY_SCREENS | ForEach-Object { $_.Name } } else { @() }
    OutputDir    = $OutputDir
    SeedData     = (-not $SkipSeed)
    Built        = (-not $SkipBuild)
}
$manifestPath = Join-Path $OutputDir "manifest.json"
$manifest | ConvertTo-Json -Depth 3 | Set-Content -Path $manifestPath -Encoding UTF8
Write-Host "  Manifest: $manifestPath" -ForegroundColor DarkGray

# Print next-step instructions
Write-Host ""
Write-Host "-------------------------------------------------------" -ForegroundColor Yellow
Write-Host "  NEXT STEP: Run the Vision Audit" -ForegroundColor Yellow
Write-Host "-------------------------------------------------------" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Option A: Fully automated (recommended)" -ForegroundColor White
Write-Host '    .\scripts\run-vision-review.ps1 -Auto -SkipCapture' -ForegroundColor Cyan
Write-Host ""
Write-Host "  Option B: Manual with @vision-reviewer agent" -ForegroundColor White
Write-Host "    1. Open Copilot Chat" -ForegroundColor DarkGray
Write-Host "    2. Select @vision-reviewer" -ForegroundColor DarkGray
Write-Host "    3. Attach screenshots from: $OutputDir" -ForegroundColor DarkGray
Write-Host "    4. Type: audit these screenshots" -ForegroundColor DarkGray
Write-Host ""
