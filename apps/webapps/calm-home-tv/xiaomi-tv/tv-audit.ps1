# TV audit bot: 40 checks for debloat, essentials, Calm Home, speed and storage.
# Read-only except that it opens apps/screens to measure them, then returns Home.
#
#   powershell -ExecutionPolicy Bypass -File tv-audit.ps1 -TvIp 192.168.1.50
param([string]$TvIp = "192.168.1.50")

$ErrorActionPreference = "Continue"
$adb = Join-Path $PSScriptRoot "..\tools\platform-tools\adb.exe"
$dev = "${TvIp}:5555"
$me = "com.calmtv.home"
$results = New-Object System.Collections.ArrayList
$stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$outDir = Join-Path $PSScriptRoot "audit"
New-Item -ItemType Directory -Force $outDir | Out-Null

function Sh([string]$cmd) { (& $adb -s $dev shell $cmd) -join "`n" }
function Key([string]$k) { & $adb -s $dev shell input keyevent $k | Out-Null }
function Focus { (Sh "dumpsys window | grep mCurrentFocus") }
function Pss([string]$pkg) {
    $m = Sh "dumpsys meminfo $pkg | grep 'TOTAL PSS'"
    if ($m -match 'TOTAL PSS:\s+(\d+)') { [int]$Matches[1] / 1024 } else { 0 }
}
function Rec([int]$id, [string]$area, [string]$name, [string]$status, [string]$detail) {
    [void]$results.Add([pscustomobject]@{ "#" = $id; Area = $area; Check = $name; Result = $status; Detail = $detail })
    $color = @{ PASS = "Green"; WARN = "Yellow"; FAIL = "Red"; INFO = "Cyan" }[$status]
    Write-Host ("{0,2}. [{1}] {2} - {3}" -f $id, $status, $name, $detail) -ForegroundColor $color
}
function Grade([double]$v, [double]$good, [double]$ok, [bool]$lowerIsBetter = $true) {
    if ($lowerIsBetter) { if ($v -le $good) { "PASS" } elseif ($v -le $ok) { "WARN" } else { "FAIL" } }
    else { if ($v -ge $good) { "PASS" } elseif ($v -ge $ok) { "WARN" } else { "FAIL" } }
}
function Shot([string]$name) {
    Sh "screencap -p /sdcard/audit.png" | Out-Null
    & $adb -s $dev pull /sdcard/audit.png (Join-Path $outDir "$stamp-$name.png") | Out-Null
    Sh "rm /sdcard/audit.png" | Out-Null
}

$debloated = @{
    telemetry = @('com.miui.tv.analytics', 'com.xiaomi.statistic')
    # (partnercustomizer stays ON: it maps the remote's Netflix/Prime/YouTube buttons)
    ads       = @('com.xm.webcontent', 'android.autoinstalls.config.xioami.dangal', 'com.mitv.tvhome.oemtab', 'com.mitv.tvhome.michannel', 'com.mitv.tvhome.mitvplus', 'com.google.android.apps.tv.dreamx')
    junk      = @('com.google.android.feedback', 'com.xiaomi.mitv.manualhelp', 'com.google.android.play.games', 'com.google.android.marvin.talkback', 'com.android.printspooler', 'com.android.dynsystem', 'com.android.bluetoothmidiservice', 'com.xiaomi.mitv.tvmanager', 'com.mitv.gallery', 'com.xiaomi.mitv.mediaexplorer', 'com.xiaomi.mimusic2', 'com.google.android.tts',
                  'com.tcl.browser', 'com.mxtech.videoplayer.television', 'com.google.android.syncadapters.calendar',
                  'com.google.android.videos')
}
$streaming = @('com.netflix.ninja', 'com.amazon.amazonvideo.livingroom', 'in.startv.hotstar', 'com.sonyliv', 'com.google.android.youtube.tv', 'com.google.android.youtube.tvmusic', 'com.fancode.tv', 'com.spotify.tv.android')

# ---------- A. Connection ----------
& $adb connect $dev | Out-Null
$state = (& $adb -s $dev get-state) -join ''
if ($state -ne 'device') { Write-Host "TV not connected ($state). Check Wi-Fi / USB debugging." -ForegroundColor Red; exit 1 }
Rec 1 "Device" "ADB connection" "PASS" $dev
Rec 2 "Device" "Model / Android" "INFO" ((Sh "getprop ro.product.model") + " / Android " + (Sh "getprop ro.build.version.release"))
$up = Sh "cat /proc/uptime"; $upMin = [math]::Round(([double]($up -split ' ')[0]) / 60)
Rec 3 "Device" "Booted and stable" $(if ((Sh "getprop sys.boot_completed") -eq '1') { "PASS" } else { "FAIL" }) "uptime $upMin min"

