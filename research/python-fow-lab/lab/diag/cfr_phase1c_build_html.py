"""Build an interactive HTML interface for the Phase 1c hand-validation.

Generates a single-file HTML page with:
- SVG board render per position (via python-chess.svg)
- Arrows on the board: red = played blunder, green = human suggested,
  blue = CFR argmax
- Radio buttons for B/C/W/? judgment + freeform notes
- LocalStorage autosave so closing the tab doesn't lose state
- "Show Tally" button that computes the defensible rate
- Keyboard shortcuts: 1=B, 2=C, 3=W, 4=?

Run:
    cd research/python-fow-lab
    PYTHONPATH=src .venv/bin/python lab/diag/cfr_phase1c_build_html.py
    open lab/diag/cfr-phase1c-hand-validation.html
"""

from __future__ import annotations

import html
import json
from pathlib import Path

import chess
import chess.svg


MIN_CONFIDENCE = 0.45
RESULTS_PATH = (
    Path(__file__).parent / "cfr-phase1b-smoke-results.json"
)
ANNOTATIONS_PATH = Path(__file__).parents[2] / "feedback" / "annotations.jsonl"
OUTPUT_PATH = (
    Path(__file__).parent / "cfr-phase1c-hand-validation.html"
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


def _board_svg(
    board: chess.Board,
    played: chess.Move,
    suggested: chess.Move,
    cfr_move: chess.Move,
    flipped: bool,
) -> str:
    arrows = []
    if played in board.pseudo_legal_moves or True:
        arrows.append(
            chess.svg.Arrow(played.from_square, played.to_square, color="#c0392b")
        )
    if suggested in board.pseudo_legal_moves:
        arrows.append(
            chess.svg.Arrow(
                suggested.from_square, suggested.to_square, color="#27ae60"
            )
        )
    if cfr_move in board.pseudo_legal_moves:
        arrows.append(
            chess.svg.Arrow(
                cfr_move.from_square, cfr_move.to_square, color="#2980b9"
            )
        )
    return chess.svg.board(
        board,
        arrows=arrows,
        flipped=flipped,
        size=380,
    )


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Phase 1c Hand-Validation</title>
<style>
  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    max-width: 900px;
    margin: 2em auto;
    padding: 0 1em;
    color: #222;
    line-height: 1.5;
  }}
  h1 {{ margin-bottom: 0.2em; }}
  .lede {{ color: #666; margin-top: 0; }}
  .legend {{
    background: #f6f8fa;
    padding: 0.6em 1em;
    border-radius: 6px;
    margin: 1em 0 2em 0;
    font-size: 0.95em;
  }}
  .legend .swatch {{
    display: inline-block;
    width: 14px;
    height: 4px;
    margin-right: 4px;
    vertical-align: middle;
  }}
  .position {{
    border: 1px solid #d0d7de;
    border-radius: 8px;
    padding: 1em 1.2em;
    margin-bottom: 1.5em;
    transition: background 0.15s;
  }}
  .position.judged {{
    background: #f0fff4;
    border-color: #b5e0c2;
  }}
  .position h2 {{ margin-top: 0; }}
  .meta {{ color: #666; font-size: 0.9em; margin-bottom: 0.5em; }}
  .note {{
    font-style: italic;
    color: #444;
    background: #fffdf0;
    padding: 0.4em 0.8em;
    border-left: 3px solid #f1c40f;
    margin: 0.5em 0 1em 0;
  }}
  .grid {{
    display: grid;
    grid-template-columns: 380px 1fr;
    gap: 1.5em;
    align-items: start;
  }}
  .board svg {{ display: block; }}
  .moves p {{ margin: 0.2em 0; font-family: ui-monospace, monospace; }}
  .moves .played {{ color: #c0392b; }}
  .moves .suggested {{ color: #27ae60; }}
  .moves .cfr {{ color: #2980b9; font-weight: 600; }}
  .judgment {{ margin-top: 1em; }}
  .judgment label {{
    display: inline-block;
    padding: 0.4em 0.8em;
    margin-right: 0.3em;
    margin-bottom: 0.3em;
    border: 1px solid #d0d7de;
    border-radius: 4px;
    cursor: pointer;
    user-select: none;
  }}
  .judgment label:hover {{ background: #f6f8fa; }}
  .judgment input[type=radio] {{ margin-right: 0.4em; }}
  .judgment input[type=radio]:checked + span {{ font-weight: 600; }}
  .judgment label.checked {{ background: #ddf4ff; border-color: #54aeff; }}
  textarea {{
    width: 100%;
    min-height: 60px;
    margin-top: 0.5em;
    padding: 0.5em;
    border: 1px solid #d0d7de;
    border-radius: 4px;
    font-family: inherit;
    font-size: 0.95em;
    box-sizing: border-box;
  }}
  .tally-button {{
    position: sticky;
    bottom: 1em;
    background: #2980b9;
    color: white;
    border: none;
    padding: 0.8em 1.5em;
    font-size: 1em;
    border-radius: 6px;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  }}
  .tally-button:hover {{ background: #1c5d8c; }}
  #tally-result {{
    background: #2c3e50;
    color: white;
    padding: 1.2em 1.5em;
    border-radius: 8px;
    margin-top: 1em;
    font-family: ui-monospace, monospace;
    white-space: pre;
    display: none;
  }}
  .progress {{
    position: sticky;
    top: 0;
    background: #fff;
    border-bottom: 1px solid #d0d7de;
    padding: 0.6em 0;
    margin-bottom: 1em;
    z-index: 100;
  }}
  .progress-bar {{
    background: #e7ebef;
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
  }}
  .progress-fill {{
    background: #2980b9;
    height: 100%;
    transition: width 0.2s;
    width: 0;
  }}
</style>
</head>
<body>
<h1>Phase 1c — Hand-Validation</h1>
<p class="lede">
  CFR (Phase 1b) confidently picked a move that is neither the played
  blunder nor the human-suggested alternative. Judge whether CFR's pick
  is defensible vs the human's suggested move.
</p>

<div class="legend">
  <strong>Board arrow legend:</strong>
  <span class="swatch" style="background:#c0392b"></span> played (blunder)
  &nbsp;
  <span class="swatch" style="background:#27ae60"></span> human suggested
  &nbsp;
  <span class="swatch" style="background:#2980b9"></span> CFR argmax
  <br>
  <strong>Keyboard:</strong> hover over a position, then press
  <code>1</code> (Better), <code>2</code> (Comparable), <code>3</code>
  (Worse), <code>4</code> (Can't tell). State auto-saves to your browser.
</div>

<div class="progress">
  <div>Judged: <span id="judged-count">0</span> / {n_positions}</div>
  <div class="progress-bar"><div id="progress-fill" class="progress-fill"></div></div>
</div>

{positions_html}

<button class="tally-button" onclick="computeTally()">Compute tally</button>
<div id="tally-result"></div>

<script>
const STORAGE_KEY = "phase1c-hand-validation";

function save() {{
  const state = {{}};
  document.querySelectorAll(".position").forEach(div => {{
    const id = div.dataset.id;
    const radio = div.querySelector("input[type=radio]:checked");
    const notes = div.querySelector("textarea").value;
    state[id] = {{
      verdict: radio ? radio.value : null,
      notes: notes,
    }};
  }});
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  updateProgress();
}}

function restore() {{
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  const state = JSON.parse(raw);
  document.querySelectorAll(".position").forEach(div => {{
    const id = div.dataset.id;
    if (!state[id]) return;
    if (state[id].verdict) {{
      const radio = div.querySelector(`input[type=radio][value="${{state[id].verdict}}"]`);
      if (radio) {{
        radio.checked = true;
        radio.closest("label").classList.add("checked");
        div.classList.add("judged");
      }}
    }}
    if (state[id].notes) {{
      div.querySelector("textarea").value = state[id].notes;
    }}
  }});
  updateProgress();
}}

function updateProgress() {{
  const total = document.querySelectorAll(".position").length;
  const judged = document.querySelectorAll(".position.judged").length;
  document.getElementById("judged-count").textContent = judged;
  document.getElementById("progress-fill").style.width = (judged / total * 100) + "%";
}}

function setupHandlers() {{
  document.querySelectorAll(".position").forEach(div => {{
    div.querySelectorAll("input[type=radio]").forEach(radio => {{
      radio.addEventListener("change", e => {{
        div.querySelectorAll("label").forEach(l => l.classList.remove("checked"));
        e.target.closest("label").classList.add("checked");
        div.classList.add("judged");
        save();
      }});
    }});
    div.querySelector("textarea").addEventListener("input", save);
  }});
}}

let hoveredPosition = null;
function setupKeyboard() {{
  document.querySelectorAll(".position").forEach(div => {{
    div.addEventListener("mouseenter", () => {{ hoveredPosition = div; }});
    div.addEventListener("mouseleave", () => {{ hoveredPosition = null; }});
  }});
  const keymap = {{ "1": "B", "2": "C", "3": "W", "4": "?" }};
  document.addEventListener("keydown", e => {{
    if (!hoveredPosition) return;
    if (document.activeElement && document.activeElement.tagName === "TEXTAREA") return;
    const value = keymap[e.key];
    if (!value) return;
    const radio = hoveredPosition.querySelector(`input[type=radio][value="${{value}}"]`);
    if (radio) {{
      radio.checked = true;
      radio.dispatchEvent(new Event("change"));
    }}
  }});
}}

function computeTally() {{
  const counts = {{ B: 0, C: 0, W: 0, "?": 0, unmarked: 0 }};
  document.querySelectorAll(".position").forEach(div => {{
    const radio = div.querySelector("input[type=radio]:checked");
    if (radio) counts[radio.value]++;
    else counts.unmarked++;
  }});
  const judged = counts.B + counts.C + counts.W + counts["?"];
  const total = judged + counts.unmarked;
  const defensible = counts.B + counts.C;
  // exclude unsure (?) from denominator for the defensible rate, matching
  // the scoring script's convention (judged includes ? but defensible doesn't)
  const denom = judged;
  const rate = denom > 0 ? defensible / denom : 0;
  let verdict;
  if (denom === 0) {{
    verdict = "No judgments yet.";
  }} else if (rate >= 0.60) {{
    verdict = "≥60% defensible — metric was unfair to CFR.\\nPhase 1b is a SOFT PASS. Proceed to Phase 2.";
  }} else if (rate >= 0.30) {{
    verdict = "30-60% defensible — inconclusive.\\nCollect more validations or accept Phase 1b as fail.";
  }} else {{
    verdict = "<30% defensible — metric was fair.\\nPhase 1b really did fail. Honor the gate; stop CFR investment.";
  }}
  const lines = [
    `Total positions: ${{total}}`,
    `Judged: ${{judged}}; Unmarked: ${{counts.unmarked}}`,
    "",
    "Breakdown:",
    `  [B] Better than suggested:    ${{counts.B}}`,
    `  [C] Comparable to suggested:  ${{counts.C}}`,
    `  [W] Worse than suggested:     ${{counts.W}}`,
    `  [?] Can't tell:               ${{counts["?"]}}`,
    "",
    `Defensible rate (B+C / judged): ${{defensible}}/${{denom}} = ${{(rate*100).toFixed(0)}}%`,
    "",
    verdict,
  ];
  const el = document.getElementById("tally-result");
  el.textContent = lines.join("\\n");
  el.style.display = "block";
  el.scrollIntoView({{ behavior: "smooth", block: "center" }});
}}

document.addEventListener("DOMContentLoaded", () => {{
  setupHandlers();
  setupKeyboard();
  restore();
}});
</script>
</body>
</html>
"""


POSITION_TEMPLATE = """
<div class="position" data-id="{idx}">
  <h2>Position {idx} of {n_total} — {severity}, {mover} to move</h2>
  <div class="meta">
    material: {material:+.0f} cp ({mover} POV) ·
    legal moves: {n_legal} ·
    CFR confidence: {cfr_conf:.0%}
  </div>
  <div class="note">{annotation_note}</div>
  <div class="grid">
    <div class="board">{board_svg}</div>
    <div class="moves">
      <p><span class="played">played (blunder):</span> {played}</p>
      <p><span class="suggested">human suggested:</span> {suggested}</p>
      <p><span class="cfr">CFR argmax:</span> {cfr_arg} (top prob {cfr_conf:.2f})</p>
      <p>fow argmax: {fow_arg}</p>
      <div class="judgment">
        <label><input type="radio" name="pos{idx}" value="B"><span>[B] Better</span></label>
        <label><input type="radio" name="pos{idx}" value="C"><span>[C] Comparable</span></label>
        <label><input type="radio" name="pos{idx}" value="W"><span>[W] Worse</span></label>
        <label><input type="radio" name="pos{idx}" value="?"><span>[?] Can't tell</span></label>
      </div>
      <textarea placeholder="Optional notes..."></textarea>
    </div>
  </div>
</div>
"""


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
    n_total = len(candidates)
    print(f"Building HTML for {n_total} positions...")

    positions_html_blocks = []
    skipped = 0
    for i, r in enumerate(candidates, 1):
        ann = ann_by_id[r["annotation_id"]]
        placement = ann["board_fen_after"]
        mover_color_str = ann["move_played_color"]
        mover_color = chess.WHITE if mover_color_str == "white" else chess.BLACK
        to_move_after = "b" if mover_color_str == "white" else "w"
        try:
            board_after = chess.Board(f"{placement} {to_move_after} - - 0 1")
            played = chess.Move.from_uci(ann["move_played_uci"])
            suggested = chess.Move.from_uci(ann["suggested_move_uci"])
            cfr_move = chess.Move.from_uci(r["cfr_argmax_move"])
            board_before = _reconstruct_board_before(
                board_after, played, mover_color
            )
            svg_str = _board_svg(
                board_before, played, suggested, cfr_move,
                flipped=(mover_color == chess.BLACK),
            )
            material = sum(
                (1 if p.color == mover_color else -1)
                * {chess.PAWN: 100, chess.KNIGHT: 300, chess.BISHOP: 320,
                   chess.ROOK: 500, chess.QUEEN: 900, chess.KING: 0}[p.piece_type]
                for p in board_before.piece_map().values()
            )
            n_legal = len(list(board_before.pseudo_legal_moves))
        except Exception as e:
            print(f"  Position {i}: skip ({e})")
            skipped += 1
            continue

        positions_html_blocks.append(
            POSITION_TEMPLATE.format(
                idx=i,
                n_total=n_total,
                severity=html.escape(r["severity"]),
                mover=html.escape(mover_color_str),
                material=material,
                n_legal=n_legal,
                cfr_conf=r["cfr_argmax_prob"],
                annotation_note=html.escape(ann.get("note", "(no note)")),
                board_svg=svg_str,
                played=html.escape(r["played"]),
                suggested=html.escape(r["suggested"]),
                cfr_arg=html.escape(r["cfr_argmax_move"]),
                fow_arg=html.escape(r["fow_argmax_move"]),
            )
        )

    page = HTML_TEMPLATE.format(
        n_positions=n_total - skipped,
        positions_html="\n".join(positions_html_blocks),
    )
    OUTPUT_PATH.write_text(page)
    print(f"Wrote {OUTPUT_PATH}  ({n_total - skipped} positions)")


if __name__ == "__main__":
    main()
