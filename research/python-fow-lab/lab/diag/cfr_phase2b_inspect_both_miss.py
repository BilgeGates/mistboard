"""Generate a manual-inspection markdown package for the both-miss positions.

A "both-miss" position is one where neither Phase 1b nor Phase 2b's
argmax matched the human-suggested move. These are candidates for:

(a) noisy annotations — the suggested move isn't actually best, in which
    case our gate metric (cfr_argmax_match_rate) over-penalizes CFR.
(b) structural CFR weakness — both tabular and Deep CFR pick the same
    wrong move for the same reason, telling us where Phase 3 work could
    move the needle.

The package gives the user enough context to make that judgment per
position without re-running anything.

Run:
    PYTHONPATH=src .venv/bin/python lab/diag/cfr_phase2b_inspect_both_miss.py
"""

from __future__ import annotations

import json
from pathlib import Path

import chess

from fow_chess.evaluator import fow_evaluator

DIAG_DIR = Path(__file__).parent
LAB_DIR = DIAG_DIR.parents[1]
ANNOTATIONS_PATH = LAB_DIR / "feedback" / "annotations.jsonl"
PHASE_1B_PATH = DIAG_DIR / "cfr-phase1b-smoke-results.json"
PHASE_2B_PATH = DIAG_DIR / "cfr-phase2b-hybrid_fog-smoke-results.json"
OUTPUT_PATH = DIAG_DIR / "cfr-phase2b-both-miss-inspection.md"

MAX_POSITIONS = 10


# Copied from cfr_phase1_smoke.py / cfr_phase2b_smoke.py — needed to
# reconstruct board_before from board_fen_after + the played move.
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


def _annotations_by_id() -> dict[str, dict]:
    out: dict[str, dict] = {}
    with ANNOTATIONS_PATH.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            ann = json.loads(line)
            out[ann["id"]] = ann
    return out


def _results_by_id(path: Path) -> dict[str, dict]:
    payload = json.loads(path.read_text())
    return {r["annotation_id"]: r for r in payload["results"] if "error" not in r}


def _board_ascii(board: chess.Board) -> str:
    return str(board)


def _fow_eval_all_moves(
    board: chess.Board, perspective: chess.Color
) -> list[tuple[chess.Move, float]]:
    evaluate = fow_evaluator()
    rows = [
        (mv, float(evaluate(board, mv, perspective)))
        for mv in board.pseudo_legal_moves
    ]
    rows.sort(key=lambda r: -r[1])
    return rows


