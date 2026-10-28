@echo off
rem Baja a esta PC los respaldos del servidor (copia fuera del VPS). Doble clic.
rem Opciones: bajar-respaldos.bat -SinMedios   (solo la base de datos)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bajar-respaldos.ps1" %*
echo.
pause
