# Captures the emulator screen into .impeccable/review/<name>.png
# Pulls to a temp folder first: writing straight into OneDrive sometimes leaves an empty file mid-sync.
param([string]$name)
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$tmp = Join-Path $env:TEMP "split-shot.png"
& $adb shell screencap -p /sdcard/shot.png
& $adb pull /sdcard/shot.png $tmp | Out-Null
Copy-Item $tmp "$PSScriptRoot\.impeccable\review\$name.png" -Force
