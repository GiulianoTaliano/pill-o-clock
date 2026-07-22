<#
.SYNOPSIS
    Objective accessibility measurement for Pill O-Clock on an Android device.

.DESCRIPTION
    Complements the pixel screenshots (capture-screenshots.ps1) with numbers that
    a screenshot cannot give you:

      1. Touch targets & labels — dumps the native accessibility tree
         (uiautomator) and, for every clickable node, reports its size in dp and
         its accessible name (content-desc). Flags targets smaller than the
         44dp minimum and clickable nodes with no accessible name.

      2. WCAG contrast (sampled) — for every text node, samples its region in a
         raw screencap, finds the two dominant colors (the text ink and the
         background paper), and computes the WCAG 2.1 contrast ratio. Flags
         normal text below 4.5:1 (AA) — the exact thing the category-label and
         muted-text findings were about.

    Unlike hitSlop (which extends the touch area but leaves the layout bounds
    unchanged, so scanners never credit it), this measures the real node bounds
    — the same thing Google's Accessibility Scanner / Play pre-launch report use.

.PARAMETER Serial   ADB serial (auto-detected if omitted).
.PARAMETER Screens  Deep-link paths to visit. Defaults to the main screens.
.PARAMETER OutDir   Where to write the JSON report. Defaults to ./a11y-report/<timestamp>.
.PARAMETER MinTargetDp   Minimum touch-target size in dp (default 44).
.PARAMETER MinContrast   Minimum WCAG ratio for normal text (default 4.5).
.PARAMETER DelayMs       Render wait after each deep link (default 2500).

.EXAMPLE
    .\scripts\measure-a11y.ps1
    .\scripts\measure-a11y.ps1 -Screens "/onboarding","/medications" -Serial emulator-5554
