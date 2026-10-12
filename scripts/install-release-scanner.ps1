$ErrorActionPreference = 'Stop'
$scannerVersion = '8.30.1'
$scannerPlatform = if ($IsWindows -or $env:OS -eq 'Windows_NT') { 'windows' } else { 'linux' }
$scannerExtension = if ($scannerPlatform -eq 'windows') { 'zip' } else { 'tar.gz' }
$scannerName = "gitleaks_${scannerVersion}_${scannerPlatform}_x64.${scannerExtension}"
$scannerRoot = Join-Path (Get-Location) 'artifacts/release-scanner'
New-Item -ItemType Directory -Path $scannerRoot -Force | Out-Null
$scannerBase = "https://github.com/gitleaks/gitleaks/releases/download/v$scannerVersion"
Invoke-WebRequest "$scannerBase/$scannerName" -OutFile (Join-Path $scannerRoot $scannerName)
Invoke-WebRequest "$scannerBase/gitleaks_${scannerVersion}_checksums.txt" -OutFile (Join-Path $scannerRoot 'checksums.txt')
$scannerExpected = (Get-Content (Join-Path $scannerRoot 'checksums.txt') | Where-Object { $_ -match ([regex]::Escape($scannerName) + '$') }).Split(' ')[0]
$scannerActual = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $scannerRoot $scannerName)).Hash.ToLowerInvariant()
if (!$scannerExpected -or $scannerExpected -ne $scannerActual) { throw 'Scanner checksum mismatch' }
if ($scannerPlatform -eq 'windows') {
  Expand-Archive -LiteralPath (Join-Path $scannerRoot $scannerName) -DestinationPath $scannerRoot -Force
  $scannerBinary = Join-Path $scannerRoot 'gitleaks.exe'
} else {
  tar -xzf (Join-Path $scannerRoot $scannerName) -C $scannerRoot
  if ($LASTEXITCODE -ne 0) { throw 'Scanner extraction failed' }
  $scannerBinary = Join-Path $scannerRoot 'gitleaks'
}
if ($env:GITHUB_ENV) { Add-Content -LiteralPath $env:GITHUB_ENV -Value "GITLEAKS_BIN=$scannerBinary" }
Write-Output "Verified release scanner: $scannerBinary"