def main() -> None:
    anns = _annotations_by_id()
    p1b = _results_by_id(PHASE_1B_PATH)
    p2b = _results_by_id(PHASE_2B_PATH)
    common_ids = sorted(set(p1b) & set(p2b))

    both_miss = [
        aid
        for aid in common_ids
        if not p1b[aid]["argmax_match_suggested_cfr"]
        and not p2b[aid]["argmax_match_suggested_cfr"]
    ]
    print(f"Found {len(both_miss)} both-miss argmax positions.")

    lines: list[str] = [
        "# Phase 2b both-miss argmax inspection",
        "",
        "Positions where **both** Phase 1b (tabular) and Phase 2b (Deep CFR) ",
        "picked an argmax move that does NOT match the human-suggested move.",
        "",
        "Per position:",
        "- Annotation context (tags, severity, note if present).",
        "- `board_before` ASCII.",
        "- Played move + suggested move + Phase 2b's CFR argmax + top fow_evaluator moves.",
        "- Eval scores for the relevant moves so you can see whether `suggested` ",
        "  is actually best in the evaluator's view.",
        "",
        f"Showing first {min(MAX_POSITIONS, len(both_miss))} of {len(both_miss)}.",
        "",
        "---",
        "",
    ]

    for i, aid in enumerate(both_miss[:MAX_POSITIONS], start=1):
        ann = anns.get(aid)
        if ann is None:
            continue
        try:
            placement = ann["board_fen_after"]
            mover_color_str = ann["move_played_color"]
            mover = chess.WHITE if mover_color_str == "white" else chess.BLACK
            to_move_after = "b" if mover_color_str == "white" else "w"
            board_after = chess.Board(f"{placement} {to_move_after} - - 0 1")
            played = chess.Move.from_uci(ann["move_played_uci"])
            suggested = chess.Move.from_uci(ann["suggested_move_uci"])
            board_before = _reconstruct_board_before(board_after, played, mover)
        except Exception as exc:
            lines.append(f"## #{i}: {aid[:8]} — reconstruct failed ({exc})\n")
            continue

        r1b = p1b[aid]
        r2b = p2b[aid]
        scores = _fow_eval_all_moves(board_before, mover)
        score_by_uci = {mv.uci(): cp for mv, cp in scores}

        sev = ann.get("severity", "?")
        tags = ", ".join(ann.get("tags", [])) or "(no tags)"
        note = ann.get("note") or "(no note)"
        ply = ann.get("ply", "?")

        lines.append(f"## #{i}: `{aid[:8]}` — {sev} blunder, ply {ply}, {mover_color_str} to move")
        lines.append("")
        lines.append(f"**Tags:** {tags}")
        lines.append("")
        lines.append(f"**Note:** {note}")
        lines.append("")
        lines.append("**Board (perspective: white = upper-case, black = lower-case):**")
        lines.append("")
        lines.append("```")
        lines.append(_board_ascii(board_before))
        lines.append("```")
        lines.append("")

        played_score = score_by_uci.get(played.uci(), float("-inf"))
        suggested_score = score_by_uci.get(suggested.uci(), float("-inf"))
        p1b_argmax = r1b["cfr_argmax_move"]
        p2b_argmax = r2b["cfr_argmax_move"]
        p1b_argmax_score = score_by_uci.get(p1b_argmax, float("-inf"))
        p2b_argmax_score = score_by_uci.get(p2b_argmax, float("-inf"))

        lines.append("**Move comparison:**")
        lines.append("")
        lines.append("| Source | Move | fow_evaluator (cp) | Phase 2b prob | Note |")
        lines.append("|---|---|---|---|---|")
        lines.append(
            f"| played | `{played.uci()}` | {played_score:+.0f} "
            f"| {r2b['cfr_played_prob']:.3f} | annotated blunder |"
        )
        lines.append(
            f"| **suggested** | `{suggested.uci()}` | {suggested_score:+.0f} "
            f"| {r2b['cfr_suggested_prob']:.3f} | human says best |"
        )
        lines.append(
            f"| Phase 1b argmax | `{p1b_argmax}` | {p1b_argmax_score:+.0f} "
            f"| (tabular n/a) | tabular CFR pick |"
        )
        lines.append(
            f"| **Phase 2b argmax** | `{p2b_argmax}` | {p2b_argmax_score:+.0f} "
            f"| {r2b['cfr_argmax_prob']:.3f} | Deep CFR pick |"
        )
        lines.append("")

        lines.append("**Top 5 fow_evaluator picks:**")
        lines.append("")
        lines.append("| Rank | Move | Score (cp) |")
        lines.append("|---|---|---|")
        for rank, (mv, cp) in enumerate(scores[:5], start=1):
            tag = ""
            if mv.uci() == suggested.uci():
                tag = " ← suggested"
            elif mv.uci() == played.uci():
                tag = " ← played"
            elif mv.uci() == p2b_argmax:
                tag = " ← Phase 2b argmax"
            lines.append(f"| {rank} | `{mv.uci()}` | {cp:+.0f}{tag} |")
        lines.append("")

        lines.append("**Your judgment** (fill in when reviewing):")
        lines.append("")
        lines.append("- [ ] suggested move IS actually best in this position")
        lines.append("- [ ] suggested move is NOT clearly best (annotation noise)")
        lines.append("- [ ] Phase 2b's pick is reasonable (alternative-but-valid)")
        lines.append("- [ ] Phase 2b's pick is unreasonable (CFR systematically wrong)")
        lines.append("")
        lines.append("---")
        lines.append("")

    OUTPUT_PATH.write_text("\n".join(lines))
    print(f"Wrote {OUTPUT_PATH}")
    print(f"Open in your editor to review and tick the checkboxes per position.")


if __name__ == "__main__":
    main()
