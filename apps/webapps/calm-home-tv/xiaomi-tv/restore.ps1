# Restore the TV to its backed-up state.
# Re-enables every app that was enabled in the backup, removes the custom
# home screen (if installed), and resets animation speeds.
#
# Usage (from this folder):
#   powershell -ExecutionPolicy Bypass -File restore.ps1 -TvIp 192.168.1.50
#   powershell -ExecutionPolicy Bypass -File restore.ps1 -TvIp 192.168.1.50 -BackupDir backup\<date>
param(
    [string]$TvIp = "192.168.1.50",
    [string]$BackupDir = ""
)

$ErrorActionPreference = "Continue"
$adb = Join-Path $PSScriptRoot "..\tools\platform-tools\adb.exe"
if (-not (Test-Path $adb)) { $adb = "adb" }

if (-not $BackupDir) {
    $BackupDir = Get-ChildItem (Join-Path $PSScriptRoot "backup") -Directory | Sort-Object Name | Select-Object -First 1 -ExpandProperty FullName
}
$enabledFile = Join-Path $BackupDir "packages-enabled.txt"
if (-not (Test-Path $enabledFile)) { Write-Error "Backup not found: $enabledFile"; exit 1 }
Write-Host "Using backup: $BackupDir"

& $adb connect "${TvIp}:5555" | Out-Null
$s = @("-s", "${TvIp}:5555")
if ((& $adb @s get-state) -ne "device") { Write-Error "TV not connected. Check Wi-Fi and USB debugging, then accept the prompt on the TV."; exit 1 }

# 1. Re-enable everything that was enabled before.
$wasEnabled = (Get-Content $enabledFile) -replace '^package:', '' | Where-Object { $_ }
$nowDisabled = (& $adb @s shell pm list packages -d) -replace '^package:', ''
foreach ($p in $nowDisabled) {
    if ($p -in $wasEnabled) {
        Write-Host "Enabling $p"
        & $adb @s shell pm enable --user 0 $p | Out-Null
    }
}
# Bring back anything removed for user 0 (should not happen; we only disable).
$nowInstalled = (& $adb @s shell pm list packages) -replace '^package:', ''
foreach ($p in $wasEnabled) {
    if ($p -notin $nowInstalled) {
        Write-Host "Reinstalling for user 0: $p"
        & $adb @s shell cmd package install-existing $p | Out-Null
    }
}

# 2. Remove the custom home screen and its Home-button service, if present.
$home = "com.calmtv.home"
if ((& $adb @s shell pm list packages $home) -match $home) {
    Write-Host "Removing custom home screen ($home)"
    $acc = (Get-Content (Join-Path $BackupDir "accessibility.txt") -Raw).Trim()
    if ($acc -and $acc -ne "null") { & $adb @s shell settings put secure enabled_accessibility_services $acc }
    else { & $adb @s shell settings delete secure enabled_accessibility_services | Out-Null }
    & $adb @s uninstall $home | Out-Null
}

# 3. Restore animation speeds and the screensaver from backup.
$global = Get-Content (Join-Path $BackupDir "settings-global.txt")
foreach ($key in "window_animation_scale", "transition_animation_scale", "animator_duration_scale") {
    $line = $global | Where-Object { $_ -like "$key=*" }
    if ($line) { & $adb @s shell settings put global $key ($line -split '=', 2)[1] }
    else { & $adb @s shell settings delete global $key | Out-Null }
}
$secure = Get-Content (Join-Path $BackupDir "settings-secure.txt")
foreach ($key in "screensaver_components", "screensaver_default_component") {
    $line = $secure | Where-Object { $_ -like "$key=*" }
    if ($line) { & $adb @s shell settings put secure $key ($line -split '=', 2)[1] }
}

# 4. Lift the background restrictions, reset the background-app cap, and make Google TV the Home app again.
foreach ($p in 'com.google.android.apps.tv.launcherx', 'com.mitv.tvhome.atv', 'com.google.android.videos',
        'com.xiaomi.mitv.updateservice', 'com.google.android.youtube.tv', 'com.amazon.amazonvideo.livingroom',
        'com.netflix.ninja', 'in.startv.hotstar', 'com.sonyliv', 'com.graymatrix.did', 'com.jio.media.stb.ondemand',
        'tv.airtel.xstream.tvapp', 'com.crunchyroll.crunchyroid', 'com.fancode.tv') {
    & $adb @s shell cmd appops set $p RUN_ANY_IN_BACKGROUND allow | Out-Null
}
& $adb @s shell device_config delete activity_manager max_cached_processes | Out-Null
& $adb @s shell cmd role add-role-holder android.app.role.HOME com.google.android.apps.tv.launcherx | Out-Null

# Give Android time to save package states before rebooting (it writes them after a delay;
# rebooting straight away can lose them).
Write-Host "Saving..."
Start-Sleep 25
& $adb @s shell sync
Write-Host "Done. Restarting TV..."
& $adb @s reboot
