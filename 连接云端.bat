@echo off
chcp 65001 >nul
title 云端隧道
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0连接云端.ps1"
if errorlevel 1 pause
