#!/usr/bin/env bash
# Off-site копия бэкапов (rsync)
# BACKUP_REMOTE=user@backup-host:/backups/jbrealty

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/backup-common.sh
source "${SCRIPT_DIR}/lib/backup-common.sh"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/jbrealty}"
BACKUP_REMOTE="${BACKUP_REMOTE:-}"
ENV_FILE="${ENV_FILE:-/var/www/jbrealty/server/.env}"
BACKUP_LOG_FILE="${BACKUP_LOG_FILE:-/var/log/jbrealty/backup.log}"

load_backup_config

if [[ -z "$BACKUP_REMOTE" ]]; then
  backup_log_warn "backup.sync_skipped" "BACKUP_REMOTE not set"
  exit 0
fi

backup_log_info "backup.sync_start" "$BACKUP_REMOTE"
rsync -az --delete "${BACKUP_DIR}/" "${BACKUP_REMOTE}/"
backup_log_info "backup.sync_complete"
