"""Generate a production-vs-production self-play corpus with full event logs.

Different from distill_corpus.py:
  - both sides are PRODUCTION engine (mcts_rollouts=0, full Tier1Strategy)
  - no MCTS q-values (none exist)
  - per-game events.jsonl with the move chosen at each ply
  - per-position record with (fen_before, mover, move_uci, outcome) — enough
    to train a policy net later

Per-position record:
  {
    "fen_before": <FEN of canonical board BEFORE the move>,
    "mover": "white" | "black",
    "move_uci": <e.g., "e2e4">,
    "outcome": +1 / -1 / 0 from mover's POV,
    "game": <game index>, "ply": <ply number>
  }

Output backends:
  --out <dir>             write corpus.jsonl + games.jsonl + manifest.json
  --out-postgres <id>     write one row per game to lab_games (corpus_id=<id>);
                          resumes from MAX(corpus_idx)+1 automatically.

Usage:
    .venv/bin/python3 scripts/generate_production_corpus.py --games 30 --out lab/corpora/c-prod-v0
    .venv/bin/python3 scripts/generate_production_corpus.py --games 100 --out-postgres c-prod-railway-v0
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import chess

_LAB_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_LAB_ROOT / "src"))

from fow_chess.engine import static_builder
from fow_chess.evaluator import fow_evaluator
from fow_chess.move_priors import uniform_prior
from fow_chess.selfplay import play_game
from fow_chess.strategies import Tier1Strategy

from fow_chess.lab import manifest as mf


_PROMO = {"queen": "q", "rook": "r", "bishop": "b", "knight": "n"}


@dataclass
class GameRollout:
    game_id: str
    game_index: int
    winner: str | None
    end_reason: str | None
    plies: int
    seed_white: int
    seed_black: int
    wall_seconds: float
    events: list[dict[str, Any]]
    positions: list[dict[str, Any]]


def _play_one_game(
    *, game_index: int, base_seed: int, max_plies: int, builder, prior
) -> GameRollout:
    seed_w = base_seed + game_index * 7919
    seed_b = base_seed + game_index * 7919 + 1

    white = Tier1Strategy(
        evaluator_builder=builder, move_prior=prior,
        target_n=256, max_eval_particles=16, seed=seed_w,
        mcts_rollouts=0,
    )
    black = Tier1Strategy(
        evaluator_builder=builder, move_prior=prior,
        target_n=256, max_eval_particles=16, seed=seed_b,
        mcts_rollouts=0,
    )

    t_g = time.time()
    result = play_game(
        white, black, max_plies=max_plies,
        room_id=f"prod-g{game_index:04d}", seed=seed_w,
    )
    wall = time.time() - t_g

    outcome_white = 1.0 if result.winner == "white" else -1.0 if result.winner == "black" else 0.0

    board = chess.Board()
    positions: list[dict[str, Any]] = []
    for evt in result.events:
        if evt.get("type") != "move-played":
            continue
        color = evt["color"]
        m = evt["move"]
        promo = m.get("promotion")
        pl = _PROMO.get(promo, "") if promo else ""
        move_uci = f"{m['from']}{m['to']}{pl}"

        if evt.get("opening_random"):
            board.push(chess.Move.from_uci(move_uci))
            continue

        outcome = outcome_white if color == "white" else -outcome_white
        positions.append({
            "schema_version": 2,
            "fen_before": board.fen(),
            "mover": color,
            "move_uci": move_uci,
            "outcome": outcome,
            "game": game_index,
            "ply": board.ply(),
        })
        board.push(chess.Move.from_uci(move_uci))

    return GameRollout(
        game_id=f"prod-g{game_index:04d}-s{base_seed}",
        game_index=game_index,
        winner=result.winner,
        end_reason=result.end_reason,
        plies=result.plies,
        seed_white=seed_w,
        seed_black=seed_b,
        wall_seconds=wall,
        events=result.events,
        positions=positions,
    )


def _game_record(roll: GameRollout) -> dict[str, Any]:
    return {
        "schema_version": 2,
        "game": roll.game_index,
        "game_id": roll.game_id,
        "winner": roll.winner,
        "end_reason": roll.end_reason,
        "plies": roll.plies,
        "seed_white": roll.seed_white,
        "seed_black": roll.seed_black,
        "wall_seconds": round(roll.wall_seconds, 2),
        "events": roll.events,
        "positions": roll.positions,
    }


def _run_filesystem(args) -> int:
    out: Path = args.out if args.out.is_absolute() else (_LAB_ROOT / args.out)
    if out.exists():
        print(f"out dir {out} already exists; refusing to overwrite", file=sys.stderr)
        return 1
    out.mkdir(parents=True)
    corpus_path = out / "corpus.jsonl"
    games_path = out / "games.jsonl"

    builder = static_builder(fow_evaluator())
    prior = uniform_prior

    n_positions = 0
    n_games = 0
    winners = {"white": 0, "black": 0, "none": 0}
    t_start = time.time()

    # Allow disjoint game-index ranges across parallel workers writing to
    # different out dirs. When --start-index is not provided in fs mode the
    # behavior is unchanged (range 0..games).
    start = args.start_index if args.start_index is not None else 0

    games_fh = games_path.open("w", encoding="utf-8", buffering=1)
    with corpus_path.open("w", encoding="utf-8", buffering=1) as fout:
        for i in range(start, start + args.games):
            roll = _play_one_game(
                game_index=i, base_seed=args.seed, max_plies=args.max_plies,
                builder=builder, prior=prior,
            )
            winners[roll.winner or "none"] = winners.get(roll.winner or "none", 0) + 1

            games_fh.write(json.dumps({
                "schema_version": 2,
                "game": roll.game_index,
                "winner": roll.winner,
                "end_reason": roll.end_reason,
                "plies": roll.plies,
                "seed_white": roll.seed_white,
                "seed_black": roll.seed_black,
                "events": roll.events,
            }) + "\n")
            games_fh.flush()

            for record in roll.positions:
                fout.write(json.dumps(record) + "\n")
                fout.flush()
                n_positions += 1

            n_games += 1
            print(
                f"  g{i:04d} winner={roll.winner or 'none':<5} plies={roll.plies:>3} "
                f"pos={len(roll.positions)} wall={roll.wall_seconds:>5.1f}s"
            )

    games_fh.close()
    wall_total = time.time() - t_start

    manifest = mf.build(
        type="corpus",
        id=out.name,
        spec={
            "type": "generate-corpus",
            "teacher": "production-v093 (Tier1Strategy mcts_rollouts=0 + fow + full vetoes)",
            "label_mode": "policy",
            "games": args.games,
            "seed": args.seed,
        },
        inputs={"teacher": "configs/tier1-v093.json"},
        outputs={"corpus": "corpus.jsonl", "games": "games.jsonl"},
        metrics={
            "n_positions": n_positions,
            "n_games": n_games,
            "winners": winners,
            "wall_seconds": round(wall_total, 1),
        },
        lineage=[],
        notes="Production-vs-production self-play with full event logs. Used to train an opponent policy prior that replaces uniform_prior in the belief filter.",
    )
    mf.write(mf.manifest_path(out), manifest)
    print(f"\n{n_positions} positions over {n_games} games in {wall_total:.0f}s → {out}")
    return 0


def _run_postgres(args) -> int:
    from fow_chess.lab.postgres_store import LabCorpusStore

    builder = static_builder(fow_evaluator())
    prior = uniform_prior

    with LabCorpusStore(corpus_id=args.out_postgres) as store:
        if args.start_index is not None:
            start = args.start_index
            target = start + args.games
            print(
                f"corpus={args.out_postgres} explicit_start={start} target={target} "
                f"({args.games} new games, base_seed={args.seed})"
            )
        else:
            start = store.next_corpus_idx()
            target = start + args.games
            print(
                f"corpus={args.out_postgres} resume_from={start} target={target} "
                f"({args.games} new games, base_seed={args.seed})"
            )

        winners = {"white": 0, "black": 0, "none": 0}
        n_positions = 0
        n_games = 0
        t_start = time.time()

        for i in range(start, target):
            roll = _play_one_game(
                game_index=i, base_seed=args.seed, max_plies=args.max_plies,
                builder=builder, prior=prior,
            )
            winners[roll.winner or "none"] = winners.get(roll.winner or "none", 0) + 1
            store.insert_game(
                corpus_idx=i, game_id=roll.game_id, data=_game_record(roll)
            )
            n_positions += len(roll.positions)
            n_games += 1
            print(
                f"  g{i:04d} winner={roll.winner or 'none':<5} plies={roll.plies:>3} "
                f"pos={len(roll.positions)} wall={roll.wall_seconds:>5.1f}s"
            )

        wall_total = time.time() - t_start
        print(
            f"\n{n_positions} positions over {n_games} games in {wall_total:.0f}s → "
            f"postgres lab_games (corpus_id={args.out_postgres}, total rows now {store.count()})"
        )
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--games", type=int, default=30)
    ap.add_argument("--max-plies", type=int, default=200)
    ap.add_argument("--seed", type=int, default=3030)
    ap.add_argument(
        "--start-index", type=int, default=None,
        help="explicit corpus_idx to start writing at (Postgres mode only); "
             "lets parallel workers claim disjoint ranges. Default: resume from MAX+1.",
    )

    out_group = ap.add_mutually_exclusive_group(required=True)
    out_group.add_argument(
        "--out", type=Path,
        help="filesystem output dir (corpus.jsonl + games.jsonl + manifest.json)",
    )
    out_group.add_argument(
        "--out-postgres", type=str, metavar="CORPUS_ID",
        help="write one row per game to lab_games with this corpus_id; resumes automatically",
    )
    args = ap.parse_args()

    if args.out is not None:
        return _run_filesystem(args)
    return _run_postgres(args)


if __name__ == "__main__":
    sys.exit(main())
