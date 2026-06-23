#!/usr/bin/env bash
# Legacy wrapper — prefer: npm run dev:all (node scripts/dev-all.mjs)
set -euo pipefail
exec node "$(dirname "$0")/dev-all.mjs"
