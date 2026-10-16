# Instala el worker de Itegra como SERVICIO DE WINDOWS llamado "CarteleriaQ Itegra Worker" (usa WinSW).
#  - arranca con la PC, sin iniciar sesion, como cuenta SYSTEM
#  - se reinicia solo si falla
#  - se ve en services.msc
# Lo llama instalar-servicio.bat (que pide permisos de administrador). Sin acentos a proposito: PowerShell 5.1 lee mal los archivos sin BOM.
param([switch]$Simular)

$ErrorActionPreference = 'Stop'
$serviceId = 'CarteleriaQItegraWorker'
$serviceName = 'CarteleriaQ Itegra Worker'
$oldTask = 'CarteleriaQ Itegra Worker'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$worker = Join-Path $dir 'worker.exe'
$cfg = Join-Path $dir 'worker.config.json'
$winsw = Join-Path $dir 'winsw.exe'
$svcExe = Join-Path $dir "$serviceId.exe"
$svcXml = Join-Path $dir "$serviceId.xml"

function Run($file, $arguments) {
  # Ejecuta y devuelve la salida; falla si el codigo de salida no es 0
  $out = & $file $arguments.Split(' ') 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { throw "Fallo '$([IO.Path]::GetFileName($file)) $arguments': $($out.Trim())" }
  return $out
}

try {
  if (-not (Test-Path $cfg))    { throw "Falta worker.config.json en $dir. Copia worker.config.example.json y completalo." }
  if (-not (Test-Path $worker)) { throw "Falta worker.exe en $dir." }
  if (-not (Test-Path $svcXml)) { throw "Falta $serviceId.xml en $dir (viene en el zip)." }
  if (-not (Test-Path $winsw) -and -not (Test-Path $svcExe)) { throw "Falta winsw.exe en $dir (viene en el zip)." }

  if ($Simular) {
    Write-Host "SIMULACION: se instalaria el servicio '$serviceName' ($serviceId)"
    Write-Host "  Programa : $worker"
    Write-Host "  Config   : $cfg"
    Write-Host "  Carpeta  : $dir"
    $old = Get-ScheduledTask -TaskName $oldTask -ErrorAction SilentlyContinue
    if ($old) { Write-Host "  Se quitaria la tarea programada anterior '$oldTask'" }
    exit 0
  }

  # 1) Si estaba instalado como tarea programada (version anterior), se quita
  $task = Get-ScheduledTask -TaskName $oldTask -ErrorAction SilentlyContinue
  if ($task) {
    Write-Host "Quitando la tarea programada anterior '$oldTask'..."
    Stop-ScheduledTask -TaskName $oldTask -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $oldTask -Confirm:$false
  }

  # 2) Si ya estaba instalado como servicio, se reinstala limpio
  $existing = Get-Service -Name $serviceId -ErrorAction SilentlyContinue
  if ($existing -and (Test-Path $svcExe)) {
    Write-Host 'El servicio ya existia: se reinstala...'
    if ($existing.Status -ne 'Stopped') { & $svcExe stop 2>&1 | Out-Null }
    & $svcExe uninstall 2>&1 | Out-Null
    Start-Sleep -Seconds 2
  }

  # 3) Si hay un worker.exe abierto a mano desde esta carpeta, se cierra para no duplicar
  Get-Process -Name worker -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $worker } | ForEach-Object {
    Write-Host "Cerrando el worker.exe que estaba abierto a mano (PID $($_.Id))..."
    Stop-Process -Id $_.Id -Force
  }
  Start-Sleep -Seconds 1

  # 4) Instalar e iniciar
  Copy-Item $winsw $svcExe -Force
  Write-Host "Instalando el servicio '$serviceName'..."
  Run $svcExe 'install' | Out-Null
  Run $svcExe 'start' | Out-Null
  Start-Sleep -Seconds 8

  $svc = Get-Service -Name $serviceId
  Write-Host ''
  Write-Host "Servicio: $($svc.DisplayName)  -  Estado: $($svc.Status)  -  Inicio: $((Get-CimInstance Win32_Service -Filter "Name='$serviceId'").StartMode)"
  $log = Join-Path $dir 'worker.log'
  if (Test-Path $log) {
    Write-Host 'Ultimas lineas de worker.log:'
    Get-Content $log -Tail 4 -Encoding UTF8 | ForEach-Object { Write-Host "  $_" }
  }
  Write-Host ''
  if ($svc.Status -eq 'Running') {
    Write-Host 'LISTO: el servicio quedo instalado y funcionando. Se ve en services.msc como "CarteleriaQ Itegra Worker".' -ForegroundColor Green
  } else {
    Write-Host "ATENCION: el servicio se instalo pero no esta en ejecucion (estado $($svc.Status)). Revisa worker.log y la carpeta logs." -ForegroundColor Yellow
  }
  exit 0
}
catch {
  Write-Host ''
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
