"""Diagnostic: reconstruct belief at an annotated blunder ply, dump scores + marginals.

Tests the belief-collapse hypothesis on production blunders. For a given
annotated case (game JSONL, perspective, blunder ply, blunder move):
  - Replay through ply-1, building the perspective's belief filter.
  - Snapshot belief: ESS, weight entropy, exact-match-vs-truth.
  - Compute marginal P(piece type at attacker squares).
  - Run best_action with fow_evaluator and dump per-move scores (top-K).
  - Compare the chosen move (the blunder) against the top alternatives.
  - Report whether _belief_veto_king_attack would have caught it.

The hypothesis under test: production v0.9.5 blunders ("moves into defended
square") happen because the belief filter under-counts known defenders. If the
true defender is in <5% of belief particles, the safety penalty dilutes and
the move passes the veto.

Usage:
    .venv/bin/python3 scripts/diag_annotated_blunder.py \\
        --events /path/to/game.jsonl \\
        --perspective black --ply 26 --played b6a5 \\
        --prior uniform
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

import chess

_LAB_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_LAB_ROOT / "src"))

from fow_chess.belief import BeliefState
from fow_chess.engine import best_action
from fow_chess.evaluator import fow_evaluator
from fow_chess.event_log import iter_steps
from fow_chess.move_priors import learned_policy_prior, uniform_prior
from fow_chess.visibility import visible_squares


def _attacker_squares(board: chess.Board, target_sq: chess.Square, by_color: chess.Color) -> list[chess.Square]:
    """Squares from which `by_color` pseudo-legally attacks `target_sq` in `board`."""
    work = board.copy()
    work.turn = by_color
    return [m.from_square for m in work.pseudo_legal_moves if m.to_square == target_sq]


def _marginal_at_square(belief: BeliefState, sq: chess.Square, opp_color: chess.Color) -> dict:
    """Distribution over (opp_color, piece_type) at square `sq` across belief.

    Returns {'empty': p, 'pawn': p, ...} summing to 1.
    """
    total = sum(belief.weights) or 1.0
    counts = {"empty": 0.0, "pawn": 0.0, "knight": 0.0, "bishop": 0.0, "rook": 0.0, "queen": 0.0, "king": 0.0, "own": 0.0}
    for particle, w in zip(belief.particles, belief.weights):
        p = particle.piece_at(sq)
        if p is None:
            counts["empty"] += w
        elif p.color != opp_color:
            counts["own"] += w
        else:
            name = chess.piece_name(p.piece_type)
            counts[name] += w
    return {k: v / total for k, v in counts.items()}


def _belief_attacker_marginal(belief: BeliefState, target_sq: chess.Square, opp_color: chess.Color) -> float:
    """Fraction of belief weight in particles where some opp piece attacks target_sq."""
    total = sum(belief.weights) or 1.0
    attacked_weight = 0.0
    for particle, w in zip(belief.particles, belief.weights):
        work = particle.copy()
        work.turn = opp_color
        if any(m.to_square == target_sq for m in work.pseudo_legal_moves):
            attacked_weight += w
    return attacked_weight / total


def _ess(weights):
    s = sum(weights)
    if s <= 0:
        return 0.0
    return (s * s) / sum(w * w for w in weights)


def _veto_attacked_after(belief: BeliefState, move: chess.Move, own: chess.Color) -> tuple[float, float]:
    """Replicate _belief_veto_king_attack accounting for a single move.

    Returns (fraction_legal_in_belief, fraction_of_legal_where_king_attacked_after).
    The veto threshold is 5%; if the second number > 0.05, the veto fires.
    """
    legal = 0
    attacked = 0
    for particle in belief.particles:
        if not particle.is_pseudo_legal(move):
            continue
        legal += 1
        sim = particle.copy()
        sim.push(move)
        king_sq = sim.king(own)
        if king_sq is None:
            attacked += 1
            continue
        sim.turn = not own
        if any(m.to_square == king_sq for m in sim.pseudo_legal_moves):
            attacked += 1
    if legal == 0:
        return (0.0, 0.0)
    return (legal / len(belief.particles), attacked / legal)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--events", type=Path, required=True)
    ap.add_argument("--perspective", choices=("white", "black"), required=True)
    ap.add_argument("--ply", type=int, required=True, help="Failure ply (1-indexed move number).")
    ap.add_argument("--played", required=True, help="UCI of the move actually played at --ply.")
    ap.add_argument("--prior", choices=("uniform", "learned"), default="uniform")
    ap.add_argument("--prior-weights", type=Path, default=None)
    ap.add_argument("--target-n", type=int, default=256)
    ap.add_argument("--max-particles", type=int, default=16)
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--top-k", type=int, default=8, help="Show top-K best_action moves by score.")
    ap.add_argument("--risk-aversion", type=float, default=0.0)
    args = ap.parse_args()

    perspective = chess.WHITE if args.perspective == "white" else chess.BLACK

    events = [json.loads(line) for line in args.events.open() if line.strip()]

    if args.prior == "learned":
        if args.prior_weights is None:
            raise SystemExit("--prior learned requires --prior-weights")
        wp = args.prior_weights if args.prior_weights.is_absolute() else (_LAB_ROOT / args.prior_weights)
        prior = learned_policy_prior(str(wp))
    else:
        prior = uniform_prior

    belief = BeliefState.initial(
        perspective=perspective,
        move_prior=prior,
        target_n=args.target_n,
        rng=random.Random(args.seed),
    )

    canonical_before_blunder: chess.Board | None = None
    for step in iter_steps(events, perspective):
        if step.ply >= args.ply:
            canonical_before_blunder = step.canonical_before
            break
        if step.own_move is not None:
            belief.update_after_own_move(step.own_move)
        else:
            belief.update_after_opp_move(step.opp_observation)

    if canonical_before_blunder is None:
        raise SystemExit(f"Ply {args.ply} not reached for perspective {args.perspective} in {args.events}")

    played_move = chess.Move.from_uci(args.played)
    own_color = perspective
    opp_color = not perspective
    truth = canonical_before_blunder

    visible = visible_squares(truth, own_color)
    legal = list(truth.pseudo_legal_moves)
    if played_move not in legal:
        # Promotion or off-by-one — best to just try.
        print(f"WARN: played move {args.played} not in pseudo_legal_moves of truth board; continuing.")

    scored: list[tuple[chess.Move, float, float]] = []
    chosen = best_action(
        belief,
        fow_evaluator(),
        legal,
        max_particles=args.max_particles,
        risk_aversion=args.risk_aversion,
        rng=random.Random(args.seed),
        out_scored_moves=scored,
    )
    scored.sort(key=lambda x: x[1], reverse=True)

    # ----- Marginals at the destination + attackers -----
    target_sq = played_move.to_square
    truth_attackers = _attacker_squares(truth, target_sq, opp_color)
    truth_defenders_visible = [sq for sq in truth_attackers if sq in visible]
    marginal_target = _marginal_at_square(belief, target_sq, opp_color)
    p_attacked = _belief_attacker_marginal(belief, target_sq, opp_color)

    veto_legal_frac, veto_attacked_frac = _veto_attacked_after(belief, played_move, own_color)

    # ----- Per-attacker-square marginals (drill-down) -----
    attacker_marginals = []
    for sq in truth_attackers:
        m = _marginal_at_square(belief, sq, opp_color)
        truth_piece = truth.piece_at(sq)
        truth_type = chess.piece_name(truth_piece.piece_type) if truth_piece else "empty"
        truth_visible = sq in visible
        attacker_marginals.append({
            "sq": chess.square_name(sq),
            "truth_piece": truth_type,
            "truth_visible_to_own": truth_visible,
            "marginal": m,
            "p_truth_type_in_belief": m.get(truth_type, 0.0),
        })

    # ----- Output -----
    print("=" * 78)
    print(f"DIAGNOSTIC: {args.events.name}  ply={args.ply}  perspective={args.perspective}")
    print(f"prior={args.prior}  target_n={args.target_n}  max_particles={args.max_particles}")
    print(f"played move: {args.played}  (target sq: {chess.square_name(target_sq)})")
    print(f"truth FEN before move: {truth.fen()}")
    print(f"risk_aversion: {args.risk_aversion}")
    print("=" * 78)
    print()
    print("BELIEF STATE")
    print(f"  n_particles    {len(belief.particles)}")
    print(f"  ESS            {_ess(belief.weights):.1f} / {len(belief.particles)}")
    print(f"  unique boards  {len({p.fen() for p in belief.particles})}")
    truth_in_set = any(p.piece_map() == truth.piece_map() for p in belief.particles)
    print(f"  truth in set?  {truth_in_set}")
    print()

    print(f"TARGET-SQ {chess.square_name(target_sq)} marginal in belief:")
    for k, v in sorted(marginal_target.items(), key=lambda x: -x[1]):
        if v > 0.005:
            print(f"    {k:<8} {v*100:>6.2f}%")
    print(f"  P(some opp attacks {chess.square_name(target_sq)} in belief): {p_attacked*100:.2f}%")
    print()

    print(f"GROUND TRUTH: pieces attacking {chess.square_name(target_sq)} from opp:")
    if not truth_attackers:
        print("  (none in truth — annotation may be wrong?)")
    for am in attacker_marginals:
        truth_visible_str = "VISIBLE" if am["truth_visible_to_own"] else "hidden"
        print(f"  {am['sq']:<3} {am['truth_piece']:<8} ({truth_visible_str} to own)")
        print(f"      truth piece-type prob in belief = {am['p_truth_type_in_belief']*100:.2f}%")
        for k, v in sorted(am["marginal"].items(), key=lambda x: -x[1]):
            if v > 0.02:
                print(f"        {k:<8} {v*100:>6.2f}%")
    print()

    print(f"_belief_veto_king_attack check on played move:")
    print(f"  fraction of particles where move is legal: {veto_legal_frac*100:.1f}%")
    print(f"  fraction (of legal) where king attacked after move: {veto_attacked_frac*100:.2f}%")
    print(f"  veto threshold (non-king move): 5.00%  -> {'VETOED' if veto_attacked_frac > 0.05 else 'not vetoed'}")
    print()

    print(f"BEST_ACTION top-{args.top_k} (fow_evaluator, max_particles={args.max_particles})")
    print(f"  chosen by best_action: {chosen.uci()}")
    print(f"  {'rank':<5} {'move':<8} {'score':>10} {'support':>10}")
    for i, (m, s, sup) in enumerate(scored[:args.top_k], 1):
        mark = " <- played" if m == played_move else ""
        print(f"  {i:<5} {m.uci():<8} {s:>10.2f} {sup:>10.4f}{mark}")
    played_score = next((s for m, s, _ in scored if m == played_move), None)
    if played_score is not None:
        rank = next((i+1 for i, (m, _, _) in enumerate(scored) if m == played_move), None)
        print(f"  played move {args.played}: rank {rank}, score {played_score:.2f}")
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
