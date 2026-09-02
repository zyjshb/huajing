# 只启动镜场画布。云端 Comfy 请另开「连接云端.bat」。
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$Canvas = "http://127.0.0.1:5173/"

function Test-Port([int]$Port) {
  $tcp = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $tcp.BeginConnect("127.0.0.1", $Port, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(400)
    return [bool]($ok -and $tcp.Connected)
  } catch {
    return $false
  } finally {
    $tcp.Close()
  }
}

Write-Host ""
Write-Host "  镜场画布" -ForegroundColor Cyan
Write-Host "  $Canvas"
Write-Host "  出图出视频走本机 127.0.0.1:8188"
Write-Host "  云端机器请另开：连接云端.bat"
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "没找到 Node.js。先装 https://nodejs.org/ （LTS），装完再双击「启动镜场.bat」。" -ForegroundColor Red
  Read-Host "按回车退出"
  exit 1
}

if (-not (Test-Path (Join-Path $Root "node_modules"))) {
  Write-Host "第一次运行，正在安装依赖…" -ForegroundColor Yellow
  npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host "npm install 失败。" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
  }
}

if (-not (Test-Port 8188)) {
  Write-Host "8188 还没人听。出图前：双击「连接云端.bat」，或自己开本机 Comfy。" -ForegroundColor Yellow
  Write-Host ""
}

if ((Test-Port 5173) -and (Test-Port 8787)) {
  Write-Host "镜场已在运行，直接打开画布。" -ForegroundColor Green
  Start-Process $Canvas
  Start-Sleep -Seconds 2
  exit 0
}

Write-Host "正在启动镜场（关掉这个窗口 = 关掉画布服务）…" -ForegroundColor Cyan
$wait = @"
for (`$i = 0; `$i -lt 90; `$i++) {
  `$tcp = New-Object System.Net.Sockets.TcpClient
  try {
    `$iar = `$tcp.BeginConnect('127.0.0.1', 5173, `$null, `$null)
    `$ok = `$iar.AsyncWaitHandle.WaitOne(400)
    if (`$ok -and `$tcp.Connected) {
      `$tcp.Close()
      Start-Sleep -Milliseconds 800
      Start-Process '$Canvas'
      exit 0
    }
  } catch {}
  finally { `$tcp.Close() }
  Start-Sleep -Seconds 1
}
"@
Start-Process -FilePath "powershell.exe" -WindowStyle Hidden -ArgumentList @("-NoProfile","-ExecutionPolicy","Bypass","-Command",$wait) | Out-Null
npm run dev
