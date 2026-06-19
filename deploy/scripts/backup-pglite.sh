#!/usr/bin/env bash
# Бэкап локальной PGlite (dev / без PostgreSQL)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=lib/backup-common.sh
source "${SCRIPT_DIR}/lib/backup-common.sh"

BACKUP_DIR="${BACKUP_DIR:-${ROOT}/backups/pglite}"
ENV_FILE="${ENV_FILE:-${ROOT}/server/.env}"
BACKUP_LOG_FILE="${BACKUP_LOG_FILE:-${ROOT}/backups/pglite/backup.log}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

mkdir -p "$BACKUP_DIR" "$(dirname "$BACKUP_LOG_FILE")"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

PGLITE_PATH="${PGLITE_PATH:-${ROOT}/server/data/crm}"
if [[ "$PGLITE_PATH" != /* ]]; then
  PGLITE_PATH="${ROOT}/server/${PGLITE_PATH#./}"
fi
if [[ ! -d "$PGLITE_PATH" ]]; then
  backup_log_error "backup.pglite_missing" "$PGLITE_PATH"
  exit 1
fi

STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="${BACKUP_DIR}/pglite_${STAMP}.tar.gz"

START_TS="$(date +%s)"
backup_log_info "backup.pglite_start" "$PGLITE_PATH"

tar -czf "$OUT" -C "$(dirname "$PGLITE_PATH")" "$(basename "$PGLITE_PATH")"
verify_gzip "$OUT"
write_checksum "$OUT" || true

DURATION=$(( $(date +%s) - START_TS ))
write_manifest "$BACKUP_DIR" "pglite_${STAMP}" "$OUT" "$DURATION" "pglite"

find "$BACKUP_DIR" -maxdepth 1 -name 'pglite_*.tar.gz' -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -name 'pglite_*.tar.gz.sha256' -mtime +"$RETENTION_DAYS" -delete

backup_log_info "backup.pglite_complete" "$(basename "$OUT")"
