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
import chess.svg

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


# ---------------------------------------------------------------------------
# HTML rendering (one self-contained file per packet, rendered boards + arrows).
# ---------------------------------------------------------------------------

_HTML_CSS = """
* { box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  margin: 0;
  background: #f7f7f5;
  color: #1a1a1a;
  line-height: 1.5;
}
header {
  padding: 24px 32px 16px;
  background: #fff;
  border-bottom: 1px solid #ddd;
}
header h1 { margin: 0 0 8px; font-size: 22px; }
header .meta { color: #555; font-size: 14px; }
.layout { display: grid; grid-template-columns: 220px 1fr; min-height: 100vh; }
nav.sidebar {
  background: #fff;
  border-right: 1px solid #ddd;
  padding: 16px 8px;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
  font-size: 13px;
}
nav.sidebar a {
  display: block;
  padding: 4px 12px;
  color: #1a1a1a;
  text-decoration: none;
  border-radius: 4px;
  margin-bottom: 1px;
}
nav.sidebar a:hover { background: #ececec; }
nav.sidebar .severity-major { font-weight: 600; }
nav.sidebar .severity-minor { color: #666; }
main { padding: 24px 32px 64px; max-width: 1100px; }
.position {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  margin-bottom: 24px;
  overflow: hidden;
}
.position h2 {
  margin: 0;
  padding: 14px 20px;
  background: #fafafa;
  border-bottom: 1px solid #eee;
  font-size: 16px;
  font-weight: 600;
}
.position-body {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 20px;
  padding: 16px 20px;
}
.board-side { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; }
.board-side svg { display: block; max-width: 100%; height: auto; }
.legend { font-size: 12px; color: #555; line-height: 1.7; }
.legend .swatch { display: inline-block; width: 12px; height: 12px; margin-right: 6px; vertical-align: middle; border-radius: 2px; }
.data-side { font-size: 13px; }
.note { background: #fff9e6; border-left: 3px solid #f5c518; padding: 8px 12px; margin-bottom: 12px; font-size: 13px; }
.tags { font-size: 12px; color: #888; margin-bottom: 12px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 12px; }
th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #eee; }
th { background: #f5f5f5; font-weight: 600; font-size: 11px; color: #555; text-transform: uppercase; letter-spacing: 0.04em; }
td.move { font-family: ui-monospace, Menlo, monospace; }
td.cp { text-align: right; }
.played-row td { background: #ffeeee; }
.suggested-row td { background: #eaf6e6; }
.argmax-row td { background: #e6eeff; font-weight: 600; }
.p1b-row td { background: #f4ecff; }
.judgment { background: #fafafa; border: 1px solid #e5e5e5; border-radius: 6px; padding: 12px 14px; margin-top: 8px; }
.judgment h3 { margin: 0 0 8px; font-size: 13px; font-weight: 600; }
.judgment label { display: block; padding: 3px 0; font-size: 13px; cursor: pointer; }
.judgment input[type="text"] { width: 100%; padding: 6px 8px; font-size: 13px; border: 1px solid #ccc; border-radius: 4px; margin-top: 6px; }
.severity-major-tag { display: inline-block; background: #d83a3a; color: #fff; padding: 1px 6px; border-radius: 3px; font-size: 11px; font-weight: 600; margin-right: 6px; }
.severity-minor-tag { display: inline-block; background: #888; color: #fff; padding: 1px 6px; border-radius: 3px; font-size: 11px; margin-right: 6px; }
.color-tag { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 11px; margin-right: 6px; }
.color-tag.white { background: #fff; color: #333; border: 1px solid #ccc; }
.color-tag.black { background: #1a1a1a; color: #fff; }
"""


_ARROW_PLAYED = "#d83a3a"
_ARROW_SUGGESTED = "#3aa83a"
_ARROW_ARGMAX = "#3a6dd8"
_ARROW_P1B = "#a83ad8"


