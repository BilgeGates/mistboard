"""Replay human annotations as local Tier-1 regression checks.

Usage:
    .venv/bin/python scripts/annotation_replay.py
    .venv/bin/python scripts/annotation_replay.py --manifest-url /bakeoff-v0.7.0-hardobs-rung2-3game/manifest.json

The gate is intentionally counterfactual. It force-feeds the saved game history
up to the annotated ply, then asks the current engine what it would choose at
that exact decision. This answers the narrow question: did the current engine
fix the reviewed moment, given the same observation stream up to that point?
"""

from __future__ import annotations

import argparse
import json
import sys
from contextlib import nullcontext
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterator

import chess

_LAB_ROOT = Path(__file__).resolve().parent.parent
_REPO_ROOT = _LAB_ROOT.parents[1]
sys.path.insert(0, str(_LAB_ROOT / "src"))

from fow_chess.engine import EvaluatorBuilder, static_builder
from fow_chess.evaluator import (
    king_safety_evaluator,
    material_evaluator,
    stockfish_evaluator,
    visibility_threat_evaluator,
)
from fow_chess.event_log import _convert_move
from fow_chess.move_priors import uniform_prior
from fow_chess.observation import observation_from_transition
from fow_chess.selfplay import PerspectiveView
from fow_chess.strategies import TIER1_VERSION, Tier1Strategy, tier1_commit
from fow_chess.visibility import visible_piece_map, visible_squares


@dataclass(frozen=True)
class ReplayResult:
    annotation_id: str
    status: str
    manifest_url: str
    game_index: int
    game_path: str
    ply: int
    side: str
    move_played_uci: str
    suggested_move_uci: str
    chosen_move_uci: str | None = None
    passed: bool = False
    decision_path: str | None = None
    reason: str | None = None
    tier1_version: str = TIER1_VERSION
    tier1_commit: str = ""

    def to_json(self) -> dict[str, Any]:
        out = asdict(self)
        out["tier1_commit"] = out["tier1_commit"] or tier1_commit()
        return out


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


def annotation_candidates(
    annotations: list[dict[str, Any]],
    *,
    manifest_url: str | None = None,
    game_index: int | None = None,
) -> list[dict[str, Any]]:
    rows = [
        row
        for row in annotations
        if row.get("suggested_move_uci")
        and (manifest_url is None or row.get("manifest_url") == manifest_url)
        and (game_index is None or int(row.get("game_index", -1)) == game_index)
    ]
    return sorted(
        rows,
        key=lambda row: (
            str(row.get("manifest_url") or ""),
            int(row.get("game_index") or -1),
            int(row.get("ply") or -1),
            str(row.get("id") or ""),
        ),
    )


def resolve_manifest_url(manifest_url: str, repo_root: Path = _REPO_ROOT) -> Path:
    path = Path(manifest_url)
    if path.is_absolute() and path.exists():
        return path
    if manifest_url.startswith("/"):
        return repo_root / "apps" / "web" / "public" / manifest_url.lstrip("/")
    if path.is_absolute():
        return path
    return repo_root / manifest_url


def replay_annotation(
    annotation: dict[str, Any],
    *,
    evaluator_name: str = "manifest",
    stockfish_path: str = "stockfish",
) -> ReplayResult:
    manifest_url = str(annotation["manifest_url"])
    manifest_path = resolve_manifest_url(manifest_url)
    if not manifest_path.exists():
        return _skipped(annotation, f"manifest not found: {manifest_path}")

    manifest = load_json(manifest_path)
    game_index = int(annotation["game_index"])
    game = next(
        (row for row in manifest.get("games", []) if int(row["index"]) == game_index),
        None,
    )
    if game is None:
        return _skipped(annotation, f"game index {game_index} not in manifest")

    side = str(annotation["move_played_color"])
    perspective = chess.WHITE if side == "white" else chess.BLACK
    if not _is_tier1_decision(annotation, manifest, game, side):
        return _skipped(annotation, "annotation is not a Tier-1 decision")

    game_path = manifest_path.parent / str(game["path"])
    if not game_path.exists():
        return _skipped(annotation, f"game log not found: {game_path}")

    events = load_jsonl(game_path)
    seed = _seed_for_side(manifest, game, side)
    evaluator_choice = (
        str(manifest.get("evaluator") or "material")
        if evaluator_name == "manifest"
        else evaluator_name
    )

    with evaluator_builder_ctx(
        evaluator_choice,
        threat_lambda=float(manifest.get("threat_lambda") or 0.3),
        depth=int(manifest.get("depth") or 4),
        stockfish_path=stockfish_path,
    ) as evaluator_builder:
        strategy = Tier1Strategy(
            evaluator_builder=evaluator_builder,
            move_prior=uniform_prior,
            target_n=int(manifest.get("target_n") or 256),
            max_eval_particles=int(manifest.get("max_particles") or 16),
            risk_aversion=float(manifest.get("risk_aversion") or 0.0),
            seed=seed,
            verbose_belief_capture=False,
        )
        strategy.reset(perspective)
        return _replay_to_ply(annotation, events, strategy, perspective)


