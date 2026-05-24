#!/usr/bin/env bash
# Launch a multi-shard v2-vs-v0.9.5 bakeoff. Each shard runs as a
# separate `run_v2_bakeoff.py` orchestrator process, which itself spawns
# one subprocess per game (crash + memory isolation).
#
# Resume: re-running with the same OUT_DIR skips already-completed
# game_ids in each shard's log. Safe to Ctrl+C and re-launch.
#
# Usage:
#   scripts/launch_v2_bakeoff.sh \
#       OUT_DIR=lab/runs/v2-vs-v095-2026-05-24 \
#       N_SHARDS=4 GAMES_PER_SHARD=50 \
#       V2_ITERS=500 V2_I=32 MAX_PLIES=160
#
# Or with defaults:
#   scripts/launch_v2_bakeoff.sh OUT_DIR=lab/runs/probe
#
# Monitor while running:
#   tail -f $OUT_DIR/shard-*.stdout
#   wc -l $OUT_DIR/shard-*.jsonl

set -euo pipefail

# --- config (env-overridable) ---
OUT_DIR="${OUT_DIR:-}"
N_SHARDS="${N_SHARDS:-4}"
GAMES_PER_SHARD="${GAMES_PER_SHARD:-50}"
V2_ITERS="${V2_ITERS:-500}"
V2_I="${V2_I:-32}"
V2_TIME_BUDGET="${V2_TIME_BUDGET:-5.0}"
V2_P_MAX="${V2_P_MAX:-1000000}"
MAX_PLIES="${MAX_PLIES:-160}"
BASE_SEED="${BASE_SEED:-12345}"
PER_GAME_TIMEOUT="${PER_GAME_TIMEOUT:-1800}"
STOCKFISH="${STOCKFISH:-stockfish}"
# Global offset for the first game index this launch covers. Use to add
# a rung without re-assigning already-done games to different shards:
#   rung 1: START_INDEX=0 GAMES_PER_SHARD=1   →  games [0, 4)
#   rung 2: START_INDEX=4 GAMES_PER_SHARD=1   →  games [4, 8)
#   rung 3: START_INDEX=8 GAMES_PER_SHARD=2   →  games [8, 16)
# Default 0 = behave like before (start fresh).
START_INDEX="${START_INDEX:-0}"

if [[ -z "$OUT_DIR" ]]; then
  echo "OUT_DIR= is required" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p "$OUT_DIR"

PYTHON="${PYTHON:-.venv/bin/python3}"
if [[ ! -x "$PYTHON" ]]; then
  echo "python not found at $PYTHON (set PYTHON= env var)" >&2
  exit 2
fi

echo "v2 bakeoff: $((N_SHARDS * GAMES_PER_SHARD)) games across $N_SHARDS shards (game indices [$START_INDEX, $((START_INDEX + N_SHARDS * GAMES_PER_SHARD))))"
echo "  out=$OUT_DIR"
echo "  v2-iters=$V2_ITERS |I|=$V2_I time=$V2_TIME_BUDGET p_max=$V2_P_MAX max_plies=$MAX_PLIES"
echo "  per-game-timeout=${PER_GAME_TIMEOUT}s base-seed=$BASE_SEED"
echo

pids=()
for shard in $(seq 0 $((N_SHARDS - 1))); do
  start=$((START_INDEX + shard * GAMES_PER_SHARD))
  stdout_log="$OUT_DIR/shard-$(printf %02d "$shard").stdout"
  PYTHONPATH=src "$PYTHON" -u scripts/run_v2_bakeoff.py \
    --out-dir "$OUT_DIR" \
    --shard-id "$shard" \
    --games "$GAMES_PER_SHARD" \
    --start-index "$start" \
    --max-plies "$MAX_PLIES" \
    --v2-iters "$V2_ITERS" \
    --v2-i "$V2_I" \
    --v2-time-budget "$V2_TIME_BUDGET" \
    --v2-p-max "$V2_P_MAX" \
    --base-seed "$BASE_SEED" \
    --stockfish "$STOCKFISH" \
    --per-game-timeout "$PER_GAME_TIMEOUT" \
    > "$stdout_log" 2>&1 &
  pid=$!
  pids+=("$pid")
  echo "  shard $shard (pid $pid): games [$start, $((start + GAMES_PER_SHARD))) → $stdout_log"
done

echo
echo "All shards launched. Waiting for completion..."
echo "Monitor with:  tail -f $OUT_DIR/shard-*.stdout"
echo "Resume after a kill: re-run this command (already-completed games skip)."
echo

# Wait for all shards; record failures but don't abort siblings.
failed=0
for pid in "${pids[@]}"; do
  if ! wait "$pid"; then
    failed=$((failed + 1))
  fi
done

echo
if (( failed > 0 )); then
  echo "DONE — $failed shard(s) had errors (see shard logs)"
else
  echo "DONE — all shards exited clean"
fi
echo "  manifest: $OUT_DIR/manifest.json"
echo "  view in browser: open apps/web dev server, then visit /?bakeoff=/$OUT_DIR/manifest.json"
exit $failed
