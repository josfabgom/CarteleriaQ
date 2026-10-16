# Instala el worker de Itegra como tarea de Windows que corre SIEMPRE en segundo plano:
#  - arranca con la PC (sin necesidad de iniciar sesion), como cuenta SYSTEM
#  - sin limite de tiempo de ejecucion (las tareas normales se cortan a las 72 horas)
#  - sigue corriendo con la PC a bateria
#  - si el programa se cierra por un error, se reinicia solo al minuto
# Lo llama instalar-tarea.bat (que pide permisos de administrador). Sin acentos a proposito: PowerShell 5.1 lee mal los archivos sin BOM.
param([switch]$Simular)

$ErrorActionPreference = 'Stop'
$taskName = 'CarteleriaQ Itegra Worker'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$exe = Join-Path $dir 'worker.exe'
$js  = Join-Path $dir 'worker.js'
$cfg = Join-Path $dir 'worker.config.json'

try {
  if (-not (Test-Path $cfg)) { throw "Falta worker.config.json en $dir. Copia worker.config.example.json y completalo." }

  if (Test-Path $exe) {
    $execute  = $exe
    $argument = "--config `"$cfg`""
  } else {
    $node = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (-not $node) { throw 'No encuentro worker.exe ni Node.js. Usa la version con worker.exe o instala Node.js desde https://nodejs.org' }
    $execute  = $node
    $argument = "`"$js`" --config `"$cfg`""
  }

  $action    = New-ScheduledTaskAction -Execute $execute -Argument $argument -WorkingDirectory $dir
  $trigger   = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
                 -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew

  if ($Simular) {
    Write-Host "SIMULACION: se instalaria la tarea '$taskName'"
    Write-Host "  Programa : $execute"
    Write-Host "  Argumentos: $argument"
    Write-Host "  Carpeta  : $dir"
    exit 0
  }

  Write-Host "Instalando la tarea '$taskName'..."
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
  Start-ScheduledTask -TaskName $taskName
  Start-Sleep -Seconds 6

  $info = Get-ScheduledTaskInfo -TaskName $taskName
  $state = (Get-ScheduledTask -TaskName $taskName).State
  Write-Host ''
  Write-Host "Estado de la tarea: $state"
  $log = Join-Path $dir 'worker.log'
  if (Test-Path $log) {
    Write-Host 'Ultimas lineas de worker.log:'
    Get-Content $log -Tail 4 | ForEach-Object { Write-Host "  $_" }
  }
  Write-Host ''
  if ($state -eq 'Running' -or $info.LastTaskResult -eq 267009) {
    Write-Host 'LISTO: el worker quedo funcionando y arrancara solo con la PC.' -ForegroundColor Green
  } else {
    Write-Host "ATENCION: la tarea se creo pero no figura en ejecucion (resultado $($info.LastTaskResult)). Revisa worker.log." -ForegroundColor Yellow
  }
  exit 0
}
catch {
  Write-Host ''
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
