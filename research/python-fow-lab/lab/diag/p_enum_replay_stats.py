"""Cardinality + performance benchmark for PEnumerator on real games.

Loads all available game logs, replays each through the enumerator
for both perspectives, records |P| per ply, and aggregates stats.

Compares against Obscuro's reported numbers (avg |P| ≈ 17K, max ~10⁶)
to validate our enumerator's behavior on real adversarial play.

Output: lab/diag/p-enum-baseline-stats.json + console summary.

Run:
    PYTHONPATH=src .venv/bin/python lab/diag/p_enum_replay_stats.py
"""

from __future__ import annotations

import json
import statistics
import time
from pathlib import Path

import chess

from fow_chess.observation import observation_from_transition
from fow_chess.p_enum import PEnumerator


REPLAY_ROOTS = [
    Path(__file__).parents[2] / "feedback" / "mirror-mcts-200-depth8" / "games",
    Path(__file__).parents[2] / "feedback" / "mirror-mcts-v0.1" / "games",
    Path(__file__).parents[2] / "feedback" / "mirror-mcts-v0.2" / "games",
    Path(__file__).parents[2] / "feedback" / "mirror-v0.9.1-2026-05-16" / "games",
]
OUT_PATH = Path(__file__).parent / "p-enum-baseline-stats.json"

# Stop a game's replay if either |P_white| or |P_black| exceeds this.
# Per-ply updates scale linearly in |P|, so beyond this point the
# benchmark spends disproportionate time on pathological games.
# Stats up to the bail are still reported.
_MAX_P_SIZE = 200_000


_PROMO_LETTER = {
    "queen": "q", "rook": "r", "bishop": "b", "knight": "n",
    "q": "q", "r": "r", "b": "b", "n": "n",
}


def _load_moves(path: Path) -> list[chess.Move]:
    moves: list[chess.Move] = []
    with path.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if event.get("type") != "move-played":
                continue
            mv = event.get("move", {})
            frm = mv.get("from")
            to = mv.get("to")
            promo = mv.get("promotion")
            if frm is None or to is None:
                continue
            uci = f"{frm}{to}"
            if promo:
                letter = _PROMO_LETTER.get(str(promo).lower())
                if letter is None:
                    continue  # unknown promo encoding; skip this game's move
                uci += letter
            moves.append(chess.Move.from_uci(uci))
    return moves


def _replay_one(
    moves: list[chess.Move],
) -> list[dict] | None:
    """Replay one game, return per-ply records.

    Returns None on early-game-over or replay error.
    """
    if not moves:
        return None
    truth = chess.Board()
    e_white = PEnumerator(chess.WHITE)
    e_black = PEnumerator(chess.BLACK)
    rows: list[dict] = []
    for ply, move in enumerate(moves, start=1):
        if truth.king(chess.WHITE) is None or truth.king(chess.BLACK) is None:
            break
        if move not in truth.pseudo_legal_moves:
            break
        prev = truth.copy()
        truth.push(move)
        mover = prev.turn
        t0 = time.perf_counter()
        try:
            if mover == chess.WHITE:
                obs_for_black = observation_from_transition(prev, truth, chess.BLACK)
                e_white.update_own_move(move)
                e_black.update_opp_move(obs_for_black)
            else:
                obs_for_white = observation_from_transition(prev, truth, chess.WHITE)
                e_black.update_own_move(move)
                e_white.update_opp_move(obs_for_white)
        except RuntimeError:
            # Soundness violation. Log and bail.
            return None
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        # Truth-in-P sanity (silent; benchmark, not gate).
        truth_in_white = truth.fen() in e_white.positions
        truth_in_black = truth.fen() in e_black.positions
        rows.append({
            "ply": ply,
            "mover": "white" if mover == chess.WHITE else "black",
            "P_white_size": e_white.size,
            "P_black_size": e_black.size,
            "truth_in_P_white": truth_in_white,
            "truth_in_P_black": truth_in_black,
            "update_ms": elapsed_ms,
        })
        if e_white.size > _MAX_P_SIZE or e_black.size > _MAX_P_SIZE:
            # Bail early; stats up to this ply are still reported.
            break
    return rows


def _summarize(per_ply_rows: list[list[dict]]) -> dict:
    """Aggregate stats across games."""
    all_sizes_w: list[int] = []
    all_sizes_b: list[int] = []
    all_update_ms: list[float] = []
    truth_violations = 0
    n_plies_total = 0
    for game_rows in per_ply_rows:
        for r in game_rows:
            all_sizes_w.append(r["P_white_size"])
            all_sizes_b.append(r["P_black_size"])
            all_update_ms.append(r["update_ms"])
            n_plies_total += 1
            if not r["truth_in_P_white"]:
                truth_violations += 1
            if not r["truth_in_P_black"]:
                truth_violations += 1

    def _pct(values: list[float], q: float) -> float:
        if not values:
            return 0.0
        sv = sorted(values)
        i = min(len(sv) - 1, int(q * len(sv)))
        return sv[i]

    def _stats(values: list[float]) -> dict:
        if not values:
            return {}
        return {
            "n": len(values),
            "min": min(values),
            "median": statistics.median(values),
            "mean": statistics.mean(values),
            "p90": _pct(values, 0.90),
            "p99": _pct(values, 0.99),
            "max": max(values),
        }

    return {
        "n_games": len(per_ply_rows),
        "n_plies_total": n_plies_total,
        "truth_in_P_violations": truth_violations,
        "P_white_size_stats": _stats([float(v) for v in all_sizes_w]),
        "P_black_size_stats": _stats([float(v) for v in all_sizes_b]),
        "update_ms_stats": _stats(all_update_ms),
    }


def main() -> None:
    paths: list[Path] = []
    for root in REPLAY_ROOTS:
        if root.exists():
            paths.extend(sorted(root.glob("game-*.jsonl")))
    print(f"Found {len(paths)} game logs across {len(REPLAY_ROOTS)} roots", flush=True)
    per_ply_rows: list[list[dict]] = []
    skipped = 0
    t0 = time.monotonic()
    for i, path in enumerate(paths, start=1):
        g0 = time.monotonic()
        moves = _load_moves(path)
        rows = _replay_one(moves)
        g_wall = time.monotonic() - g0
        if rows is None:
            skipped += 1
            print(f"[{i}/{len(paths)}] {path.parent.parent.name}/{path.name}  SKIPPED  {g_wall:.1f}s", flush=True)
            continue
        last = rows[-1]
        bailed = " BAIL" if (last["P_white_size"] > _MAX_P_SIZE or last["P_black_size"] > _MAX_P_SIZE) else ""
        print(
            f"[{i}/{len(paths)}] {path.parent.parent.name}/{path.name}  "
            f"plies={len(rows)} max|Pw|={max(r['P_white_size'] for r in rows)} "
            f"max|Pb|={max(r['P_black_size'] for r in rows)} {g_wall:.1f}s{bailed}",
            flush=True,
        )
        per_ply_rows.append(rows)
    wall = time.monotonic() - t0
    summary = _summarize(per_ply_rows)
    payload = {
        "wall_seconds": wall,
        "n_paths_seen": len(paths),
        "n_skipped": skipped,
        "summary": summary,
    }
    OUT_PATH.write_text(json.dumps(payload, indent=2))
    print(f"Wrote {OUT_PATH}")
    print()
    print("=== Summary ===")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
