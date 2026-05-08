#!/usr/bin/env bash
# Step 1: Back up NVM from the current controller
# Saves raw NVM data as a base64-encoded JSON file with timestamp

set -euo pipefail

BASE_URL="${KOLDENHOME_URL:-http://localhost:3000}"
BACKUP_DIR="$(dirname "$0")/../backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/nvm-backup-${TIMESTAMP}.json"

echo "Backing up NVM from $BASE_URL ..."
HTTP_CODE=$(curl -s -o "$BACKUP_FILE" -w "%{http_code}" \
  -X POST "$BASE_URL/api/controller/nvm/backup")

if [ "$HTTP_CODE" -ne 200 ]; then
  echo "ERROR: Backup failed with HTTP $HTTP_CODE"
  cat "$BACKUP_FILE"
  rm -f "$BACKUP_FILE"
  exit 1
fi

# Verify the file has data
LENGTH=$(python3 -c "import json,sys; d=json.load(open('$BACKUP_FILE')); print(d['length'])")
echo "Backup saved: $BACKUP_FILE ($LENGTH bytes)"
echo ""
echo "Next steps:"
echo "  1. sudo systemctl stop koldenhome"
echo "  2. Unplug old dongle, plug in HomeSeer G8"
echo "  3. Check new serial port: ls -la /dev/ttyUSB* /dev/ttyACM*"
echo "  4. Update SERIAL_PORT if needed, then: sudo systemctl start koldenhome"
echo "  5. Run: ./scripts/nvm-restore.sh $BACKUP_FILE"
