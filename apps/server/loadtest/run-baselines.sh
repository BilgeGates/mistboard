#!/usr/bin/env bash
# Phase 1 baseline sweep. Assumes the server is already running on
# $SERVER_URL with python-random-legal in MISTBOARD_EXTRA_PLAYABLE_ENGINES
# and MISTBOARD_PVE_ENGINE_DELAY_MS=0.
#
# Saves per-run summaries + JSONL to ./baseline-results/

set -euo pipefail

SERVER_URL=${SERVER_URL:-ws://127.0.0.1:3101}
OUT_DIR=${OUT_DIR:-baseline-results}
mkdir -p "$OUT_DIR"

# Each run table entry: <label> <mode> <engine-or-none> <concurrency>
RUNS=(
  # PvE casual w/ builtin (near-zero engine cost; tests WS+state path).
  "pvecasual-builtin-c1 pve-casual builtin 1"
  "pvecasual-builtin-c5 pve-casual builtin 5"
  "pvecasual-builtin-c10 pve-casual builtin 10"
  "pvecasual-builtin-c25 pve-casual builtin 25"
  "pvecasual-builtin-c50 pve-casual builtin 50"
  # PvE blitz w/ python-random-legal (isolates subprocess-spawn cost).
  "pveblitz-pyrand-c1 pve-blitz python-random-legal 1"
  "pveblitz-pyrand-c5 pve-blitz python-random-legal 5"
  "pveblitz-pyrand-c10 pve-blitz python-random-legal 10"
  "pveblitz-pyrand-c20 pve-blitz python-random-legal 20"
  "pveblitz-pyrand-c50 pve-blitz python-random-legal 50"
  # PvP blitz (pure WS load, no engine).
  "pvp-blitz-c1 pvp-blitz none 1"
  "pvp-blitz-c10 pvp-blitz none 10"
  "pvp-blitz-c50 pvp-blitz none 50"
  "pvp-blitz-c100 pvp-blitz none 100"
)

SUMMARY="$OUT_DIR/SUMMARY.md"
echo "# Phase 1 baselines  (server=$SERVER_URL, $(date -u +%Y-%m-%dT%H:%M:%SZ))" > "$SUMMARY"
echo "" >> "$SUMMARY"
echo "| run | mode | engine | conc | games | moves | move-p50 | move-p95 | move-p99 | game-p99 | outcomes |" >> "$SUMMARY"
echo "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|" >> "$SUMMARY"

for row in "${RUNS[@]}"; do
  read -r label mode engine conc <<< "$row"
  echo ""
  echo "==== $label: $mode engine=$engine concurrency=$conc ===="

  ENGINE_ARG=""
  if [ "$engine" != "builtin" ] && [ "$engine" != "none" ]; then
    ENGINE_ARG="--engine $engine"
  fi

  RESULT_FILE="$OUT_DIR/$label.jsonl"
  set +e
  OUT=$(npx tsx loadtest/cli.ts \
    --mode "$mode" --concurrency "$conc" --server "$SERVER_URL" \
    --seed 42 --quiet --out "$RESULT_FILE" $ENGINE_ARG 2>&1)
  set -e
  echo "$OUT" | tail -8

  # Parse the summary lines from CLI output for the markdown table.
  GAMES=$(echo "$OUT" | grep -E "^  wall=" | head -1 | sed -E 's/.*games=([0-9]+).*/\1/')
  MOVES=$(echo "$OUT" | grep -E "^  wall=" | head -1 | sed -E 's/.*total_moves=([0-9]+).*/\1/')
  MOVE_P50=$(echo "$OUT" | grep "move-rtt" | head -1 | sed -E 's/.*p50= *([0-9]+)ms.*/\1/')
  MOVE_P95=$(echo "$OUT" | grep "move-rtt" | head -1 | sed -E 's/.*p95= *([0-9]+)ms.*/\1/')
  MOVE_P99=$(echo "$OUT" | grep "move-rtt" | head -1 | sed -E 's/.*p99= *([0-9]+)ms.*/\1/')
  GAME_P99=$(echo "$OUT" | grep "game-duration" | head -1 | sed -E 's/.*p99= *([0-9]+)ms.*/\1/')
  OUTCOMES=$(echo "$OUT" | grep -E "^  outcomes:" | head -1 | sed -E 's/^  outcomes: //')
  echo "| $label | $mode | $engine | $conc | $GAMES | $MOVES | ${MOVE_P50}ms | ${MOVE_P95}ms | ${MOVE_P99}ms | ${GAME_P99}ms | $OUTCOMES |" >> "$SUMMARY"

  # Give the server a second to settle between runs.
  sleep 2
done

echo ""
echo "==== summary written to $SUMMARY ===="
cat "$SUMMARY"
