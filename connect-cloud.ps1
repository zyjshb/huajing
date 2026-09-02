# Map remote Comfy to local 8188. Canvas: start.bat
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

function Test-Port([int]$Port) {
  $tcp = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $tcp.BeginConnect("127.0.0.1", $Port, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(350)
    return [bool]($ok -and $tcp.Connected)
  } catch {
    return $false
  } finally {
    $tcp.Close()
  }
}

function Parse-SshTarget([string]$raw) {
  $raw = ($raw -replace '^\s+|\s+$', '')
  $user = "root"
  $port = ""
  $rport = ""
  $hostName = $raw

  if ($raw -match '-p\s+(\d+)') { $port = $Matches[1] }
  if ($raw -match '-L\s+\d+:[^:\s]+:(\d+)') { $rport = $Matches[1] }
  if ($raw -match '([\w.-]+)@([\w.-]+)') {
    $user = $Matches[1]
    $hostName = $Matches[2]
  } elseif ($raw -match 'ssh\s+.+\s+([\w.-]+)\s*$') {
    $hostName = $Matches[1]
  } elseif ($raw -match '^([\w.-]+):(\d+)$') {
    $hostName = $Matches[1]
    $port = $Matches[2]
  }

  $hostName = $hostName -replace '^ssh\s+', ''
  return [pscustomobject]@{ User = $user; Host = $hostName; Port = $port; RemotePort = $rport }
}

Write-Host ""
Write-Host "  Cloud tunnel" -ForegroundColor Cyan
Write-Host "  local 127.0.0.1:8188  <-  Comfy on the machine"
Write-Host "  Open the canvas with start.bat. This window is tunnel only."
Write-Host ""
Write-Host "  Paste a full ssh line, for example:"
Write-Host "  ssh -p 12345 root@region.seetacloud.com"
Write-Host "  Or just an IP / hostname."
Write-Host ""

$lastPath = Join-Path $Root "data\tunnel.last.json"
$last = $null
if (Test-Path $lastPath) {
  try { $last = Get-Content $lastPath -Raw | ConvertFrom-Json } catch { $last = $null }
}
if ($last -and $last.Host) {
  Write-Host ("  Last: {0}@{1}  port {2}  remote Comfy {3}" -f $last.User, $last.Host, $last.Port, $last.RemotePort) -ForegroundColor DarkGray
}

$addr = Read-Host "Address or ssh command"
if (-not $addr) { Write-Host "No address." -ForegroundColor Red; exit 1 }
$t = Parse-SshTarget $addr

if (-not $t.Port) {
  $hint = if ($last -and $last.Port) { $last.Port } else { "22" }
  $p = Read-Host "SSH port (Enter=$hint)"
  $t.Port = if ($p) { $p } else { $hint }
}
if (-not $t.RemotePort) {
  $hint = if ($last -and $last.RemotePort) { $last.RemotePort } else { "6006" }
  $rp = Read-Host "Comfy port on the machine (Enter=$hint; use 8188 if it already listens there)"
  $t.RemotePort = if ($rp) { $rp } else { $hint }
}

$sec = Read-Host "Password" -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
)
if (-not $plain) { Write-Host "No password." -ForegroundColor Red; exit 1 }

if (Test-Port 8188) {
  Write-Host ""
  Write-Host "Local 8188 is already in use (local Comfy or an old tunnel)." -ForegroundColor Yellow
  Write-Host "Close local Comfy, or run disconnect-cloud.bat first."
  Read-Host "Press Enter to exit"
  exit 1
}

New-Item -ItemType Directory -Force -Path (Join-Path $Root "data") | Out-Null
@{ User = $t.User; Host = $t.Host; Port = $t.Port; RemotePort = $t.RemotePort } |
  ConvertTo-Json | Set-Content $lastPath -Encoding UTF8

$ssh = "$env:SystemRoot\System32\OpenSSH\ssh.exe"
if (-not (Test-Path $ssh)) {
  $sshCmd = Get-Command ssh -ErrorAction SilentlyContinue
  $ssh = if ($sshCmd) { $sshCmd.Source } else { $null }
}
$plinkCmd = Get-Command plink -ErrorAction SilentlyContinue
$plink = if ($plinkCmd) { $plinkCmd.Source } else { $null }

Write-Host ""
Write-Host ("Connecting {0}@{1}:{2}  ->  remote {3} …" -f $t.User, $t.Host, $t.Port, $t.RemotePort) -ForegroundColor Cyan
Write-Host "Keep this window open. In Settings, Comfy URL is http://127.0.0.1:8188"
Write-Host ""

$passFile = Join-Path $env:TEMP ("jc-ssh-" + [guid]::NewGuid().ToString("n") + ".txt")
$askFile = Join-Path $env:TEMP ("jc-ask-" + [guid]::NewGuid().ToString("n") + ".cmd")
$scrub = "Start-Sleep -Seconds 20; Remove-Item -Force -ErrorAction SilentlyContinue '$passFile','$askFile'"
Start-Process -FilePath "powershell.exe" -WindowStyle Hidden -ArgumentList @("-NoProfile","-Command",$scrub) | Out-Null
try {
  [IO.File]::WriteAllText($passFile, $plain)
  "@echo off`r`ntype `"$passFile`"`r`n" | Set-Content $askFile -Encoding ASCII

  if ($ssh) {
    $env:DISPLAY = "127.0.0.1:0"
    $env:SSH_ASKPASS = $askFile
    $env:SSH_ASKPASS_REQUIRE = "force"
    & $ssh -C -N `
      -L "8188:127.0.0.1:$($t.RemotePort)" `
      -o ExitOnForwardFailure=yes `
      -o ServerAliveInterval=30 `
      -o ServerAliveCountMax=3 `
      -o StrictHostKeyChecking=accept-new `
      -o PreferredAuthentications=password `
      -o PubkeyAuthentication=no `
      -p $t.Port `
      "$($t.User)@$($t.Host)"
  } elseif ($plink) {
    & $plink -batch -ssh -P $t.Port -pw $plain -N -C `
      -L "8188:127.0.0.1:$($t.RemotePort)" "$($t.User)@$($t.Host)"
  } else {
    Write-Host "ssh not found. Windows Settings → Apps → Optional features → OpenSSH Client." -ForegroundColor Red
    exit 1
  }
  $code = $LASTEXITCODE
  if ($code -ne 0) {
    Write-Host "Tunnel dropped ($code). Check host, port, password, and whether Comfy is running." -ForegroundColor Red
    exit $code
  }
} finally {
  Remove-Item $passFile, $askFile -Force -ErrorAction SilentlyContinue
}
