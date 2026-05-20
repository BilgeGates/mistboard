"""Post-game PvE analysis harness.

Given a finished PvE game's room ID (or a local events JSONL), fetches the
event log, replays the engine's perspective through Tier1Strategy with trace
capture, scores each engine move by case-1-blunder fingerprint, and renders
an HTML report with board diagrams + per-knob ablation drill-downs.

Usage:
    # From local dev server:
    .venv/bin/python3 scripts/analyze_pve_game.py \\
        --room-id <id> --engine-color black \\
        --out /tmp/game-analysis

    # From a local JSONL (e.g., bakeoff replay):
    .venv/bin/python3 scripts/analyze_pve_game.py \\
        --events /path/to/game.jsonl --engine-color black \\
        --out /tmp/game-analysis
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import chess
import chess.svg

_LAB_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_LAB_ROOT / "src"))

from fow_chess.engine import static_builder
from fow_chess.evaluator import fow_evaluator
from fow_chess.event_log import iter_steps
from fow_chess.move_priors import uniform_prior
from fow_chess.observation import observation_from_transition
from fow_chess.selfplay import PerspectiveView
from fow_chess.strategies import Tier1Strategy
from fow_chess.visibility import visible_piece_map, visible_squares

# -------------------------------------------------------------------
# Event-log fetching
# -------------------------------------------------------------------


def fetch_events_from_server(server_url: str, room_id: str) -> list[dict[str, Any]]:
    url = f"{server_url.rstrip('/')}/api/games/{room_id}/events"
    with urllib.request.urlopen(url, timeout=10) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    # The /api/games/:id/events response shape: { events: [...], ... }
    if isinstance(body, dict) and "events" in body:
        return body["events"]
    if isinstance(body, list):
        return body
    raise ValueError(f"unexpected response shape from {url}: {type(body)}")


def load_events_from_file(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.open() if line.strip()]


# -------------------------------------------------------------------
# Replay + trace
# -------------------------------------------------------------------


def _make_strategy(seed: int = 2026, **overrides) -> Tier1Strategy:
    """Tier1Strategy with v0.9.5 production defaults. Overrides for ablation."""
    kwargs = dict(
        evaluator_builder=static_builder(fow_evaluator()),
        move_prior=uniform_prior,
        target_n=256,
        max_eval_particles=16,
        risk_aversion=0.0,
        seed=seed,
        mcts_rollouts=0,
        capture_risk_penalty_coef=10.0,
        anti_shuffle_penalty=20.0,
        anti_shuffle_window=4,
        queen_fog_risk_threshold=0.20,
        piece_fog_risk_threshold=0.25,
        push_when_ahead_bonus=200.0,
        push_when_ahead_min_edge=3.0,
        info_reveal_bonus_coef=25.0,
        anti_shuffle_penalty_strong=250.0,
    )
    kwargs.update(overrides)
    return Tier1Strategy(**kwargs)


def _build_perspective_view(board: chess.Board, perspective: chess.Color) -> PerspectiveView:
    work = board.copy()
    work.turn = perspective
    own_legal = list(work.pseudo_legal_moves)
    vs = visible_squares(board, perspective)
    vpm = visible_piece_map(board, perspective)
    return PerspectiveView(
        perspective=perspective,
        own_legal_moves=own_legal,
        visible_squares=vs,
        visible_piece_map=vpm,
    )


@dataclass
class MoveTrace:
    """One engine move with surrounding context for analysis."""
    ply: int
    canonical_before_fen: str
    canonical_after_fen: str
    actual_move_uci: str
    decision_path: str | None
    top_k: list[tuple[str, float, float]] = field(default_factory=list)
    n_particles: int = 0
    belief_truth_in_set: bool = False
    # Belief diagnostics about the move destination:
    p_dest_attacked_in_belief: float = 0.0  # P(some opp attacks dest in belief)
    risk_recapture: float = 0.0             # P(landed piece is recapturable in belief)
    # Per-bonus contributions (estimated):
    info_reveal_squares: int = 0            # delta visible squares from the move
    is_forward_progress: bool = False
    visible_attacker_at_dest: bool = False  # ground truth: is dest attacked by a visible-from-truth opp?


def _replay_one_strategy(
    events: list[dict],
    perspective: chess.Color,
    overrides: dict | None = None,
    seed: int = 2026,
) -> list[MoveTrace]:
    """Replay engine's perspective through Tier1Strategy with trace, return per-move records."""
    strategy = _make_strategy(seed=seed, **(overrides or {}))
    strategy.reset(perspective)

    traces: list[MoveTrace] = []

    for step in iter_steps(events, perspective):
        if step.own_move is None:
            # Opp (human) moved; just update belief.
            strategy.observe_opp_move(step.opp_observation)
            continue

        # Engine's turn. Reconstruct view BEFORE the move, call pick_move,
        # then capture trace + apply the observation to advance the belief.
        view = _build_perspective_view(step.canonical_before, perspective)
        # Call pick_move to get the trace for what THIS config would pick.
        # The actual move from the game log is `step.own_move`.
        try:
            picked = strategy.pick_move(view)
        except Exception as e:  # noqa: BLE001
            picked = step.own_move
        trace_log = strategy.trace_log[-1] if strategy.trace_log else {}

        # Belief diagnostics about the move that was ACTUALLY PLAYED in the game.
        n_particles = len(strategy._belief.particles) if strategy._belief else 0
        truth_in_set = False
        p_attacked = 0.0
        if strategy._belief and strategy._belief.particles:
            truth_pieces = step.canonical_before.piece_map()
            truth_in_set = any(p.piece_map() == truth_pieces for p in strategy._belief.particles)
            total_w = sum(strategy._belief.weights) or 1.0
            attacked_w = 0.0
            for particle, w in zip(strategy._belief.particles, strategy._belief.weights):
                work = particle.copy()
                work.turn = not perspective
                if any(m.to_square == step.own_move.to_square for m in work.pseudo_legal_moves):
                    attacked_w += w
            p_attacked = attacked_w / total_w

        # P(piece survives) via the strategy's own capture-risk-map calculation.
        risk_recapture = 0.0
        try:
            rm = strategy._compute_capture_risk_map([step.own_move], view)
            risk_recapture = rm.get(step.own_move, 0.0)
        except Exception:  # noqa: BLE001
            pass

        # Visibility delta from the move (proxy for info_reveal bonus magnitude).
        info_reveal_squares = 0
        try:
            pre_vis = strategy._cached_visibility_count(view)
            info_reveal_squares = strategy._move_visibility_delta(step.own_move, view, pre_vis)
        except Exception:  # noqa: BLE001
            pass

        is_forward = False
        try:
            is_forward = strategy._is_forward_progress(step.own_move, perspective)
        except Exception:  # noqa: BLE001
            pass

        # Ground-truth: is the destination attacked by a piece the player CAN SEE
        # in the true world? Filter out non-capturing pawn pushes — a pawn push
        # can't capture an occupied destination, so it's not a real "attacker."
        truth_work = step.canonical_before.copy()
        truth_work.turn = not perspective
        truth_visible_to_own = visible_squares(step.canonical_before, perspective)
        dest_sq = step.own_move.to_square
        visible_attacker_at_dest = False
        for m in truth_work.pseudo_legal_moves:
            if m.to_square != dest_sq:
                continue
            if m.from_square not in truth_visible_to_own:
                continue
            piece = truth_work.piece_at(m.from_square)
            if piece is None:
                continue
            # Pawn moves that change FILE are captures; same-file is a push.
            if piece.piece_type == chess.PAWN and chess.square_file(m.from_square) == chess.square_file(m.to_square):
                continue  # pawn push, not an attack
            visible_attacker_at_dest = True
            break

        traces.append(MoveTrace(
            ply=step.ply,
            canonical_before_fen=step.canonical_before.fen(),
            canonical_after_fen=step.canonical_after.fen(),
            actual_move_uci=step.own_move.uci(),
            decision_path=trace_log.get("decision_path"),
            top_k=[tuple(t) for t in (trace_log.get("top_k_scores") or [])],
            n_particles=n_particles,
            belief_truth_in_set=truth_in_set,
            p_dest_attacked_in_belief=p_attacked,
            risk_recapture=risk_recapture,
            info_reveal_squares=info_reveal_squares,
            is_forward_progress=is_forward,
            visible_attacker_at_dest=visible_attacker_at_dest,
        ))

        # Now apply the ACTUAL move that the game played (so the strategy stays in sync
        # with what the user-game actually did, even if THIS config would have picked
        # a different move).
        actual_obs = observation_from_transition(step.canonical_before, step.canonical_after, perspective)
        strategy.observe_own_move(step.own_move, actual_obs)

    return traces


