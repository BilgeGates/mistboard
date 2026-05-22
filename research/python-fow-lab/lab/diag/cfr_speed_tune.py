"""Tabular CFR speed-tune experiment.

Question: can tabular CFR be sped up to live-game time budgets (~5 sec/move)
while still picking good moves? If yes, we have a deployable engine
without Phase 3 (the amortized neural model).

Runs tabular CFR on a handful of annotated positions across multiple
(depth, iterations) settings. Records wall time + argmax + top-3 strategy
at each setting. Generates an HTML comparison page so Brian can judge
whether move quality holds up as speed increases.

Usage:
    PYTHONPATH=src .venv/bin/python lab/diag/cfr_speed_tune.py

Default config:
- 4 positions spanning easy → hard (different Phase 2b argmax_prob levels).
- 6 settings: depth=3 × iters in {500, 100, 50, 20, 10}, plus depth=2 × 50.
- Output: lab/diag/cfr-speed-tune-results.json + cfr-speed-tune-report.html.
"""

from __future__ import annotations

import json
import multiprocessing as mp
import os
import time
from pathlib import Path

import chess
import chess.svg

from fow_chess.cfr.leaf_eval import hybrid_fog_leaf_eval
from fow_chess.cfr.tabular import solve_subgame
from fow_chess.cfr.walker import SubgameNode
from fow_chess.evaluator import fow_evaluator


DIAG_DIR = Path(__file__).parent
PROJECT_ROOT = Path(__file__).parents[2]
ANNOTATIONS_PATH = PROJECT_ROOT / "feedback" / "annotations.jsonl"
RESULTS_PATH = DIAG_DIR / "cfr-speed-tune-results.json"
HTML_PATH = DIAG_DIR / "cfr-speed-tune-report.html"


# 4 positions spanning Phase 2b argmax_prob from very high to very low.
TARGET_ANNOTATION_PREFIXES = [
    "4cb2418d",  # easy (Phase 2b argmax_prob 0.958)
    "a1bf921f",  # medium (0.658)
    "0aac8a1d",  # hard (0.149)
    "9ad0b093",  # very diffuse (0.043, 47 legal moves)
]

# (label, depth, iterations, value_samples). Ordered fastest → slowest
# for psychological progression in the report.
SETTINGS: list[tuple[str, int, int, int]] = [
    ("d2_i10",  2, 10, 50),
    ("d2_i50",  2, 50, 100),
    ("d3_i10",  3, 10, 50),
    ("d3_i20",  3, 20, 100),
    ("d3_i50",  3, 50, 200),
    ("d3_i100", 3, 100, 200),
    ("d3_i500", 3, 500, 500),  # Phase 1b's actual setting (slow baseline)
]


