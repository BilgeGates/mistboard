"""EngineV2 vs random-legal opponent — sanity baseline.

Strong sanity gate: if EngineV2 doesn't crush a random-legal opponent
(target ≥80% win rate over 20 games), something fundamental is wrong
in the v2 stack (Stockfish leaf, PCFR+, P enum, multi-root, purification).

This is NOT the A7.3 bakeoff vs v0.9.5 — that requires wiring into
the existing scripts/eve_game_runner.py harness. This is a simpler
in-process self-play vs a random-move opponent to confirm v2 works
end-to-end on real games.

Settings (env-overridable):
    N_GAMES=20
    MAX_PLIES=120
    ITERATIONS=200      — GT-CFR iterations per move
    I_SAMPLE_SIZE=8     — |I| per move
    TIME_BUDGET=        — optional per-move wall budget (seconds)

Output: lab/diag/engine-v2-vs-random-results.json

Run:
    PYTHONPATH=src .venv/bin/python lab/diag/engine_v2_vs_random_smoke.py
"""

from __future__ import annotations

import json
import multiprocessing as mp
import os
import random
import time
from pathlib import Path

import chess

from fow_chess.cfr.leaf_eval_stockfish import StockfishLeafEval
from fow_chess.engine_v2 import EngineV2
from fow_chess.observation import observation_from_transition


N_GAMES = int(os.environ.get("N_GAMES", "20"))
MAX_PLIES = int(os.environ.get("MAX_PLIES", "120"))
ITERATIONS = int(os.environ.get("ITERATIONS", "200"))
I_SAMPLE_SIZE = int(os.environ.get("I_SAMPLE_SIZE", "8"))
TIME_BUDGET = float(os.environ.get("TIME_BUDGET", "0"))  # 0 → unlimited

OUT_PATH = Path(__file__).parent / "engine-v2-vs-random-results.json"


def _play_game(game_id: int) -> dict:
    """Play one game: v2 as one color, random-legal as the other.
    Color alternates by game_id parity (even=v2 white, odd=v2 black).
    """
    v2_color = chess.WHITE if game_id % 2 == 0 else chess.BLACK
    rng_random = random.Random(game_id * 1000 + 1)
    rng_v2 = random.Random(game_id * 1000 + 2)

    sf = StockfishLeafEval()
    engine = None
    try:
        engine = EngineV2(v2_color, stockfish=sf, rng=rng_v2)
        truth = chess.Board()
        t0 = time.monotonic()

        result = None  # 'v2_win' | 'random_win' | 'draw_max_plies'
        n_plies = 0
        for _ in range(MAX_PLIES):
            # FoW terminal: king captured
            if truth.king(chess.WHITE) is None:
                result = "v2_win" if v2_color == chess.BLACK else "random_win"
                break
            if truth.king(chess.BLACK) is None:
                result = "v2_win" if v2_color == chess.WHITE else "random_win"
                break

            legal_moves = list(truth.pseudo_legal_moves)
            if not legal_moves:
                # Stalemate-like — call it a draw
                result = "draw_stalemate"
                break

            mover = truth.turn
            if mover == v2_color:
                # v2 picks
                tb = TIME_BUDGET if TIME_BUDGET > 0 else None
                move = engine.choose_move(
                    iterations=ITERATIONS,
                    i_sample_size=I_SAMPLE_SIZE,
                    time_budget_seconds=tb,
                )
                assert move in truth.pseudo_legal_moves, (
                    f"v2 returned illegal {move.uci()} on {truth.fen()}"
                )
                prev = truth.copy()
                truth.push(move)
                engine.observe_own_move(move)
            else:
                # Random-legal picks
                move = rng_random.choice(legal_moves)
                prev = truth.copy()
                truth.push(move)
                obs = observation_from_transition(prev, truth, v2_color)
                engine.observe_opp_move(obs)
            n_plies += 1

        if result is None:
            result = "draw_max_plies"

        wall = time.monotonic() - t0
        return {
            "game_id": game_id,
            "v2_color": "white" if v2_color == chess.WHITE else "black",
            "result": result,
            "n_plies": n_plies,
            "wall_seconds": wall,
        }
    except Exception as e:
        return {
            "game_id": game_id,
            "v2_color": "white" if v2_color == chess.WHITE else "black",
            "error": f"{type(e).__name__}: {e}",
        }
    finally:
        if engine is not None:
            try:
                engine.close()
            except Exception:
                pass
        else:
            try:
                sf.close()
            except Exception:
                pass


def main() -> None:
    print(f"Running {N_GAMES} games of EngineV2 vs random-legal", flush=True)
    print(
        f"Settings: ITERATIONS={ITERATIONS}, I_SAMPLE_SIZE={I_SAMPLE_SIZE}, "
        f"TIME_BUDGET={TIME_BUDGET or 'unlimited'}, MAX_PLIES={MAX_PLIES}",
        flush=True,
    )

    n_workers = max(1, min(os.cpu_count() or 4, N_GAMES))
    print(f"Running on {n_workers} parallel workers...", flush=True)

    t0 = time.monotonic()
    with mp.Pool(processes=n_workers) as pool:
        results = []
        for i, r in enumerate(pool.imap_unordered(_play_game, range(N_GAMES))):
            results.append(r)
            status = (
                r.get("result", r.get("error", "?"))
                if "error" not in r
                else f"ERROR: {r['error']}"
            )
            print(
                f"  [{i+1}/{N_GAMES}] game{r['game_id']} v2={r.get('v2_color')} "
                f"{status} plies={r.get('n_plies', '?')} "
                f"wall={r.get('wall_seconds', 0):.1f}s",
                flush=True,
            )
    wall = time.monotonic() - t0

    valid = [r for r in results if "error" not in r]
    n_valid = len(valid)
    if n_valid == 0:
        summary = {"n_games": N_GAMES, "n_errors": len(results)}
    else:
        v2_wins = sum(1 for r in valid if r["result"] == "v2_win")
        random_wins = sum(1 for r in valid if r["result"] == "random_win")
        draws = sum(1 for r in valid if r["result"].startswith("draw"))
        summary = {
            "n_games": N_GAMES,
            "n_valid": n_valid,
            "n_errors": len(results) - n_valid,
            "v2_wins": v2_wins,
            "random_wins": random_wins,
            "draws": draws,
            "v2_win_rate": v2_wins / n_valid,
            "avg_plies": sum(r["n_plies"] for r in valid) / n_valid,
            "avg_wall_seconds": sum(r["wall_seconds"] for r in valid) / n_valid,
            "total_wall_seconds": wall,
        }
    payload = {
        "settings": {
            "n_games": N_GAMES,
            "max_plies": MAX_PLIES,
            "iterations": ITERATIONS,
            "i_sample_size": I_SAMPLE_SIZE,
            "time_budget": TIME_BUDGET,
        },
        "summary": summary,
        "results": results,
    }
    OUT_PATH.write_text(json.dumps(payload, indent=2))
    print(f"Wrote {OUT_PATH}")
    print()
    print("=== Summary ===")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