def evaluator_builder_ctx(
    evaluator_name: str,
    *,
    threat_lambda: float,
    depth: int,
    stockfish_path: str,
) -> Iterator[EvaluatorBuilder]:
    if evaluator_name == "material":
        base = static_builder(material_evaluator())
        return nullcontext(_with_king_safety(base))
    if evaluator_name == "visibility-threat":
        base = visibility_threat_evaluator(threat_lambda)
        return nullcontext(_with_king_safety(base))
    if evaluator_name == "stockfish":
        ctx = stockfish_evaluator(
            path=stockfish_path,
            depth=depth,
            time_cap_seconds=0.5,
        )

        class _StockfishBuilderCtx:
            def __enter__(self) -> EvaluatorBuilder:
                evaluator = ctx.__enter__()
                return _with_king_safety(static_builder(evaluator))

            def __exit__(self, exc_type, exc, tb) -> bool | None:
                return ctx.__exit__(exc_type, exc, tb)

        return _StockfishBuilderCtx()
    raise ValueError(f"unsupported evaluator: {evaluator_name}")


def _with_king_safety(base: EvaluatorBuilder) -> EvaluatorBuilder:
    def build(view: PerspectiveView):
        return king_safety_evaluator(base(view))

    return build


def _replay_to_ply(
    annotation: dict[str, Any],
    events: list[dict[str, Any]],
    strategy: Tier1Strategy,
    perspective: chess.Color,
) -> ReplayResult:
    target_ply = int(annotation["ply"])
    board = chess.Board()
    ply = 0

    for event in events:
        if event.get("type") != "move-played":
            continue
        ply += 1
        actor = chess.WHITE if event["color"] == "white" else chess.BLACK
        move = _convert_move(event["move"], board)
        prev = board.copy()

        if ply == target_ply:
            if actor != perspective:
                return _skipped(annotation, "target ply was not this side to move")
            view = _view(prev, perspective)
            chosen = strategy.pick_move(view)
            trace = strategy.trace_log[-1] if strategy.trace_log else {}
            suggested = str(annotation["suggested_move_uci"])
            return ReplayResult(
                annotation_id=str(annotation.get("id") or ""),
                status="pass" if chosen.uci() == suggested else "fail",
                manifest_url=str(annotation["manifest_url"]),
                game_index=int(annotation["game_index"]),
                game_path=str(annotation["game_path"]),
                ply=target_ply,
                side="white" if perspective == chess.WHITE else "black",
                move_played_uci=str(annotation.get("move_played_uci") or move.uci()),
                suggested_move_uci=suggested,
                chosen_move_uci=chosen.uci(),
                passed=chosen.uci() == suggested,
                decision_path=str(trace.get("decision_path") or ""),
                reason=None,
            )

        board.push(move)
        if actor == perspective:
            view = _view(prev, perspective)
            # Force-feeding saved own moves should still update the capture
            # accounting that pick_move would have staged before observe_own_move.
            strategy._stage_pending_capture(move, view)
            strategy.observe_own_move(
                move,
                observation_from_transition(prev, board, perspective),
            )
        else:
            strategy.observe_opp_move(
                observation_from_transition(prev, board, perspective)
            )

    return _skipped(annotation, f"target ply {target_ply} not found in game log")


