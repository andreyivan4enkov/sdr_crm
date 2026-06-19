#!/usr/bin/env bash
# Восстановление PostgreSQL из .sql.gz бэкапа
# Использование: ./restore-db.sh /var/backups/sdr-crm/crm_YYYYMMDD_HHMMSS.sql.gz

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/backup-common.sh
source "${SCRIPT_DIR}/lib/backup-common.sh"

ENV_FILE="${ENV_FILE:-/var/www/sdr-crm/server/.env}"
BACKUP_LOG_FILE="${BACKUP_LOG_FILE:-/var/log/sdr-crm/backup.log}"
BACKUP_FILE="${1:-}"

if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
  echo "Usage: $0 <backup.sql.gz>"
  exit 1
fi

load_env "$ENV_FILE"

if [[ -z "${DATABASE_URL:-}" ]]; then
  backup_log_error "restore.no_database_url"
  exit 1
fi

backup_log_info "restore.verify" "$BACKUP_FILE"
verify_gzip "$BACKUP_FILE"
if [[ -f "${BACKUP_FILE}.sha256" ]]; then
  verify_checksum "$BACKUP_FILE" || {
    backup_log_error "restore.checksum_fail"
    exit 1
  }
fi

echo "ВНИМАНИЕ: все данные в целевой БД будут перезаписаны."
echo "Файл: $BACKUP_FILE"
echo "DATABASE_URL: ${DATABASE_URL%%@*}@***"
read -r -p "Введите YES для продолжения: " CONFIRM
if [[ "$CONFIRM" != "YES" ]]; then
  backup_log_warn "restore.cancelled"
  exit 0
fi

START_TS="$(date +%s)"
backup_log_info "restore.start" "$(basename "$BACKUP_FILE")"

gunzip -c "$BACKUP_FILE" | psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q

DURATION=$(( $(date +%s) - START_TS ))
backup_log_info "restore.complete" "duration_sec=${DURATION}"
