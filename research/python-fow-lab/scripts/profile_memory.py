"""Profile memory composition during a cap-hitting game.

Goals:
  - Identify the actual memory hot spots so optimization choices
    (RP8, P-in-Rust, KLUSS k=2, streaming output, allocator swap)
    are informed by data instead of guesses.
  - Sample at every ply: RSS, Python heap size, PEnumerator |P|,
    PEnumerator storage bytes, GTCFRState regret-table size.

What we measure
  - RSS via resource.getrusage (peak + current)
  - Python object heap via gc + sys.getsizeof on key containers
  - PEnumerator: len(_positions), sys.getsizeof on the set, sum of
    sys.getsizeof on a sample of entries
  - GTCFRState: total regret-table entry count (proxy for tree size)

What we do NOT measure (yet)
  - Rust-side allocations during update_*_move calls (would need
    to instrument the Rust function to report alloc bytes — defer)
  - Stockfish subprocess RSS (could `psutil` it if needed; defer)

Usage::

    PYTHONPATH=src .venv/bin/python scripts/profile_memory.py \\
        --seed 2026540 --p-max 0 --max-plies 30

  Note: p-max=0 (uncapped) lets P grow naturally; useful for finding
  the actual memory ceiling. With cap=5M+ on most seeds, P stays small
  enough that a clean profile is fast.
"""

from __future__ import annotations

import argparse
import gc
import json
import resource
import sys
import time
from pathlib import Path
from typing import Iterable

import chess

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from fow_chess.engine_v2 import EngineV2Strategy
from fow_chess.selfplay import play_game
from fow_chess.tournament.config import load_config
from fow_chess.tournament.runtime import bot_runtime


_TIER1_CONFIG = ROOT / "configs" / "tier1-v1.json"


def _rss_mb() -> float:
    ru = resource.getrusage(resource.RUSAGE_SELF)
    if sys.platform == "darwin":
        return ru.ru_maxrss / (1024 * 1024)
    return ru.ru_maxrss / 1024


def _enumerator_storage_bytes(positions) -> int:
    """Estimate the Python heap bytes held by the PEnumerator's
    `_positions` set. sys.getsizeof on the set itself + average entry
    size × count."""
    total = sys.getsizeof(positions)
    # Sample up to 100 entries to estimate average entry size.
    sample = []
    for i, p in enumerate(positions):
        if i >= 100:
            break
        sample.append(sys.getsizeof(p))
    if sample:
        avg = sum(sample) / len(sample)
        total += int(avg * len(positions))
    return total


def _cfr_state_size(strategy: EngineV2Strategy) -> tuple[int, int, int]:
    """Inspect the engine's last_solution (if any) to size the CFR state."""
    eng = strategy._engine
    if eng is None or eng.last_solution is None:
        return 0, 0, 0
    sol = eng.last_solution
    info_set_count = sol.info_set_count
    tree_node_count = sol.total_tree_nodes
    n_roots = sol.n_roots
    return info_set_count, tree_node_count, n_roots


_samples: list[dict] = []


