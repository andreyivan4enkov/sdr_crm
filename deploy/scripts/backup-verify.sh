#!/usr/bin/env bash
# Проверка целостности бэкапов (запускать после backup или по cron)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/backup-common.sh
source "${SCRIPT_DIR}/lib/backup-common.sh"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/jbrealty}"
BACKUP_LOG_FILE="${BACKUP_LOG_FILE:-/var/log/jbrealty/backup.log}"
TARGET="${1:-latest}"

mkdir -p "$(dirname "$BACKUP_LOG_FILE")"
backup_log_info "backup.verify_start" "dir=$BACKUP_DIR target=$TARGET"

resolve_file() {
  if [[ "$TARGET" == "latest" ]]; then
    if [[ -f "${BACKUP_DIR}/latest.json" ]]; then
      local name
      name="$(grep -o '"file": *"[^"]*"' "${BACKUP_DIR}/latest.json" | head -1 | sed 's/.*"\([^"]*\)"/\1/')"
      echo "${BACKUP_DIR}/${name}"
      return
    fi
    local newest
    newest="$(find "$BACKUP_DIR" -maxdepth 1 -name 'jbrealty_*.sql.gz' -type f | sort -r | head -1)"
    echo "$newest"
    return
  fi
  if [[ -f "$TARGET" ]]; then
    echo "$TARGET"
  else
    echo "${BACKUP_DIR}/${TARGET}"
  fi
}

FILE="$(resolve_file)"
if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  backup_log_error "backup.verify_not_found"
  exit 1
fi

FAIL=0

if ! verify_gzip "$FILE"; then
  FAIL=1
fi

if [[ -f "${FILE}.sha256" ]]; then
  if verify_checksum "$FILE"; then
    backup_log_info "backup.verify_checksum_ok" "$(basename "$FILE")"
  else
    backup_log_error "backup.verify_checksum_fail" "$(basename "$FILE")"
    FAIL=1
  fi
else
  backup_log_warn "backup.verify_no_checksum" "$(basename "$FILE")"
fi

SIZE="$(stat -c%s "$FILE" 2>/dev/null || stat -f%z "$FILE")"
if [[ "$SIZE" -lt 1024 ]]; then
  backup_log_error "backup.verify_too_small" "size=$SIZE"
  FAIL=1
fi

if [[ "$FAIL" -eq 0 ]]; then
  backup_log_info "backup.verify_ok" "$(basename "$FILE") size=$SIZE"
  exit 0
fi

backup_log_error "backup.verify_failed" "$(basename "$FILE")"
exit 1
