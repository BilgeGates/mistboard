"""Replay a fixed game log with different belief particle budgets.

This isolates the particle-generation lane from self-play divergence. The game
moves are force-fed from an existing bake-off artifact; only Tier-1's internal
belief tracker changes.

Examples:
    .venv/bin/python scripts/particle_sweep.py \\
      ../../apps/web/public/bakeoff-v0.7.17-rung3-piece-facts \\
      --game-index 18 --side white --plies 31 --target-ns 64,128,256,512
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import chess

_LAB_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_LAB_ROOT / "src"))

from fow_chess.engine import EvaluatorBuilder
from fow_chess.evaluator import king_safety_evaluator, visibility_threat_evaluator
from fow_chess.event_log import _convert_move
from fow_chess.move_priors import uniform_prior
from fow_chess.observation import observation_from_transition
from fow_chess.selfplay import PerspectiveView
from fow_chess.strategies import Tier1Strategy
from fow_chess.visibility import visible_piece_map, visible_squares


@dataclass(frozen=True)
class ParticleSnapshot:
    target_n: int
    game_index: int
    side: str
    ply: int
    snapshot_kind: str
    move_uci: str | None
    move_support: float | None
    move_support_count: int | None
    move_support_unique: int | None
    particle_count: int
    unique_count: int
    top1_weight: float
    top3_weight: float
    hard_piece_facts: list[str]
    hard_square_facts: list[str]
    csp_reseed_fired: bool
    csp_reseed_count: int
    repair_fired: bool
    repair_count: int
    last_constraint_pruned: int
    elapsed_ms: float


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open() as fh:
        for line in fh:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def side_color(side: str) -> chess.Color:
    if side == "white":
        return chess.WHITE
    if side == "black":
        return chess.BLACK
    raise ValueError(f"side must be white or black, got {side!r}")


def view(board: chess.Board, perspective: chess.Color) -> PerspectiveView:
    return PerspectiveView(
        perspective=perspective,
        own_legal_moves=list(board.pseudo_legal_moves),
        visible_squares=visible_squares(board, perspective),
        visible_piece_map=visible_piece_map(board, perspective),
    )


def seed_for_side(manifest: dict[str, Any], game: dict[str, Any], side: str) -> int:
    if str(game.get("tier1_color")) == side:
        return int(game["tier1_seed"])
    if manifest.get("opponent") == "tier1":
        return int(game["random_seed"])
    return int(game["tier1_seed"])


def evaluator_builder(threat_lambda: float) -> EvaluatorBuilder:
    base = visibility_threat_evaluator(threat_lambda)

    def build(current_view: PerspectiveView):
        return king_safety_evaluator(base(current_view))

    return build


def snapshot(
    strategy: Tier1Strategy,
    *,
    target_n: int,
    game_index: int,
    side: str,
    ply: int,
    snapshot_kind: str,
    elapsed_ms: float,
    move: chess.Move | None = None,
) -> ParticleSnapshot:
    belief = strategy._belief
    assert belief is not None
    clusters = belief.top_k_clusters(k=3)
    facts = belief.hard_fact_summary()
    move_support: float | None = None
    move_support_count: int | None = None
    move_support_unique: int | None = None
    if move is not None:
        total = sum(belief.weights)
        support_weight = 0.0
        support_count = 0
        support_fens: set[str] = set()
        for particle, weight in zip(belief.particles, belief.weights):
            if not particle.is_pseudo_legal(move):
                continue
            support_weight += weight
            support_count += 1
            support_fens.add(particle.fen())
        move_support = support_weight / total if total > 0 else 0.0
        move_support_count = support_count
        move_support_unique = len(support_fens)
    return ParticleSnapshot(
        target_n=target_n,
        game_index=game_index,
        side=side,
        ply=ply,
        snapshot_kind=snapshot_kind,
        move_uci=move.uci() if move is not None else None,
        move_support=move_support,
        move_support_count=move_support_count,
        move_support_unique=move_support_unique,
        particle_count=len(belief.particles),
        unique_count=len({particle.fen() for particle in belief.particles}),
        top1_weight=clusters[0][1] if clusters else 0.0,
        top3_weight=sum(weight for _, weight, _ in clusters),
        hard_piece_facts=list(facts.get("piece_facts") or []),
        hard_square_facts=list(facts.get("square_facts") or []),
        csp_reseed_fired=bool(belief.last_csp_reseed_fired),
        csp_reseed_count=belief.last_csp_reseed_count,
        repair_fired=bool(belief.last_repair_fired),
        repair_count=belief.last_repair_count,
        last_constraint_pruned=belief.last_constraint_pruned,
        elapsed_ms=elapsed_ms,
    )


def replay_one(
    run_dir: Path,
    *,
    game_index: int,
    side: str,
    target_n: int,
    plies: set[int],
) -> list[ParticleSnapshot]:
    manifest = load_json(run_dir / "manifest.json")
    game = next(
        row for row in manifest.get("games", []) if int(row["index"]) == game_index
    )
    events = load_jsonl(run_dir / str(game["path"]))
    perspective = side_color(side)
    seed = seed_for_side(manifest, game, side)
    strategy = Tier1Strategy(
        evaluator_builder=evaluator_builder(
            float(manifest.get("threat_lambda") or 0.3)
        ),
        move_prior=uniform_prior,
        target_n=target_n,
        max_eval_particles=int(manifest.get("max_particles") or 16),
        risk_aversion=float(manifest.get("risk_aversion") or 0.0),
        seed=seed,
        verbose_belief_capture=False,
    )
    strategy.reset(perspective)

    board = chess.Board()
    ply = 0
    rows: list[ParticleSnapshot] = []
    started = time.perf_counter()

    for event in events:
        if event.get("type") != "move-played":
            continue
        ply += 1
        actor = side_color(str(event["color"]))
        move = _convert_move(event["move"], board)
        prev = board.copy()

        if ply in plies and actor == perspective:
            rows.append(
                snapshot(
                    strategy,
                    target_n=target_n,
                    game_index=game_index,
                    side=side,
                    ply=ply,
                    snapshot_kind="decision",
                    elapsed_ms=(time.perf_counter() - started) * 1000,
                    move=move,
                )
            )

        board.push(move)
        if actor == perspective:
            pre_view = view(prev, perspective)
            strategy._stage_pending_capture(move, pre_view)
            strategy.observe_own_move(
                move,
                observation_from_transition(prev, board, perspective),
            )
            kind = "after-own-move"
        else:
            strategy.observe_opp_move(
                observation_from_transition(prev, board, perspective)
            )
            kind = "after-opp-move"

        if ply in plies:
            rows.append(
                snapshot(
                    strategy,
                    target_n=target_n,
                    game_index=game_index,
                    side=side,
                    ply=ply,
                    snapshot_kind=kind,
                    elapsed_ms=(time.perf_counter() - started) * 1000,
                )
            )

    return rows


def write_markdown(path: Path, rows: list[ParticleSnapshot]) -> None:
    lines = [
        "# Particle Sweep",
        "",
        "| target_n | game | side | ply | snapshot | move | support | particles | unique | top1 | top3 | repair | csp | ms |",
        "| ---: | ---: | --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: |",
    ]
    for row in rows:
        lines.append(
            "| "
            + " | ".join(
                [
                    str(row.target_n),
                    str(row.game_index),
                    row.side,
                    str(row.ply),
                    row.snapshot_kind,
                    row.move_uci or "",
                    f"{row.move_support:.3f}" if row.move_support is not None else "",
                    str(row.particle_count),
                    str(row.unique_count),
                    f"{row.top1_weight:.3f}",
                    f"{row.top3_weight:.3f}",
                    f"{row.repair_count}" if row.repair_fired else "",
                    f"{row.csp_reseed_count}" if row.csp_reseed_fired else "",
                    f"{row.elapsed_ms:.1f}",
                ]
            )
            + " |"
        )
    path.write_text("\n".join(lines) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_dir", type=Path)
    parser.add_argument("--game-index", type=int, required=True)
    parser.add_argument("--side", choices=("white", "black"), required=True)
    parser.add_argument("--plies", required=True, help="Comma-separated ply numbers")
    parser.add_argument(
        "--target-ns",
        default="64,128,256,512",
        help="Comma-separated target_n values",
    )
    parser.add_argument("--json-out", type=Path, default=None)
    parser.add_argument("--md-out", type=Path, default=None)
    args = parser.parse_args()

    plies = {int(part) for part in args.plies.split(",") if part}
    target_ns = [int(part) for part in args.target_ns.split(",") if part]

    rows: list[ParticleSnapshot] = []
    for target_n in target_ns:
        rows.extend(
            replay_one(
                args.run_dir,
                game_index=args.game_index,
                side=args.side,
                target_n=target_n,
                plies=plies,
            )
        )

    json_out = args.json_out or args.run_dir / (
        f"particle_sweep_g{args.game_index}_{args.side}.json"
    )
    md_out = args.md_out or args.run_dir / (
        f"particle_sweep_g{args.game_index}_{args.side}.md"
    )
    json_out.write_text(
        json.dumps([asdict(row) for row in rows], indent=2) + "\n"
    )
    write_markdown(md_out, rows)
    print(f"rows: {len(rows)}")
    print(f"json: {json_out}")
    print(f"markdown: {md_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
