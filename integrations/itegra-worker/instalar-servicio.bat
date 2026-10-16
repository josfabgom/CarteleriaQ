@echo off
rem Instala el worker como SERVICIO DE WINDOWS ("CarteleriaQ Itegra Worker"): corre siempre en segundo plano y arranca con la PC.
rem Pide permisos de administrador solo (aparece el aviso de Windows: hay que aceptar).
rem Hacer antes, una vez:  .\worker.exe --aplicar
net session >nul 2>&1
if errorlevel 1 (
  echo Pidiendo permisos de administrador... acepta el aviso de Windows.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-servicio.ps1"
echo.
pause