# ---------- B. Debloat ----------
$disabled = (Sh "pm list packages -d") -split "`n" | ForEach-Object { ($_ -replace 'package:', '').Trim() } | Where-Object { $_ }
$all = (Sh "pm list packages") -split "`n" | ForEach-Object { ($_ -replace 'package:', '').Trim() } | Where-Object { $_ }
$id = 4
foreach ($group in 'telemetry', 'ads', 'junk') {
    $missing = $debloated[$group] | Where-Object { $_ -notin $disabled }
    Rec $id "Debloat" "$group apps disabled ($($debloated[$group].Count))" $(if (-not $missing) { "PASS" } else { "FAIL" }) $(if ($missing) { "still enabled: " + ($missing -join ', ') } else { "all disabled" })
    $id++
}
$backup = Get-ChildItem (Join-Path $PSScriptRoot "backup") -Directory | Sort-Object Name | Select-Object -First 1
$wasThere = (Get-Content (Join-Path $backup.FullName "packages-enabled.txt")) -replace 'package:', '' | Where-Object { $_ }
$gone = $wasThere | Where-Object { $_ -notin $all }
Rec 7 "Debloat" "Nothing uninstalled (vs backup)" $(if (-not $gone) { "PASS" } else { "FAIL" }) $(if ($gone) { "missing: " + ($gone -join ', ') } else { "$($wasThere.Count) original packages present" })
$expected = $debloated.Values | ForEach-Object { $_ }
$extra = $disabled | Where-Object { $_ -notin $expected }
Rec 8 "Debloat" "No unexpected apps disabled" $(if (-not $extra) { "PASS" } else { "WARN" }) $(if ($extra) { "also disabled: " + ($extra -join ', ') } else { "$($disabled.Count) disabled, all intended" })

# ---------- C. Essentials still working ----------
function Enabled([string]$p) { ($p -in $all) -and ($p -notin $disabled) }
Rec 9 "Essentials" "Play Store enabled" $(if (Enabled 'com.android.vending') { "PASS" } else { "FAIL" }) "install apps from All Apps > Play Store"
Rec 10 "Essentials" "Google Play Services enabled" $(if (Enabled 'com.google.android.gms') { "PASS" } else { "FAIL" }) "sign-in, DRM, casting"
$hdmi = Sh "dumpsys tv_input | grep -c 'Hdmi[0-9]InputService/HW'"
Rec 11 "Essentials" "HDMI inputs registered (PS4)" $(if ((Enabled 'com.droidlogic.tvinput') -and [int]$hdmi -ge 2) { "PASS" } else { "FAIL" }) "$hdmi HDMI input entries"
$hdmiHandler = Sh "cmd package resolve-activity --brief -a android.intent.action.VIEW -t vnd.android.cursor.item/channel | tail -1"
Rec 12 "Essentials" "HDMI switch handler (Live TV app)" $(if ($hdmiHandler -match 'livetv') { "PASS" } else { "FAIL" }) $hdmiHandler.Trim()
Rec 13 "Essentials" "Bluetooth (PS4 pad/remote)" $(if ((Enabled 'com.android.bluetooth') -and (Sh "settings get global bluetooth_on") -eq '1') { "PASS" } else { "WARN" }) ("bluetooth_on=" + (Sh "settings get global bluetooth_on"))
Rec 14 "Essentials" "Remote control service" $(if (Enabled 'com.google.android.tv.remote.service') { "PASS" } else { "FAIL" }) ""
Rec 15 "Essentials" "On-screen keyboard" $(if (Enabled 'com.google.android.inputmethod.latin') { "PASS" } else { "FAIL" }) ""
$offStream = $streaming | Where-Object { -not (Enabled $_) -and ($_ -in $all) }
Rec 16 "Essentials" "Streaming & music apps enabled" $(if (-not $offStream) { "PASS" } else { "FAIL" }) $(if ($offStream) { "disabled: " + ($offStream -join ', ') } else { "$(($streaming | Where-Object { $_ -in $all }).Count) apps OK" })

