@echo off
chcp 65001 >nul
title 关闭镜场
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ports=5173,8787; foreach($p in $ports){ Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } catch {} } }; Write-Host '镜场画布服务已关掉。云端隧道请用「关闭云端.bat」。'"
pause