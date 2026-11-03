# Runs Gradle with the build JDK and keeps Gradle's caches outside OneDrive.
# Usage: .\build.ps1 assembleDebug   |   .\build.ps1 testDebugUnitTest
# After a successful build, the latest APK is copied to the "Split app - install on phone" folder on the Desktop.
$env:JAVA_HOME = Join-Path $env:USERPROFILE "AndroidBuild\tools\jdk-21.0.12.1+1"
& "$PSScriptRoot\gradlew.bat" --project-cache-dir (Join-Path $env:USERPROFILE "AndroidBuild\split-app\.gradle") @args
$code = $LASTEXITCODE
$apk = Join-Path $env:USERPROFILE "AndroidBuild\split-app\app\outputs\apk\debug\app-debug.apk"
$drop = Join-Path (Split-Path (Split-Path $PSScriptRoot)) "Split app - install on phone"
if ($code -eq 0 -and (Test-Path $apk) -and ($args -contains "assembleDebug")) {
    New-Item -ItemType Directory -Force $drop | Out-Null
    Copy-Item $apk (Join-Path $drop "Split.apk") -Force
}
exit $code
