# Baja a esta PC los respaldos que el servidor (VPS) hace cada madrugada, para tener una copia FUERA del servidor.
#
#   .\bajar-respaldos.ps1                      baja lo que falte (base de datos + una copia de los archivos cada 7 dias)
#   .\bajar-respaldos.ps1 -SinMedios           solo la base de datos (rapido, unos KB)
#   .\bajar-respaldos.ps1 -MediosCadaDias 1    tambien los archivos (fotos y videos) todos los dias (~300 MB por dia)
#   .\bajar-respaldos.ps1 -Destino D:\Respaldos
#
# Requiere el cliente SSH de Windows (viene con Windows 10/11) y acceso por clave al servidor (ya configurado en esta PC).
# Sin acentos a proposito: PowerShell 5.1 lee mal los archivos sin BOM.
param(
  [string]$Servidor = 'root@82.25.64.166',
  [string]$RutaRemota = '/opt/carteleriaq/backups',
  [string]$Destino = 'C:\RespaldosCarteleriaQ',
  [int]$ConservarDias = 30,
  [int]$MediosCadaDias = 7,
  [switch]$SinMedios
)

$ErrorActionPreference = 'Stop'
$sshOpts = @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', '-o', 'ServerAliveInterval=15')
$log = Join-Path $Destino 'bajada.log'

function Log($msg) {
  $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Write-Host $line
  try { Add-Content -Path $log -Value $line -Encoding UTF8 } catch { }
}

# Lee el archivo comprimido completo para comprobar que no esta danado
function Test-Gzip($path) {
  $fs = [IO.File]::OpenRead($path)
  try {
    $gz = New-Object IO.Compression.GZipStream($fs, [IO.Compression.CompressionMode]::Decompress)
    $buf = New-Object byte[] 1048576
    while ($gz.Read($buf, 0, $buf.Length) -gt 0) { }
    return $true
  } catch { return $false } finally { $fs.Dispose() }
}

try {
  if (-not (Get-Command ssh -ErrorAction SilentlyContinue) -or -not (Get-Command scp -ErrorAction SilentlyContinue)) {
    throw 'No encuentro ssh/scp. Activa el "Cliente OpenSSH" en Windows (Configuracion > Aplicaciones > Caracteristicas opcionales).'
  }
  New-Item -ItemType Directory -Force -Path $Destino | Out-Null
  Log "Inicio. Servidor: $Servidor  Destino: $Destino"

  # Lista remota: "nombre tamano"
  $remoteOut = & ssh @sshOpts $Servidor "cd '$RutaRemota' && stat -c '%n %s' db-2*.sql.gz uploads-2*.tgz 2>/dev/null"
  if ($LASTEXITCODE -ne 0 -and -not $remoteOut) { throw "No pude conectar con el servidor ($Servidor). Revisa internet y la clave SSH." }
  $remote = @()
  foreach ($l in $remoteOut) {
    if ($l -match '^(\S+) (\d+)$') { $remote += [pscustomobject]@{ Name = $Matches[1]; Size = [int64]$Matches[2] } }
  }
  if ($remote.Count -eq 0) { throw 'El servidor no tiene respaldos automaticos todavia (db-*.sql.gz). Revisa el cron del VPS.' }

  $toGet = @()
  # Base de datos: todos los que falten (pesan unos KB)
  $toGet += $remote | Where-Object { $_.Name -like 'db-*' }
  # Archivos subidos: solo el mas reciente y solo si el ultimo que tengo es viejo (pesan ~300 MB)
  if (-not $SinMedios) {
    $newestRemote = $remote | Where-Object { $_.Name -like 'uploads-*' } | Sort-Object Name | Select-Object -Last 1
    if ($newestRemote) {
      $localMedios = Get-ChildItem $Destino -Filter 'uploads-2*.tgz' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1
      $old = (-not $localMedios) -or (((Get-Date) - $localMedios.LastWriteTime).TotalDays -ge $MediosCadaDias)
      if ($old) { $toGet += $newestRemote } else { Log ('Archivos subidos: el ultimo respaldo local tiene {0:N1} dias (se baja cada {1}).' -f ((Get-Date) - $localMedios.LastWriteTime).TotalDays, $MediosCadaDias) }
    }
  }

  $downloaded = 0; $skipped = 0; $failed = 0
  foreach ($f in $toGet) {
    $dest = Join-Path $Destino $f.Name
    if ((Test-Path $dest) -and ((Get-Item $dest).Length -eq $f.Size)) { $skipped++; continue }
    $part = "$dest.part"
    Remove-Item $part -Force -ErrorAction SilentlyContinue
    Log ('Bajando {0} ({1:N1} MB)...' -f $f.Name, ($f.Size / 1MB))
    & scp -q @sshOpts "${Servidor}:${RutaRemota}/$($f.Name)" $part
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $part)) { Log "ERROR: fallo la descarga de $($f.Name)"; $failed++; Remove-Item $part -Force -ErrorAction SilentlyContinue; continue }
    if ((Get-Item $part).Length -ne $f.Size) { Log "ERROR: $($f.Name) llego incompleto"; $failed++; Remove-Item $part -Force; continue }
    if (-not (Test-Gzip $part)) { Log "ERROR: $($f.Name) esta danado (no se puede descomprimir)"; $failed++; Remove-Item $part -Force; continue }
    Move-Item $part $dest -Force
    # La fecha del nombre es la hora del servidor (UTC): se guarda como fecha del archivo en hora local
    $utc = [datetime]::SpecifyKind([datetime]::ParseExact(($f.Name -replace '^(db|uploads)-(\d{8})-(\d{6}).*$', '$2$3'), 'yyyyMMddHHmmss', $null), [DateTimeKind]::Utc)
    (Get-Item $dest).LastWriteTime = $utc.ToLocalTime()
    $downloaded++
  }

  # Limpieza: se conservan los ultimos N dias
  $limit = (Get-Date).AddDays(-$ConservarDias)
  $old = Get-ChildItem $Destino -File | Where-Object { $_.Name -match '^(db|uploads)-2' -and $_.LastWriteTime -lt $limit }
  foreach ($o in $old) { Remove-Item $o.FullName -Force; Log "Borrado (mas de $ConservarDias dias): $($o.Name)" }

  $dbCount = (Get-ChildItem $Destino -Filter 'db-2*.sql.gz').Count
  $upCount = (Get-ChildItem $Destino -Filter 'uploads-2*.tgz').Count
  $sizeMb = [math]::Round(((Get-ChildItem $Destino -File | Measure-Object Length -Sum).Sum / 1MB), 1)
  Log "Listo: bajados $downloaded, ya estaban $skipped, con error $failed. En esta PC: $dbCount de base de datos y $upCount de archivos ($sizeMb MB)."
  if ($failed -gt 0) { exit 1 }
  exit 0
}
catch {
  Log "ERROR: $($_.Exception.Message)"
  exit 1
}
