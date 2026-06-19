#!/usr/bin/env bash
# Базовое усиление Ubuntu VPS для SDR CRM
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo $0"
  exit 1
fi

apt install -y ufw fail2ban

ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

cat > /etc/fail2ban/jail.d/sdr-crm-sshd.conf <<'EOF'
[sshd]
enabled = true
maxretry = 5
bantime = 3600
EOF

systemctl enable fail2ban
systemctl restart fail2ban

echo "OK: ufw enabled (22,80,443), fail2ban sshd active"
