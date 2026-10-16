# Quita el servicio de Windows "CarteleriaQ Itegra Worker" (y la tarea programada de versiones anteriores, si existe).
# Lo llama desinstalar-servicio.bat. Sin acentos a proposito (PowerShell 5.1).
$ErrorActionPreference = 'Stop'
$serviceId = 'CarteleriaQItegraWorker'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$svcExe = Join-Path $dir "$serviceId.exe"

try {
  $svc = Get-Service -Name $serviceId -ErrorAction SilentlyContinue
  if ($svc -and (Test-Path $svcExe)) {
    if ($svc.Status -ne 'Stopped') { Write-Host 'Deteniendo el servicio...'; & $svcExe stop 2>&1 | Out-Null }
    & $svcExe uninstall 2>&1 | Out-Null
    Write-Host 'Servicio desinstalado.'
  } elseif ($svc) {
    Write-Host 'Deteniendo y quitando el servicio con sc.exe...'
    & sc.exe stop $serviceId | Out-Null
    & sc.exe delete $serviceId | Out-Null
  } else {
    Write-Host 'El servicio no estaba instalado.'
  }

  $task = Get-ScheduledTask -TaskName 'CarteleriaQ Itegra Worker' -ErrorAction SilentlyContinue
  if ($task) {
    Stop-ScheduledTask -TaskName 'CarteleriaQ Itegra Worker' -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName 'CarteleriaQ Itegra Worker' -Confirm:$false
    Write-Host 'Tarea programada anterior eliminada.'
  }
  Write-Host ''
  Write-Host 'Listo. Los archivos de la carpeta no se borran: se pueden eliminar a mano si ya no se usan.' -ForegroundColor Green
  exit 0
}
catch {
  Write-Host ''
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
