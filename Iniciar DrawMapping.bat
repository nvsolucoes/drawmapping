@echo off
setlocal
cd /d "%~dp0"
title DrawMapping - Servidor local
where node.exe >nul 2>&1
if errorlevel 1 (
  echo O Node.js nao foi encontrado.
  echo Instale o Node.js LTS em https://nodejs.org e tente novamente.
  pause
  exit /b 1
)
node scripts\launch.mjs
set "DRAWMAPPING_EXIT=%ERRORLEVEL%"
if not "%DRAWMAPPING_EXIT%"=="0" pause
exit /b %DRAWMAPPING_EXIT%
