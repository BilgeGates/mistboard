"""Inspect particle-filter belief evolution through a Fog of War game.

Replays the events of one bichess FOW game, runs a parallel `BeliefState` from
the chosen perspective, and emits per-ply diagnostics + a side-by-side HTML
render of canonical truth vs the perspective's belief.

The HTML shows two boards per ply: the canonical position on the left, and a
"belief board" on the right with the perspective's visible pieces plus a red
shading on hidden squares proportional to opponent-piece probability mass.
Plies where the canonical truth has fallen out of the particle set are
highlighted.

Usage:
    .venv/bin/python scripts/inspect_belief.py <events.jsonl> --perspective white \\
        --out /tmp/belief-game42 [--target-n 256]

Outputs:
    <out>/diagnostics.csv
    <out>/index.html
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import random
import sys
from dataclasses import dataclass
from pathlib import Path

import chess
import chess.svg

_LAB_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_LAB_ROOT / "src"))

from fow_chess.belief import BeliefState
from fow_chess.event_log import iter_steps
from fow_chess.move_priors import uniform_prior
from fow_chess.visibility import visible_squares


@dataclass
class PlyDiagnostic:
    ply: int
    actor: str  # "own_move" | "opp_observation"
    particle_count: int
    unique_particles: int
    marginal_entropy_bits: float
    truth_in_set: bool


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("events", type=Path, help="Path to events JSONL file")
    parser.add_argument(
        "--perspective", choices=("white", "black"), required=True
    )
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--target-n", type=int, default=256)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument(
        "--top-k",
        type=int,
        default=6,
        help="Render the top-K unique particle boards (by population) per ply. "
        "0 to disable.",
    )
    parser.add_argument(
        "--no-html",
        action="store_true",
        help="Skip HTML rendering; emit only diagnostics.csv. Useful for "
        "cross-game aggregate passes.",
    )
    args = parser.parse_args()

    perspective = chess.WHITE if args.perspective == "white" else chess.BLACK
    args.out.mkdir(parents=True, exist_ok=True)

    with args.events.open() as fh:
        events = [json.loads(line) for line in fh if line.strip()]

    belief = BeliefState.initial(
        perspective=perspective,
        move_prior=uniform_prior,
        target_n=args.target_n,
        rng=random.Random(args.seed),
    )

    diagnostics: list[PlyDiagnostic] = []
    html_sections: list[str] = []

    for step in iter_steps(events, perspective):
        if step.own_move is not None:
            belief.update_after_own_move(step.own_move)
            actor = "own_move"
        else:
            assert step.opp_observation is not None
            belief.update_after_opp_move(step.opp_observation)
            actor = "opp_observation"

        diag = _compute_diagnostic(
            ply=step.ply,
            actor=actor,
            belief=belief,
            canonical=step.canonical_after,
        )
        diagnostics.append(diag)
        if not args.no_html:
            html_sections.append(
                _render_ply_html(
                    step=step,
                    belief=belief,
                    perspective=perspective,
                    diag=diag,
                    top_k=args.top_k,
                )
            )

    _write_csv(args.out / "diagnostics.csv", diagnostics)
    if not args.no_html:
        _write_html(
            args.out / "index.html",
            sections=html_sections,
            diagnostics=diagnostics,
            events_name=args.events.name,
            perspective_name=args.perspective,
            target_n=args.target_n,
        )

    print(f"plies inspected:        {len(diagnostics)}")
    print(
        f"truth-in-set plies:     "
        f"{sum(1 for d in diagnostics if d.truth_in_set)}/{len(diagnostics)}"
    )
    truth_lost_at = next(
        (d.ply for d in diagnostics if not d.truth_in_set), None
    )
    if truth_lost_at is not None:
        print(f"truth fell out at ply:  {truth_lost_at}")
    print(f"output:                 {args.out}/index.html")
    return 0


def _compute_diagnostic(
    *,
    ply: int,
    actor: str,
    belief: BeliefState,
    canonical: chess.Board,
) -> PlyDiagnostic:
    if not belief.particles:
        return PlyDiagnostic(
            ply=ply,
            actor=actor,
            particle_count=0,
            unique_particles=0,
            marginal_entropy_bits=0.0,
            truth_in_set=False,
        )
    truth_pieces = canonical.piece_map()
    truth_in_set = any(p.piece_map() == truth_pieces for p in belief.particles)
    fens = {p.fen() for p in belief.particles}
    return PlyDiagnostic(
        ply=ply,
        actor=actor,
        particle_count=len(belief.particles),
        unique_particles=len(fens),
        marginal_entropy_bits=_marginal_entropy(belief),
        truth_in_set=truth_in_set,
    )


def _marginal_entropy(belief: BeliefState) -> float:
    """Sum of per-square marginal entropies in bits.

    For each square, compute H over the (piece-or-empty) distribution implied
    by particle weights. Squares where every particle agrees contribute 0.
    """
    total = 0.0
    for sq in chess.SQUARES:
        marg = belief.marginal_piece_at(sq)
        for p in marg.values():
            if p > 0.0:
                total -= p * math.log2(p)
    return total


def _render_ply_html(
    *,
    step,
    belief: BeliefState,
    perspective: chess.Color,
    diag: PlyDiagnostic,
    top_k: int,
) -> str:
    canonical_svg = chess.svg.board(
        step.canonical_after,
        size=320,
        orientation=perspective,
    )
    belief_svg = _render_belief_svg(
        belief=belief,
        canonical=step.canonical_after,
        perspective=perspective,
    )
    truth_label = "✓" if diag.truth_in_set else "✗ truth out of set"
    section_class = "ply" if diag.truth_in_set else "ply truth-lost"
    top_html = (
        _render_top_particles_html(
            belief=belief,
            canonical=step.canonical_after,
            perspective=perspective,
            k=top_k,
        )
        if top_k > 0 and diag.unique_particles > 1
        else ""
    )
    return f"""
    <section class="{section_class}" id="ply-{diag.ply}">
      <h3>ply {diag.ply} — {diag.actor}</h3>
      <p>
        particles: {diag.particle_count} ({diag.unique_particles} unique),
        marginal entropy: {diag.marginal_entropy_bits:.2f} bits,
        truth in set: {truth_label}
      </p>
      <div class="boards">
        <div><h4>canonical truth</h4>{canonical_svg}</div>
        <div><h4>belief (opp marginals shaded)</h4>{belief_svg}</div>
      </div>
      {top_html}
    </section>
    """


def _render_top_particles_html(
    *,
    belief: BeliefState,
    canonical: chess.Board,
    perspective: chess.Color,
    k: int,
) -> str:
    """Render the top-K most-populated unique particle worlds as a row of mini-boards.

    If the canonical truth is in the set but doesn't fall in the top K (common
    early-game when populations are spread thin), it's appended as an extra
    card so the truth comparison stays visible.
    """
    groups = _group_particles_by_piece_map(belief)
    if not groups:
        return ""
    truth_key = _piece_map_key(canonical)
    top = list(groups[:k])
    truth_in_set = any(key == truth_key for key, _ in groups)
    truth_in_top = any(key == truth_key for key, _ in top)
    appended_truth = False
    if truth_in_set and not truth_in_top:
        for key, val in groups:
            if key == truth_key:
                top.append((key, val))
                appended_truth = True
                break

    cards: list[str] = []
    for key, (board, count) in top:
        is_truth = key == truth_key
        svg = chess.svg.board(board, size=180, orientation=perspective)
        truth_marker = (
            " · <strong style='color:#2a2;'>TRUTH</strong>" if is_truth else ""
        )
        border = "3px solid #2a2" if is_truth else "1px solid #ccc"
        cards.append(
            f'<div style="border: {border}; padding: 4px; background: #fafafa;">'
            f'<div>{svg}</div>'
            f'<div style="font-size: 11px; text-align: center; padding-top: 2px;">'
            f'{count} particle{"" if count == 1 else "s"}{truth_marker}'
            f'</div>'
            f'</div>'
        )
    total_unique = len(groups)
    shown = min(k, total_unique)
    header = f"top {shown} of {total_unique} unique worlds"
    if appended_truth:
        header += " (+ truth, appended)"
    elif truth_in_set:
        header += " · truth in top"
    return (
        f'<details style="margin-top: 8px;"><summary style="cursor: pointer;'
        f' font-size: 12px; color: #555;">{header}</summary>'
        f'<div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px;">'
        f'{"".join(cards)}</div></details>'
    )


def _group_particles_by_piece_map(
    belief: BeliefState,
) -> list[tuple[tuple, tuple[chess.Board, int]]]:
    """Group particles by piece-map; return (key, (representative_board, count)), sorted desc by count."""
    groups: dict[tuple, tuple[chess.Board, int]] = {}
    for board in belief.particles:
        key = _piece_map_key(board)
        if key in groups:
            b, c = groups[key]
            groups[key] = (b, c + 1)
        else:
            groups[key] = (board, 1)
    return sorted(groups.items(), key=lambda item: -item[1][1])


def _piece_map_key(board: chess.Board) -> tuple:
    return tuple(
        sorted(
            (sq, piece.piece_type, piece.color)
            for sq, piece in board.piece_map().items()
        )
    )


def _render_belief_svg(
    *,
    belief: BeliefState,
    canonical: chess.Board,
    perspective: chess.Color,
) -> str:
    """Board with perspective's visible pieces + opp marginals as red shading."""
    visible = visible_squares(canonical, perspective)
    vis_board = chess.Board.empty()
    for sq, piece in canonical.piece_map().items():
        if sq in visible:
            vis_board.set_piece_at(sq, piece)
    vis_board.turn = canonical.turn

    opp_color = not perspective
    fill: dict[chess.Square, str] = {}
    for sq in chess.SQUARES:
        if sq in visible:
            continue
        marg = belief.marginal_piece_at(sq)
        opp_p = sum(
            p
            for piece, p in marg.items()
            if piece is not None and piece.color == opp_color
        )
        if opp_p > 0.05:
            # Intensity 100..255 across opp_p ∈ [0.05, 1.0].
            intensity = int(100 + 155 * min(opp_p, 1.0))
            fill[sq] = f"#{intensity:02x}3030"

    return chess.svg.board(
        vis_board,
        size=320,
        orientation=perspective,
        fill=fill,
    )


