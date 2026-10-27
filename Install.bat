@echo off
setlocal
cd /d "%~dp0"
title Instalar DrawMapping
echo.
echo   Instalacao do DrawMapping
echo   Mantenha esta janela aberta. A instalacao precisa de internet.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-windows.ps1"
if errorlevel 1 (
  echo.
  echo A instalacao nao terminou. Confira a mensagem acima e tente novamente.
  pause
  exit /b 1
)
echo.
echo Pronto! Abra o DrawMapping pelo atalho na area de trabalho.
echo Mantenha esta pasta no mesmo lugar para o atalho funcionar.
pause
