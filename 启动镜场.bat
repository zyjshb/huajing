@echo off
chcp 65001 >nul
title 镜场服务
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0启动镜场.ps1"
if errorlevel 1 pause