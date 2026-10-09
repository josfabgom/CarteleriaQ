#!/usr/bin/env bash
# Respaldo de la base de datos y de los archivos subidos. Ejecutar desde la carpeta del proyecto.
# Cron diario sugerido (3:30 AM):  30 3 * * * cd /opt/CarteleriaQ && ./deploy/backup.sh >> backups/backup.log 2>&1
set -euo pipefail

COMPOSE="docker compose -f docker-compose.prod.yml"
DIR="${BACKUP_DIR:-backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$DIR"
set -a; source .env; set +a

$COMPOSE exec -T db pg_dump -U "${POSTGRES_USER:-carteleria_user}" "${POSTGRES_DB:-carteleria_db}" | gzip > "$DIR/db-$STAMP.sql.gz"
$COMPOSE exec -T backend tar czf - -C /app uploads > "$DIR/uploads-$STAMP.tgz"

# Borrar respaldos viejos
find "$DIR" -type f \( -name 'db-*.sql.gz' -o -name 'uploads-*.tgz' \) -mtime +"$KEEP_DAYS" -delete

echo "$(date -Is) respaldo OK: $DIR/db-$STAMP.sql.gz, $DIR/uploads-$STAMP.tgz"
