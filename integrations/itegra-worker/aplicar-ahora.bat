@echo off
rem Sube ahora mismo los cambios de Itegra a la nube (equivale a: worker.exe --aplicar).
rem Sirve para forzar una actualizacion sin esperar la revision automatica de cada 5 minutos.
cd /d "%~dp0"
if exist "%~dp0worker.exe" (
  "%~dp0worker.exe" --aplicar
) else (
  node "%~dp0worker.js" --aplicar
)
echo.
if exist "%~dp0actualizaciones.log" (
  echo --- Ultimos cambios registrados en actualizaciones.log ---
  powershell -NoProfile -Command "Get-Content -Encoding UTF8 -Tail 10 '%~dp0actualizaciones.log'"
)
echo.
pause
