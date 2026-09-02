@echo off
chcp 65001 >nul
title Disconnect cloud
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0disconnect-cloud.ps1"
pause