def _sample(strategy: EngineV2Strategy, label: str, ply: int):
    eng = strategy._engine
    p_size = eng.enumerator.size if eng is not None else 0
    p_storage = (
        _enumerator_storage_bytes(eng.enumerator._positions)
        if eng is not None else 0
    )
    info_sets, tree_nodes, n_roots = _cfr_state_size(strategy)
    gc.collect()
    n_python_objs = len(gc.get_objects())
    _samples.append({
        "ply": ply,
        "label": label,
        "rss_peak_mb": round(_rss_mb(), 1),
        "p_size": p_size,
        "p_storage_mb": round(p_storage / (1024 * 1024), 1),
        "info_sets": info_sets,
        "tree_nodes": tree_nodes,
        "n_roots": n_roots,
        "py_objects": n_python_objs,
    })


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--seed", type=int, default=2026540,
                    help="seed (use a known cap-hitter for meaningful data)")
    ap.add_argument("--p-max", type=int, default=0,
                    help="--v2-p-max equivalent; 0 = uncapped")
    ap.add_argument("--max-plies", type=int, default=30,
                    help="cap game length; longer = more data but slower")
    ap.add_argument("--v2-iters", type=int, default=200)
    ap.add_argument("--v2-i", type=int, default=16)
    ap.add_argument("--v2-time-budget", type=float, default=2.0)
    ap.add_argument("--stockfish", default="stockfish")
    ap.add_argument("--out", type=str, default="/tmp/memory_profile.jsonl")
    args = ap.parse_args()

    print(f"memory profile: seed={args.seed} p_max={args.p_max} max_plies={args.max_plies}", flush=True)
    print(f"  v2: iters={args.v2_iters} |I|={args.v2_i} budget={args.v2_time_budget}s", flush=True)
    print(f"  out: {args.out}", flush=True)
    print()

    v2 = EngineV2Strategy(
        seed=args.seed + 7,
        iterations=args.v2_iters,
        i_sample_size=args.v2_i,
        time_budget_seconds=args.v2_time_budget,
        p_max_size=args.p_max if args.p_max > 0 else None,
        capture_telemetry=False,
    )
    config = load_config(_TIER1_CONFIG)
    cm = bot_runtime(config, stockfish_path=args.stockfish)
    factory = cm.__enter__()
    v095 = factory(args.seed)

    try:
        # Custom play loop so we can sample memory at every ply
        from fow_chess.observation import observation_from_transition
        from fow_chess.visibility import visible_squares, visible_piece_map
        from fow_chess.selfplay import PerspectiveView

        v2.reset(chess.WHITE)
        v095.reset(chess.BLACK)
        _sample(v2, "init", 0)

        board = chess.Board()
        for ply in range(1, args.max_plies + 1):
            if board.king(chess.WHITE) is None or board.king(chess.BLACK) is None:
                break
            color = board.turn
            active = v2 if color == chess.WHITE else v095
            passive = v095 if color == chess.WHITE else v2

            own_legals = list(board.pseudo_legal_moves)
            if not own_legals:
                break

            view = PerspectiveView(
                perspective=color,
                own_legal_moves=own_legals,
                visible_squares=visible_squares(board, color),
                visible_piece_map=visible_piece_map(board, color),
                clock_remaining_ms=None,
                increment_ms=0,
            )
            prev = board.copy()
            t0 = time.monotonic()
            mv = active.pick_move(view)
            wall = time.monotonic() - t0
            board.push(mv)

            active.observe_own_move(mv, observation_from_transition(prev, board, color))
            opp = chess.BLACK if color == chess.WHITE else chess.WHITE
            passive.observe_opp_move(observation_from_transition(prev, board, opp))

            mover = "W" if color == chess.WHITE else "B"
            _sample(v2, f"post-ply-{mover}-{mv.uci()}", ply)
            print(
                f"ply {ply:3d} {mover} {mv.uci():>5s} "
                f"wall={wall*1000:>5.0f}ms "
                f"rss={_samples[-1]['rss_peak_mb']:>6.0f}MB "
                f"|P|={_samples[-1]['p_size']:>9,d} "
                f"P_mb={_samples[-1]['p_storage_mb']:>6.1f} "
                f"info_sets={_samples[-1]['info_sets']:>6,d} "
                f"tree_nodes={_samples[-1]['tree_nodes']:>7,d}",
                flush=True,
            )
    finally:
        try:
            v2.close()
        finally:
            cm.__exit__(None, None, None)

    with open(args.out, "w") as f:
        for row in _samples:
            f.write(json.dumps(row) + "\n")
    print(f"\nwrote {len(_samples)} samples to {args.out}")

    # Peak summary
    if _samples:
        max_rss = max(s["rss_peak_mb"] for s in _samples)
        max_p = max(s["p_size"] for s in _samples)
        max_storage = max(s["p_storage_mb"] for s in _samples)
        max_tree = max(s["tree_nodes"] for s in _samples)
        peak_rss_sample = max(_samples, key=lambda s: s["rss_peak_mb"])
        print()
        print("=== peaks ===")
        print(f"  RSS (peak):        {max_rss:>7.0f} MB")
        print(f"  |P| (peak):        {max_p:>10,d}")
        print(f"  P storage (peak):  {max_storage:>7.1f} MB")
        print(f"  CFR tree (peak):   {max_tree:>7,d} nodes")
        print()
        s = peak_rss_sample
        print("=== at peak RSS ===")
        print(f"  ply: {s['ply']} ({s['label']})")
        print(f"  |P|: {s['p_size']:,}")
        print(f"  P storage: {s['p_storage_mb']:.1f} MB")
        print(f"  CFR info_sets: {s['info_sets']:,}")
        print(f"  CFR tree nodes: {s['tree_nodes']:,}")
        # Account: what fraction of RSS is P + CFR?
        py_overhead_base = 50  # Python interpreter base, rough
        accounted = s["p_storage_mb"]
        print(f"\n  P explains: {100 * accounted / s['rss_peak_mb']:.0f}% of RSS")
        print(f"  remainder ({s['rss_peak_mb'] - accounted:.0f} MB) = CFR + Rust scratch + Stockfish + Python overhead")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
