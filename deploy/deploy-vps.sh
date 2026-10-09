#!/usr/bin/env bash
# Despliega el proyecto en el VPS y (opcionalmente) publica el APK.
#
#   ./deploy/deploy-vps.sh root@82.25.64.166                 # backend + panel + archivos del reproductor (OTA)
#   ./deploy/deploy-vps.sh root@82.25.64.166 ruta/al.apk     # además publica el APK en /download
#
# Variables (con valores para el VPS compartido con viajesq):
#   REMOTE_DIR     carpeta del proyecto en el servidor        (por defecto /opt/carteleriaq)
#   COMPOSE_FILES  archivos compose a usar en el servidor     (por defecto shared + red de viajesq)
#   PROJECT        nombre del proyecto compose                (por defecto carteleriaq)
#
# Qué NO toca: el .env del servidor, los volúmenes (base de datos y archivos subidos), downloads/ ni otros proyectos.
set -euo pipefail

HOST="${1:?Uso: $0 usuario@servidor [ruta/al.apk]}"
APK="${2:-}"
REMOTE_DIR="${REMOTE_DIR:-/opt/carteleriaq}"
PROJECT="${PROJECT:-carteleriaq}"
COMPOSE_FILES="${COMPOSE_FILES:--f docker-compose.shared.yml -f deploy/docker-compose.viajesq-network.yml}"

cd "$(dirname "$0")/.."

echo "==> Versión de los archivos del reproductor (OTA)"
( cd player-app && node build-manifest.js )

echo "==> Copiando código a $HOST:$REMOTE_DIR"
tar czf - --exclude=node_modules --exclude=.git --exclude=dist --exclude=android --exclude=uploads \
  --exclude=.env --exclude='*.apk' --exclude=backups --exclude=downloads --exclude=www \
  --exclude='*.tsbuildinfo' --exclude=.agents --exclude=.claude . \
  | ssh "$HOST" "mkdir -p '$REMOTE_DIR' && cd '$REMOTE_DIR' && tar xzf - && chown -R root:root ."

echo "==> Reconstruyendo y reiniciando (solo el proyecto $PROJECT)"
ssh "$HOST" "cd '$REMOTE_DIR' && docker compose -p '$PROJECT' $COMPOSE_FILES up -d --build"

# Los archivos del reproductor se montan en el backend como archivos sueltos: al reemplazarlos, el contenedor
# sigue viendo el archivo viejo hasta recrearse. Sin esto las TVs no verían las versiones nuevas (corte de ~3 s).
echo "==> Recreando el backend para que sirva los archivos nuevos del reproductor"
ssh "$HOST" "cd '$REMOTE_DIR' && docker compose -p '$PROJECT' $COMPOSE_FILES up -d --force-recreate --no-deps backend"

if [ -n "$APK" ]; then
  echo "==> Publicando APK en /download/carteleriaq.apk"
  ssh "$HOST" "mkdir -p '$REMOTE_DIR/downloads'"
  scp -q "$APK" "$HOST:$REMOTE_DIR/downloads/carteleriaq.apk"
  ssh "$HOST" "chmod 644 '$REMOTE_DIR/downloads/carteleriaq.apk'"
fi

echo "==> Listo. Las TVs con el APK actual se actualizan solas en un máximo de 10 minutos."