#>
[CmdletBinding()]
param(
    [string]$Serial,
    [string[]]$Screens = @("/", "/medications", "/health", "/settings", "/calendar", "/history", "/appointments", "/onboarding"),
    [string]$OutDir,
    [int]$MinTargetDp = 44,
    [double]$MinContrast = 4.5,
    [int]$DelayMs = 2500
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$APP = "com.pilloclock.app"
$SCHEME = "pilloclock"

$adb = Join-Path $env:ANDROID_HOME "platform-tools\adb.exe"
if (-not (Test-Path $adb)) { $adb = "adb" }

# ─── Device ──────────────────────────────────────────────────────────────────

if ([string]::IsNullOrWhiteSpace($Serial)) {
    $line = (& $adb devices) | Select-String "device$" | Select-Object -First 1
    if ($line) { $Serial = ($line -split "\s+")[0] }
}
if ([string]::IsNullOrWhiteSpace($Serial)) { Write-Error "No connected device."; exit 1 }

# No param block: with no declared parameters, flags like `-a` (am start's
# action flag) fall through into $args instead of being parsed as function params.
function Adb { & $adb -s $Serial @args }

$density = 160
$dline = (Adb shell wm density) -join " "
if ($dline -match "(\d+)") { $density = [int]$Matches[1] }
$dpPerPx = $density / 160.0
Write-Host "Device $Serial | density ${density}dpi (${dpPerPx}x)" -ForegroundColor Cyan

if ([string]::IsNullOrWhiteSpace($OutDir)) {
    $ts = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
    $OutDir = Join-Path (Join-Path (Get-Location) "a11y-report") $ts
}
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

# ─── WCAG helpers ────────────────────────────────────────────────────────────

function Get-Lin([double]$c) {
    $s = $c / 255.0
    if ($s -le 0.03928) { return $s / 12.92 }
    return [math]::Pow((($s + 0.055) / 1.055), 2.4)
}
function Get-RelLum($r, $g, $b) {
    return 0.2126 * (Get-Lin $r) + 0.7152 * (Get-Lin $g) + 0.0722 * (Get-Lin $b)
}
function Get-Wcag($c1, $c2) {
    $l1 = Get-RelLum $c1[0] $c1[1] $c1[2]
    $l2 = Get-RelLum $c2[0] $c2[1] $c2[2]
    $hi = [math]::Max($l1, $l2); $lo = [math]::Min($l1, $l2)
    return [math]::Round((($hi + 0.05) / ($lo + 0.05)), 2)
}

# Two dominant colors in a bounding box: quantize to 4 bits/channel, keep the
# two most-populated buckets, return their mean RGB. For a text label on a solid
# background these approximate the ink and the paper.
function Get-TopTwoColors($bmp, $x1, $y1, $x2, $y2) {
    $w = $x2 - $x1; $h = $y2 - $y1
    if ($w -le 3 -or $h -le 3) { return $null }
    # inset a little so we don't sample the node's border / neighbours
    $ix1 = [int]($x1 + $w * 0.12); $ix2 = [int]($x2 - $w * 0.12)
    $iy1 = [int]($y1 + $h * 0.12); $iy2 = [int]($y2 - $h * 0.12)
    $ix1 = [math]::Max(0, $ix1); $iy1 = [math]::Max(0, $iy1)
    $ix2 = [math]::Min($bmp.Width - 1, $ix2); $iy2 = [math]::Min($bmp.Height - 1, $iy2)
    if ($ix2 -le $ix1 -or $iy2 -le $iy1) { return $null }
    $stepX = [math]::Max(1, [int](($ix2 - $ix1) / 80))
    $stepY = [math]::Max(1, [int](($iy2 - $iy1) / 40))
    $buckets = @{}
    for ($y = $iy1; $y -le $iy2; $y += $stepY) {
        for ($x = $ix1; $x -le $ix2; $x += $stepX) {
            $p = $bmp.GetPixel($x, $y)
            $key = "{0}_{1}_{2}" -f ($p.R -shr 4), ($p.G -shr 4), ($p.B -shr 4)
            if (-not $buckets.ContainsKey($key)) { $buckets[$key] = @{ c = 0; r = 0; g = 0; b = 0 } }
            $bk = $buckets[$key]; $bk.c++; $bk.r += $p.R; $bk.g += $p.G; $bk.b += $p.B
        }
    }
    if ($buckets.Count -lt 2) { return $null }
    $top = $buckets.GetEnumerator() | Sort-Object { $_.Value.c } -Descending | Select-Object -First 2
    $a = $top[0].Value; $b = $top[1].Value
    $ca = @([int]($a.r / $a.c), [int]($a.g / $a.c), [int]($a.b / $a.c))
    $cb = @([int]($b.r / $b.c), [int]($b.g / $b.c), [int]($b.b / $b.c))
    return @{ paper = $ca; ink = $cb }
}

function ConvertTo-Hex($c) { return ("#{0:X2}{1:X2}{2:X2}" -f $c[0], $c[1], $c[2]) }

# ─── XML node parsing ────────────────────────────────────────────────────────

function Get-Nodes($xml) {
    $nodes = @()
    foreach ($m in [regex]::Matches($xml, '<node\b[^>]*?/?>')) {
        $n = $m.Value
        $get = {
            param($attr)
            if ($n -match ([regex]::Escape($attr) + '="([^"]*)"')) { return $Matches[1] } else { return "" }
        }
        $bounds = & $get 'bounds'
        if ($bounds -notmatch '\[(\d+),(\d+)\]\[(\d+),(\d+)\]') { continue }
        $nodes += [pscustomobject]@{
            class      = & $get 'class'
            desc       = & $get 'content-desc'
            text       = & $get 'text'
            clickable  = (& $get 'clickable') -eq 'true'
            resourceId = & $get 'resource-id'
            x1         = [int]$Matches[1]; y1 = [int]$Matches[2]
            x2         = [int]$Matches[3]; y2 = [int]$Matches[4]
        }
    }
    return $nodes
}

# ─── Main loop ───────────────────────────────────────────────────────────────

$report = @()
$flagTargets = 0; $flagLabels = 0; $flagContrast = 0

foreach ($path in $Screens) {
    $name = ($path -replace '[\\/:?&=]', '_').Trim('_'); if ($name -eq '') { $name = 'home' }
    Write-Host ""
    Write-Host "-- $path" -ForegroundColor Yellow

    Adb shell am start -a android.intent.action.VIEW -d "${SCHEME}://${path}" -n "$APP/.MainActivity" | Out-Null
    Start-Sleep -Milliseconds $DelayMs
    Adb shell input tap 540 300 | Out-Null  # dismiss dev-warning banner
    Start-Sleep -Milliseconds 300

    $png = Join-Path $OutDir "$name.png"
    Adb shell screencap -p /sdcard/_m.png | Out-Null
    Adb pull /sdcard/_m.png $png | Out-Null
    Adb shell rm /sdcard/_m.png | Out-Null
    Adb shell uiautomator dump /sdcard/_m.xml | Out-Null
    $xmlPath = Join-Path $OutDir "$name.xml"
    Adb pull /sdcard/_m.xml $xmlPath | Out-Null
    Adb shell rm /sdcard/_m.xml | Out-Null

    if (-not (Test-Path $png) -or -not (Test-Path $xmlPath)) { Write-Warning "  capture failed"; continue }
    $bmp = [System.Drawing.Image]::FromFile($png)
    $xml = Get-Content $xmlPath -Raw
    $nodes = Get-Nodes $xml

    # 1. Touch targets & labels (clickable nodes)
    foreach ($nd in ($nodes | Where-Object { $_.clickable })) {
        # Native controls (Switch/SeekBar/CheckBox) have platform-fixed sizes —
        # a 46x27dp Switch is Android's own control, not a fixable target.
        $isNativeControl = ($nd.class -match 'Switch|SeekBar|CheckBox|RadioButton')
        $wpx = $nd.x2 - $nd.x1; $hpx = $nd.y2 - $nd.y1
        $wdp = [math]::Round($wpx / $dpPerPx); $hdp = [math]::Round($hpx / $dpPerPx)
        $small = ([math]::Min($wdp, $hdp) -lt $MinTargetDp) -and (-not $isNativeControl)
        # a clickable node needs an accessible name: its own content-desc/text,
        # or a text-bearing descendant (approx: any text node inside its bounds)
        $hasOwnName = -not ([string]::IsNullOrWhiteSpace($nd.desc) -and [string]::IsNullOrWhiteSpace($nd.text))
        $hasChildText = $false
        if (-not $hasOwnName) {
            $hasChildText = [bool]($nodes | Where-Object {
                    -not [string]::IsNullOrWhiteSpace($_.text) -and
                    $_.x1 -ge $nd.x1 -and $_.y1 -ge $nd.y1 -and $_.x2 -le $nd.x2 -and $_.y2 -le $nd.y2
                })
        }
        $unlabeled = (-not $hasOwnName -and -not $hasChildText)
        if ($small) { $flagTargets++ }
        if ($unlabeled) { $flagLabels++ }
        if ($small -or $unlabeled) {
            $label = if ($hasOwnName) { if ($nd.desc) { $nd.desc } else { $nd.text } } else { "(no name)" }
            $tag = @(); if ($small) { $tag += "SMALL ${wdp}x${hdp}dp" }; if ($unlabeled) { $tag += "NO-LABEL" }
            Write-Host ("   !! target   {0,-26} {1}  [{2}]" -f $label, ($tag -join ' '), ($nd.class -replace 'android.widget.', '')) -ForegroundColor Red
            $report += [pscustomobject]@{ screen = $path; kind = "target"; name = $label; wdp = $wdp; hdp = $hdp; small = $small; unlabeled = $unlabeled; class = $nd.class }
        }
    }

    # 2. WCAG contrast on REAL text nodes only. Ionicons render as TextViews
    # whose text is a Private-Use-Area glyph, and moods render as emoji encoded
    # as "&#NNNNN;" entities — both are non-text (icons). Strip emoji entities
    # then require an actual letter so glyphs/emoji/number-only nodes are skipped.
    foreach ($nd in ($nodes | Where-Object { $_.class -match 'TextView' -and (($_.text -replace '&#\d+;', '') -match '[A-Za-z]') })) {
        $cols = Get-TopTwoColors $bmp $nd.x1 $nd.y1 $nd.x2 $nd.y2
        if (-not $cols) { continue }
        $ratio = Get-Wcag $cols.paper $cols.ink
        $hdp = [math]::Round(($nd.y2 - $nd.y1) / $dpPerPx)
        $isLarge = ($hdp -ge 26)   # rough: tall line ≈ large text (AA large = 3:1)
        $threshold = if ($isLarge) { 3.0 } else { $MinContrast }
        if ($ratio -lt $threshold) {
            $flagContrast++
            $txt = if ($nd.text.Length -gt 22) { $nd.text.Substring(0, 22) } else { $nd.text }
            Write-Host ("   !! contrast {0,5}:1  '{1}'  {2}/{3}{4}" -f $ratio, $txt, (ConvertTo-Hex $cols.ink), (ConvertTo-Hex $cols.paper), $(if ($isLarge) { " (large)" } else { "" })) -ForegroundColor Red
            $report += [pscustomobject]@{ screen = $path; kind = "contrast"; text = $nd.text; ratio = $ratio; ink = (ConvertTo-Hex $cols.ink); paper = (ConvertTo-Hex $cols.paper); large = $isLarge; threshold = $threshold }
        }
    }

    $bmp.Dispose()
    $clk = ($nodes | Where-Object { $_.clickable }).Count
    $txt = ($nodes | Where-Object { -not [string]::IsNullOrWhiteSpace($_.text) -and $_.class -match 'TextView' }).Count
    Write-Host ("   scanned {0} clickable, {1} text nodes" -f $clk, $txt) -ForegroundColor DarkGray
}

# ─── Summary ─────────────────────────────────────────────────────────────────

$report | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $OutDir "report.json") -Encoding UTF8
Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ("  Small targets (<${MinTargetDp}dp): {0}" -f $flagTargets) -ForegroundColor $(if ($flagTargets) { "Red" } else { "Green" })
Write-Host ("  Unlabeled clickables:      {0}" -f $flagLabels) -ForegroundColor $(if ($flagLabels) { "Red" } else { "Green" })
Write-Host ("  Low-contrast text (<AA):   {0}" -f $flagContrast) -ForegroundColor $(if ($flagContrast) { "Red" } else { "Green" })
Write-Host "  Report: $OutDir\report.json" -ForegroundColor DarkGray
Write-Host "=======================================================" -ForegroundColor Cyan
if (($flagTargets + $flagLabels + $flagContrast) -eq 0) { Write-Host "MEASURE_A11Y:CLEAN" -ForegroundColor Green }
else { Write-Host "MEASURE_A11Y:ISSUES" -ForegroundColor Yellow }
