# Deja programada en esta PC la bajada diaria de respaldos (todos los dias a las 9:30; si la PC estaba apagada, la hace al encenderse).
# No necesita permisos de administrador. Corre con tu usuario (usa tu clave SSH).
# Sin acentos a proposito: PowerShell 5.1 lee mal los archivos sin BOM.
param([string]$Hora = '09:30', [switch]$Quitar)

$ErrorActionPreference = 'Stop'
$name = 'CarteleriaQ - Bajar respaldos'
try {
  if ($Quitar) {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Tarea '$name' eliminada."
    exit 0
  }
  $script = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'bajar-respaldos.ps1'
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
  $trigger = New-ScheduledTaskTrigger -Daily -At $Hora
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries
  Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
  Write-Host "Listo: '$name' se ejecuta todos los dias a las $Hora."
  Write-Host 'Los respaldos quedan en C:\RespaldosCarteleriaQ (registro: bajada.log). Para quitarla: .\programar-bajada.ps1 -Quitar'
  exit 0
}
catch {
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
