@echo off
rem Sets up the Wellness PC link: your phone sends its activity log to this PC, and the parenting coach, Tagalog
rem checks and advice run through Claude Code here. Everything it installs goes in %LOCALAPPDATA%\Wellness.
setlocal
title Wellness - PC link
set "WL_REPO=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f=[IO.File]::ReadAllText('%~f0'); $i=$f.LastIndexOf('#PS_START#'); iex $f.Substring($i+10)"
echo.
if not defined WL_CI pause
exit /b
#PS_START#
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$repo = $env:WL_REPO.TrimEnd('\')
$srv  = Join-Path $repo 'pc'
$wl   = Join-Path $env:LOCALAPPDATA 'Wellness'
$bin  = Join-Path $wl 'bin'
New-Item -ItemType Directory -Force $bin | Out-Null
New-Item -ItemType Directory -Force (Join-Path $env:USERPROFILE 'Desktop\wellness-progress') | Out-Null
$env:UV_PROJECT_ENVIRONMENT = Join-Path $wl 'venv'
function Say($t) { Write-Host "  $t" }
Write-Host ''
Write-Host '  Wellness PC link'
Write-Host '  ================'
Write-Host '  Your phone sends what you do in the app to this PC (Desktop\wellness-progress), and asks'
Write-Host '  Claude Code on this PC for the parenting coach, Tagalog checks and advice.'
Write-Host '  Only a phone you pair can use it, and only on your home network.'
Write-Host ''
try {
  # 1. uv (installs Python for this without touching anything else): reuse Loudbook's copy if it's there
  $uv = Join-Path $bin 'uv.exe'
  if (-not (Test-Path $uv)) {
    $lbuv = Join-Path $env:LOCALAPPDATA 'Loudbook\bin\uv.exe'
    if (Test-Path $lbuv) { Copy-Item $lbuv $uv; Say '1/5 uv: using the copy Loudbook already has.' }
    else {
      Say '1/5 Getting uv (Python installer)...'
      $zip = Join-Path $env:TEMP 'wellness-uv.zip'
      Invoke-WebRequest 'https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip' -OutFile $zip -UseBasicParsing
      $tmp = Join-Path $env:TEMP 'wellness-uv'
      if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
      Expand-Archive -Force $zip $tmp
      Copy-Item (Get-ChildItem $tmp -Recurse -Filter 'uv.exe' | Select-Object -First 1).FullName $uv
      Remove-Item -Recurse -Force $tmp, $zip
    }
  } else { Say '1/5 uv is here.' }

  # 2. Python and the one package it needs (to make its own HTTPS certificate)
  Say '2/5 Getting Python ready (first time takes a minute)...'
  & $uv sync --quiet --python 3.12 --project $srv
  if ($LASTEXITCODE -ne 0) { throw 'installing Python failed' }

  # 3. Claude Code: the coach and advice run through it, signed in as you (your own plan; nothing is copied)
  $claude = Get-Command claude -ErrorAction SilentlyContinue
  if (-not $claude) { $claude = Get-Item (Join-Path $env:USERPROFILE '.local\bin\claude.exe') -ErrorAction SilentlyContinue }
  if ($claude) { Say '3/5 Claude Code found.' }
  else {
    Say '3/5 Claude Code was not found. The activity log works anyway; for the coach and advice, install Claude Code'
    Say '    (claude.ai/download or docs.claude.com), open it once and sign in, then run this again.'
  }

  # 4. let the phone reach it: home (private) networks only, these two ports only
  if (-not $env:WL_CI) {
    $have = Get-NetFirewallRule -DisplayName 'Wellness PC link' -ErrorAction SilentlyContinue
    if (-not $have) {
      Say '4/5 Allowing the phone in through Windows Firewall (home networks only). Windows will ask for permission.'
      $cmd = "New-NetFirewallRule -DisplayName 'Wellness PC link' -Direction Inbound -Protocol TCP -LocalPort 8780 -Profile Private -Action Allow | Out-Null; " +
             "New-NetFirewallRule -DisplayName 'Wellness PC link (finding the PC)' -Direction Inbound -Protocol UDP -LocalPort 8781 -Profile Private -Action Allow | Out-Null"
      try { Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList ('-NoProfile -Command "' + $cmd + '"') }
      catch { Say '    Skipped. If Windows asks whether Python may use the network, allow Private networks only.' }
    } else { Say '4/5 Firewall is set.' }
    $public = Get-NetConnectionProfile -ErrorAction SilentlyContinue | Where-Object { $_.NetworkCategory -eq 'Public' }
    if ($public) {
      Say ''
      Say "    Note: Windows treats '$($public[0].Name)' as a public network, so the phone can't reach this PC on it."
      Say '    If it is your home Wi-Fi: Settings > Network & internet > (your network) > Private network.'
      Say ''
    }
    # start with Windows
    $startup = [Environment]::GetFolderPath('Startup')
    $launcher = Join-Path $startup 'Wellness PC link.vbs'
    $line = 'CreateObject("WScript.Shell").Run "wscript.exe //B ""' + (Join-Path $srv 'run-pc.vbs') + '""", 0, False'
    Set-Content -Encoding ASCII $launcher $line
  }

  # 5. (re)start it now
  Say '5/5 Starting the PC link...'
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { ($_.Name -eq 'cmd.exe' -and $_.CommandLine -like '*start-pc.cmd*') -or ($_.Name -eq 'python.exe' -and $_.CommandLine -like '*wellness_pc.py*serve*') } |
    Sort-Object { $_.Name -ne 'cmd.exe' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep 1
  Set-Content (Join-Path $wl 'run.on') 'on'
  $log = Join-Path $wl 'pc.log'
  $before = if (Test-Path $log) { (Get-Item $log).Length } else { 0 }
  Start-Process wscript.exe -ArgumentList '//B', ('"' + (Join-Path $srv 'run-pc.vbs') + '"')
  $ok = $false
  for ($i = 0; $i -lt 120; $i++) {
    Start-Sleep 1
    if (Test-Path $log) {
      $fs = [IO.File]::Open($log, 'Open', 'Read', 'ReadWrite'); $fs.Seek($before, 'Begin') | Out-Null
      $new = (New-Object IO.StreamReader($fs)).ReadToEnd(); $fs.Close()
      if ($new -match 'ready on port') { $ok = $true; break }
      if ($new -match 'Traceback') { Write-Host $new; break }
    }
  }
  if (-not $ok) {
    if (Test-Path $log) { Write-Host '  ---- pc.log (end) ----'; Get-Content $log -Tail 25 | ForEach-Object { Write-Host "  $_" } } else { Write-Host '  (no pc.log was written)' }
    throw "the PC link didn't start (see $log)"
  }
  Say 'The PC link is running, and starts by itself when you sign in to Windows.'
  if (-not $env:WL_CI) {
    Write-Host ''
    & $uv run --no-sync --project $srv python (Join-Path $srv 'wellness_pc.py') pair
  }
} catch {
  Write-Host ''
  Write-Host "  Setup stopped: $($_.Exception.Message)" -ForegroundColor Red
  if ($env:WL_CI) { exit 1 }
}
