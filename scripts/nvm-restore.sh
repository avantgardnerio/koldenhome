#!/usr/bin/env bash
# Step 2: Restore NVM backup to the new controller
# Automatically converts 500→800 series NVM format

set -euo pipefail

BASE_URL="${KOLDENHOME_URL:-http://localhost:3000}"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup-file.json>"
  echo ""
  echo "Available backups:"
  ls -1t "$(dirname "$0")/../backups"/nvm-backup-*.json 2>/dev/null || echo "  (none)"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: File not found: $BACKUP_FILE"
  exit 1
fi

LENGTH=$(python3 -c "import json,sys; d=json.load(open('$BACKUP_FILE')); print(d['length'])")
echo "Restoring NVM from $BACKUP_FILE ($LENGTH bytes) ..."
echo "zwave-js will auto-convert 500→800 series format if needed."
echo ""
read -p "Continue? [y/N] " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

HTTP_CODE=$(curl -s -o /tmp/nvm-restore-result.json -w "%{http_code}" \
  -X POST "$BASE_URL/api/controller/nvm/restore" \
  -H "Content-Type: application/json" \
  -d @"$BACKUP_FILE")

if [ "$HTTP_CODE" -ne 200 ]; then
  echo "ERROR: Restore failed with HTTP $HTTP_CODE"
  cat /tmp/nvm-restore-result.json
  exit 1
fi

echo "Restore complete!"
echo ""
echo "Next steps:"
echo "  1. sudo systemctl restart koldenhome"
echo "  2. Run: ./scripts/nvm-verify.sh"
echo "  3. Remove ghost nodes: ./scripts/remove-ghosts.sh"
