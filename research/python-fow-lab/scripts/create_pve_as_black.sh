#!/usr/bin/env bash
# Create a PvE room with the engine playing WHITE so the human plays black.
# Prints the room URL.
#
# Usage:
#   bash scripts/create_pve_as_black.sh
#   bash scripts/create_pve_as_black.sh python-tier1-v0.9.1  # different engine

set -euo pipefail

ENGINE_ID="${1:-python-tier1-current}"
SERVER_URL="${MISTBOARD_SERVER_URL:-http://localhost:3001}"
WEB_URL="${MISTBOARD_WEB_URL:-http://localhost:3000}"

response=$(curl -s -X POST "${SERVER_URL}/api/rooms" \
  -H "content-type: application/json" \
  -d "{
    \"mode\": \"pve\",
    \"variant\": \"fog-of-war\",
    \"timeControl\": {\"initialMs\": 180000, \"incrementMs\": 2000},
    \"engineId\": \"${ENGINE_ID}\",
    \"engineColor\": \"white\"
  }")

room_id=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('roomId', ''))")
if [[ -z "$room_id" ]]; then
  echo "failed to create room. server response:"
  echo "$response"
  exit 1
fi

echo "engine=${ENGINE_ID} as WHITE (you play black)"
echo ""
echo "Open this URL:"
echo "  ${WEB_URL}/room/${room_id}"