def _render_position_html(
    idx: int,
    aid: str,
    ann: dict,
    result: dict,
    phase1b_result: dict | None,
) -> tuple[str, dict]:
    """Render one position as an HTML <section>. Returns (html, nav_meta)."""
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
        html = f'<section class="position" id="pos-{idx}"><h2>#{idx}: {aid[:8]} — reconstruct failed ({exc})</h2></section>'
        return html, {"idx": idx, "aid": aid, "label": f"{aid[:8]} (broken)", "severity": "?"}

    fow_all = _fow_score_all(board_before, mover)
    fow_top = fow_all[:5]
    score_by_uci = {mv.uci(): cp for mv, cp in fow_all}
    rank_by_uci = {mv.uci(): i + 1 for i, (mv, _) in enumerate(fow_all)}
    n_legal = len(fow_all)

    cfr_argmax_uci = result["cfr_argmax_move"]
    cfr_argmax_move = chess.Move.from_uci(cfr_argmax_uci)
    p1b_argmax_uci = phase1b_result["cfr_argmax_move"] if phase1b_result else None
    p1b_argmax_move = chess.Move.from_uci(p1b_argmax_uci) if p1b_argmax_uci else None

    # Build the board SVG. Always include every arrow — later ones draw on
    # top, so we order played → suggested → Deep CFR → Phase 1b for visibility
    # of the engine picks when they overlap with played/suggested.
    arrows = []
    arrows.append(chess.svg.Arrow(played.from_square, played.to_square, color=_ARROW_PLAYED))
    arrows.append(chess.svg.Arrow(suggested.from_square, suggested.to_square, color=_ARROW_SUGGESTED))
    arrows.append(chess.svg.Arrow(cfr_argmax_move.from_square, cfr_argmax_move.to_square, color=_ARROW_ARGMAX))
    if p1b_argmax_move:
        arrows.append(chess.svg.Arrow(p1b_argmax_move.from_square, p1b_argmax_move.to_square, color=_ARROW_P1B))

    # Compute overlap notes so the user knows when a single color masks
    # multiple sources.
    overlap_notes = []
    if cfr_argmax_uci == suggested.uci():
        overlap_notes.append("🔵 = 🟢 (Deep CFR = suggested)")
    elif cfr_argmax_uci == played.uci():
        overlap_notes.append("🔵 = 🔴 (Deep CFR = played — bad sign)")
    if p1b_argmax_uci == cfr_argmax_uci and p1b_argmax_uci:
        overlap_notes.append("🟣 = 🔵 (Phase 1b = Deep CFR)")
    elif p1b_argmax_uci == suggested.uci():
        overlap_notes.append("🟣 = 🟢 (Phase 1b = suggested)")
    elif p1b_argmax_uci == played.uci():
        overlap_notes.append("🟣 = 🔴 (Phase 1b = played — bad sign)")
    if suggested.uci() == played.uci():
        overlap_notes.append("🟢 = 🔴 (suggested = played — annotation oddity)")
    overlap_html = (
        f'<div style="font-size:12px;color:#a06000;margin-top:6px;"><strong>Overlap:</strong> {" · ".join(overlap_notes)}</div>'
        if overlap_notes
        else ""
    )

    svg = chess.svg.board(
        board_before,
        arrows=arrows,
        size=380,
        orientation=mover,
    )

    sev = ann.get("severity", "?")
    sev_tag = f'<span class="severity-{sev}-tag">{sev}</span>' if sev in ("major", "minor") else f'<span>{sev}</span>'
    color_tag = f'<span class="color-tag {mover_color_str}">{mover_color_str} to move</span>'
    note = ann.get("note") or "(no note)"
    tags = ", ".join(ann.get("tags", [])) or ""
    ply = ann.get("ply", "?")

    def _row(label, move_uci, prob, fow_cp, fow_rank, row_class, extra=""):
        prob_str = f"{prob:.3f}" if prob is not None else "—"
        cp_str = f"{fow_cp:+.0f}" if fow_cp is not None else "?"
        return (
            f'<tr class="{row_class}">'
            f'<td>{label}</td>'
            f'<td class="move">{move_uci}</td>'
            f'<td class="cp">{cp_str}</td>'
            f'<td class="cp">{fow_rank} / {n_legal}</td>'
            f'<td class="cp">{prob_str}</td>'
            f'<td>{extra}</td>'
            f'</tr>'
        )

    played_uci = played.uci()
    suggested_uci = suggested.uci()
    rows_html = []
    rows_html.append(_row(
        "played", played_uci, result["cfr_played_prob"],
        score_by_uci.get(played_uci), rank_by_uci.get(played_uci, "?"),
        "played-row", "annotated blunder",
    ))
    rows_html.append(_row(
        "suggested", suggested_uci, result["cfr_suggested_prob"],
        score_by_uci.get(suggested_uci), rank_by_uci.get(suggested_uci, "?"),
        "suggested-row", "annotator's pick",
    ))
    match_label = "✓ matches suggested" if cfr_argmax_uci == suggested_uci else "≠ suggested"
    rows_html.append(_row(
        "Deep CFR argmax", cfr_argmax_uci, result["cfr_argmax_prob"],
        score_by_uci.get(cfr_argmax_uci), rank_by_uci.get(cfr_argmax_uci, "?"),
        "argmax-row", match_label,
    ))
    if p1b_argmax_uci:
        same = " (same)" if p1b_argmax_uci == cfr_argmax_uci else ""
        rows_html.append(_row(
            "Phase 1b argmax", p1b_argmax_uci, None,
            score_by_uci.get(p1b_argmax_uci), rank_by_uci.get(p1b_argmax_uci, "?"),
            "p1b-row", f"tabular CFR{same}",
        ))

    fow_top_rows = []
    for rank, (mv, cp) in enumerate(fow_top, start=1):
        markers = []
        if mv.uci() == suggested_uci: markers.append("suggested")
        if mv.uci() == played_uci: markers.append("played")
        if mv.uci() == cfr_argmax_uci: markers.append("Deep CFR")
        if p1b_argmax_uci and mv.uci() == p1b_argmax_uci: markers.append("Phase 1b")
        marker_html = ", ".join(f"<em>{m}</em>" for m in markers) if markers else ""
        fow_top_rows.append(
            f'<tr><td>{rank}</td><td class="move">{mv.uci()}</td>'
            f'<td class="cp">{cp:+.0f}</td><td>{marker_html}</td></tr>'
        )

    judgment_html = f"""
<div class="judgment">
  <h3>Your chess judgment</h3>
  <label><input type="checkbox" name="j-{idx}-best"> Deep CFR's argmax is the <strong>best</strong> available move (better than suggested + played)</label>
  <label><input type="checkbox" name="j-{idx}-reasonable-suggested-better"> Deep CFR's argmax is reasonable but suggested is better</label>
  <label><input type="checkbox" name="j-{idx}-reasonable-no-better"> Deep CFR's argmax is reasonable; suggested is no better (annotation is noisy)</label>
  <label><input type="checkbox" name="j-{idx}-unreasonable"> Deep CFR's argmax is unreasonable — engine is wrong here</label>
  <label><input type="checkbox" name="j-{idx}-suggested-bad"> The annotator's suggested move is itself questionable</label>
  <input type="text" name="j-{idx}-comment" placeholder="Comment (optional)">
</div>
"""

    section = f"""
<section class="position" id="pos-{idx}">
  <h2>#{idx}: {sev_tag}{color_tag} ply {ply} · <code>{aid[:8]}</code></h2>
  <div class="position-body">
    <div class="board-side">
      {svg}
      <div class="legend">
        <div><span class="swatch" style="background:{_ARROW_PLAYED}"></span> played (annotated blunder)</div>
        <div><span class="swatch" style="background:{_ARROW_SUGGESTED}"></span> annotator's suggested</div>
        <div><span class="swatch" style="background:{_ARROW_ARGMAX}"></span> Deep CFR's argmax</div>
        <div><span class="swatch" style="background:{_ARROW_P1B}"></span> Phase 1b (tabular) argmax</div>
        {overlap_html}
      </div>
    </div>
    <div class="data-side">
      <div class="note"><strong>Annotator's note:</strong> {note}</div>
      {f'<div class="tags">Tags: {tags}</div>' if tags else ''}
      <table>
        <thead><tr><th>Source</th><th>Move</th><th>fow cp</th><th>fow rank</th><th>this run's prob</th><th></th></tr></thead>
        <tbody>{''.join(rows_html)}</tbody>
      </table>
      <table>
        <thead><tr><th colspan="4">fow_evaluator top 5 (anchor reference)</th></tr><tr><th>#</th><th>Move</th><th>cp</th><th>marker</th></tr></thead>
        <tbody>{''.join(fow_top_rows)}</tbody>
      </table>
      {judgment_html}
    </div>
  </div>
</section>
"""

    nav_meta = {
        "idx": idx,
        "aid": aid,
        "label": f"#{idx} {aid[:8]} {mover_color_str[0].upper()} ply{ply}",
        "severity": sev,
    }
    return section, nav_meta


