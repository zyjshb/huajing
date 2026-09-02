# 把云端 Comfy 映射到本机 8188。镜场画布请另开「启动镜场.bat」。
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
Write-Host "  云端隧道" -ForegroundColor Cyan
Write-Host "  本机 127.0.0.1:8188  <-  机器上的 Comfy"
Write-Host "  画布请另开「启动镜场.bat」，这边只负责连机器。"
Write-Host ""
Write-Host "  可粘贴控制台整行 ssh，例如："
Write-Host "  ssh -p 12345 root@region.seetacloud.com"
Write-Host "  也可以只填 IP 或域名。"
Write-Host ""

$lastPath = Join-Path $Root "data\tunnel.last.json"
$last = $null
if (Test-Path $lastPath) {
  try { $last = Get-Content $lastPath -Raw | ConvertFrom-Json } catch { $last = $null }
}
if ($last -and $last.Host) {
  Write-Host ("  上次：{0}@{1}  端口 {2}  远端 Comfy {3}" -f $last.User, $last.Host, $last.Port, $last.RemotePort) -ForegroundColor DarkGray
}

$addr = Read-Host "地址或 ssh 命令"
if (-not $addr) { Write-Host "没填地址。" -ForegroundColor Red; exit 1 }
$t = Parse-SshTarget $addr

if (-not $t.Port) {
  $hint = if ($last -and $last.Port) { $last.Port } else { "22" }
  $p = Read-Host "SSH 端口（回车=$hint）"
  $t.Port = if ($p) { $p } else { $hint }
}
if (-not $t.RemotePort) {
  $hint = if ($last -and $last.RemotePort) { $last.RemotePort } else { "6006" }
  $rp = Read-Host "机器上 Comfy 端口（回车=$hint；自己开在 8188 就填 8188）"
  $t.RemotePort = if ($rp) { $rp } else { $hint }
}

$sec = Read-Host "密码" -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
)
if (-not $plain) { Write-Host "没填密码。" -ForegroundColor Red; exit 1 }

if (Test-Port 8188) {
  Write-Host ""
  Write-Host "本机 8188 已经被占用（本机 Comfy 或上次隧道没关）。" -ForegroundColor Yellow
  Write-Host "先关本机 Comfy，或双击「关闭云端.bat」再连。"
  Read-Host "按回车退出"
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
Write-Host ("正在连接 {0}@{1}:{2}  ->  远端 {3} …" -f $t.User, $t.Host, $t.Port, $t.RemotePort) -ForegroundColor Cyan
Write-Host "连上后不要关这个窗口。画布设置里地址填 http://127.0.0.1:8188"
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
    Write-Host "没找到 ssh。Windows 设置 → 应用 → 可选功能 → OpenSSH 客户端。" -ForegroundColor Red
    exit 1
  }
  $code = $LASTEXITCODE
  if ($code -ne 0) {
    Write-Host "隧道断了（$code）。检查地址、端口、密码，以及机器上 Comfy 是否已开。" -ForegroundColor Red
    exit $code
  }
} finally {
  Remove-Item $passFile, $askFile -Force -ErrorAction SilentlyContinue
}
