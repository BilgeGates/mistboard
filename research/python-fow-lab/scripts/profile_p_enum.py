"""Isolated PEnumerator profiling on a real game replay.

Replays one game from feedback/mirror-*/games/ through a PEnumerator,
recording per-update |P| + wall time + cProfile around the whole loop.
No engine, no GT-CFR, no Stockfish — just PEnumerator behavior.

Output:
  /tmp/p_enum_profile.txt — cProfile sorted by cumtime (top 50)
  /tmp/p_enum_per_update.csv — ply, side, P_w_size, P_b_size, update_ms

Usage:
    PYTHONPATH=src .venv/bin/python scripts/profile_p_enum.py
    PYTHONPATH=src .venv/bin/python scripts/profile_p_enum.py \\
        --game feedback/mirror-mcts-200-depth8/games/game-0007-L-tier1-black.jsonl \\
        --max-ply 18 --p-max 0
"""

from __future__ import annotations

import argparse
import cProfile
import json
import pstats
import sys
import time
from pathlib import Path

import chess

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from fow_chess.observation import observation_from_transition
from fow_chess.p_enum import PEnumerator


_PROMO_LETTER = {"queen": "q", "rook": "r", "bishop": "b", "knight": "n",
                 "q": "q", "r": "r", "b": "b", "n": "n"}


def _load_moves(path: Path) -> list[chess.Move]:
    moves: list[chess.Move] = []
    with path.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                e = json.loads(line)
            except json.JSONDecodeError:
                continue
            if e.get("type") != "move-played":
                continue
            mv = e.get("move", {})
            frm = mv.get("from")
            to = mv.get("to")
            if frm is None or to is None:
                continue
            uci = f"{frm}{to}"
            if mv.get("promotion"):
                letter = _PROMO_LETTER.get(str(mv["promotion"]).lower())
                if letter is None:
                    continue
                uci += letter
            moves.append(chess.Move.from_uci(uci))
    return moves


def _replay_one(
    moves: list[chess.Move],
    max_ply: int,
    p_max: int | None,
    rows: list[dict],
) -> None:
    """Replay through both perspectives; record per-update stats."""
    truth = chess.Board()
    e_white = PEnumerator(chess.WHITE, max_size=p_max)
    e_black = PEnumerator(chess.BLACK, max_size=p_max)

    for ply, move in enumerate(moves[:max_ply], start=1):
        if truth.king(chess.WHITE) is None or truth.king(chess.BLACK) is None:
            break
        if move not in truth.pseudo_legal_moves:
            print(f"illegal move at ply {ply}: {move.uci()}", file=sys.stderr)
            break
        prev = truth.copy()
        truth.push(move)
        mover = prev.turn

        t0 = time.perf_counter()
        try:
            if mover == chess.WHITE:
                e_white.update_own_move(move)
                obs_b = observation_from_transition(prev, truth, chess.BLACK)
                e_black.update_opp_move(obs_b)
                update_target = "P_black (opp)"
            else:
                e_black.update_own_move(move)
                obs_w = observation_from_transition(prev, truth, chess.WHITE)
                e_white.update_opp_move(obs_w)
                update_target = "P_white (opp)"
        except RuntimeError as ex:
            print(f"soundness error at ply {ply}: {ex}", file=sys.stderr)
            break
        wall_ms = (time.perf_counter() - t0) * 1000.0

        rows.append({
            "ply": ply,
            "mover": "white" if mover == chess.WHITE else "black",
            "update_target": update_target,
            "P_white_size": e_white.size,
            "P_black_size": e_black.size,
            "update_ms": wall_ms,
        })
        print(
            f"ply {ply:>3} mover={rows[-1]['mover']:<5}  "
            f"|P_w|={e_white.size:>6}  |P_b|={e_black.size:>6}  "
            f"update_ms={wall_ms:>8.1f}",
            flush=True,
        )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--game",
        type=Path,
        default=ROOT / "feedback" / "mirror-mcts-200-depth8" / "games" / "game-0007-L-tier1-black.jsonl",
    )
    parser.add_argument("--max-ply", type=int, default=18)
    parser.add_argument(
        "--p-max",
        type=int,
        default=0,
        help="0 = unbounded (what we actually want to profile)",
    )
    parser.add_argument("--profile-out", type=Path, default=Path("/tmp/p_enum_profile.txt"))
    parser.add_argument("--per-update-csv", type=Path, default=Path("/tmp/p_enum_per_update.csv"))
    args = parser.parse_args()

    print(f"Replaying {args.game.name} up to ply {args.max_ply}", flush=True)
    moves = _load_moves(args.game)
    print(f"  loaded {len(moves)} moves", flush=True)
    p_max = args.p_max if args.p_max > 0 else None

    rows: list[dict] = []
    pr = cProfile.Profile()
    t0 = time.monotonic()
    pr.enable()
    _replay_one(moves, args.max_ply, p_max, rows)
    pr.disable()
    total_wall = time.monotonic() - t0

    # Per-update CSV
    with args.per_update_csv.open("w") as f:
        f.write("ply,mover,update_target,P_white_size,P_black_size,update_ms\n")
        for r in rows:
            f.write(
                f"{r['ply']},{r['mover']},{r['update_target']},"
                f"{r['P_white_size']},{r['P_black_size']},{r['update_ms']:.3f}\n"
            )
    print(f"\nWrote per-update CSV: {args.per_update_csv}", flush=True)

    # cProfile sorted by cumtime (top 50)
    with args.profile_out.open("w") as f:
        f.write(f"Total wall: {total_wall:.2f}s\n")
        f.write(f"Game: {args.game.name}, max_ply={args.max_ply}\n")
        f.write("=" * 80 + "\n\n")
        f.write("=== Top 50 by cumulative time ===\n")
        st = pstats.Stats(pr, stream=f).sort_stats("cumtime")
        st.print_stats(50)
        f.write("\n\n=== Top 30 by total time (self) ===\n")
        st = pstats.Stats(pr, stream=f).sort_stats("tottime")
        st.print_stats(30)
    print(f"Wrote profile: {args.profile_out}", flush=True)
    print(f"Total wall: {total_wall:.2f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