def _write_csv(path: Path, diagnostics: list[PlyDiagnostic]) -> None:
    with path.open("w", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(
            [
                "ply",
                "actor",
                "particle_count",
                "unique_particles",
                "marginal_entropy_bits",
                "truth_in_set",
            ]
        )
        for d in diagnostics:
            writer.writerow(
                [
                    d.ply,
                    d.actor,
                    d.particle_count,
                    d.unique_particles,
                    f"{d.marginal_entropy_bits:.4f}",
                    int(d.truth_in_set),
                ]
            )


def _write_html(
    path: Path,
    *,
    sections: list[str],
    diagnostics: list[PlyDiagnostic],
    events_name: str,
    perspective_name: str,
    target_n: int,
) -> None:
    truth_lost_at = next(
        (d.ply for d in diagnostics if not d.truth_in_set), None
    )
    truth_summary = (
        f"truth in particle set throughout all {len(diagnostics)} plies"
        if truth_lost_at is None
        else f"truth fell out of belief at ply {truth_lost_at}"
    )
    summary = (
        f"events={events_name}, perspective={perspective_name}, "
        f"target_n={target_n}, plies={len(diagnostics)}"
    )
    html = f"""<!doctype html>
<html><head><meta charset="utf-8">
<title>belief inspection: {events_name} {perspective_name}</title>
<style>
  body {{
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    margin: 24px; max-width: 920px; color: #111;
  }}
  h1 {{ font-size: 22px; margin-bottom: 4px; }}
  h3 {{ border-bottom: 1px solid #ccc; padding-bottom: 4px; }}
  h4 {{ margin: 4px 0; font-weight: 500; color: #555; }}
  p.summary {{ font-family: monospace; font-size: 12px; color: #333; }}
  section.ply {{ scroll-margin-top: 16px; }}
  section.truth-lost {{ background: #fff4f4; padding: 8px 12px; }}
  section.truth-lost h3 {{ color: #b00020; }}
  div.boards {{ display: flex; gap: 24px; align-items: flex-start; }}
</style>
</head><body>
<h1>Belief inspection</h1>
<p class="summary">{summary}</p>
<p class="summary">{truth_summary}</p>
{"".join(sections)}
</body></html>
"""
    path.write_text(html)


if __name__ == "__main__":
    raise SystemExit(main())
