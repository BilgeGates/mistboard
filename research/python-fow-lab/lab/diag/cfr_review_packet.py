"""Position-review packet generator.

Takes any CFR smoke result JSON + the annotations corpus, and produces a
markdown report you can flip through in 15-30 minutes to grade with
chess judgment instead of just metrics.

Per position the packet shows:
- Annotation context (id, ply, color, severity, tags, note).
- Board ASCII at the decision point.
- Played move (the annotated blunder) + Suggested move.
- The result file's argmax + probabilities for played and suggested.
- fow_evaluator's top 5 moves with centipawn scores (chess anchor).
- Phase 1b (tabular CFR) argmax for comparison if available.
- Checkboxes + comment line for your judgment.

Usage:
    PYTHONPATH=src .venv/bin/python lab/diag/cfr_review_packet.py \
        --result-file lab/diag/cfr-phase2b-hybrid_fog-100iter-smoke-results.json \
        --filter all

    # Or filter to interesting subsets:
    --filter both-miss        positions where both tabular + Deep CFR miss suggested
    --filter diffuse          argmax_prob < 0.30 — strategies CFR is uncertain about
    --filter argmax-correct   Deep CFR's argmax == suggested
    --filter direction-wrong  Deep CFR ranked played > suggested

    # Limit to N positions:
    --limit 10
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import chess

from fow_chess.evaluator import fow_evaluator

DIAG_DIR = Path(__file__).parent
PROJECT_ROOT = Path(__file__).parents[2]  # research/python-fow-lab/
ANNOTATIONS_PATH = PROJECT_ROOT / "feedback" / "annotations.jsonl"
PHASE_1B_PATH = DIAG_DIR / "cfr-phase1b-smoke-results.json"


# Reconstruction helper — duplicated from cfr_phase2b_smoke.py
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


def _load_annotations() -> dict[str, dict]:
    out: dict[str, dict] = {}
    with ANNOTATIONS_PATH.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            ann = json.loads(line)
            out[ann["id"]] = ann
    return out


def _load_results(path: Path) -> dict[str, dict]:
    if not path.exists():
        return {}
    payload = json.loads(path.read_text())
    return {r["annotation_id"]: r for r in payload.get("results", []) if "error" not in r}


def _filter_positions(
    results: dict, phase1b_results: dict, mode: str
) -> list[str]:
    """Return annotation_ids matching the filter mode."""
    aids = list(results.keys())
    if mode == "all":
        return aids
    if mode == "argmax-correct":
        return [a for a in aids if results[a]["argmax_match_suggested_cfr"]]
    if mode == "direction-wrong":
        return [a for a in aids if not results[a]["direction_correct_cfr"]]
    if mode == "diffuse":
        return [a for a in aids if results[a]["cfr_argmax_prob"] < 0.30]
    if mode == "both-miss":
        # Both tabular Phase 1b and Deep CFR miss suggested
        return [
            a
            for a in aids
            if not results[a]["argmax_match_suggested_cfr"]
            and a in phase1b_results
            and not phase1b_results[a]["argmax_match_suggested_cfr"]
        ]
    raise ValueError(f"unknown filter mode: {mode!r}")


def _board_ascii(board: chess.Board) -> str:
    return str(board)


def _fow_score_all(
    board: chess.Board, perspective: chess.Color
) -> list[tuple[chess.Move, float]]:
    """Return ALL legal moves sorted by fow_evaluator score, descending."""
    evaluate = fow_evaluator()
    rows = [(mv, float(evaluate(board, mv, perspective))) for mv in board.pseudo_legal_moves]
    rows.sort(key=lambda r: -r[1])
    return rows


def _render_position(
    idx: int,
    aid: str,
    ann: dict,
    result: dict,
    phase1b_result: dict | None,
    label: str,
) -> str:
    placement = ann["board_fen_after"]
    mover_color_str = ann["move_played_color"]
    mover = chess.WHITE if mover_color_str == "white" else chess.BLACK
    to_move_after = "b" if mover_color_str == "white" else "w"
    try:
        board_after = chess.Board(f"{placement} {to_move_after} - - 0 1")
        played = chess.Move.from_uci(ann["move_played_uci"])
        suggested = chess.Move.from_uci(ann["suggested_move_uci"])
        board_before = _reconstruct_board_before(board_after, played, mover)
    except Exception as exc:
        return f"\n## #{idx}: `{aid[:8]}` — reconstruct failed ({exc})\n\n---\n"

    fow_all = _fow_score_all(board_before, mover)
    fow_top = fow_all[:5]
    score_by_uci = {mv.uci(): cp for mv, cp in fow_all}
    # Compute rank of each interesting move for sanity reference.
    rank_by_uci = {mv.uci(): i + 1 for i, (mv, _) in enumerate(fow_all)}
    n_legal = len(fow_all)

    note = ann.get("note") or "(no note)"
    tags = ", ".join(ann.get("tags", [])) or "(no tags)"
    sev = ann.get("severity", "?")
    ply = ann.get("ply", "?")

    p1b_argmax = phase1b_result["cfr_argmax_move"] if phase1b_result else None

    lines: list[str] = []
    lines.append(f"## #{idx}: `{aid[:8]}` — {sev}, ply {ply}, {mover_color_str} to move")
    lines.append("")
    lines.append(f"**Annotator's note:** {note}")
    lines.append("")
    lines.append(f"*Tags: {tags}*")
    lines.append("")
    lines.append("**Board (capitals = white, lowercase = black):**")
    lines.append("")
    lines.append("```")
    lines.append(_board_ascii(board_before))
    lines.append("```")
    lines.append("")

    cfr_argmax = result["cfr_argmax_move"]
    played_cp = score_by_uci.get(played.uci())
    suggested_cp = score_by_uci.get(suggested.uci())
    cfr_argmax_cp = score_by_uci.get(cfr_argmax)
    p1b_argmax_cp = score_by_uci.get(p1b_argmax) if p1b_argmax else None
    cfr_argmax_match_label = "✓ matches suggested" if cfr_argmax == suggested.uci() else "≠ suggested"

    def _fmt_cp(cp):
        if cp is None:
            return "  ? "
        return f"{cp:+5.0f}"

    played_rank = rank_by_uci.get(played.uci(), "?")
    suggested_rank = rank_by_uci.get(suggested.uci(), "?")
    cfr_argmax_rank = rank_by_uci.get(cfr_argmax, "?")
    p1b_argmax_rank = rank_by_uci.get(p1b_argmax, "?") if p1b_argmax else None

    lines.append(f"**{label} run** (n_legal = {n_legal}):")
    lines.append("")
    lines.append("| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |")
    lines.append("|---|---|---|---|---|---|")
    lines.append(
        f"| played | `{played.uci()}` | {_fmt_cp(played_cp)} | {played_rank} | "
        f"{result['cfr_played_prob']:.3f} | annotated blunder |"
    )
    lines.append(
        f"| **suggested** | `{suggested.uci()}` | {_fmt_cp(suggested_cp)} | {suggested_rank} | "
        f"{result['cfr_suggested_prob']:.3f} | annotator's recommendation |"
    )
    lines.append(
        f"| **this run's argmax** | `{cfr_argmax}` | {_fmt_cp(cfr_argmax_cp)} | {cfr_argmax_rank} | "
        f"{result['cfr_argmax_prob']:.3f} | Deep CFR's top pick ({cfr_argmax_match_label}) |"
    )
    if p1b_argmax and p1b_argmax != cfr_argmax:
        lines.append(
            f"| Phase 1b argmax | `{p1b_argmax}` | {_fmt_cp(p1b_argmax_cp)} | {p1b_argmax_rank} | (tabular n/a) | tabular CFR (different pick) |"
        )
    elif p1b_argmax:
        lines.append(
            f"| Phase 1b argmax | `{p1b_argmax}` | {_fmt_cp(p1b_argmax_cp)} | {p1b_argmax_rank} | (tabular n/a) | tabular CFR (same pick) |"
        )
    lines.append("")

    lines.append("**fow_evaluator's top 5 (chess-anchor reference):**")
    lines.append("")
    lines.append("| Rank | Move | Score (cp) | Match? |")
    lines.append("|---|---|---|---|")
    for rank, (mv, cp) in enumerate(fow_top, start=1):
        tags = []
        if mv.uci() == suggested.uci(): tags.append("← suggested")
        if mv.uci() == played.uci(): tags.append("← played")
        if mv.uci() == cfr_argmax: tags.append("← this run's argmax")
        if p1b_argmax and mv.uci() == p1b_argmax: tags.append("← Phase 1b argmax")
        lines.append(f"| {rank} | `{mv.uci()}` | {cp:+.0f} | {' '.join(tags)} |")
    lines.append("")

    lines.append("**Your chess judgment** (check the ones that apply):")
    lines.append("")
    lines.append("- [ ] this run's argmax is the *best* move available (better than suggested + played)")
    lines.append("- [ ] this run's argmax is *reasonable* but suggested is better")
    lines.append("- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)")
    lines.append("- [ ] this run's argmax is *unreasonable* — the engine is wrong here")
    lines.append("- [ ] the annotator's suggested move is itself questionable")
    lines.append("")
    lines.append("Comment: _____________________________________________________")
    lines.append("")
    lines.append("---")
    lines.append("")

    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--result-file", type=Path, required=True)
    parser.add_argument(
        "--filter",
        choices=["all", "argmax-correct", "direction-wrong", "diffuse", "both-miss"],
        default="all",
    )
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--label", default=None, help="Label for the run (defaults to filename)")
    args = parser.parse_args()

    if not args.result_file.exists():
        raise SystemExit(f"Result file not found: {args.result_file}")

    annotations = _load_annotations()
    results = _load_results(args.result_file)
    phase1b_results = _load_results(PHASE_1B_PATH)

    label = args.label or args.result_file.stem
    aids = _filter_positions(results, phase1b_results, args.filter)
    if args.limit:
        aids = aids[: args.limit]

    print(f"Result file: {args.result_file.name} ({len(results)} positions)")
    print(f"Filter: {args.filter} → {len(aids)} positions matched")
    if args.limit:
        print(f"Limit: {args.limit}")

    lines: list[str] = []
    lines.append(f"# Review packet: {label}")
    lines.append("")
    lines.append(f"- Source result file: `{args.result_file.name}`")
    lines.append(f"- Filter: `{args.filter}`")
    lines.append(f"- Positions: {len(aids)}")
    lines.append("")
    lines.append("## How to use this")
    lines.append("")
    lines.append("Flip through each position. Check whichever judgment line(s) apply,")
    lines.append("optionally leave a 1-line comment. After you finish, the aggregate")
    lines.append("of your judgments is the *real* gate for whether this run is doing")
    lines.append("the right thing — independent of the argmax-match-suggested metric.")
    lines.append("")
    lines.append("Specifically, watch for:")
    lines.append("- Cases where this run's argmax is **better** than the annotator's suggested ")
    lines.append("  → the gate metric is undercounting Deep CFR's actual quality.")
    lines.append("- Cases where this run's argmax is **unreasonable**")
    lines.append("  → real engine weakness; tells us where Phase 3 needs to help.")
    lines.append("- Cases where the annotator's suggested move is **itself questionable**")
    lines.append("  → annotation noise; affects how seriously to take the gate metric.")
    lines.append("")
    lines.append("---")
    lines.append("")

    for i, aid in enumerate(aids, start=1):
        ann = annotations.get(aid)
        if ann is None:
            continue
        result = results[aid]
        p1b = phase1b_results.get(aid)
        lines.append(_render_position(i, aid, ann, result, p1b, label))

    output = args.out or DIAG_DIR / f"review-packet-{label}.md"
    output.write_text("\n".join(lines))
    print(f"Wrote {output}")


if __name__ == "__main__":
    main()