def _reconstruct_board_before(
    board_after: chess.Board, move: chess.Move, mover_color: chess.Color
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


def _load_annotation_by_prefix(prefix: str) -> dict:
    with ANNOTATIONS_PATH.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            ann = json.loads(line)
            if ann["id"].startswith(prefix):
                return ann
    raise SystemExit(f"No annotation matching prefix {prefix!r}")


def _build_root(ann: dict) -> tuple[chess.Board, chess.Color]:
    mover = chess.WHITE if ann["move_played_color"] == "white" else chess.BLACK
    to_move_after = "b" if ann["move_played_color"] == "white" else "w"
    board_after = chess.Board(f"{ann['board_fen_after']} {to_move_after} - - 0 1")
    played = chess.Move.from_uci(ann["move_played_uci"])
    board_before = _reconstruct_board_before(board_after, played, mover)
    return board_before, mover


def _run_one(args: tuple[str, str, int, int, int]) -> dict:
    """Worker: run tabular CFR on one (annotation, setting) pair."""
    ann_prefix, label, depth, iters, value_samples = args
    ann = _load_annotation_by_prefix(ann_prefix)
    board, mover = _build_root(ann)
    root = SubgameNode.root(board, to_move=mover)

    t0 = time.monotonic()
    sol = solve_subgame(
        root,
        depth=depth,
        leaf_eval=hybrid_fog_leaf_eval,
        iterations=iters,
        value_estimate_samples=value_samples,
    )
    wall = time.monotonic() - t0

    strat = {mv.uci(): p for mv, p in sol.strategy_at_root.items()}
    top3 = sorted(strat.items(), key=lambda kv: -kv[1])[:3]

    played_uci = ann["move_played_uci"]
    suggested_uci = ann["suggested_move_uci"]

    return {
        "annotation_id": ann["id"],
        "annotation_prefix": ann_prefix,
        "setting_label": label,
        "depth": depth,
        "iterations": iters,
        "value_samples": value_samples,
        "wall_seconds": wall,
        "argmax_move": top3[0][0] if top3 else None,
        "argmax_prob": top3[0][1] if top3 else 0.0,
        "top3": top3,
        "played_prob": strat.get(played_uci, 0.0),
        "suggested_prob": strat.get(suggested_uci, 0.0),
        "value_at_root": sol.value_at_root,
        "info_set_count": sol.info_set_count,
    }


# ---------------------------------------------------------------------------
# HTML rendering
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
  padding: 20px 32px;
  background: #fff;
  border-bottom: 1px solid #ddd;
}
header h1 { margin: 0 0 8px; font-size: 22px; }
header p { margin: 6px 0; color: #555; font-size: 14px; max-width: 880px; }
main { padding: 24px 32px 64px; max-width: 1400px; }
.position {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  margin-bottom: 32px;
  overflow: hidden;
}
.position-header {
  padding: 12px 20px;
  background: #fafafa;
  border-bottom: 1px solid #eee;
  font-size: 15px;
  font-weight: 600;
}
.position-body {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 20px;
  padding: 16px 20px;
}
.board-side svg { display: block; max-width: 100%; height: auto; }
.note {
  background: #fff9e6;
  border-left: 3px solid #f5c518;
  padding: 8px 12px;
  margin-top: 10px;
  font-size: 13px;
}
.settings-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.settings-table th, .settings-table td {
  text-align: left;
  padding: 6px 10px;
  border-bottom: 1px solid #eee;
}
.settings-table th {
  background: #f5f5f5;
  font-weight: 600;
  font-size: 12px;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.settings-table td.num { text-align: right; }
.settings-table td.move { font-family: ui-monospace, Menlo, monospace; }
.row-fast { background: #f0f9f0; }
.row-slow { background: #fff8f0; }
.move-changed { background: #ffe9d6 !important; }
.judgment {
  background: #fafafa;
  border: 1px solid #e5e5e5;
  border-radius: 6px;
  padding: 10px 14px;
  margin-top: 12px;
  font-size: 13px;
}
.judgment label { display: block; padding: 3px 0; cursor: pointer; }
.color-tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
  margin-right: 6px;
}
.color-tag.white { background: #fff; color: #333; border: 1px solid #ccc; }
.color-tag.black { background: #1a1a1a; color: #fff; }
"""


def _render_html(results: list[dict]) -> str:
    annotations_by_id: dict[str, dict] = {}
    for r in results:
        if r["annotation_id"] not in annotations_by_id:
            annotations_by_id[r["annotation_id"]] = _load_annotation_by_prefix(r["annotation_prefix"])

    # Group results by annotation_id, in the same order as TARGET_ANNOTATION_PREFIXES.
    grouped: dict[str, list[dict]] = {}
    for r in results:
        grouped.setdefault(r["annotation_id"], []).append(r)
    for k in grouped:
        grouped[k].sort(key=lambda r: SETTINGS_LABEL_ORDER.get(r["setting_label"], 999))

    sections_html = []
    for prefix in TARGET_ANNOTATION_PREFIXES:
        ann_id = next((a for a in grouped if a.startswith(prefix)), None)
        if ann_id is None:
            continue
        ann = annotations_by_id[ann_id]
        rows = grouped[ann_id]

        try:
            board, mover = _build_root(ann)
        except Exception:
            continue

        played = chess.Move.from_uci(ann["move_played_uci"])
        suggested = chess.Move.from_uci(ann["suggested_move_uci"])

        # Find the slowest setting's argmax — used as "reference best."
        slowest = max(rows, key=lambda r: r["iterations"])
        reference_argmax = slowest["argmax_move"]
        reference_argmax_move = chess.Move.from_uci(reference_argmax) if reference_argmax else None

        # Always draw all three arrows. Order matters: later arrows render on
        # top, so blue (CFR pick) draws over green (suggested) and red
        # (played) when they overlap — meaning the user always sees blue,
        # which is what they're checking.
        arrows = [
            chess.svg.Arrow(played.from_square, played.to_square, color="#d83a3a"),
            chess.svg.Arrow(suggested.from_square, suggested.to_square, color="#3aa83a"),
        ]
        if reference_argmax_move:
            arrows.append(
                chess.svg.Arrow(reference_argmax_move.from_square, reference_argmax_move.to_square, color="#3a6dd8")
            )

        # Annotate any overlaps in the legend so the user knows when a single
        # arrow color is masking multiple moves.
        played_uci = played.uci()
        suggested_uci = suggested.uci()
        ref_uci = reference_argmax or ""
        overlap_notes = []
        if ref_uci == suggested_uci:
            overlap_notes.append("🔵 = 🟢 (CFR argmax = suggested)")
        elif ref_uci == played_uci:
            overlap_notes.append("🔵 = 🔴 (CFR argmax = played — bad sign)")
        if suggested_uci == played_uci:
            overlap_notes.append("🟢 = 🔴 (suggested = played — annotation oddity)")
        overlap_line = (
            f'<div style="font-size:12px;color:#a06000;margin-top:4px;"><strong>Overlap:</strong> {" · ".join(overlap_notes)}</div>'
            if overlap_notes
            else ""
        )

        svg = chess.svg.board(board, arrows=arrows, size=340, orientation=mover)

        mover_str = "white" if mover == chess.WHITE else "black"
        sev = ann.get("severity", "?")
        note = ann.get("note") or "(no note)"

        # Build table rows
        table_rows = []
        for r in rows:
            wall = r["wall_seconds"]
            argmax = r["argmax_move"]
            argmax_changed = argmax != reference_argmax
            row_class = "row-fast" if wall < 5.0 else ("row-slow" if wall > 60 else "")
            move_class = "move-changed" if argmax_changed else ""
            top3_str = ", ".join(f"{mv} ({p:.2f})" for mv, p in r["top3"][:3])
            table_rows.append(
                f'<tr class="{row_class}">'
                f'<td>d={r["depth"]}, iters={r["iterations"]}</td>'
                f'<td class="num">{wall:.1f}s</td>'
                f'<td class="move {move_class}">{argmax}</td>'
                f'<td class="num">{r["argmax_prob"]:.3f}</td>'
                f'<td class="num">{r["played_prob"]:.3f}</td>'
                f'<td class="num">{r["suggested_prob"]:.3f}</td>'
                f'<td style="font-size:11px;">{top3_str}</td>'
                f'</tr>'
            )

        judgment_html = f"""
<div class="judgment">
  <strong>Your judgment — at what setting does CFR still pick a move you'd accept for live play?</strong>
  <label><input type="checkbox"> All settings pick an acceptable move (CFR is robust to speed)</label>
  <label><input type="checkbox"> Quality holds at d=3, iters≥50 (medium-fast still OK)</label>
  <label><input type="checkbox"> Quality holds at d=3, iters≥100 (need to stay closer to slow baseline)</label>
  <label><input type="checkbox"> Quality holds at d=3, iters≥500 only (speed-tune doesn't work for this position)</label>
  <label><input type="checkbox"> d=2 settings produce different/worse moves than d=3</label>
</div>
"""

        sections_html.append(f"""
<section class="position">
  <div class="position-header">
    <span class="color-tag {mover_str}">{mover_str} to move</span>
    ply {ann.get("ply", "?")} · <code>{ann_id[:8]}</code> · {sev}
  </div>
  <div class="position-body">
    <div class="board-side">
      {svg}
      <div class="note"><strong>Annotator's note:</strong> {note}</div>
      <div style="font-size:12px;color:#555;margin-top:6px;">
        🔴 played (annotated blunder) ·
        🟢 annotator's suggested ·
        🔵 slowest-setting argmax (CFR reference: d=3 iters=500)
      </div>
      {overlap_line}
    </div>
    <div class="data-side">
      <table class="settings-table">
        <thead>
          <tr>
            <th>Setting</th>
            <th>Wall</th>
            <th>Argmax</th>
            <th>P(argmax)</th>
            <th>P(played)</th>
            <th>P(suggested)</th>
            <th>Top 3</th>
          </tr>
        </thead>
        <tbody>{''.join(table_rows)}</tbody>
      </table>
      <p style="font-size:12px;color:#777;margin-top:8px;">
        Rows highlighted <span style="background:#f0f9f0;padding:1px 4px;">green</span>
        finish in &lt;5 seconds (live-game viable).
        Rows highlighted <span style="background:#fff8f0;padding:1px 4px;">orange</span>
        take &gt;60 seconds (not live-game viable).
        Argmax moves highlighted <span style="background:#ffe9d6;padding:1px 4px;">orange</span>
        differ from the slow-baseline reference pick.
      </p>
      {judgment_html}
    </div>
  </div>
</section>
""")

    intro = """
<header>
  <h1>Tabular CFR speed-tune experiment</h1>
  <p>
    For each of 4 positions, tabular CFR was run at 7 different (depth, iteration)
    settings. The question: <strong>can CFR be sped up to live-game time budgets
    (~5 sec/move) while still picking good moves?</strong>
  </p>
  <p>
    For each position you can see how the argmax move changes (or doesn't) as
    we reduce iters from 500 down to 10. The slowest setting (d=3, iters=500)
    is the Phase 1b baseline — its argmax is the "reference best." Settings
    where CFR picks the same move at less compute are "free speedups."
  </p>
  <p>
    <strong>What to watch for:</strong> if d=3 iters=20 (a ~5 sec setting)
    picks the same argmax as iters=500, we have a deployable engine — no
    Phase 3 needed.
  </p>
</header>
"""

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>CFR speed-tune report</title>
<style>{_HTML_CSS}</style>
</head>
<body>
{intro}
<main>{''.join(sections_html)}</main>
</body>
</html>
"""


SETTINGS_LABEL_ORDER = {label: i for i, (label, _, _, _) in enumerate(SETTINGS)}


def main() -> None:
    print(f"Speed-tune: {len(TARGET_ANNOTATION_PREFIXES)} positions × {len(SETTINGS)} settings = {len(TARGET_ANNOTATION_PREFIXES) * len(SETTINGS)} runs")
    print(f"Annotations: {TARGET_ANNOTATION_PREFIXES}")
    print(f"Settings: {[s[0] for s in SETTINGS]}")
    print()

    jobs: list[tuple[str, str, int, int, int]] = []
    for ann_prefix in TARGET_ANNOTATION_PREFIXES:
        for label, depth, iters, value_samples in SETTINGS:
            jobs.append((ann_prefix, label, depth, iters, value_samples))

    n_workers = min(len(jobs), os.cpu_count() or 4)
    print(f"Running {len(jobs)} jobs on {n_workers} workers...")
    t0 = time.monotonic()
    with mp.Pool(processes=n_workers) as pool:
        results: list[dict] = []
        for i, r in enumerate(pool.imap_unordered(_run_one, jobs), start=1):
            results.append(r)
            print(
                f"  [{i}/{len(jobs)}] {r['annotation_prefix']} {r['setting_label']} "
                f"argmax={r['argmax_move']} prob={r['argmax_prob']:.3f} wall={r['wall_seconds']:.1f}s",
                flush=True,
            )
    wall = time.monotonic() - t0
    print(f"\nTotal wall: {wall:.1f}s")

    RESULTS_PATH.write_text(json.dumps({
        "annotations": TARGET_ANNOTATION_PREFIXES,
        "settings": [{"label": l, "depth": d, "iterations": it, "value_samples": vs} for l, d, it, vs in SETTINGS],
        "n_workers": n_workers,
        "total_wall_seconds": wall,
        "results": results,
    }, indent=2, default=str))
    print(f"Wrote {RESULTS_PATH}")

    html = _render_html(results)
    HTML_PATH.write_text(html)
    print(f"Wrote {HTML_PATH}")


if __name__ == "__main__":
    main()
