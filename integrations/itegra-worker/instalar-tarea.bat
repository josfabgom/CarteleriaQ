@echo off
rem Instala el worker para que arranque solo con Windows (tarea programada, como SYSTEM).
rem Ejecutar como Administrador, DESPUES de haber hecho "worker.exe --aplicar" (o "node worker.js --aplicar") una vez.
setlocal
set "DIR=%~dp0"
if not exist "%DIR%worker.config.json" (
  echo Falta worker.config.json. Copia worker.config.example.json y completalo.
  exit /b 1
)
set "NODE="
for /f "delims=" %%i in ('where node 2^>nul') do set "NODE=%%i"
if exist "%DIR%worker.exe" (
  set "CMD=\"%DIR%worker.exe\" --config \"%DIR%worker.config.json\""
) else if defined NODE (
  set "CMD=\"%NODE%\" \"%DIR%worker.js\" --config \"%DIR%worker.config.json\""
) else (
  echo No encuentro worker.exe ni Node.js. Usa la version con worker.exe o instala Node.js desde https://nodejs.org
  exit /b 1
)
schtasks /Create /TN "CarteleriaQ Itegra Worker" /TR "%CMD%" /SC ONSTART /RU SYSTEM /RL HIGHEST /F
if errorlevel 1 exit /b 1
schtasks /Run /TN "CarteleriaQ Itegra Worker"
echo.
echo Listo. El worker queda funcionando y arranca solo con la PC. El registro esta en worker.log
