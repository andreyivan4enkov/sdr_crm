#!/usr/bin/env bash
# Общие функции для скриптов резервного копирования JBrealty CRM

backup_log() {
  local level="$1"
  local msg="$2"
  shift 2
  local extra=""
  if [[ $# -gt 0 ]]; then
    extra="$(printf '%s' "$*" | sed 's/"/\\"/g')"
    extra=", \"detail\": \"${extra}\""
  fi
  local line="{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"level\":\"${level}\",\"service\":\"jbrealty-backup\",\"msg\":\"${msg}\"${extra}}"
  echo "$line"
  if [[ -n "${BACKUP_LOG_FILE:-}" ]]; then
    echo "$line" >> "$BACKUP_LOG_FILE"
  fi
}

backup_log_info() { backup_log "info" "$@"; }
backup_log_warn() { backup_log "warn" "$@"; }
backup_log_error() { backup_log "error" "$@"; }

acquire_lock() {
  local lock_file="${1:?}"
  exec 9>"$lock_file"
  if ! flock -n 9; then
    backup_log_error "backup.lock_busy" "Another backup is running"
    exit 2
  fi
}

load_env() {
  local env_file="${1:?}"
  if [[ ! -f "$env_file" ]]; then
    backup_log_error "backup.env_missing" "$env_file"
    exit 1
  fi
  # shellcheck disable=SC1090
  source "$env_file"
}

# Настройки из CRM (server/data/backup-config.json)
load_backup_config() {
  local cfg="${BACKUP_CONFIG:-/var/www/jbrealty/server/data/backup-config.json}"
  [[ -f "$cfg" ]] || return 0
  if ! command -v node >/dev/null 2>&1; then
    backup_log_warn "backup.config_no_node" "$cfg"
    return 0
  fi
  local remote retention webhook
  remote="$(node -e "try{const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));if(c.remoteEnabled&&c.remoteUrl)process.stdout.write(String(c.remoteUrl));}catch{}" "$cfg" 2>/dev/null || true)"
  retention="$(node -e "try{const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));if(c.retentionDays)process.stdout.write(String(c.retentionDays));}catch{}" "$cfg" 2>/dev/null || true)"
  webhook="$(node -e "try{const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));if(c.alertWebhook)process.stdout.write(String(c.alertWebhook));}catch{}" "$cfg" 2>/dev/null || true)"
  [[ -n "$remote" ]] && export BACKUP_REMOTE="$remote"
  [[ -n "$retention" ]] && export RETENTION_DAYS="$retention"
  [[ -n "$webhook" ]] && export BACKUP_ALERT_WEBHOOK="$webhook"
}

chown_backup_files() {
  local file="$1"
  if [[ "$(id -u)" -eq 0 ]] && getent passwd www-data >/dev/null 2>&1; then
    local base="${file%.sql.gz}"
    chown www-data:www-data "$file" "${file}.sha256" "${base}.meta.json" 2>/dev/null || true
    [[ -n "${BACKUP_DIR:-}" ]] && chown www-data:www-data "${BACKUP_DIR}/latest.json" 2>/dev/null || true
  fi
}

verify_gzip() {
  local file="$1"
  if ! gzip -t "$file" 2>/dev/null; then
    backup_log_error "backup.gzip_invalid" "$file"
    return 1
  fi
  return 0
}

write_checksum() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}' > "${file}.sha256"
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{print $1}' > "${file}.sha256"
  else
    backup_log_warn "backup.no_sha256" "sha256sum not found"
    return 1
  fi
  return 0
}

verify_checksum() {
  local file="$1"
  local sum_file="${file}.sha256"
  [[ -f "$sum_file" ]] || return 1
  local expected actual
  expected="$(cat "$sum_file")"
  if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$file" | awk '{print $1}')"
  else
    actual="$(shasum -a 256 "$file" | awk '{print $1}')"
  fi
  [[ "$expected" == "$actual" ]]
}

write_manifest() {
  local backup_dir="$1"
  local base_name="$2"
  local file="$3"
  local duration_sec="$4"
  local pg_version="${5:-unknown}"
  local size_bytes
  size_bytes="$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file")"
  local sha256=""
  [[ -f "${file}.sha256" ]] && sha256="$(cat "${file}.sha256")"

  local meta="${backup_dir}/${base_name}.meta.json"
  cat > "$meta" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "file": "$(basename "$file")",
  "sha256": "$sha256",
  "size_bytes": $size_bytes,
  "pg_version": "$pg_version",
  "duration_sec": $duration_sec,
  "status": "ok"
}
EOF

  cp "$meta" "${backup_dir}/latest.json"
}

send_backup_alert() {
  local msg="$1"
  if [[ -n "${BACKUP_ALERT_WEBHOOK:-}" ]]; then
    curl -sf -X POST "$BACKUP_ALERT_WEBHOOK" \
      -H "Content-Type: application/json" \
      -d "{\"text\":\"JBrealty backup: ${msg}\"}" >/dev/null 2>&1 || true
  fi
}

prune_old_backups() {
  local backup_dir="$1"
  local retention_days="$2"
  (
    cd "$backup_dir" || exit 0
    find . -maxdepth 1 -name 'jbrealty_*.sql.gz' -mtime +"$retention_days" -delete
    find . -maxdepth 1 -name 'jbrealty_*.sql.gz.sha256' -mtime +"$retention_days" -delete
    find . -maxdepth 1 -name 'jbrealty_*.meta.json' -mtime +"$retention_days" -delete
  )
}