# -------------------------------------------------------------------
# Suspicion scoring
# -------------------------------------------------------------------


def score_suspicion(trace: MoveTrace) -> tuple[float, list[str]]:
    """Heuristic score for case-1-blunder fingerprint. Higher = more suspicious. Returns (score, reasons)."""
    reasons: list[str] = []
    score = 0.0

    # Only main-eval path can have this bug (defensive tiers don't touch info_reveal).
    if trace.decision_path != "main-eval":
        return (0.0, ["non-main-eval path"])

    # Significant info_reveal contribution.
    if trace.info_reveal_squares >= 8:
        score += 2.0
        reasons.append(f"info_reveal: {trace.info_reveal_squares} new squares (~{trace.info_reveal_squares * 25} cp bonus)")
    elif trace.info_reveal_squares >= 4:
        score += 1.0
        reasons.append(f"info_reveal: {trace.info_reveal_squares} squares")

    # Nontrivial belief-attack at destination (eval saw the risk).
    if trace.p_dest_attacked_in_belief >= 0.10:
        score += 1.5
        reasons.append(f"belief: {trace.p_dest_attacked_in_belief*100:.0f}% of particles say dest attacked")
    elif trace.p_dest_attacked_in_belief >= 0.02:
        score += 0.7
        reasons.append(f"belief: {trace.p_dest_attacked_in_belief*100:.1f}% of particles say dest attacked (low but non-zero)")

    # Recapture risk on landing square.
    if trace.risk_recapture >= 0.10:
        score += 1.5
        reasons.append(f"risk_recapture: {trace.risk_recapture*100:.0f}%")
    elif trace.risk_recapture >= 0.02:
        score += 0.7
        reasons.append(f"risk_recapture: {trace.risk_recapture*100:.1f}% (low but non-zero)")

    # Ground-truth confirmation: destination is actually attacked by a visible-to-own opp.
    if trace.visible_attacker_at_dest:
        score += 2.0
        reasons.append("GROUND TRUTH: dest attacked by a piece engine SHOULD be able to see")

    # Forward-progress amplifier (push_when_ahead can stack on top).
    if trace.is_forward_progress:
        score += 0.3
        reasons.append("forward-progress (push_when_ahead may fire if ahead)")

    # Belief truth-in-set bonus penalty (if truth is out of belief, engine is blind).
    if not trace.belief_truth_in_set:
        score += 0.3
        reasons.append("truth not in particle set")

    return (score, reasons)


