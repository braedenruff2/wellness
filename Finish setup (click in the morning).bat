@echo off
rem Click once: (1) restarts the Wellness PC link so it runs the newest version (the Filipino voice download, the voice
rem from your PC, app updates), and (2) turns on the automatic GitHub upload every 15 minutes (a Windows scheduled task).
setlocal
title Wellness - finish setup
set "WL_REPO=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f=[IO.File]::ReadAllText('%~f0'); $i=$f.LastIndexOf('#PS_START#'); iex $f.Substring($i+10)"
echo.
pause
exit /b
#PS_START#
$ErrorActionPreference = 'Continue'
$repo = $env:WL_REPO.TrimEnd('\')
$wl = Join-Path $env:LOCALAPPDATA 'Wellness'
function Say($t) { Write-Host "  $t" }
Write-Host ''
Write-Host '  Wellness: finish setup'
Write-Host '  ======================'

# 1. restart the PC link into its newest version
$uv = Join-Path $wl 'bin\uv.exe'
if (-not (Test-Path $uv)) {
  Say '1/2 The PC link isn''t set up yet: double-click "Set up PC link.bat" once (then run this again).'
} else {
  Say '1/2 Restarting the PC link...'
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { ($_.Name -eq 'cmd.exe' -and $_.CommandLine -like '*start-pc.cmd*') -or ($_.Name -eq 'python.exe' -and $_.CommandLine -like '*wellness_pc.py*serve*') } |
    Sort-Object { $_.Name -ne 'cmd.exe' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep 1
  Set-Content (Join-Path $wl 'run.on') 'on'
  $log = Join-Path $wl 'pc.log'
  $before = if (Test-Path $log) { (Get-Item $log).Length } else { 0 }
  Start-Process wscript.exe -ArgumentList '//B', ('"' + (Join-Path $repo 'pc\run-pc.vbs') + '"')
  $ok = $false
  for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep 1
    if (Test-Path $log) {
      $fs = [IO.File]::Open($log, 'Open', 'Read', 'ReadWrite'); $fs.Seek($before, 'Begin') | Out-Null
      $new = (New-Object IO.StreamReader($fs)).ReadToEnd(); $fs.Close()
      if ($new -match 'ready on port') { $ok = $true; break }
      if ($new -match 'Traceback') { Write-Host $new; break }
    }
  }
  if ($ok) { Say '    Running the newest version (from now on it restarts by itself after updates).' }
  else { Say "    It didn't start: see $log" }
}

# 2. the automatic upload: a scheduled task for you, every 15 minutes, using PowerShell's own task commands
Say '2/2 Turning on the automatic upload to GitHub...'
$name = 'Wellness upload'
try {
  $old = Get-ScheduledTask -TaskName 'Wellness publish' -ErrorAction SilentlyContinue
  if ($old) { Say '    (an older "Wellness publish" task is there; leaving it alone)' }
  $act = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('//B "' + (Join-Path $repo 'tools\publish.vbs') + '"')
  $trg = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 15)
  $set = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
  $who = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $pri = New-ScheduledTaskPrincipal -UserId $who -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $name -Action $act -Trigger $trg -Settings $set -Principal $pri -Force -ErrorAction Stop | Out-Null
  Say "    On: the wellness folder goes up to GitHub every 15 minutes (task ""$name"")."
} catch {
  Say "    Windows refused the scheduled task: $($_.Exception.Message)"
  Say '    (Nothing else was changed. Copy this message to Claude, or run this file again with right-click > Run as administrator.)'
  $log2 = Join-Path $repo 'tools\last-task-error.txt'
  Set-Content $log2 ("$(Get-Date -Format s) $($_.Exception.Message)`r`n$($_ | Out-String)")
  Say "    (Details saved in tools\last-task-error.txt for Claude to read.)"
}
