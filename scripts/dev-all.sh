#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

cleanup() {
  if [[ -n "${API_PID:-}" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "==> Starting API..."
npm run dev:api &
API_PID=$!

echo "==> Waiting for API on :3000..."
for _ in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
    echo "==> API ready"
    break
  fi
  if ! kill -0 "$API_PID" 2>/dev/null; then
    echo "error: API process exited before becoming ready"
    exit 1
  fi
  sleep 0.25
done

if ! curl -sf "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
  echo "error: API did not start in time. Check server logs above."
  exit 1
fi

echo "==> Starting Vite..."
npm run dev
