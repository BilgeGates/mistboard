"""Deep-dive: tabular CFR on one annotated FoW position.

Picks one ``major``-severity blunder annotation with a non-null
``suggested_move_uci``, constructs a SubgameNode rooted at the position
the opponent faces, runs CFR at depth 3 with material_leaf_eval at
leaves, and compares the equilibrium value + strategy to what
``fow_evaluator`` produces on the same position.

This is a single-position deep-dive, not the full Phase 1 validation
experiment. Goal: surface concrete data on CFR-on-FoW solve time,
strategy distribution, and ordering relative to fow_evaluator before
we scale to a 100-position corpus.

Run:
    cd research/python-fow-lab
    .venv/bin/python lab/diag/cfr_deep_dive.py
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import chess

from fow_chess.cfr.leaf_eval import material_leaf_eval
from fow_chess.cfr.tabular import solve_subgame
from fow_chess.cfr.walker import SubgameNode
from fow_chess.evaluator import fow_evaluator, material_score


ANNOTATIONS_PATH = Path(__file__).parents[2] / "feedback" / "annotations.jsonl"


def _load_annotations() -> list[dict]:
    with ANNOTATIONS_PATH.open() as f:
        return [json.loads(line) for line in f if line.strip()]


def _pick_major_blunder_with_suggested(annotations: list[dict]) -> dict:
    """First major-severity blunder annotation with a non-null suggested move."""
    for ann in annotations:
        if (
            ann.get("severity") == "major"
            and ann.get("suggested_move_uci")
            and ann.get("move_played_uci")
        ):
            return ann
    raise RuntimeError("no major+suggested annotation found")


def _board_from_annotation(ann: dict) -> tuple[chess.Board, chess.Color]:
    """Reconstruct board_after with to-move = opp of move_played_color."""
    placement = ann["board_fen_after"]
    move_played_color = ann["move_played_color"]
    to_move = "b" if move_played_color == "white" else "w"
    full_fen = f"{placement} {to_move} - - 0 1"
    board = chess.Board(full_fen)
    perspective = chess.WHITE if to_move == "w" else chess.BLACK
    return board, perspective


def _reconstruct_board_before(
    board_after: chess.Board,
    move: chess.Move,
    mover_color: chess.Color,
) -> chess.Board:
    """Reconstruct the position before ``move`` was played to produce ``board_after``.

    Tries each possible captured-piece-type on the destination square and
    picks the candidate that, when ``move`` is applied, produces a board
    matching ``board_after``. Raises if no candidate matches.
    """
    moving_piece_after = board_after.piece_at(move.to_square)
    if moving_piece_after is None:
        raise RuntimeError(f"no piece at {chess.square_name(move.to_square)} in board_after")

    # Promotion: the piece that moved was a pawn; demoted on the from square.
    if move.promotion is not None:
        original_piece = chess.Piece(chess.PAWN, moving_piece_after.color)
    else:
        original_piece = moving_piece_after

    opp_color = not original_piece.color
    candidates: list[tuple[chess.Board, chess.Piece | None]] = []

    # Capture-piece type space: None (no capture), or each non-king opp type.
    capture_options: list[chess.Piece | None] = [None] + [
        chess.Piece(pt, opp_color)
        for pt in (chess.PAWN, chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN)
    ]

    for captured in capture_options:
        candidate = board_after.copy()
        candidate.remove_piece_at(move.to_square)
        candidate.set_piece_at(move.from_square, original_piece)
        if captured is not None:
            candidate.set_piece_at(move.to_square, captured)
        candidate.turn = mover_color
        # Verify: pushing the move reproduces board_after's placement.
        if move not in candidate.pseudo_legal_moves:
            continue
        test = candidate.copy()
        test.push(move)
        if test.board_fen() == board_after.board_fen():
            candidates.append((candidate, captured))

    if not candidates:
        raise RuntimeError(
            f"could not reconstruct board_before for move {move.uci()}"
        )
    # Prefer no-capture if it's a valid match (rare ambiguity case).
    for cb, cap in candidates:
        if cap is None:
            return cb
    return candidates[0][0]


def _fow_argmax(board: chess.Board, perspective: chess.Color) -> tuple[chess.Move, float]:
    """Return (move, score) for the highest-scoring legal move under fow_evaluator."""
    evaluate = fow_evaluator()
    best_move = None
    best_score = float("-inf")
    for mv in board.pseudo_legal_moves:
        score = evaluate(board, mv, perspective)
        if score > best_score:
            best_score = score
            best_move = mv
    if best_move is None:
        raise RuntimeError("no legal moves")
    return best_move, best_score


def main() -> None:
    annotations = _load_annotations()
    print(f"Loaded {len(annotations)} annotations from {ANNOTATIONS_PATH}")

    ann = _pick_major_blunder_with_suggested(annotations)
    print()
    print(f"Selected annotation: {ann['id']}")
    print(f"  game: {ann['game_path']} ply {ann['ply']}")
    print(f"  played: {ann['move_played_uci']} by {ann['move_played_color']}")
    print(f"  severity: {ann['severity']}, tags: {ann.get('tags', [])}")
    print(f"  suggested: {ann.get('suggested_move_uci')}")
    print(f"  note: {ann.get('note')}")
    print(f"  board_fen_after: {ann['board_fen_after']}")

    # Reconstruct the position BEFORE the blunder. Evaluate from the
    # blunderer's POV — the right Phase 1 question is "would CFR weight the
    # suggested move higher than the actually-played move?"
    board_after, _ = _board_from_annotation(ann)
    mover_color = chess.WHITE if ann["move_played_color"] == "white" else chess.BLACK
    played_move = chess.Move.from_uci(ann["move_played_uci"])
    suggested_move = chess.Move.from_uci(ann["suggested_move_uci"])
    board_before = _reconstruct_board_before(board_after, played_move, mover_color)
    perspective = mover_color
    perspective_name = "WHITE" if perspective == chess.WHITE else "BLACK"

    print()
    print(f"Reconstructed board_before: {board_before.fen()}")
    print(f"CFR root perspective: {perspective_name} (the blunderer; deciding now)")
    print(f"Legal moves at root: {len(list(board_before.pseudo_legal_moves))}")
    print(f"Material score (perspective POV): {material_score(board_before, perspective):+.1f} cp")
    print(f"Played move: {played_move.uci()}  (annotation says: {ann['severity']} blunder)")
    print(f"Suggested move: {suggested_move.uci()}")

    # CFR solve
    root = SubgameNode.root(board_before, to_move=perspective)
    depth = 3
    iterations = 1000
    print()
    print(f"Running tabular CFR: depth={depth}, iterations={iterations}")
    t0 = time.monotonic()
    sol = solve_subgame(
        root,
        depth=depth,
        leaf_eval=material_leaf_eval,
        iterations=iterations,
        value_estimate_samples=1000,
    )
    wall = time.monotonic() - t0

    print(f"  wall: {wall:.2f}s")
    print(f"  info sets visited: {sol.info_set_count}")
    print(f"  equilibrium value at root: {sol.value_at_root:+.4f} (in [-1, 1])")
    print()

    # Top moves by average strategy
    top = sorted(sol.strategy_at_root.items(), key=lambda kv: -kv[1])[:8]
    print("CFR top-8 moves by average strategy:")
    for mv, prob in top:
        marker = ""
        if mv == played_move:
            marker = "  <-- played (blunder)"
        elif mv == suggested_move:
            marker = "  <-- suggested"
        print(f"  {mv.uci():>6}  {prob:.3f}{marker}")

    print()
    fow_move, fow_score = _fow_argmax(board_before, perspective)
    print(f"fow_evaluator argmax: {fow_move.uci()} (score {fow_score:+.1f} cp)")

    # Critical comparison: do CFR and fow_evaluator weight suggested > played?
    cfr_played_prob = sol.strategy_at_root.get(played_move, 0.0)
    cfr_suggested_prob = sol.strategy_at_root.get(suggested_move, 0.0)
    fow_played = fow_evaluator()(board_before, played_move, perspective)
    fow_suggested = fow_evaluator()(board_before, suggested_move, perspective)

    print()
    print("Phase-1 directional comparison:")
    print(f"                           played   suggested   delta(suggested - played)")
    print(f"  CFR avg-strategy prob:   {cfr_played_prob:.3f}    {cfr_suggested_prob:.3f}       {cfr_suggested_prob - cfr_played_prob:+.3f}")
    print(f"  fow_evaluator (cp):      {fow_played:+.1f}     {fow_suggested:+.1f}       {fow_suggested - fow_played:+.1f}")
    print()
    cfr_picks_suggested = cfr_suggested_prob > cfr_played_prob
    fow_picks_suggested = fow_suggested > fow_played
    print(f"CFR ranks suggested over played: {cfr_picks_suggested}")
    print(f"fow_evaluator ranks suggested over played: {fow_picks_suggested}")


if __name__ == "__main__":
    main()
