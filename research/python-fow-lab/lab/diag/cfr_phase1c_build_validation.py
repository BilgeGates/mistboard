"""Build the Phase 1c hand-validation report.

Identifies positions from Phase 1b where CFR picked a "third move" — neither
the played blunder nor the human-suggested alternative — with non-trivial
confidence. Renders each as a markdown entry with ASCII board + judgment
checkboxes. User fills in their judgment of whether CFR's pick is
defensible vs the human's suggested move.

Score interpretation:
- "Better than suggested" / "Comparable to suggested": CFR is doing real
  work; the argmax-match-human metric was unfair to CFR.
- "Worse than suggested": the metric was fair; CFR's third-option picks
  are actually inferior.

If ≥60% are defensible (better or comparable), Phase 1b passes a softer
re-gate. If <30%, the original metric was fair and Phase 1b really did
fail.

Run:
    cd research/python-fow-lab
    PYTHONPATH=src .venv/bin/python lab/diag/cfr_phase1c_build_validation.py
"""

from __future__ import annotations

import json
from pathlib import Path

import chess

from fow_chess.evaluator import material_score


MIN_CONFIDENCE = 0.45
RESULTS_PATH = (
    Path(__file__).parent / "cfr-phase1b-smoke-results.json"
)
ANNOTATIONS_PATH = Path(__file__).parents[2] / "feedback" / "annotations.jsonl"
OUTPUT_PATH = (
    Path(__file__).parent / "cfr-phase1c-hand-validation.md"
)


def _reconstruct_board_before(
    board_after: chess.Board,
    move: chess.Move,
    mover_color: chess.Color,
) -> chess.Board:
    moving_piece_after = board_after.piece_at(move.to_square)
    if moving_piece_after is None:
        raise RuntimeError("no piece at destination in board_after")
    if move.promotion is not None:
        original_piece = chess.Piece(chess.PAWN, moving_piece_after.color)
    else:
        original_piece = moving_piece_after
    opp_color = not original_piece.color
    capture_options: list[chess.Piece | None] = [None] + [
        chess.Piece(pt, opp_color)
        for pt in (chess.PAWN, chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN)
    ]
    candidates: list[tuple[chess.Board, chess.Piece | None]] = []
    for captured in capture_options:
        candidate = board_after.copy()
        candidate.remove_piece_at(move.to_square)
        candidate.set_piece_at(move.from_square, original_piece)
        if captured is not None:
            candidate.set_piece_at(move.to_square, captured)
        candidate.turn = mover_color
        if move not in candidate.pseudo_legal_moves:
            continue
        test = candidate.copy()
        test.push(move)
        if test.board_fen() == board_after.board_fen():
            candidates.append((candidate, captured))
    if not candidates:
        raise RuntimeError("could not reconstruct board_before")
    for cb, cap in candidates:
        if cap is None:
            return cb
    return candidates[0][0]


def main() -> None:
    with RESULTS_PATH.open() as f:
        smoke = json.load(f)
    with ANNOTATIONS_PATH.open() as f:
        ann_by_id = {
            json.loads(line)["id"]: json.loads(line)
            for line in f if line.strip()
        }

    candidates = [
        r for r in smoke["results"]
        if r["cfr_argmax_move"] != r["played"]
        and r["cfr_argmax_move"] != r["suggested"]
        and r["cfr_argmax_prob"] >= MIN_CONFIDENCE
    ]
    candidates.sort(key=lambda r: -r["cfr_argmax_prob"])
    print(f"Selected {len(candidates)} positions for hand-validation.")

    lines: list[str] = []
    lines.append("# Phase 1c — Hand-validation of CFR's third-move picks")
    lines.append("")
    lines.append(
        "These are positions where CFR (Phase 1b, hybrid_fog leaf) confidently"
        " picked a move that is **neither** the played blunder **nor** the"
        " human-suggested alternative. Your job: judge whether CFR's pick is"
        " defensible vs the human's suggested move."
    )
    lines.append("")
    lines.append("**Filter:** CFR top-action prob ≥ {:.2f}.".format(MIN_CONFIDENCE))
    lines.append("")
    lines.append("**Scoring rubric** (mark exactly one per position):")
    lines.append("- `[B]` Better than suggested")
    lines.append("- `[C]` Comparable to suggested")
    lines.append("- `[W]` Worse than suggested")
    lines.append("- `[?]` Can't tell / position too unclear")
    lines.append("")
    lines.append(
        "When done, the script `cfr_phase1c_score.py` (TBD) parses your "
        "marks and computes the final tally. Or just count them by hand and "
        "tell me the result."
    )
    lines.append("")
    lines.append("---")
    lines.append("")

    for i, r in enumerate(candidates, 1):
        ann = ann_by_id[r["annotation_id"]]
        placement = ann["board_fen_after"]
        mover_color_str = ann["move_played_color"]
        mover_color = chess.WHITE if mover_color_str == "white" else chess.BLACK
        to_move_after = "b" if mover_color_str == "white" else "w"
        try:
            board_after = chess.Board(f"{placement} {to_move_after} - - 0 1")
            played = chess.Move.from_uci(ann["move_played_uci"])
            board_before = _reconstruct_board_before(
                board_after, played, mover_color
            )
            ascii_board = str(board_before)
            full_fen = board_before.fen()
        except Exception as e:
            ascii_board = f"[reconstruction failed: {e}]"
            full_fen = "(unavailable)"

        lines.append(f"## Position {i} — {r['severity']}, {mover_color_str} to move")
        lines.append("")
        lines.append(f"**Annotation note:** {ann.get('note', '(none)')}")
        lines.append("")
        lines.append(f"**Material at position:** {material_score(board_before, mover_color):+.0f} cp (from {mover_color_str}'s POV)")
        lines.append("")
        lines.append(f"**FEN (before played move):** `{full_fen}`")
        lines.append("")
        lines.append("```")
        lines.append(ascii_board)
        lines.append("```")
        lines.append("")
        lines.append(f"- **Played (blunder):** `{r['played']}`")
        lines.append(f"- **Suggested (human):** `{r['suggested']}`")
        lines.append(f"- **CFR argmax:** `{r['cfr_argmax_move']}` (top prob: {r['cfr_argmax_prob']:.2f})")
        lines.append(f"- **fow argmax:** `{r['fow_argmax_move']}`")
        lines.append("")
        lines.append(f"**Your judgment of CFR's pick `{r['cfr_argmax_move']}` vs human's suggested `{r['suggested']}`:**")
        lines.append("")
        lines.append("- [ ] `[B]` Better than suggested")
        lines.append("- [ ] `[C]` Comparable to suggested")
        lines.append("- [ ] `[W]` Worse than suggested")
        lines.append("- [ ] `[?]` Can't tell")
        lines.append("")
        lines.append("**Notes:** _(optional)_")
        lines.append("")
        lines.append("---")
        lines.append("")

    OUTPUT_PATH.write_text("\n".join(lines))
    print(f"Wrote {OUTPUT_PATH} ({len(candidates)} positions)")


if __name__ == "__main__":
    main()
