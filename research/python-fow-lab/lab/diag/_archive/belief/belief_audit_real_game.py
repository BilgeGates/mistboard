"""Belief filter audit on a real FoW game replay.

Replays a recorded PvP/sample game through the production BeliefState
from one player's perspective. At each ply, dumps diagnostics that
answer: is the particle filter tracking truth, or drifting?

Per ply we record:
- particle_count          — total particles after the update
- unique_particles        — distinct truth-board FENs
- posterior_top1_mass     — how concentrated belief is on its top hypothesis
- posterior_entropy_norm  — normalized entropy of posterior across particles
- truth_in_belief         — was the actual truth board one of the particles?
- truth_marginal_l1       — L1 distance between belief marginals and truth (0=perfect)
- repairs_fired           — Stage A + Stage B repair events
- csp_reseed_fired        — emergency CSP reseed events
- jitter_fired            — jitter-augmentation events
- elapsed_ms              — per-update wall time

If truth_in_belief drops to False, belief has lost track of reality.
If truth_marginal_l1 climbs steadily, belief is drifting. If repairs
or reseeds fire repeatedly, the filter is unstable.

Usage:
    PYTHONPATH=src .venv/bin/python lab/diag/belief_audit_real_game.py \\
        --replay /path/to/sample-1.jsonl --perspective white

Output:
    lab/diag/belief-audit-<game>-<perspective>.json (raw per-ply data)
    lab/diag/belief-audit-<game>-<perspective>.md   (human-readable summary)
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import chess

from fow_chess.belief import BeliefState
from fow_chess.move_priors import uniform_prior
from fow_chess.observation import observation_from_transition


DIAG_DIR = Path(__file__).parent


def _read_replay(path: Path) -> list[dict]:
    events = []
    with path.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            events.append(json.loads(line))
    return events


def _extract_moves(events: list[dict]) -> list[chess.Move]:
    """Pull (color, Move) tuples from the event stream in order."""
    moves: list[chess.Move] = []
    for e in events:
        if e.get("type") != "move-played":
            continue
        mv = e.get("move", {})
        frm = mv.get("from")
        to = mv.get("to")
        promo = mv.get("promotion")
        if frm is None or to is None:
            continue
        uci = f"{frm}{to}"
        if promo:
            uci += promo.lower()
        moves.append(chess.Move.from_uci(uci))
    return moves


def _truth_marginals(board: chess.Board, perspective: chess.Color) -> dict:
    """Return {square: (color, piece_type)} for opp pieces only."""
    opp = not perspective
    return {
        sq: (p.color, p.piece_type)
        for sq, p in board.piece_map().items()
        if p.color == opp
    }


def _belief_l1_to_truth(
    belief: BeliefState, truth: chess.Board, perspective: chess.Color
) -> float:
    """L1 distance: sum over opp pieces of |truth_indicator - belief_marginal|.

    Truth marginal at (sq, piece) is 1 if opp piece of that type is there, 0
    otherwise. Belief marginal is the particle-filter's probability for the
    same. We sum |delta| over the 64×6 opp-piece-type grid.
    """
    opp = not perspective
    opp_piece_types = (
        chess.PAWN, chess.KNIGHT, chess.BISHOP,
        chess.ROOK, chess.QUEEN, chess.KING,
    )
    total = 0.0
    truth_set = {(sq, p.piece_type) for sq, p in truth.piece_map().items() if p.color == opp}
    for sq in chess.SQUARES:
        m = belief.marginal_piece_at(sq)
        for pt in opp_piece_types:
            piece = chess.Piece(pt, opp)
            belief_prob = m.get(piece, 0.0)
            truth_indicator = 1.0 if (sq, pt) in truth_set else 0.0
            total += abs(truth_indicator - belief_prob)
    return total


def _truth_in_belief(belief: BeliefState, truth: chess.Board) -> bool:
    truth_fen = truth.board_fen()
    return any(p.board_fen() == truth_fen for p in belief.particles)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--replay", type=Path, required=True)
    parser.add_argument("--perspective", choices=["white", "black"], default="white")
    parser.add_argument("--target-n", type=int, default=256,
                        help="BeliefState target particle count (default matches prod)")
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()

    perspective = chess.WHITE if args.perspective == "white" else chess.BLACK
    events = _read_replay(args.replay)
    moves = _extract_moves(events)
    print(f"Replay: {args.replay.name} — {len(moves)} moves, audit from {args.perspective}'s perspective")

    truth = chess.Board()
    belief = BeliefState.initial(
        perspective=perspective,
        move_prior=uniform_prior,
        target_n=args.target_n,
        start_board=truth,
        rng=random.Random(42),
    )

    rows: list[dict] = []
    rows.append({
        "ply": 0,
        "to_move": "white",
        "applied": "<initial>",
        "particle_count": len(belief.particles),
        "unique_particles": len({p.board_fen() for p in belief.particles}),
        "truth_in_belief": _truth_in_belief(belief, truth),
        "truth_marginal_l1": _belief_l1_to_truth(belief, truth, perspective),
        "posterior_top1_mass": 1.0,
        "posterior_entropy_norm": 0.0,
        "repairs_fired": 0,
        "csp_reseed_fired": 0,
        "jitter_fired": 0,
        "stage_a_elapsed_ms": 0.0,
        "stage_b_elapsed_ms": 0.0,
    })

    for i, move in enumerate(moves, start=1):
        prev_truth = truth.copy()
        truth.push(move)

        obs = observation_from_transition(prev_truth, truth, perspective)
        mover_color = prev_truth.turn

        if mover_color == perspective:
            belief.update_after_own_move(move, observation=obs)
            stage_a_ms = belief.last_stage_a_elapsed_ms
            stage_b_ms = 0.0
        else:
            belief.update_after_opp_move(obs)
            stage_a_ms = 0.0
            stage_b_ms = belief.last_stage_b_elapsed_ms

        profile = belief.particle_weight_profile(k=1)
        summary = profile["summary"]
        rows.append({
            "ply": i,
            "to_move": "white" if mover_color == chess.WHITE else "black",
            "applied": move.uci(),
            "particle_count": len(belief.particles),
            "unique_particles": summary["unique_count"],
            "truth_in_belief": _truth_in_belief(belief, truth),
            "truth_marginal_l1": _belief_l1_to_truth(belief, truth, perspective),
            "posterior_top1_mass": summary["posterior_top1_mass"],
            "posterior_entropy_norm": summary["posterior_entropy_norm"],
            "repairs_fired": belief.last_repair_fired,
            "csp_reseed_fired": belief.last_csp_reseed_fired,
            "jitter_fired": belief.last_jitter_fired,
            "stage_a_elapsed_ms": stage_a_ms,
            "stage_b_elapsed_ms": stage_b_ms,
        })

    # Summary stats
    truth_lost_at_ply = next((r["ply"] for r in rows if not r["truth_in_belief"]), None)
    max_l1 = max(r["truth_marginal_l1"] for r in rows)
    final_l1 = rows[-1]["truth_marginal_l1"]
    total_repairs = sum(r["repairs_fired"] for r in rows)
    total_reseeds = sum(r["csp_reseed_fired"] for r in rows)
    total_jitters = sum(r["jitter_fired"] for r in rows)

    payload = {
        "replay": str(args.replay),
        "perspective": args.perspective,
        "target_n": args.target_n,
        "n_moves": len(moves),
        "summary": {
            "truth_lost_at_ply": truth_lost_at_ply,
            "max_l1_to_truth": max_l1,
            "final_l1_to_truth": final_l1,
            "total_repairs_fired": total_repairs,
            "total_csp_reseeds_fired": total_reseeds,
            "total_jitters_fired": total_jitters,
        },
        "rows": rows,
    }

    out_json = args.out or DIAG_DIR / f"belief-audit-{args.replay.stem}-{args.perspective}.json"
    out_json.write_text(json.dumps(payload, indent=2, default=str))
    print(f"Wrote {out_json}")

    # Human-readable summary
    print()
    print(f"=== Belief audit: {args.replay.name} ({args.perspective}'s perspective) ===")
    print(f"Truth tracked: {'NO — lost at ply ' + str(truth_lost_at_ply) if truth_lost_at_ply else 'YES (truth in belief at every ply)'}")
    print(f"L1 to truth — max: {max_l1:.2f}, final: {final_l1:.2f}")
    print(f"Repair events fired across the game: {total_repairs}")
    print(f"CSP reseed events fired: {total_reseeds}")
    print(f"Jitter events fired: {total_jitters}")
    print()
    print("Per-ply (showing every 4th ply + any ply with anomaly):")
    print(f"{'ply':>3} {'mover':<6} {'move':<7} {'particles':>9} {'unique':>7} {'truth':>5} {'L1':>7} {'top1':>6} {'rep':>3} {'csp':>3} {'jit':>3}")
    anomalies = set()
    for r in rows:
        if not r["truth_in_belief"] or r["repairs_fired"] > 0 or r["csp_reseed_fired"] > 0 or r["jitter_fired"] > 0:
            anomalies.add(r["ply"])
            anomalies.add(max(0, r["ply"] - 1))
    for r in rows:
        if r["ply"] % 4 == 0 or r["ply"] in anomalies or r["ply"] == rows[-1]["ply"]:
            print(
                f"{r['ply']:>3} {r['to_move']:<6} {r['applied']:<7} "
                f"{r['particle_count']:>9} {r['unique_particles']:>7} "
                f"{'Y' if r['truth_in_belief'] else 'N':>5} "
                f"{r['truth_marginal_l1']:>7.2f} {r['posterior_top1_mass']:>6.3f} "
                f"{r['repairs_fired']:>3} {r['csp_reseed_fired']:>3} {r['jitter_fired']:>3}"
            )


if __name__ == "__main__":
    main()