def _render_html_document(packet_label: str, source_file: str, filter_mode: str, sections: list[tuple[str, dict]]) -> str:
    nav_links = "\n".join(
        f'<a href="#pos-{meta["idx"]}" class="severity-{meta["severity"]}">{meta["label"]}</a>'
        for _, meta in sections
    )
    sections_html = "\n".join(html for html, _ in sections)
    intro = f"""
<header>
  <h1>Review packet: {packet_label}</h1>
  <div class="meta">
    Source: <code>{source_file}</code> · Filter: <code>{filter_mode}</code> · {len(sections)} positions
  </div>
  <p style="margin-top:12px; font-size:13px; color:#555; max-width:780px;">
    For each position: board with played (<span style="color:{_ARROW_PLAYED}">red</span>),
    annotator's suggested (<span style="color:{_ARROW_SUGGESTED}">green</span>),
    Deep CFR's argmax (<span style="color:{_ARROW_ARGMAX}">blue</span>),
    Phase 1b argmax (<span style="color:{_ARROW_P1B}">purple</span>).
    Use the checkboxes to grade with your chess judgment. Watch for cases where
    Deep CFR picks a move fow ranks higher than the annotator's suggested —
    that's the gate metric undercounting CFR.
  </p>
</header>
"""
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{packet_label}</title>
<style>{_HTML_CSS}</style>
</head>
<body>
{intro}
<div class="layout">
  <nav class="sidebar">{nav_links}</nav>
  <main>{sections_html}</main>
</div>
</body>
</html>
"""


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
    parser.add_argument("--format", choices=["md", "html"], default="html",
                        help="Output format. html is recommended (rendered boards + arrows).")
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

    if args.format == "md":
        lines: list[str] = []
        lines.append(f"# Review packet: {label}")
        lines.append("")
        lines.append(f"- Source result file: `{args.result_file.name}`")
        lines.append(f"- Filter: `{args.filter}`")
        lines.append(f"- Positions: {len(aids)}")
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
    else:
        sections: list[tuple[str, dict]] = []
        for i, aid in enumerate(aids, start=1):
            ann = annotations.get(aid)
            if ann is None:
                continue
            result = results[aid]
            p1b = phase1b_results.get(aid)
            sections.append(_render_position_html(i, aid, ann, result, p1b))
        document = _render_html_document(
            packet_label=label,
            source_file=args.result_file.name,
            filter_mode=args.filter,
            sections=sections,
        )
        output = args.out or DIAG_DIR / f"review-packet-{label}.html"
        output.write_text(document)
    print(f"Wrote {output}")


if __name__ == "__main__":
    main()
