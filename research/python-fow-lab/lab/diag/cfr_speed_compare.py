"""Compare two CFR result files at the per-position level.

Use case: we have a fast tabular CFR setting (d=3 iters=20, ~6.7s/move)
and a slow baseline (Phase 1b at iters=500, ~3.5min/move). The fast
setting agrees with the slow baseline on only 12/38 positions in
argmax. The question: are the 26 disagreements *comparable in chess
quality* (different-but-fine) or *worse* (we need more iters)?

Generates an HTML report showing the 26 disagreement positions side
by side — board with fast/slow/played/suggested arrows, fow_evaluator
ranks for each, judgment checkboxes per position.

Usage:
    PYTHONPATH=src .venv/bin/python lab/diag/cfr_speed_compare.py \\
        --fast lab/diag/cfr-phase1b-d3i20-smoke-results.json \\
        --slow lab/diag/cfr-phase1b-smoke-results.json \\
        --label d3i20-vs-iters500
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import chess
import chess.svg

from fow_chess.evaluator import fow_evaluator


DIAG_DIR = Path(__file__).parent
PROJECT_ROOT = Path(__file__).parents[2]
ANNOTATIONS_PATH = PROJECT_ROOT / "feedback" / "annotations.jsonl"


def _reconstruct_board_before(board_after, move, mover_color):
    moving_piece_after = board_after.piece_at(move.to_square)
    if moving_piece_after is None:
        raise RuntimeError("no piece at destination in board_after")
    if move.promotion is not None:
        original_piece = chess.Piece(chess.PAWN, moving_piece_after.color)
    else:
        original_piece = moving_piece_after
    opp_color = not original_piece.color
    capture_options = [None] + [
        chess.Piece(pt, opp_color)
        for pt in (chess.PAWN, chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN)
    ]
    candidates = []
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


def _load_annotations():
    out = {}
    with ANNOTATIONS_PATH.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            ann = json.loads(line)
            out[ann["id"]] = ann
    return out


def _load_results(path):
    payload = json.loads(path.read_text())
    return {r["annotation_id"]: r for r in payload.get("results", []) if "error" not in r}


_CSS = """
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #f7f7f5; color: #1a1a1a; line-height: 1.5; }
header { padding: 20px 32px; background: #fff; border-bottom: 1px solid #ddd; }
header h1 { margin: 0 0 8px; font-size: 22px; }
header p { margin: 6px 0; color: #555; font-size: 14px; max-width: 880px; }
main { padding: 24px 32px 64px; max-width: 1400px; }
.position { background: #fff; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 24px; overflow: hidden; }
.position h2 { margin: 0; padding: 12px 20px; background: #fafafa; border-bottom: 1px solid #eee; font-size: 15px; font-weight: 600; }
.body { display: grid; grid-template-columns: 380px 1fr; gap: 20px; padding: 16px 20px; }
.board-side svg { display: block; max-width: 100%; height: auto; }
.legend { font-size: 12px; color: #555; line-height: 1.7; margin-top: 8px; }
.swatch { display: inline-block; width: 12px; height: 12px; margin-right: 6px; vertical-align: middle; border-radius: 2px; }
.note { background: #fff9e6; border-left: 3px solid #f5c518; padding: 8px 12px; font-size: 13px; margin-bottom: 12px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 13px; }
th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #eee; }
th { background: #f5f5f5; font-weight: 600; font-size: 11px; color: #555; text-transform: uppercase; }
td.num { text-align: right; }
td.move { font-family: ui-monospace, Menlo, monospace; }
.row-fast td { background: #e6eeff; }
.row-slow td { background: #f4ecff; }
.row-played td { background: #ffeeee; }
.row-suggested td { background: #eaf6e6; }
.judgment { background: #fafafa; border: 1px solid #e5e5e5; border-radius: 6px; padding: 12px 14px; margin-top: 8px; font-size: 13px; }
.judgment label { display: block; padding: 3px 0; cursor: pointer; }
.judgment input[type="text"] { width: 100%; padding: 6px 8px; font-size: 13px; border: 1px solid #ccc; border-radius: 4px; margin-top: 6px; }
.color-tag { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 11px; margin-right: 6px; }
.color-tag.white { background: #fff; color: #333; border: 1px solid #ccc; }
.color-tag.black { background: #1a1a1a; color: #fff; }
.toolbar { position: sticky; top: 0; z-index: 50; background: #fafafa; border-bottom: 1px solid #ddd; padding: 10px 32px; display: flex; gap: 10px; align-items: center; }
.toolbar button { padding: 6px 12px; font-size: 13px; border-radius: 4px; border: 1px solid #ccc; background: #fff; cursor: pointer; }
.toolbar button:hover { background: #f0f0f0; }
.toolbar .status { font-size: 12px; color: #555; }
"""

_TOOLBAR_JS = """
<div class="toolbar">
  <button onclick="saveJudgments()">💾 Save judgments → JSON</button>
  <button onclick="loadJudgments()">📂 Load judgments from JSON</button>
  <button onclick="clearAll()">🗑 Clear all</button>
  <span class="status" id="status"></span>
  <input type="file" id="loadInput" accept="application/json" style="display:none" onchange="onFileLoad(event)">
</div>
<script>
function _collect() {
  const data = {meta: {timestamp: new Date().toISOString(), report: document.title}, positions: {}};
  document.querySelectorAll('input[type="checkbox"], input[type="text"]').forEach(el => {
    const m = el.name.match(/^j-(\\d+)-(.+)$/);
    if (!m) return;
    const idx = m[1], key = m[2];
    data.positions[idx] = data.positions[idx] || {};
    data.positions[idx][key] = el.type === 'checkbox' ? el.checked : el.value;
  });
  return data;
}
function saveJudgments() {
  const data = _collect();
  const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = document.title.replace(/[^a-z0-9.-]/gi, '_') + '-judgments.json';
  a.click();
  document.getElementById('status').textContent = 'Saved ' + Object.keys(data.positions).length + ' positions';
}
function loadJudgments() { document.getElementById('loadInput').click(); }
function onFileLoad(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      let n = 0;
      Object.entries(data.positions || {}).forEach(([idx, fields]) => {
        Object.entries(fields).forEach(([key, val]) => {
          const el = document.querySelector(`input[name="j-${idx}-${key}"]`);
          if (el) { if (el.type === 'checkbox') el.checked = val; else el.value = val; n++; }
        });
      });
      document.getElementById('status').textContent = 'Loaded ' + n + ' fields';
    } catch (err) {
      document.getElementById('status').textContent = 'Load failed: ' + err.message;
    }
  };
  reader.readAsText(file);
}
function clearAll() {
  document.querySelectorAll('input[type="checkbox"]').forEach(el => el.checked = false);
  document.querySelectorAll('input[type="text"]').forEach(el => el.value = '');
  document.getElementById('status').textContent = 'Cleared';
}
</script>
"""

_FAST_COLOR = "#3a6dd8"  # blue
_SLOW_COLOR = "#a83ad8"  # purple
_PLAYED_COLOR = "#d83a3a"  # red
_SUGGESTED_COLOR = "#3aa83a"  # green


def _render_position(idx, aid, ann, fast_r, slow_r):
    placement = ann["board_fen_after"]
    mover_str = ann["move_played_color"]
    mover = chess.WHITE if mover_str == "white" else chess.BLACK
    to_move_after = "b" if mover_str == "white" else "w"
    board_after = chess.Board(f"{placement} {to_move_after} - - 0 1")
    played = chess.Move.from_uci(ann["move_played_uci"])
    suggested = chess.Move.from_uci(ann["suggested_move_uci"])
    board_before = _reconstruct_board_before(board_after, played, mover)

    fast_uci = fast_r["cfr_argmax_move"]
    slow_uci = slow_r["cfr_argmax_move"]
    fast_move = chess.Move.from_uci(fast_uci)
    slow_move = chess.Move.from_uci(slow_uci)

    evaluate = fow_evaluator()
    legal_scores = sorted(
        ((mv, float(evaluate(board_before, mv, mover))) for mv in board_before.pseudo_legal_moves),
        key=lambda kv: -kv[1],
    )
    score_by_uci = {mv.uci(): cp for mv, cp in legal_scores}
    rank_by_uci = {mv.uci(): i + 1 for i, (mv, _) in enumerate(legal_scores)}
    n_legal = len(legal_scores)

    arrows = [
        chess.svg.Arrow(played.from_square, played.to_square, color=_PLAYED_COLOR),
        chess.svg.Arrow(suggested.from_square, suggested.to_square, color=_SUGGESTED_COLOR),
        chess.svg.Arrow(slow_move.from_square, slow_move.to_square, color=_SLOW_COLOR),
        chess.svg.Arrow(fast_move.from_square, fast_move.to_square, color=_FAST_COLOR),
    ]
    svg = chess.svg.board(board_before, arrows=arrows, size=380, orientation=mover)

    fast_cp = score_by_uci.get(fast_uci)
    slow_cp = score_by_uci.get(slow_uci)
    fast_rank = rank_by_uci.get(fast_uci, "?")
    slow_rank = rank_by_uci.get(slow_uci, "?")
    cp_delta = (fast_cp - slow_cp) if (fast_cp is not None and slow_cp is not None) else None

    sev = ann.get("severity", "?")
    note = ann.get("note") or "(no note)"
    ply = ann.get("ply", "?")

    overlap_notes = []
    if fast_uci == slow_uci:
        overlap_notes.append("🔵 = 🟣 (fast = slow — wouldn't be in this report)")
    if fast_uci == played.uci():
        overlap_notes.append("🔵 = 🔴 (fast = played — bad sign)")
    if fast_uci == suggested.uci():
        overlap_notes.append("🔵 = 🟢 (fast = suggested)")
    if slow_uci == played.uci():
        overlap_notes.append("🟣 = 🔴 (slow = played — bad sign)")
    if slow_uci == suggested.uci():
        overlap_notes.append("🟣 = 🟢 (slow = suggested)")
    overlap_html = (
        f'<div style="font-size:12px;color:#a06000;margin-top:6px;"><strong>Overlap:</strong> {" · ".join(overlap_notes)}</div>'
        if overlap_notes else ""
    )

    def _fmt_cp(cp):
        return f"{cp:+.0f}" if cp is not None else "?"

    cp_delta_str = (
        f"{cp_delta:+.0f} cp"
        if cp_delta is not None else "?"
    )
    cp_delta_color = (
        "#0a7a0a" if cp_delta is not None and cp_delta >= 30
        else ("#a02020" if cp_delta is not None and cp_delta <= -30 else "#777")
    )
    cp_delta_html = (
        f'<span style="color:{cp_delta_color};font-weight:600;">{cp_delta_str}</span>'
    )

    rows = [
        f'<tr class="row-played"><td>played (blunder)</td><td class="move">{played.uci()}</td><td>{_fmt_cp(score_by_uci.get(played.uci()))}</td><td class="num">{rank_by_uci.get(played.uci(), "?")} / {n_legal}</td></tr>',
        f'<tr class="row-suggested"><td>suggested (annotator)</td><td class="move">{suggested.uci()}</td><td>{_fmt_cp(score_by_uci.get(suggested.uci()))}</td><td class="num">{rank_by_uci.get(suggested.uci(), "?")} / {n_legal}</td></tr>',
        f'<tr class="row-fast"><td><strong>FAST</strong> (d=3 i=20, {fast_r["cfr_wall_seconds"]:.1f}s)</td><td class="move">{fast_uci}</td><td>{_fmt_cp(fast_cp)}</td><td class="num">{fast_rank} / {n_legal}</td></tr>',
        f'<tr class="row-slow"><td><strong>SLOW</strong> (d=3 i=500, {slow_r["cfr_wall_seconds"]:.1f}s)</td><td class="move">{slow_uci}</td><td>{_fmt_cp(slow_cp)}</td><td class="num">{slow_rank} / {n_legal}</td></tr>',
    ]

    top5_rows = []
    for rank, (mv, cp) in enumerate(legal_scores[:5], start=1):
        markers = []
        if mv.uci() == fast_uci: markers.append("FAST")
        if mv.uci() == slow_uci: markers.append("SLOW")
        if mv.uci() == played.uci(): markers.append("played")
        if mv.uci() == suggested.uci(): markers.append("suggested")
        marker_str = ", ".join(markers)
        top5_rows.append(f'<tr><td>{rank}</td><td class="move">{mv.uci()}</td><td>{cp:+.0f}</td><td>{marker_str}</td></tr>')

    judgment = f"""
<div class="judgment">
  <strong>Your chess judgment</strong> — for live play, would you ship the FAST argmax?
  <label><input type="checkbox" name="j-{idx}-fast-equal"> FAST and SLOW picks are equivalent in quality (different moves, both fine)</label>
  <label><input type="checkbox" name="j-{idx}-fast-better"> FAST pick is actually <em>better</em> than SLOW pick</label>
  <label><input type="checkbox" name="j-{idx}-slow-better"> SLOW pick is meaningfully better; FAST is too rushed</label>
  <label><input type="checkbox" name="j-{idx}-fast-bad"> FAST pick is bad chess — don't ship at this speed</label>
  <label><input type="checkbox" name="j-{idx}-both-bad"> Both picks are questionable</label>
  <input type="text" name="j-{idx}-comment" placeholder="Comment (optional)">
</div>
"""

    return f"""
<section class="position" id="pos-{idx}">
  <h2>#{idx}: <span class="color-tag {mover_str}">{mover_str} to move</span> ply {ply} · <code>{aid[:8]}</code> · {sev}</h2>
  <div class="body">
    <div class="board-side">
      {svg}
      <div class="legend">
        <div><span class="swatch" style="background:{_PLAYED_COLOR}"></span> played (annotated blunder)</div>
        <div><span class="swatch" style="background:{_SUGGESTED_COLOR}"></span> annotator's suggested</div>
        <div><span class="swatch" style="background:{_FAST_COLOR}"></span> <strong>FAST</strong> (d=3 iters=20, ~7 sec/move)</div>
        <div><span class="swatch" style="background:{_SLOW_COLOR}"></span> <strong>SLOW</strong> baseline (d=3 iters=500, ~3.5 min/move)</div>
        {overlap_html}
      </div>
      <div class="note"><strong>Annotator's note:</strong> {note}</div>
      <div style="font-size:13px;margin-top:8px;">
        FAST vs SLOW score delta (fow): {cp_delta_html}
      </div>
    </div>
    <div class="data-side">
      <table>
        <thead><tr><th>Source</th><th>Move</th><th>fow cp</th><th>fow rank</th></tr></thead>
        <tbody>{''.join(rows)}</tbody>
      </table>
      <table>
        <thead><tr><th colspan="4">fow_evaluator top 5</th></tr><tr><th>#</th><th>Move</th><th>cp</th><th>marker</th></tr></thead>
        <tbody>{''.join(top5_rows)}</tbody>
      </table>
      {judgment}
    </div>
  </div>
</section>
"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fast", type=Path, required=True)
    parser.add_argument("--slow", type=Path, required=True)
    parser.add_argument("--label", default="speed-compare")
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()

    annotations = _load_annotations()
    fast = _load_results(args.fast)
    slow = _load_results(args.slow)
    common = sorted(set(fast) & set(slow))
    disagree = [a for a in common if fast[a]["cfr_argmax_move"] != slow[a]["cfr_argmax_move"]]
    print(f"Common positions: {len(common)}")
    print(f"FAST and SLOW disagree on argmax: {len(disagree)} positions")

    sections = []
    for i, aid in enumerate(disagree, start=1):
        ann = annotations.get(aid)
        if ann is None:
            continue
        try:
            sections.append(_render_position(i, aid, ann, fast[aid], slow[aid]))
        except Exception as exc:
            print(f"  skip {aid[:8]}: {exc}")

    intro = f"""
<header>
  <h1>FAST vs SLOW: {args.label}</h1>
  <p>
    Positions where the FAST setting (d=3 iters=20, mean ~7 sec/move)
    picks a different argmax than the SLOW baseline (d=3 iters=500, mean
    ~3.5 min/move). {len(disagree)} of {len(common)} positions.
  </p>
  <p>
    For each: board with 4 arrows (red=played, green=suggested,
    <span style="color:{_FAST_COLOR}">blue=FAST</span>,
    <span style="color:{_SLOW_COLOR}">purple=SLOW</span>), table of all
    four moves with fow_evaluator score and rank-out-of-N, plus
    judgment checkboxes.
  </p>
  <p>
    <strong>What to watch for:</strong> if FAST and SLOW picks are
    both reasonable (just different choices among comparable moves),
    we ship the FAST engine. If FAST picks are systematically worse,
    we need more iters than 20 for v1.
  </p>
</header>
"""

    output = args.out or DIAG_DIR / f"speed-compare-{args.label}.html"
    output.write_text(f"""<!doctype html>
<html><head><meta charset="utf-8"><title>{args.label}</title><style>{_CSS}</style></head>
<body>{_TOOLBAR_JS}{intro}<main>{''.join(sections)}</main></body></html>
""")
    print(f"Wrote {output}")


if __name__ == "__main__":
    main()
