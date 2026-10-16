@echo off
net session >nul 2>&1
if errorlevel 1 (
  echo Pidiendo permisos de administrador... acepta el aviso de Windows.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
schtasks /End /TN "CarteleriaQ Itegra Worker" >nul 2>&1
schtasks /Delete /TN "CarteleriaQ Itegra Worker" /F
echo.
pause
