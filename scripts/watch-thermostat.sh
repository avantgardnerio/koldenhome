#!/bin/bash
# Watch T6 Pro (Node 61) operating state and mode in real time
# Usage: ./scripts/watch-thermostat.sh [interval_seconds]

INTERVAL=${1:-5}
API="http://localhost:3000/api/nodes/61/values/poll"

declare -A STATES=(
  [0]="Idle" [1]="Heating" [2]="Cooling" [3]="Fan Only"
  [4]="Pending Heat" [5]="Pending Cool" [6]="Vent/Economizer"
  [7]="Aux Heating" [8]="2nd Stage Heat" [9]="2nd Stage Cool"
  [10]="2nd Stage Aux Heat" [11]="3rd Stage Aux Heat"
)

declare -A MODES=(
  [0]="Off" [1]="Heat" [2]="Cool" [3]="Auto"
  [4]="Aux Heat" [11]="Energy Heat" [12]="Energy Cool"
)

printf "%-12s  %-8s  %-20s  %-8s  %-8s  %s\n" "TIME" "MODE" "STATE" "TEMP" "HEAT SP" "COOL SP"
printf "%s\n" "----------  ------  ------------------  ------  ------  ------"

while true; do
  MODE=$(curl -sf -X POST "$API" -H "Content-Type: application/json" -d '{"commandClass":64,"property":"mode"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['value'])" 2>/dev/null)
  STATE=$(curl -sf -X POST "$API" -H "Content-Type: application/json" -d '{"commandClass":66,"property":"state"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['value'])" 2>/dev/null)
  TEMP=$(curl -sf -X POST "$API" -H "Content-Type: application/json" -d '{"commandClass":49,"property":"Air temperature"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['value'])" 2>/dev/null)
  HEAT_SP=$(curl -sf -X POST "$API" -H "Content-Type: application/json" -d '{"commandClass":67,"property":"setpoint","propertyKey":1}' | python3 -c "import sys,json; print(json.load(sys.stdin)['value'])" 2>/dev/null)
  COOL_SP=$(curl -sf -X POST "$API" -H "Content-Type: application/json" -d '{"commandClass":67,"property":"setpoint","propertyKey":2}' | python3 -c "import sys,json; print(json.load(sys.stdin)['value'])" 2>/dev/null)

  MODE_LABEL=${MODES[$MODE]:-"?($MODE)"}
  STATE_LABEL=${STATES[$STATE]:-"?($STATE)"}

  printf "%-12s  %-8s  %-20s  %-8s  %-8s  %s\n" \
    "$(date +%H:%M:%S)" "$MODE_LABEL" "$STATE_LABEL" "${TEMP}°F" "${HEAT_SP}°F" "${COOL_SP}°F"

  sleep "$INTERVAL"
done
