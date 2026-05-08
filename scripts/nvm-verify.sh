#!/usr/bin/env bash
# Step 3: Verify nodes are alive after controller swap
# Lists all nodes and their status

set -euo pipefail

BASE_URL="${KOLDENHOME_URL:-http://localhost:3000}"

echo "Fetching node list from $BASE_URL ..."
echo ""

curl -s "$BASE_URL/api/nodes" | python3 -c "
import json, sys
nodes = json.load(sys.stdin)
print(f'{'ID':>4}  {'Status':<12}  {'Name':<30}  Type')
print('-' * 80)
for n in sorted(nodes, key=lambda x: x.get('id', 0)):
    nid = n.get('id', '?')
    status = n.get('status', 'unknown')
    name = n.get('name', '') or n.get('label', '') or '(unnamed)'
    ntype = n.get('deviceClass', {}).get('generic', {}).get('label', '') if isinstance(n.get('deviceClass'), dict) else ''
    print(f'{nid:>4}  {status:<12}  {name:<30}  {ntype}')
print(f'\nTotal: {len(nodes)} nodes')
"