# -------------------------------------------------------------------
# Per-flagged-move ablation
# -------------------------------------------------------------------


def _replay_to_ply(strategy: Tier1Strategy, events: list[dict], perspective: chess.Color, target_ply: int):
    strategy.reset(perspective)
    canonical_before = None
    for step in iter_steps(events, perspective):
        if step.ply >= target_ply:
            canonical_before = step.canonical_before
            break
        if step.own_move is not None:
            obs = observation_from_transition(step.canonical_before, step.canonical_after, perspective)
            strategy.observe_own_move(step.own_move, obs)
        else:
            strategy.observe_opp_move(step.opp_observation)
    return canonical_before


def ablate_at_ply(events: list[dict], perspective: chess.Color, ply: int) -> dict[str, str]:
    """Return {label: chosen_uci} for several ablations at the given ply."""
    configs = {
        "baseline (v0.9.5)": {},
        "info_reveal=5": {"info_reveal_bonus_coef": 5.0},
        "info_reveal=0": {"info_reveal_bonus_coef": 0.0},
        "all post-eval off": {
            "capture_risk_penalty_coef": 0.0,
            "anti_shuffle_penalty": 0.0,
            "anti_shuffle_penalty_strong": 0.0,
            "push_when_ahead_bonus": 0.0,
            "info_reveal_bonus_coef": 0.0,
        },
    }
    results = {}
    for label, overrides in configs.items():
        strategy = _make_strategy(**overrides)
        canonical_before = _replay_to_ply(strategy, events, perspective, ply)
        if canonical_before is None:
            results[label] = "(ply not reached)"
            continue
        view = _build_perspective_view(canonical_before, perspective)
        try:
            chosen = strategy.pick_move(view)
            results[label] = chosen.uci()
        except Exception as e:  # noqa: BLE001
            results[label] = f"(error: {e})"
    return results


# -------------------------------------------------------------------
# HTML rendering
# -------------------------------------------------------------------


