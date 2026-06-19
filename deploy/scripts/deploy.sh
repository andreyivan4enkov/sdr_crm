#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "==> Installing dependencies"
npm ci

echo "==> Building API"
npm run build:api

echo "==> Running migrations"
npm run db:migrate

echo "==> Seeding (idempotent)"
npm run db:seed

echo "==> Building frontend"
npm run build

echo "==> Installing ops (logrotate, backup timer) if root"
if [[ "${SKIP_OPS:-}" != "1" ]] && [[ $EUID -eq 0 ]]; then
  bash "${ROOT}/deploy/scripts/install-ops.sh" "$ROOT"
elif [[ "${SKIP_OPS:-}" != "1" ]]; then
  echo "    (skip: install-ops только на Linux VPS: sudo bash deploy/scripts/install-ops.sh)"
fi

echo "==> Reloading Caddy if available"
if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet caddy 2>/dev/null; then
  systemctl reload caddy || true
fi

mkdir -p "${ROOT}/server/data"
chown www-data:www-data "${ROOT}/server/data" 2>/dev/null || true

echo "==> Restarting API"
if command -v systemctl >/dev/null 2>&1; then
  systemctl restart sdr-crm-api || echo "Start manually: node server/dist/index.js"
else
  echo "Start manually: node server/dist/index.js"
fi

echo "Deploy complete. Static files in dist/, API on port ${PORT:-3000}"
