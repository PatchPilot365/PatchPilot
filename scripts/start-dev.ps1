#Requires -Version 7
<#
.SYNOPSIS
  Starts the local PatchPilot dev stack: Docker Desktop, the dev containers
  (Postgres/Redis/Ollama), then the api, worker and web dev servers.

.DESCRIPTION
  Safe to re-run: anything already running is left alone, so it never starts a
  second api/worker (two workers would both consume the same queues). Meant to
  be run at sign-in from Task Scheduler — see -Register.

  Each dev server opens in its own minimized PowerShell window titled
  "PatchPilot <name>"; close that window to stop it.

  Note: the worker catches up any schedule that came due while it was off, and
  fires it straight away.

.PARAMETER DryRun
  Report what would be started without starting anything.

.PARAMETER Register
  Register this script as a Task Scheduler task that runs at sign-in.

.PARAMETER Unregister
  Remove that Task Scheduler task.
#>
param(
  [switch]$DryRun,
  [switch]$Register,
  [switch]$Unregister
)

$ErrorActionPreference = 'Stop'
$TaskName = 'PatchPilot dev stack'
$Repo = Split-Path $PSScriptRoot -Parent

if ($Unregister) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Removed scheduled task '$TaskName'."
  return
}

if ($Register) {
  $action = New-ScheduledTaskAction -Execute (Get-Command pwsh).Source `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
  # Give sign-in (and OneDrive, which this repo lives in) a moment to settle.
  $trigger.Delay = 'PT30S'
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
    -Description "Starts Docker Desktop and the PatchPilot dev servers ($Repo)." -Force | Out-Null
  Write-Host "Registered scheduled task '$TaskName' to run at sign-in."
  return
}

function Test-DockerReady {
  docker info *> $null
  return $LASTEXITCODE -eq 0
}

function Test-PortListening([int]$Port) {
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

# The api and worker run the same command line from different directories, so
# match on the pnpm filter this script (and .claude/launch.json) launches them with.
function Test-ProcessRunning([string]$Filter) {
  return [bool](Get-CimInstance Win32_Process |
    Where-Object { $_.CommandLine -and $_.CommandLine -like "*$Filter*" })
}

# 1. Docker Desktop
if (-not (Test-DockerReady)) {
  $dockerExe = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
  if ($DryRun) {
    Write-Host "[dry run] would start Docker Desktop and wait for it."
  } else {
    if (-not (Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue)) {
      Write-Host 'Starting Docker Desktop...'
      Start-Process $dockerExe
    }
    $deadline = (Get-Date).AddMinutes(5)
    while (-not (Test-DockerReady)) {
      if ((Get-Date) -gt $deadline) { throw 'Docker did not become ready within 5 minutes.' }
      Start-Sleep -Seconds 5
    }
    Write-Host 'Docker is ready.'
  }
} else {
  Write-Host 'Docker is ready.'
}

# 2. Dev containers (they also restart on their own; this covers a fresh/removed set)
Push-Location $Repo
try {
  if ($DryRun) {
    Write-Host '[dry run] would run: pnpm infra:dev:up'
  } else {
    pnpm infra:dev:up
    if ($LASTEXITCODE -ne 0) { throw 'pnpm infra:dev:up failed.' }
  }
} finally {
  Pop-Location
}

# 3. Dev servers
$servers = @(
  @{ Name = 'api';    Filter = '@patchpilot/api';    Port = 4000;  Script = 'dev:resilient' },
  @{ Name = 'worker'; Filter = '@patchpilot/worker'; Port = $null; Script = 'dev:resilient' },
  @{ Name = 'web';    Filter = '@patchpilot/web';    Port = 5173;  Script = 'dev' }
)

foreach ($s in $servers) {
  $running = if ($s.Port) { Test-PortListening $s.Port } else { Test-ProcessRunning $s.Filter }
  if ($running) {
    Write-Host "$($s.Name): already running — leaving it alone."
    continue
  }
  if ($DryRun) {
    Write-Host "[dry run] would start $($s.Name): pnpm --filter $($s.Filter) $($s.Script)"
    continue
  }
  $title = "PatchPilot $($s.Name)"
  $command = "`$Host.UI.RawUI.WindowTitle = '$title'; pnpm --filter $($s.Filter) $($s.Script)"
  Start-Process pwsh -WorkingDirectory $Repo -WindowStyle Minimized `
    -ArgumentList '-NoProfile', '-NoExit', '-Command', $command
  Write-Host "$($s.Name): started (window '$title')."
}
