@echo off
setlocal
cd /d "%~dp0"
title DrawMapping - Preparacao inicial
echo Preparando o DrawMapping. Esta etapa pode precisar de internet.
call npm.cmd ci --no-audit --no-fund
if errorlevel 1 (
  echo Nao foi possivel instalar as dependencias. Verifique a conexao e o Node.js.
  pause
  exit /b 1
)
call npm.cmd run build
if errorlevel 1 (
  echo A preparacao falhou. Copie a mensagem acima para obter ajuda.
  pause
  exit /b 1
)
echo.
echo Tudo pronto. Abra Iniciar DrawMapping.bat para comecar.
pause
