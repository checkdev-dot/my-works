# Taps an on-screen element whose text or description matches, scrolling down to find it if needed.
# Usage: .\tap.ps1 "Split" [index]
param([string]$text, [int]$index = 0)
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
# Exact match first; Compose merges a clickable card's texts into one node, so fall back to "contains".
$pattern = '(?:text|content-desc)="' + [regex]::Escape($text) + '"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"'
for ($try = 0; $try -lt 5; $try++) {
    & $adb shell uiautomator dump /sdcard/ui.xml | Out-Null
    $xml = (& $adb shell cat /sdcard/ui.xml) -join ""
    $m = [regex]::Matches($xml, $pattern)
    if ($m.Count -le $index) { $m = [regex]::Matches($xml, '(?:text|content-desc)="[^"]*' + [regex]::Escape($text) + '[^"]*"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"') }
    if ($m.Count -gt $index) {
        $g = $m[$index].Groups
        $x = ([int]$g[1].Value + [int]$g[3].Value) / 2; $y = ([int]$g[2].Value + [int]$g[4].Value) / 2
        & $adb shell input tap $x $y
        Start-Sleep -Milliseconds 1500
        exit 0
    }
    & $adb shell input swipe 540 1700 540 900 250
    Start-Sleep -Milliseconds 600
}
Write-Output "not found: $text"; exit 1
