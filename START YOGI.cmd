@echo off
setlocal
cd /d "%~dp0"
set "YOGI_APP_ROOT=%~dp0"
set "YOGI_DIAG="
set "YOGI_NO_BROWSER="
if /i "%~1"=="--diagnose" set "YOGI_DIAG=1"
if /i "%~1"=="--no-browser" set "YOGI_NO_BROWSER=1"
powershell.exe -NoLogo -NoProfile -Command "$ErrorActionPreference = 'Stop'; try { $root = $env:YOGI_APP_ROOT; if (-not $root) { $root = $PSScriptRoot }; $runtime = Join-Path $root '.runtime'; $node = $null; $candidates = @((Join-Path $runtime 'node.exe')); $installed = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue; if ($installed) { $candidates += $installed.Source }; foreach ($candidate in $candidates) { if (Test-Path -LiteralPath $candidate -PathType Leaf) { $version = & $candidate --version 2>$null; if ($LASTEXITCODE -eq 0 -and $version -match '^v(\d+)\.' -and [int]$Matches[1] -ge 22) { $node = $candidate; break } } }; if (-not $node) { $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' }; if ($env:PROCESSOR_ARCHITECTURE -eq 'x86' -and -not $env:PROCESSOR_ARCHITEW6432) { throw 'A 64-bit Windows desktop is required.' }; Write-Host 'Node.js was not found. Downloading a portable Node 24 LTS runtime from nodejs.org...'; New-Item -ItemType Directory -Force -Path $runtime | Out-Null; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $base = 'https://nodejs.org/dist/latest-v24.x/'; $sums = (Invoke-WebRequest -UseBasicParsing -Uri ($base + 'SHASUMS256.txt')).Content; if ($sums -is [byte[]]) { $sums = [Text.Encoding]::UTF8.GetString($sums) }; $match = [regex]::Match($sums, '(?m)^([a-f0-9]{64})\s+win-' + $arch + '/node\.exe\s*$'); if (-not $match.Success) { throw 'No verified Node runtime is available for this architecture.' }; $part = Join-Path $runtime 'node.download'; Invoke-WebRequest -UseBasicParsing -Uri ($base + 'win-' + $arch + '/node.exe') -OutFile $part; if ((Get-FileHash -LiteralPath $part -Algorithm SHA256).Hash.ToLowerInvariant() -ne $match.Groups[1].Value) { throw 'Node checksum verification failed. The downloaded file will not run.' }; $node = Join-Path $runtime 'node.exe'; Move-Item -LiteralPath $part -Destination $node -Force }; $launchArgs = @(); if ($env:YOGI_DIAG -eq '1') { $launchArgs += '--diagnose' }; if ($env:YOGI_NO_BROWSER -eq '1') { $launchArgs += '--no-browser' }; & $node (Join-Path $root 'launcher.mjs') @launchArgs; exit $LASTEXITCODE } catch { Write-Host ('Could not start: ' + $_.Exception.Message) -ForegroundColor Red; exit 1 }"
if errorlevel 1 (
 echo.
 echo Read START HERE.txt for help.
 pause
 exit /b 1
)
exit /b 0
