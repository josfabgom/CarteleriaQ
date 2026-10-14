@echo off
rem Instala el worker para que arranque solo con Windows (tarea programada, como SYSTEM).
rem Ejecutar como Administrador, DESPUES de haber hecho "node worker.js --aplicar" una vez.
setlocal
set "DIR=%~dp0"
for /f "delims=" %%i in ('where node') do set "NODE=%%i" & goto :found
echo No encuentro Node.js. Instalalo desde https://nodejs.org (version LTS) y volve a ejecutar esto.
exit /b 1
:found
if not exist "%DIR%worker.config.json" (
  echo Falta worker.config.json. Copia worker.config.example.json y completalo.
  exit /b 1
)
schtasks /Create /TN "CarteleriaQ Itegra Worker" /TR "\"%NODE%\" \"%DIR%worker.js\" --config \"%DIR%worker.config.json\"" /SC ONSTART /RU SYSTEM /RL HIGHEST /F
if errorlevel 1 exit /b 1
schtasks /Run /TN "CarteleriaQ Itegra Worker"
echo.
echo Listo. El worker queda funcionando y arranca solo con la PC. El registro esta en worker.log
