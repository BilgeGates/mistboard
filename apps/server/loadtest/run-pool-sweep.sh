#!/usr/bin/env bash
# Phase 2 pool-on sweep. Pairs with run-baselines.sh — same concurrency
# levels, same engine (python-random-legal), so the SUMMARY tables can be
# diffed directly.
#
# Requires server running with MISTBOARD_PYTHON_POOL_SIZE>=4 to take effect.

set -euo pipefail

SERVER_URL=${SERVER_URL:-ws://127.0.0.1:3101}
OUT_DIR=${OUT_DIR:-baseline-results-pool}
mkdir -p "$OUT_DIR"

RUNS=(
  "pveblitz-pyrand-pool-c1 pve-blitz python-random-legal 1"
  "pveblitz-pyrand-pool-c5 pve-blitz python-random-legal 5"
  "pveblitz-pyrand-pool-c10 pve-blitz python-random-legal 10"
  "pveblitz-pyrand-pool-c20 pve-blitz python-random-legal 20"
  "pveblitz-pyrand-pool-c50 pve-blitz python-random-legal 50"
)

SUMMARY="$OUT_DIR/SUMMARY.md"
echo "# Phase 2 pool-on sweep  (server=$SERVER_URL, $(date -u +%Y-%m-%dT%H:%M:%SZ))" > "$SUMMARY"
echo "" >> "$SUMMARY"
echo "| run | mode | engine | conc | games | moves | move-p50 | move-p95 | move-p99 | game-p99 | outcomes |" >> "$SUMMARY"
echo "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|" >> "$SUMMARY"

for row in "${RUNS[@]}"; do
  read -r label mode engine conc <<< "$row"
  echo ""
  echo "==== $label: $mode engine=$engine concurrency=$conc ===="

  ENGINE_ARG="--engine $engine"
  RESULT_FILE="$OUT_DIR/$label.jsonl"
  set +e
  OUT=$(npx tsx loadtest/cli.ts \
    --mode "$mode" --concurrency "$conc" --server "$SERVER_URL" \
    --seed 42 --quiet --out "$RESULT_FILE" $ENGINE_ARG 2>&1)
  set -e
  echo "$OUT" | tail -8

  GAMES=$(echo "$OUT" | grep -E "^  wall=" | head -1 | sed -E 's/.*games=([0-9]+).*/\1/')
  MOVES=$(echo "$OUT" | grep -E "^  wall=" | head -1 | sed -E 's/.*total_moves=([0-9]+).*/\1/')
  MOVE_P50=$(echo "$OUT" | grep "move-rtt" | head -1 | sed -E 's/.*p50= *([0-9]+)ms.*/\1/')
  MOVE_P95=$(echo "$OUT" | grep "move-rtt" | head -1 | sed -E 's/.*p95= *([0-9]+)ms.*/\1/')
  MOVE_P99=$(echo "$OUT" | grep "move-rtt" | head -1 | sed -E 's/.*p99= *([0-9]+)ms.*/\1/')
  GAME_P99=$(echo "$OUT" | grep "game-duration" | head -1 | sed -E 's/.*p99= *([0-9]+)ms.*/\1/')
  OUTCOMES=$(echo "$OUT" | grep -E "^  outcomes:" | head -1 | sed -E 's/^  outcomes: //')
  echo "| $label | $mode | $engine | $conc | $GAMES | $MOVES | ${MOVE_P50}ms | ${MOVE_P95}ms | ${MOVE_P99}ms | ${GAME_P99}ms | $OUTCOMES |" >> "$SUMMARY"

  sleep 2
done

echo ""
echo "==== summary written to $SUMMARY ===="
cat "$SUMMARY"
