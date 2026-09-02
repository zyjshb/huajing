@echo off
chcp 65001 >nul
title 关闭云端隧道
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0关闭云端.ps1"
pause