# ---------- D. Calm Home ----------
$ver = Sh "dumpsys package $me | grep versionName"
Rec 17 "Calm Home" "Installed" $(if ($ver) { "PASS" } else { "FAIL" }) $ver.Trim()
Sh "am start -n com.android.tv.settings/.MainSettings" | Out-Null; Start-Sleep 3
Key KEYCODE_HOME; Start-Sleep 3
$f = Focus
Rec 18 "Calm Home" "Home button opens Calm Home" $(if ($f -match $me) { "PASS" } else { "FAIL" }) ($f -replace '.*u0 ', '').Trim('}', ' ')
$a11y = Sh "settings get secure enabled_accessibility_services"
$crashed = Sh "dumpsys accessibility | grep 'Crashed services' | grep -c HomeWatcher"
Rec 19 "Calm Home" "Home-button service running" $(if ($a11y -match 'HomeWatcher' -and [int]$crashed -eq 0) { "PASS" } else { "FAIL" }) $(if ([int]$crashed -gt 0) { "enabled but marked crashed" } else { "enabled and running" })
$perm = Sh "dumpsys package $me | grep 'WRITE_SECURE_SETTINGS: granted=true'"
Rec 20 "Calm Home" "Self-heal permission" $(if ($perm) { "PASS" } else { "WARN" }) "re-enables Home service after a force-stop"
$usage = Sh "appops get $me GET_USAGE_STATS"
Rec 21 "Calm Home" "Usage access (suggestions)" $(if ($usage -match 'allow') { "PASS" } else { "WARN" }) $usage.Trim()
$dex = Sh "dumpsys package dexopt | grep -A3 '\[$me\]' | grep -o 'status=[a-z-]*' | head -1"
Rec 22 "Calm Home" "Pre-compiled (AOT)" $(if ($dex -match 'speed') { "PASS" } else { "WARN" }) $dex
$crash = Sh "logcat -d -b crash | grep -c $me"
Rec 23 "Calm Home" "No crashes logged" $(if ([int]$crash -eq 0) { "PASS" } else { "FAIL" }) "$crash crash lines"
$anr = Sh "logcat -d -b events | grep am_anr | grep -c $me"
Rec 24 "Calm Home" "No freezes (ANR)" $(if ([int]$anr -eq 0) { "PASS" } else { "FAIL" }) "$anr ANRs"
Key KEYCODE_HOME; Start-Sleep 2; Key KEYCODE_DPAD_DOWN; Start-Sleep 2
$f = Focus
Rec 25 "Calm Home" "Down opens Library" $(if ($f -match 'LibraryActivity') { "PASS" } else { "FAIL" }) ""
Shot "library"
Key KEYCODE_BACK; Start-Sleep 2
$f = Focus
Rec 26 "Calm Home" "Back returns to home" $(if ($f -match 'HomeActivity') { "PASS" } else { "FAIL" }) ""

# ---------- E. Speed ----------
$memAvail = [int]((Sh "grep MemAvailable /proc/meminfo") -replace '\D', '') / 1024
Rec 27 "Speed" "Free RAM (MemAvailable)" (Grade $memAvail 600 400 $false) ("{0:N0} MB of 1,496 MB" -f $memAvail)
Start-Sleep 3
$fg = [math]::Round((Pss $me))
Rec 28 "Speed" "Calm Home RAM, on screen" (Grade $fg 75 100) "$fg MB"
Sh "am start -n com.android.tv.settings/.MainSettings" | Out-Null; Start-Sleep 6
Sh "am send-trim-memory $me RUNNING_LOW" | Out-Null; Start-Sleep 2
$bg = [math]::Round((Pss $me))
Rec 29 "Speed" "Calm Home RAM, in background" (Grade $bg 45 70) "$bg MB while another app is open"
Key KEYCODE_HOME; Start-Sleep 3
$warm = Sh "am start -W -n $me/.HomeActivity | grep TotalTime"
Sh "am start -n com.android.tv.settings/.MainSettings" | Out-Null; Start-Sleep 3
$warm = Sh "am start -W -n $me/.HomeActivity | grep -E 'TotalTime|WaitTime'"
$warmMs = if ($warm -match 'TotalTime: (\d+)') { [int]$Matches[1] } elseif ($warm -match 'WaitTime: (\d+)') { [int]$Matches[1] } else { -1 }
Rec 30 "Speed" "Return to home (warm)" $(if ($warmMs -lt 0) { "WARN" } else { Grade $warmMs 300 600 }) "$warmMs ms"
Sh "am force-stop $me" | Out-Null; Start-Sleep 1
$cold = Sh "am start -W -n $me/.HomeActivity | grep TotalTime"
$coldMs = if ($cold -match '(\d+)') { [int]$Matches[1] } else { -1 }
Rec 31 "Speed" "Calm Home cold start" (Grade $coldMs 700 1200) "$coldMs ms"
Start-Sleep 3
Sh "dumpsys gfxinfo $me reset" | Out-Null
# Remote-paced presses from ONE shell on the TV: a separate "adb shell input" per press starts a
# Java process on the TV each time, which itself steals CPU and makes the dock look janky.
$pace = (@('input keyevent 22; sleep 0.4') * 6 + @('input keyevent 21; sleep 0.4') * 6) -join '; '
Sh "$pace; sleep 1" | Out-Null
$gfx = Sh "dumpsys gfxinfo $me"
$jank = if ($gfx -match 'Janky frames: \d+ \(([\d.]+)%\)') { [double]$Matches[1] } else { -1 }
$p90 = if ($gfx -match '90th percentile: (\d+)ms') { [int]$Matches[1] } else { -1 }
$frames = if ($gfx -match 'Total frames rendered: (\d+)') { [int]$Matches[1] } else { 0 }
Rec 32 "Speed" "Dock navigation smoothness" (Grade $jank 10 25) "$jank% janky of $frames frames"
Rec 33 "Speed" "Frame time (90th percentile)" (Grade $p90 20 34) "$p90 ms (16 ms = perfect 60 fps)"
$anim = @('window_animation_scale', 'transition_animation_scale', 'animator_duration_scale') | ForEach-Object { Sh "settings get global $_" }
Rec 34 "Speed" "System animations 0.5x" $(if (($anim | Where-Object { $_ -ne '0.5' }).Count -eq 0) { "PASS" } else { "WARN" }) ($anim -join ' / ')
# (Google TV launcher is NOT restricted: it handles the remote's app buttons)
$restricted = @('com.amazon.amazonvideo.livingroom', 'com.mitv.tvhome.atv', 'com.xiaomi.mitv.updateservice', 'com.google.android.youtube.tv', 'com.netflix.ninja') |
    Where-Object { (Sh "cmd appops get $_ RUN_ANY_IN_BACKGROUND") -match 'ignore' }
