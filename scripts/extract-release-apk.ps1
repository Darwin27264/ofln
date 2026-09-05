# Copy the release APK into releaseAPK/ as ofln_{date}.apk (keeps prior builds).
# Run from the ofln/ directory:
#   powershell -ExecutionPolicy Bypass -File .\scripts\extract-release-apk.ps1

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$releaseDir = Join-Path $repoRoot 'android\app\build\outputs\apk\release'
$outDir = Join-Path $repoRoot 'releaseAPK'

if (-not (Test-Path -LiteralPath $releaseDir)) {
  Write-Error "Release APK folder not found: $releaseDir`nBuild first: cd android; .\gradlew.bat assembleRelease"
}

$apk = Get-ChildItem -LiteralPath $releaseDir -Filter 'ofln-release.apk' -File -ErrorAction SilentlyContinue |
  Select-Object -First 1

if (-not $apk) {
  $apk = Get-ChildItem -LiteralPath $releaseDir -Filter '*.apk' -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
}

if (-not $apk) {
  Write-Error "No APK found in $releaseDir`nBuild first: cd android; .\gradlew.bat assembleRelease"
}

if (-not (Test-Path -LiteralPath $outDir)) {
  New-Item -ItemType Directory -Path $outDir | Out-Null
}

$dateStamp = Get-Date -Format 'yyyy-MM-dd'
$destName = "ofln_$dateStamp.apk"
$destPath = Join-Path $outDir $destName

# Same-day rebuild: keep the earlier file and add a time suffix.
if (Test-Path -LiteralPath $destPath) {
  $timeStamp = Get-Date -Format 'HHmmss'
  $destName = "ofln_${dateStamp}_$timeStamp.apk"
  $destPath = Join-Path $outDir $destName
}

Copy-Item -LiteralPath $apk.FullName -Destination $destPath -Force

$sizeMb = [math]::Round($apk.Length / 1MB, 1)
Write-Host "Extracted $($apk.Name) ($sizeMb MB) -> $destPath"
