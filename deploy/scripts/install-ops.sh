#!/usr/bin/env bash
# Установка systemd timer, logrotate и каталогов логов/бэкапов на Linux VPS (Ubuntu/Debian)

set -euo pipefail

ROOT="${1:-/var/www/sdr-crm}"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "skip: install-ops.sh только для Linux VPS (systemd, www-data)."
  echo "      На macOS локально: npm run dev:all  или  node server/dist/index.js"
  exit 0
fi

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo $0 [$ROOT]"
  exit 1
fi

if ! getent group www-data >/dev/null 2>&1; then
  echo "error: группа www-data не найдена (нужен Ubuntu/Debian VPS)"
  exit 1
fi

mkdir -p /var/log/sdr-crm /var/backups/sdr-crm "${ROOT}/server/data"
chown www-data:www-data /var/log/sdr-crm /var/backups/sdr-crm "${ROOT}/server/data"
chmod 750 /var/backups/sdr-crm

chmod +x "${ROOT}/deploy/scripts/"*.sh
chmod +x "${ROOT}/deploy/scripts/lib/"*.sh 2>/dev/null || true

cp "${ROOT}/deploy/systemd/sdr-crm-backup.service" /etc/systemd/system/
cp "${ROOT}/deploy/systemd/sdr-crm-backup.timer" /etc/systemd/system/
cp "${ROOT}/deploy/systemd/sdr-crm-backup-alert.service" /etc/systemd/system/
cp "${ROOT}/deploy/systemd/sdr-crm-retention.service" /etc/systemd/system/
cp "${ROOT}/deploy/systemd/sdr-crm-retention.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now sdr-crm-backup.timer
systemctl enable --now sdr-crm-retention.timer

if [[ -d /etc/logrotate.d ]]; then
  cp "${ROOT}/deploy/logrotate/crm" /etc/logrotate.d/crm
fi

echo "OK: backup timer enabled (03:00 daily), logs in /var/log/sdr-crm"
systemctl list-timers sdr-crm-backup.timer --no-pager
