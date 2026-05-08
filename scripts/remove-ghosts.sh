#!/usr/bin/env bash
# Step 4: Remove ghost nodes (failed pairing attempts from 500-series dongle)
# Default targets: nodes 73, 74, 75, 76

set -euo pipefail

BASE_URL="${KOLDENHOME_URL:-http://localhost:3000}"
GHOST_NODES="${@:-73 74 75 76}"

echo "Will attempt to remove failed nodes: $GHOST_NODES"
echo "These must be in 'dead' or 'failed' state to remove."
echo ""
read -p "Continue? [y/N] " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

for NODE_ID in $GHOST_NODES; do
  echo -n "Removing node $NODE_ID ... "
  HTTP_CODE=$(curl -s -o /tmp/remove-node-result.json -w "%{http_code}" \
    -X POST "$BASE_URL/api/controller/nodes/$NODE_ID/remove-failed")

  if [ "$HTTP_CODE" -eq 200 ]; then
    echo "OK"
  else
    echo "FAILED (HTTP $HTTP_CODE)"
    cat /tmp/remove-node-result.json
    echo ""
  fi
done

echo ""
echo "Done. Run ./scripts/nvm-verify.sh to confirm."
