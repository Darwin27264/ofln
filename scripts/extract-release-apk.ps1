param(
  [string]$Flavor = ''
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$apkBaseDir = Join-Path $repoRoot 'android\app\build\outputs\apk'
$outDir = Join-Path $repoRoot 'releaseAPK'

if (-not (Test-Path -LiteralPath $apkBaseDir)) {
  Write-Error "APK outputs folder not found: $apkBaseDir`nBuild first: npm run android:build-release"
}

# Search candidate release directories
$candidates = @()
if ($Flavor) {
  $candidates += Join-Path $apkBaseDir "$Flavor\release"
} else {
  $candidates += Join-Path $apkBaseDir 'play\release'
  $candidates += Join-Path $apkBaseDir 'release'
  $candidates += Join-Path $apkBaseDir 'foss\release'
}

$apk = $null
foreach ($dir in $candidates) {
  if (Test-Path -LiteralPath $dir) {
    $apk = Get-ChildItem -LiteralPath $dir -Filter '*.apk' -File |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
    if ($apk) { break }
  }
}

if (-not $apk) {
  # Fallback: search any release folder recursively
  $apk = Get-ChildItem -LiteralPath $apkBaseDir -Filter '*.apk' -Recurse -File |
    Where-Object { $_.DirectoryName -like '*release*' } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
}

if (-not $apk) {
  Write-Error "No release APK found in $apkBaseDir`nBuild first: npm run android:build-release or npm run android:build-foss"
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

# Also output versioned copy if package.json specifies a version
$pkgJsonPath = Join-Path $repoRoot 'package.json'
if (Test-Path -LiteralPath $pkgJsonPath) {
  try {
    $pkg = Get-Content -LiteralPath $pkgJsonPath -Raw | ConvertFrom-Json
    if ($pkg.version) {
      $versionName = "ofln-v$($pkg.version).apk"
      $versionPath = Join-Path $outDir $versionName
      Copy-Item -LiteralPath $apk.FullName -Destination $versionPath -Force
      Write-Host "Extracted versioned copy -> $versionPath"
    }
  } catch {
    Write-Warning "Could not copy versioned APK: $_"
  }
}
