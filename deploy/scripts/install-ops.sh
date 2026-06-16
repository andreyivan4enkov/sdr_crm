#!/usr/bin/env bash
# Установка systemd timer, logrotate и каталогов логов/бэкапов на Linux VPS (Ubuntu/Debian)

set -euo pipefail

ROOT="${1:-/var/www/jbrealty}"

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

mkdir -p /var/log/jbrealty /var/backups/jbrealty "${ROOT}/server/data"
chown www-data:www-data /var/log/jbrealty /var/backups/jbrealty "${ROOT}/server/data"
chmod 750 /var/backups/jbrealty

chmod +x "${ROOT}/deploy/scripts/"*.sh
chmod +x "${ROOT}/deploy/scripts/lib/"*.sh 2>/dev/null || true

cp "${ROOT}/deploy/systemd/jbrealty-backup.service" /etc/systemd/system/
cp "${ROOT}/deploy/systemd/jbrealty-backup.timer" /etc/systemd/system/
cp "${ROOT}/deploy/systemd/jbrealty-backup-alert.service" /etc/systemd/system/
cp "${ROOT}/deploy/systemd/jbrealty-retention.service" /etc/systemd/system/
cp "${ROOT}/deploy/systemd/jbrealty-retention.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now jbrealty-backup.timer
systemctl enable --now jbrealty-retention.timer

if [[ -d /etc/logrotate.d ]]; then
  cp "${ROOT}/deploy/logrotate/jbrealty" /etc/logrotate.d/jbrealty
fi

echo "OK: backup timer enabled (03:00 daily), logs in /var/log/jbrealty"
systemctl list-timers jbrealty-backup.timer --no-pager
