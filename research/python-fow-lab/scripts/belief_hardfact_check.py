"""Validate belief snapshots against hard visible facts in a bake-off run.

Usage:
    .venv/bin/python scripts/belief_hardfact_check.py /path/to/bakeoff-run

Reads:
    manifest.json
    games/*.jsonl
    belief.jsonl

Writes, by default:
    hardfact_report.json
    hardfact_report.md
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import chess

_LAB_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_LAB_ROOT / "src"))

from fow_chess.event_log import replay_canonical
from fow_chess.visibility import visible_piece_map, visible_squares


@dataclass(frozen=True)
class Violation:
    game_index: int
    game_path: str
    ply: int
    side: str
    tier1_seat: str
    snapshot_kind: str
    square: str
    kind: str
    expected: str
    observed_prob: float
    detail: str

    def to_json(self) -> dict[str, Any]:
        return asdict(self)


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    with path.open() as fh:
        for line in fh:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def validate_run(
    run_dir: Path,
    *,
    required_prob: float = 0.99,
    empty_max_prob: float = 0.01,
) -> list[Violation]:
    manifest = load_json(run_dir / "manifest.json")
    belief_rows = load_jsonl(run_dir / "belief.jsonl")
    games_by_index = {int(game["index"]): game for game in manifest.get("games", [])}
    boards_by_game: dict[int, list[chess.Board]] = {}

    violations: list[Violation] = []
    for row in belief_rows:
        game_index = int(row["game_index"])
        game = games_by_index.get(game_index)
        if game is None:
            continue
        if game_index not in boards_by_game:
            events = load_jsonl(run_dir / str(game["path"]))
            boards_by_game[game_index] = list(replay_canonical(events))
        boards = boards_by_game[game_index]
        ply = int(row["ply"])
        board_index = _board_index_for_snapshot(ply, str(row.get("snapshot_kind") or ""))
        if board_index < 0 or board_index >= len(boards):
            continue

        side = str(row.get("tier1_side") or "")
        perspective = chess.WHITE if side == "white" else chess.BLACK
        board = boards[board_index]
        vpieces = visible_piece_map(board, perspective)
        vsquares = visible_squares(board, perspective)
        marginal = row.get("marginal_field") or {}

        for square, piece in vpieces.items():
            prob = _piece_prob(marginal, square, piece)
            if prob < required_prob:
                violations.append(
                    Violation(
                        game_index=game_index,
                        game_path=str(game["path"]),
                        ply=ply,
                        side=side,
                        tier1_seat=str(row.get("tier1_seat") or ""),
                        snapshot_kind=str(row.get("snapshot_kind") or ""),
                        square=chess.square_name(square),
                        kind="visible-piece-mismatch",
                        expected=piece.symbol(),
                        observed_prob=prob,
                        detail=(
                            f"visible {piece.symbol()} expected with prob >= "
                            f"{required_prob:.3f}"
                        ),
                    )
                )

        for square in vsquares:
            if square in vpieces:
                continue
            prob = _non_empty_prob(marginal, square)
            if prob > empty_max_prob:
                violations.append(
                    Violation(
                        game_index=game_index,
                        game_path=str(game["path"]),
                        ply=ply,
                        side=side,
                        tier1_seat=str(row.get("tier1_seat") or ""),
                        snapshot_kind=str(row.get("snapshot_kind") or ""),
                        square=chess.square_name(square),
                        kind="visible-empty-mismatch",
                        expected="empty",
                        observed_prob=prob,
                        detail=(
                            f"visible empty square has non-empty belief prob "
                            f"> {empty_max_prob:.3f}"
                        ),
                    )
                )

        if _previous_move_was_by_opponent(boards, board_index, perspective):
            prev_board = boards[board_index - 1]
            captured_square = _normal_opp_capture_landing_square(
                prev_board, board, perspective
            )
            if captured_square is not None:
                prob = _opp_non_empty_prob(marginal, captured_square, perspective)
                if prob < required_prob:
                    violations.append(
                        Violation(
                            game_index=game_index,
                            game_path=str(game["path"]),
                            ply=ply,
                            side=side,
                            tier1_seat=str(row.get("tier1_seat") or ""),
                            snapshot_kind=str(row.get("snapshot_kind") or ""),
                            square=chess.square_name(captured_square),
                            kind="hidden-capture-landing-missing",
                            expected="opponent-piece",
                            observed_prob=prob,
                            detail=(
                                "own piece was captured on this square; belief "
                                "must assign an opponent piece there after an "
                                "ordinary capture"
                            ),
                        )
                    )
            forced_capture = _forced_visible_source_capture_identity(
                prev_board, board, perspective
            )
            if forced_capture is not None:
                _source_square, landing_square, expected_piece = forced_capture
                prob = _piece_prob(marginal, landing_square, expected_piece)
                if prob < required_prob:
                    violations.append(
                        Violation(
                            game_index=game_index,
                            game_path=str(game["path"]),
                            ply=ply,
                            side=side,
                            tier1_seat=str(row.get("tier1_seat") or ""),
                            snapshot_kind=str(row.get("snapshot_kind") or ""),
                            square=chess.square_name(landing_square),
                            kind="hidden-capture-identity-mismatch",
                            expected=expected_piece.symbol(),
                            observed_prob=prob,
                            detail=(
                                "opponent capture came from a visible source "
                                f"square ({chess.square_name(_source_square)}) "
                                "that is now empty; belief must preserve the "
                                "capturer identity"
                            ),
                        )
                    )

    return violations


def _board_index_for_snapshot(ply: int, snapshot_kind: str) -> int:
    if snapshot_kind == "decision":
        return ply - 1
    return ply


def _piece_prob(
    marginal: dict[str, list[dict[str, Any]]],
    square: chess.Square,
    piece: chess.Piece,
) -> float:
    entries = marginal.get(chess.square_name(square)) or []
    return sum(
        float(entry.get("prob") or 0.0)
        for entry in entries
        if entry.get("piece") == piece.symbol()
    )


def _non_empty_prob(
    marginal: dict[str, list[dict[str, Any]]],
    square: chess.Square,
) -> float:
    entries = marginal.get(chess.square_name(square)) or []
    return sum(
        float(entry.get("prob") or 0.0)
        for entry in entries
        if entry.get("piece") is not None
    )


def _opp_non_empty_prob(
    marginal: dict[str, list[dict[str, Any]]],
    square: chess.Square,
    perspective: chess.Color,
) -> float:
    entries = marginal.get(chess.square_name(square)) or []
    if not entries:
        return 0.0
    # Belief snapshots intentionally store sparse marginals: low-probability
    # piece identities can be omitted even when total occupancy is certain. For
    # hidden capture landings, the hard fact is occupancy first; exact type is
    # often unknown. So estimate occupancy as 1 - explicit empty probability
    # once the square is present in the marginal.
    empty_prob = sum(
        float(entry.get("prob") or 0.0)
        for entry in entries
        if entry.get("piece") is None
    )
    return max(0.0, min(1.0, 1.0 - empty_prob))


def _previous_move_was_by_opponent(
    boards: list[chess.Board],
    board_index: int,
    perspective: chess.Color,
) -> bool:
    if board_index <= 0 or board_index >= len(boards):
        return False
    return boards[board_index - 1].turn != perspective


def _normal_opp_capture_landing_square(
    prev_board: chess.Board,
    next_board: chess.Board,
    perspective: chess.Color,
) -> chess.Square | None:
    own_before = {
        sq for sq, piece in prev_board.piece_map().items() if piece.color == perspective
    }
    own_after = {
        sq for sq, piece in next_board.piece_map().items() if piece.color == perspective
    }
    captures = own_before - own_after
    if len(captures) != 1:
        return None
    captured_square = next(iter(captures))
    landing_piece = next_board.piece_at(captured_square)
    if landing_piece is None or landing_piece.color == perspective:
        return None
    return captured_square


def _forced_visible_source_capture_identity(
    prev_board: chess.Board,
    next_board: chess.Board,
    perspective: chess.Color,
) -> tuple[chess.Square, chess.Square, chess.Piece] | None:
    """Return exact capturer identity when a previously visible source vacated.

    The player can only promote a capture source into an exact hard fact when
    the source square was visible before the opponent move and is visible-empty
    after it. If the source was hidden before, the current empty square only
    proves the source is empty now; it does not prove the player knew which
    piece was there.
    """
    landing = _normal_opp_capture_landing_square(prev_board, next_board, perspective)
    if landing is None:
        return None
    landing_piece = next_board.piece_at(landing)
    if landing_piece is None or landing_piece.color == perspective:
        return None

    opp = not perspective
    changed_opp_sources = [
        sq
        for sq, piece in prev_board.piece_map().items()
        if piece.color == opp
        and sq != landing
        and next_board.piece_at(sq) != piece
    ]
    if len(changed_opp_sources) != 1:
        return None

    source = changed_opp_sources[0]
    prev_vsquares = visible_squares(prev_board, perspective)
    prev_vpieces = visible_piece_map(prev_board, perspective)
    next_vsquares = visible_squares(next_board, perspective)
    next_vpieces = visible_piece_map(next_board, perspective)
    if source not in prev_vsquares or prev_vpieces.get(source) != landing_piece:
        return None
    if source not in next_vsquares or source in next_vpieces:
        return None
    return source, landing, landing_piece


def write_json(path: Path, violations: list[Violation]) -> None:
    path.write_text(
        json.dumps([violation.to_json() for violation in violations], indent=2) + "\n"
    )


def write_markdown(path: Path, violations: list[Violation], run_dir: Path) -> None:
    lines = [
        "# Belief Hard-Fact Report",
        "",
        f"Run: `{run_dir}`",
        "",
        "| Game | Ply | Side | Seat | Snapshot | Square | Kind | Expected | Prob | Detail |",
        "| ---: | ---: | --- | --- | --- | --- | --- | --- | ---: | --- |",
    ]
    for v in violations:
        lines.append(
            "| "
            + " | ".join(
                [
                    str(v.game_index),
                    str(v.ply),
                    v.side,
                    v.tier1_seat,
                    v.snapshot_kind,
                    v.square,
                    v.kind,
                    v.expected,
                    f"{v.observed_prob:.3f}",
                    v.detail,
                ]
            )
            + " |"
        )
    if not violations:
        lines.append("|  |  |  |  |  |  | pass |  |  | no violations |")
    path.write_text("\n".join(lines) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_dir", type=Path)
    parser.add_argument("--required-prob", type=float, default=0.99)
    parser.add_argument("--empty-max-prob", type=float, default=0.01)
    parser.add_argument("--json-out", type=Path, default=None)
    parser.add_argument("--md-out", type=Path, default=None)
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit nonzero when any hard-fact violation is found.",
    )
    args = parser.parse_args()

    run_dir = args.run_dir
    violations = validate_run(
        run_dir,
        required_prob=args.required_prob,
        empty_max_prob=args.empty_max_prob,
    )
    json_out = args.json_out or run_dir / "hardfact_report.json"
    md_out = args.md_out or run_dir / "hardfact_report.md"
    write_json(json_out, violations)
    write_markdown(md_out, violations, run_dir)
    print(f"hard-fact check: {len(violations)} violations")
    print(f"json: {json_out}")
    print(f"markdown: {md_out}")
    return 1 if args.strict and violations else 0


if __name__ == "__main__":
    raise SystemExit(main())
