@echo off
setlocal
cd /d "%~dp0"
title DrawMapping - Encerrar servidor
echo Salve seus mapas na interface antes de encerrar o servidor.
node scripts\stop.mjs
if errorlevel 1 pause
