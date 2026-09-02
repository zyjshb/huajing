@echo off
chcp 65001 >nul
title Stop Shotfield
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ports=5173,8787; foreach($p in $ports){ Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } catch {} } }; Write-Host 'Shotfield stopped. Use disconnect-cloud.bat for the tunnel.'"
pause
