@echo off
chcp 65001 >nul
title Cloud tunnel
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0connect-cloud.ps1"
if errorlevel 1 pause