def render_html(
    out_dir: Path,
    room_id: str,
    perspective: chess.Color,
    traces: list[MoveTrace],
    flagged: list[tuple[MoveTrace, float, list[str]]],
    ablations: dict[int, dict[str, str]],
) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "report.html"

    def board_svg(fen: str, last_move: chess.Move | None = None, perspective_white: bool = True) -> str:
        b = chess.Board(fen)
        kwargs = {"size": 280, "coordinates": True, "flipped": not perspective_white}
        if last_move is not None:
            kwargs["lastmove"] = last_move
        return chess.svg.board(b, **kwargs)

    persp_str = "white" if perspective == chess.WHITE else "black"
    parts = [f"""<!doctype html>
<html><head><meta charset="utf-8"><title>PvE analysis — {room_id}</title>
<style>
body {{ font-family: -apple-system, ui-sans-serif, sans-serif; max-width: 1100px; margin: 1.5rem auto; padding: 0 1rem; color: #222; }}
h1 {{ margin-bottom: 0.3rem; }}
h2 {{ border-bottom: 1px solid #ddd; padding-bottom: 0.2rem; margin-top: 2rem; }}
.summary {{ background: #f8f8f8; padding: 0.8rem 1rem; border-radius: 8px; margin: 1rem 0; }}
.move-card {{ border: 1px solid #ddd; border-radius: 8px; padding: 1rem; margin: 1rem 0; display: grid; grid-template-columns: 320px 1fr; gap: 1rem; }}
.move-card.flagged {{ border-color: #e26d2d; background: #fff8f3; }}
.metrics table {{ border-collapse: collapse; font-size: 0.9rem; }}
.metrics td {{ padding: 0.15rem 0.5rem; }}
.metrics td:first-child {{ color: #666; }}
.reasons {{ color: #b94d10; font-size: 0.9rem; margin: 0.5rem 0; }}
.ablation table {{ border-collapse: collapse; font-size: 0.9rem; }}
.ablation td, .ablation th {{ padding: 0.2rem 0.6rem; border: 1px solid #ddd; }}
.ablation th {{ background: #f0f0f0; }}
.ablation td.match {{ background: #fff3eb; }}
code {{ background: #f0f0f0; padding: 0.1rem 0.3rem; border-radius: 3px; }}
</style></head><body>
<h1>PvE analysis — {room_id}</h1>
<p>Engine perspective: <strong>{persp_str}</strong>. Total engine moves: {len(traces)}. Flagged (suspicious) moves: {len(flagged)}.</p>

<div class="summary">
<strong>Methodology:</strong> Each engine move was replayed through Tier1Strategy with trace capture.
A move is "flagged" if its case-1-fingerprint score exceeds 2.5: main-eval path + significant
info_reveal squares + non-trivial belief-attack-prob OR recapture-risk at destination. Top suspects
shown below with per-knob ablation (what would the engine pick under different post-eval configs).
</div>
"""]

    parts.append("<h2>Flagged moves</h2>")
    if not flagged:
        parts.append("<p><em>No moves crossed the suspicion threshold. Engine's choices look clean.</em></p>")

    for trace, score, reasons in flagged:
        try:
            last_move = chess.Move.from_uci(trace.actual_move_uci)
        except ValueError:
            last_move = None
        svg = board_svg(trace.canonical_after_fen, last_move=last_move, perspective_white=(perspective == chess.WHITE))
        ablation = ablations.get(trace.ply, {})

        # Top-k formatted (defensive against type variance in trace_log)
        top_k_html = ""
        if trace.top_k:
            row_strs = []
            for entry in trace.top_k[:5]:
                if not entry:
                    continue
                m = str(entry[0]) if len(entry) > 0 else "?"
                try:
                    s = float(entry[1]) if len(entry) > 1 else 0.0
                except (TypeError, ValueError):
                    s = 0.0
                try:
                    sup = float(entry[2]) if len(entry) > 2 else 0.0
                except (TypeError, ValueError):
                    sup = 0.0
                row_strs.append(f"<tr><td>{m}</td><td>{s:+.1f}</td><td>{sup:.3f}</td></tr>")
            top_k_html = f"<table>{''.join(row_strs)}</table>" if row_strs else "<em>(empty)</em>"
        else:
            top_k_html = "<em>no top-K (defensive tier or early return)</em>"

        ablation_rows = "".join(
            f'<tr><td>{label}</td><td class="{"match" if mv == trace.actual_move_uci else ""}">{mv}</td></tr>'
            for label, mv in ablation.items()
        )
        ablation_html = f"<table><tr><th>config</th><th>chosen</th></tr>{ablation_rows}</table>" if ablation_rows else "<em>n/a</em>"

        reasons_html = "<br>".join(reasons)
        parts.append(f"""
<div class="move-card flagged">
  <div>{svg}</div>
  <div>
    <h3>ply {trace.ply}: <code>{trace.actual_move_uci}</code> · suspicion {score:.1f}</h3>
    <div class="reasons"><strong>Why flagged:</strong><br>{reasons_html}</div>
    <div class="metrics"><table>
      <tr><td>decision_path</td><td><code>{trace.decision_path}</code></td></tr>
      <tr><td>n_particles</td><td>{trace.n_particles}</td></tr>
      <tr><td>truth in belief?</td><td>{trace.belief_truth_in_set}</td></tr>
      <tr><td>P(dest attacked in belief)</td><td>{trace.p_dest_attacked_in_belief*100:.1f}%</td></tr>
      <tr><td>risk_recapture (computed by strategy)</td><td>{trace.risk_recapture*100:.1f}%</td></tr>
      <tr><td>info_reveal squares</td><td>{trace.info_reveal_squares} (~{trace.info_reveal_squares*25}cp at coef=25)</td></tr>
      <tr><td>visible attacker at dest (truth)</td><td>{trace.visible_attacker_at_dest}</td></tr>
      <tr><td>forward progress</td><td>{trace.is_forward_progress}</td></tr>
    </table></div>
    <h4>Top moves by best_action score</h4>
    {top_k_html}
    <h4>Per-knob ablation: what does the engine pick here?</h4>
    <div class="ablation">{ablation_html}</div>
  </div>
</div>
""")

    parts.append("<h2>All engine moves (overview)</h2>")
    parts.append("<table><tr><th>ply</th><th>move</th><th>decision_path</th><th>n_part</th><th>truth_in_set</th><th>P(dest atk)</th><th>reveal sq</th><th>suspicion</th></tr>")
    for trace in traces:
        s, _ = score_suspicion(trace)
        parts.append(
            f"<tr><td>{trace.ply}</td><td><code>{trace.actual_move_uci}</code></td>"
            f"<td>{trace.decision_path}</td><td>{trace.n_particles}</td>"
            f"<td>{trace.belief_truth_in_set}</td>"
            f"<td>{trace.p_dest_attacked_in_belief*100:.0f}%</td>"
            f"<td>{trace.info_reveal_squares}</td>"
            f"<td>{s:.1f}</td></tr>"
        )
    parts.append("</table>")

    parts.append("</body></html>")
    out_path.write_text("\n".join(parts), encoding="utf-8")
    return out_path


