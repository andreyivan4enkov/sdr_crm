#!/usr/bin/env bash
# Резервное копирование PostgreSQL (production)
# systemd: deploy/systemd/jbrealty-backup.timer
# cron: 0 3 * * * /var/www/jbrealty/deploy/scripts/backup-db.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/backup-common.sh
source "${SCRIPT_DIR}/lib/backup-common.sh"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/jbrealty}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
ENV_FILE="${ENV_FILE:-/var/www/jbrealty/server/.env}"
BACKUP_LOG_FILE="${BACKUP_LOG_FILE:-/var/log/jbrealty/backup.log}"
LOCK_FILE="${LOCK_FILE:-/var/www/jbrealty/server/data/backup.lock}"
MIN_SIZE_BYTES="${MIN_SIZE_BYTES:-1024}"

mkdir -p "$BACKUP_DIR" "$(dirname "$BACKUP_LOG_FILE")"
acquire_lock "$LOCK_FILE"

START_TS="$(date +%s)"
backup_log_info "backup.start" "PostgreSQL backup started"

load_env "$ENV_FILE"
load_backup_config

if [[ -z "${DATABASE_URL:-}" ]]; then
  backup_log_error "backup.no_database_url"
  exit 1
fi

if [[ "${USE_PGLITE:-}" == "1" ]]; then
  backup_log_error "backup.pglite_not_supported" "Use backup-pglite.sh for local PGlite"
  exit 1
fi

STAMP="$(date +%Y%m%d_%H%M%S)"
BASE="jbrealty_${STAMP}"
OUT="${BACKUP_DIR}/${BASE}.sql.gz"
TMP="${OUT}.partial"

cleanup_partial() {
  [[ -f "$TMP" ]] && rm -f "$TMP"
}
trap cleanup_partial EXIT

if ! command -v pg_dump >/dev/null 2>&1; then
  backup_log_error "backup.pg_dump_missing"
  exit 1
fi

PG_VER="$(psql "$DATABASE_URL" -tAc 'SHOW server_version' 2>/dev/null | tr -d '[:space:]' || echo unknown)"

if ! pg_dump "$DATABASE_URL" --no-owner --no-acl | gzip -9 > "$TMP"; then
  backup_log_error "backup.pg_dump_failed"
  send_backup_alert "pg_dump FAILED"
  exit 1
fi

mv "$TMP" "$OUT"
trap - EXIT

SIZE="$(stat -c%s "$OUT" 2>/dev/null || stat -f%z "$OUT")"
if [[ "$SIZE" -lt "$MIN_SIZE_BYTES" ]]; then
  backup_log_error "backup.too_small" "size=${SIZE}"
  rm -f "$OUT"
  exit 1
fi

if ! verify_gzip "$OUT"; then
  rm -f "$OUT"
  exit 1
fi

write_checksum "$OUT" || true
DURATION=$(( $(date +%s) - START_TS ))
write_manifest "$BACKUP_DIR" "$BASE" "$OUT" "$DURATION" "$PG_VER"
chown_backup_files "$OUT"

prune_old_backups "$BACKUP_DIR" "$RETENTION_DAYS"

backup_log_info "backup.complete" "file=$(basename "$OUT") size=${SIZE} duration_sec=${DURATION}"

if [[ -n "${BACKUP_GPG_PASSFILE:-}" && -f "$BACKUP_GPG_PASSFILE" ]]; then
  gpg --batch --yes --passphrase-file "$BACKUP_GPG_PASSFILE" -c "$OUT"
  backup_log_info "backup.gpg_created" "$(basename "$OUT").gpg"
fi

if [[ -x "${SCRIPT_DIR}/backup-sync.sh" ]]; then
  bash "${SCRIPT_DIR}/backup-sync.sh" || send_backup_alert "sync FAILED"
fi