def _view(board: chess.Board, perspective: chess.Color) -> PerspectiveView:
    return PerspectiveView(
        perspective=perspective,
        own_legal_moves=list(board.pseudo_legal_moves),
        visible_squares=visible_squares(board, perspective),
        visible_piece_map=visible_piece_map(board, perspective),
    )


def _is_tier1_decision(
    annotation: dict[str, Any],
    manifest: dict[str, Any],
    game: dict[str, Any],
    side: str,
) -> bool:
    if manifest.get("opponent") == "tier1":
        return True
    if annotation.get("is_tier1_move") is True:
        return True
    return str(game.get("tier1_color")) == side


def _seed_for_side(manifest: dict[str, Any], game: dict[str, Any], side: str) -> int:
    if str(game.get("tier1_color")) == side:
        return int(game["tier1_seed"])
    if manifest.get("opponent") == "tier1":
        return int(game["random_seed"])
    return int(game["tier1_seed"])


def _skipped(annotation: dict[str, Any], reason: str) -> ReplayResult:
    return ReplayResult(
        annotation_id=str(annotation.get("id") or ""),
        status="skipped",
        manifest_url=str(annotation.get("manifest_url") or ""),
        game_index=int(annotation.get("game_index") or -1),
        game_path=str(annotation.get("game_path") or ""),
        ply=int(annotation.get("ply") or -1),
        side=str(annotation.get("move_played_color") or ""),
        move_played_uci=str(annotation.get("move_played_uci") or ""),
        suggested_move_uci=str(annotation.get("suggested_move_uci") or ""),
        reason=reason,
    )


def write_json(path: Path, results: list[ReplayResult]) -> None:
    path.write_text(json.dumps([result.to_json() for result in results], indent=2) + "\n")


def write_markdown(path: Path, results: list[ReplayResult]) -> None:
    lines = [
        "# Annotation Replay Gate",
        "",
        "| Status | Game | Ply | Side | Played | Suggested | Chosen | Path | Reason |",
        "| --- | ---: | ---: | --- | --- | --- | --- | --- | --- |",
    ]
    for result in results:
        game = f"{result.game_index}"
        lines.append(
            "| "
            + " | ".join(
                [
                    result.status,
                    game,
                    str(result.ply),
                    result.side,
                    result.move_played_uci,
                    result.suggested_move_uci,
                    result.chosen_move_uci or "",
                    result.decision_path or "",
                    result.reason or "",
                ]
            )
            + " |"
        )
    path.write_text("\n".join(lines) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--annotations",
        type=Path,
        default=_LAB_ROOT / "feedback" / "annotations.jsonl",
    )
    parser.add_argument("--manifest-url", default=None)
    parser.add_argument("--game-index", type=int, default=None)
    parser.add_argument(
        "--evaluator",
        choices=("manifest", "material", "visibility-threat", "stockfish"),
        default="manifest",
    )
    parser.add_argument("--stockfish", default="stockfish")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument(
        "--json-out",
        type=Path,
        default=_LAB_ROOT / "feedback" / "annotation_replay.json",
    )
    parser.add_argument(
        "--md-out",
        type=Path,
        default=_LAB_ROOT / "feedback" / "annotation_replay.md",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit nonzero when any replayed annotation fails.",
    )
    args = parser.parse_args()

    annotations = annotation_candidates(
        load_jsonl(args.annotations),
        manifest_url=args.manifest_url,
        game_index=args.game_index,
    )
    if args.limit is not None:
        annotations = annotations[: args.limit]

    results = [
        replay_annotation(
            annotation,
            evaluator_name=args.evaluator,
            stockfish_path=args.stockfish,
        )
        for annotation in annotations
    ]
    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.md_out.parent.mkdir(parents=True, exist_ok=True)
    write_json(args.json_out, results)
    write_markdown(args.md_out, results)

    passed = sum(1 for result in results if result.status == "pass")
    failed = sum(1 for result in results if result.status == "fail")
    skipped = sum(1 for result in results if result.status == "skipped")
    print(
        f"annotation replay: {passed} passed, {failed} failed, {skipped} skipped "
        f"({len(results)} total)"
    )
    print(f"json: {args.json_out}")
    print(f"markdown: {args.md_out}")
    return 1 if args.strict and failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