# -------------------------------------------------------------------
# Main
# -------------------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--room-id", help="Fetch events from --server-url for this room.")
    src.add_argument("--events", type=Path, help="Read events from a local JSONL.")
    ap.add_argument("--server-url", default="http://localhost:3001",
                    help="Base URL of local dev server (default http://localhost:3001).")
    ap.add_argument("--engine-color", choices=("white", "black"), default="black",
                    help="Color the engine played (default black).")
    ap.add_argument("--out", type=Path, default=Path("/tmp/pve-analysis"))
    ap.add_argument("--suspicion-threshold", type=float, default=2.5,
                    help="Flag moves whose suspicion score >= this (default 2.5).")
    args = ap.parse_args()

    perspective = chess.WHITE if args.engine_color == "white" else chess.BLACK

    if args.room_id:
        print(f"Fetching events for room {args.room_id} from {args.server_url}...")
        events = fetch_events_from_server(args.server_url, args.room_id)
    else:
        print(f"Loading events from {args.events}...")
        events = load_events_from_file(args.events)
    print(f"  loaded {len(events)} events")

    print("Replaying engine perspective with trace capture...")
    traces = _replay_one_strategy(events, perspective)
    print(f"  captured {len(traces)} engine moves")

    # Score + flag
    flagged: list[tuple[MoveTrace, float, list[str]]] = []
    for trace in traces:
        score, reasons = score_suspicion(trace)
        if score >= args.suspicion_threshold:
            flagged.append((trace, score, reasons))
    flagged.sort(key=lambda t: -t[1])
    print(f"  flagged {len(flagged)} suspicious moves (threshold={args.suspicion_threshold})")

    # Ablate at flagged plies
    print("Running per-knob ablations at flagged plies...")
    ablations: dict[int, dict[str, str]] = {}
    for trace, _, _ in flagged:
        print(f"  ply {trace.ply}: ", end="", flush=True)
        ablations[trace.ply] = ablate_at_ply(events, perspective, trace.ply)
        print(", ".join(f"{k}={v}" for k, v in ablations[trace.ply].items()))

    room_id = args.room_id or args.events.stem
    out_path = render_html(args.out, room_id, perspective, traces, flagged, ablations)
    print(f"\n→ report: {out_path}")
    print(f"  open: file://{out_path.resolve()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
