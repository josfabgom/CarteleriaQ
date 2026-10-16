@echo off
rem Quita el servicio de Windows "CarteleriaQ Itegra Worker". Pide permisos de administrador solo.
net session >nul 2>&1
if errorlevel 1 (
  echo Pidiendo permisos de administrador... acepta el aviso de Windows.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0desinstalar-servicio.ps1"
echo.
pause
