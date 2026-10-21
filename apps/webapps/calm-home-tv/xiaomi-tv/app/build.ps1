# Builds xiaomi-tv\app\build\CalmHome.apk using the JDK and Android SDK in the repo's tools\ folder (no Gradle needed).
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$tools = (Resolve-Path (Join-Path $root "..\..\tools")).Path
$env:JAVA_HOME = "$tools\jdk"
$env:PATH = "$tools\jdk\bin;$env:PATH"
$bt = "$tools\sdk\build-tools\34.0.0"
$androidJar = "$tools\sdk\platforms\android-30\android.jar"
$out = Join-Path $root "build"

function Check($step) { if ($LASTEXITCODE -ne 0) { throw "$step failed" } }

if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory "$out\classes", "$out\dex" | Out-Null

& "$bt\aapt2.exe" compile --dir "$root\res" -o "$out\res.zip"; Check "aapt2 compile"
& "$bt\aapt2.exe" link -o "$out\unsigned.apk" -I $androidJar --manifest "$root\AndroidManifest.xml" "$out\res.zip" `
    --min-sdk-version 26 --target-sdk-version 30; Check "aapt2 link"

$sources = Get-ChildItem "$root\src" -Recurse -Filter *.java | ForEach-Object FullName
# --release 8 supplies java.* (incl. lambda support); d8 desugars lambdas for Android.
& javac --release 8 -classpath $androidJar -encoding UTF-8 `
    -d "$out\classes" $sources; Check "javac"

$classes = Get-ChildItem "$out\classes" -Recurse -Filter *.class | ForEach-Object FullName
# One jar instead of every .class on the command line (that grew past Windows' length limit).
& jar cf "$out\classes.jar" -C "$out\classes" .; Check "jar classes"
& "$bt\d8.bat" --release --min-api 26 --lib $androidJar --output "$out\dex" "$out\classes.jar"; Check "d8"

Push-Location "$out\dex"
& jar uf "$out\unsigned.apk" classes.dex; Check "add dex"
Pop-Location

# Assets via jar, not aapt2 -A: on Windows aapt2 stores "assets/wallpapers\00.jpg" with a
# backslash, which Android can't find. jar always writes forward slashes. -0 = store uncompressed.
if (Test-Path "$root\assets") {
    & jar -u -0 -f "$out\unsigned.apk" -C $root assets; Check "add assets"
}

& "$bt\zipalign.exe" -f -p 4 "$out\unsigned.apk" "$out\aligned.apk"; Check "zipalign"

# Keep this key: the TV only accepts updates signed with the same one.
$ks = "$root\keystore\calmhome.jks"   # not in git
$kp = $env:CALM_KEYSTORE_PASS
if (-not $kp) { throw "Set CALM_KEYSTORE_PASS to your keystore password first." }
if (-not (Test-Path $ks)) {
    New-Item -ItemType Directory -Force (Split-Path $ks) | Out-Null
    & keytool -genkeypair -keystore $ks -alias calmhome -keyalg RSA -keysize 2048 -validity 10000 `
        -storepass $kp -keypass $kp -dname "CN=Calm Home"; Check "keytool"
}
& "$bt\apksigner.bat" sign --ks $ks --ks-pass "pass:$kp" --key-pass "pass:$kp" `
    --out "$out\CalmHome.apk" "$out\aligned.apk"; Check "apksigner"

$size = [math]::Round((Get-Item "$out\CalmHome.apk").Length / 1KB)
Write-Host "Built $out\CalmHome.apk ($size KB)"
