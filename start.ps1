# Start Shotfield only. Cloud Comfy: connect-cloud.bat
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
Write-Host "  Shotfield" -ForegroundColor Cyan
Write-Host "  $Canvas"
Write-Host "  Images/video go through 127.0.0.1:8188"
Write-Host "  Cloud machine: connect-cloud.bat"
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js not found. Install LTS from https://nodejs.org/ then run start.bat again." -ForegroundColor Red
  Read-Host "Press Enter to exit"
  exit 1
}

if (-not (Test-Path (Join-Path $Root "node_modules"))) {
  Write-Host "First run: installing dependencies…" -ForegroundColor Yellow
  npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host "npm install failed." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
  }
}

if (-not (Test-Port 8188)) {
  Write-Host "Nothing is listening on 8188. Before generating: run connect-cloud.bat, or start local Comfy." -ForegroundColor Yellow
  Write-Host ""
}

if ((Test-Port 5173) -and (Test-Port 8787)) {
  Write-Host "Shotfield is already running. Opening the canvas." -ForegroundColor Green
  Start-Process $Canvas
  Start-Sleep -Seconds 2
  exit 0
}

Write-Host "Starting Shotfield (close this window to stop the servers)…" -ForegroundColor Cyan
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