Rec 35 "Speed" "Background restrictions applied" $(if ($restricted.Count -eq 5) { "PASS" } else { "WARN" }) "$($restricted.Count)/5 sampled apps background-restricted"
$nfx = (Sh "cmd package resolve-activity --brief -c android.intent.category.LEANBACK_LAUNCHER -a android.intent.action.MAIN com.netflix.ninja | tail -1").Trim()
Sh "am force-stop com.netflix.ninja" | Out-Null
$nf = Sh "am start -W -n $nfx | grep TotalTime"
$nfMs = if ($nf -match '(\d+)') { [int]$Matches[1] } else { -1 }
Rec 36 "Speed" "Netflix cold launch" (Grade $nfMs 2500 4500) "$nfMs ms"
Start-Sleep 2; Sh "am force-stop com.netflix.ninja" | Out-Null
Key KEYCODE_HOME; Start-Sleep 3

# ---------- F. Storage & background ----------
$df = Sh "df /data | tail -1"
$freeMb = [math]::Round(([double](($df -split '\s+')[3])) / 1024)
Rec 37 "Storage" "Free app storage" (Grade $freeMb 1500 800 $false) ("{0:N0} MB free of 4,097 MB" -f $freeMb)
$cache = Sh "dumpsys diskstats | grep 'App Cache Size'"
$cacheMb = if ($cache -match '(\d+)') { [math]::Round([double]$Matches[1] / 1MB) } else { -1 }
Rec 38 "Storage" "App caches" (Grade $cacheMb 100 250) "$cacheMb MB (diskstats is refreshed periodically)"
$apk = (Get-Item (Join-Path $PSScriptRoot "calm-home\build\CalmHome.apk")).Length / 1KB
Rec 39 "Storage" "Calm Home size (incl. 12 photos)" (Grade $apk 2500 5000) ("{0:N0} KB" -f $apk)
$gtv = [math]::Round((Pss 'com.google.android.apps.tv.launcherx') + (Pss 'com.google.android.apps.tv.launcherx:coreservices'))
Rec 40 "Speed" "Google TV home still using RAM" $(if ($gtv -le 5) { "PASS" } else { "WARN" }) "$gtv MB in the background (disable it to reclaim)"

Shot "home"
$summary = $results | Group-Object Result | ForEach-Object { "$($_.Name): $($_.Count)" }
Write-Host ""
Write-Host ("Summary: " + ($summary -join "  ")) -ForegroundColor White
$results | Export-Csv -NoTypeInformation -Encoding UTF8 (Join-Path $outDir "$stamp-audit.csv")
$results | Format-Table -AutoSize | Out-String -Width 220 | Out-File -Encoding utf8 (Join-Path $outDir "$stamp-audit.txt")
Write-Host "Saved audit\$stamp-audit.csv and screenshots."
