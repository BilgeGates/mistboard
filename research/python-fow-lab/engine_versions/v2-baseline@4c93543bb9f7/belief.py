"""Particle-filter belief state for fog of war chess."""

from __future__ import annotations

import random
from dataclasses import dataclass, field

import chess

from .move_priors import OpponentMovePrior
from .observation import Observation, consistent_with


# Standard starting piece counts (per side). Used to seed
# `BeliefState.opp_remaining_counts`. v0.6.0 treats this as a hard upper bound
# on every belief particle's opp piece count after captures we register: any
# particle hallucinating extra pieces of a captured type gets pruned.
#
# Promotion edge case: opp pawn -> opp queen (or other) increments their count.
# v0.6.0 does NOT auto-detect this and could over-prune in promotion games
# (still rare in current bake-offs). Track as TODO for v0.6.1.
_STANDARD_OPP_COUNTS: dict[chess.PieceType, int] = {
    chess.PAWN: 8,
    chess.KNIGHT: 2,
    chess.BISHOP: 2,
    chess.ROOK: 2,
    chess.QUEEN: 1,
    chess.KING: 1,
}


def _opp_piece_counts(
    board: chess.Board, perspective: chess.Color
) -> dict[chess.PieceType, int]:
    counts: dict[chess.PieceType, int] = {}
    opp = not perspective
    for piece in board.piece_map().values():
        if piece.color == opp:
            counts[piece.piece_type] = counts.get(piece.piece_type, 0) + 1
    return counts


def _violates_count_constraint(
    counts: dict[chess.PieceType, int],
    bound: dict[chess.PieceType, int],
) -> bool:
    for piece_type, n in counts.items():
        if n > bound.get(piece_type, 0):
            return True
    return False


@dataclass
class BeliefState:
    """A weighted particle distribution over true boards consistent with observation history."""

    perspective: chess.Color
    move_prior: OpponentMovePrior
    target_n: int = 256
    particles: list[chess.Board] = field(default_factory=list)
    weights: list[float] = field(default_factory=list)
    rng: random.Random = field(default_factory=random.Random)
    # Hard upper bound on opp piece counts. Decremented by `register_capture`
    # whenever we (the perspective) capture a visible enemy piece. Used as a
    # Stage-B post-expansion filter to prune particles that hallucinate extra
    # pieces of types we've already captured.
    opp_remaining_counts: dict[chess.PieceType, int] = field(
        default_factory=lambda: dict(_STANDARD_OPP_COUNTS)
    )
    # Diagnostics: count of particles dropped by the count constraint on the
    # most recent Stage-B update. Surfaced in the trace for observability.
    last_constraint_pruned: int = 0

    @classmethod
    def initial(
        cls,
        perspective: chess.Color,
        move_prior: OpponentMovePrior,
        target_n: int = 256,
        start_board: chess.Board | None = None,
        rng: random.Random | None = None,
        *,
        start_fen: str | None = None,
        chess960: bool = False,
    ) -> "BeliefState":
        """Build a belief seeded with a single known starting board.

        Forward-compat for Draft960 (engine-roadmap "Capability Tracks"):
        `start_fen` and `chess960` are accepted now so callers can pass
        them once Draft960 plumbing lands. Today both are stubs:

        - `start_fen` is honored if provided (overrides start_board), but
          the existing path (start_board / canonical) is preserved
          bit-identically when start_fen is None.
        - `chess960` is propagated to the seeded board's `.chess960` flag
          so future move-generation respects X-FEN castling, but no
          current callers set it. Default False = standard chess.
        """
        if start_fen is not None:
            seed_board = chess.Board(start_fen, chess960=chess960)
        else:
            seed_board = (start_board or chess.Board(chess960=chess960)).copy()
            if chess960:
                seed_board.chess960 = True
        # Seed opp_remaining_counts from the actual seed board so non-canonical
        # starts (FENs, Draft960) initialize correctly.
        opp_counts = _opp_piece_counts(seed_board, perspective)
        return cls(
            perspective=perspective,
            move_prior=move_prior,
            target_n=target_n,
            particles=[seed_board],
            weights=[1.0],
            rng=rng or random.Random(),
            opp_remaining_counts=opp_counts,
        )

    def register_capture(self, piece_type: chess.PieceType) -> None:
        """We just captured an opp piece of `piece_type`. Decrement the bound.

        Called by the strategy in `observe_own_move` when the move just played
        landed on a visible enemy piece (or was an en-passant capture). The
        bound is a hard truth: opponent now has one fewer piece of this type
        on the board (modulo promotion, which v0.6.0 does not track).
        """
        if piece_type in self.opp_remaining_counts:
            self.opp_remaining_counts[piece_type] = max(
                0, self.opp_remaining_counts[piece_type] - 1
            )

    def update_after_own_move(
        self,
        my_move: chess.Move,
        observation: Observation | None = None,
    ) -> None:
        """Apply perspective's own move to every particle; drop particles where the move is illegal.

        Two-stage update:
          1. Push `my_move` on every particle, drop where the move wasn't
             pseudo-legal on that particle. (Bug-class: belief was never
             consistent with reality.)
          2. If `observation` provided, drop particles whose post-move
             visibility / piece map disagree with what we now actually see.
             (Pruning class: belief was over-broad; observation evidence narrows.)

        **Rollback on collapse.** If step 2 wipes every particle (the
        observation is too strict for any surviving hypothesis), we keep the
        step 1 particles instead. Belief then has my move applied but is
        inconsistent with the post-move observation — strictly worse than
        ideal, but strictly better than zero particles, which forces the
        engine into the visibility-only fallback path. Stage B's resample on
        the next opp-move will re-tighten.
        """
        pushed: list[chess.Board] = []
        pushed_weights: list[float] = []
        consistent: list[chess.Board] = []
        consistent_weights: list[float] = []
        for board, weight in zip(self.particles, self.weights):
            if not board.is_pseudo_legal(my_move):
                continue
            advanced = board.copy()
            advanced.push(my_move)
            pushed.append(advanced)
            pushed_weights.append(weight)
            if observation is None or consistent_with(
                advanced, board, observation, self.perspective
            ):
                consistent.append(advanced)
                consistent_weights.append(weight)

        if consistent:
            self.particles = consistent
            self.weights = consistent_weights
        else:
            # Step 2 would wipe belief. Fall back to step 1 particles to keep
            # belief alive (stale w.r.t. this Stage A observation, but the
            # next Stage B expansion + resample will re-stabilize).
            self.particles = pushed
            self.weights = pushed_weights

    def update_after_opp_move(self, obs: Observation) -> None:
        """Expand each particle by opp's pseudo-legal moves, filter by `obs` + count constraint, then resample.

        Filter priority (each layer is a fallback if the previous wipes belief):
          1. obs_pass AND constraint_pass: best — visibility match + correct
             opp piece counts.
          2. constraint_pass only: relax visibility, keep piece-count truth.
             Better than allowing phantom captured pieces back into belief.
          3. all expansions (existing rollback): emergency, lose both signals.

        The count constraint (v0.6.0): a particle whose opp piece count for
        any type exceeds `opp_remaining_counts` is hallucinating pieces we
        know we've captured. Drop it.
        """
        expanded: list[tuple[chess.Board, float, bool, bool]] = []
        for prev_board, prev_weight in zip(self.particles, self.weights):
            legal = list(prev_board.pseudo_legal_moves)
            if not legal:
                continue
            priors = self.move_prior(prev_board, legal)
            for mv, p in zip(legal, priors):
                if p <= 0.0:
                    continue
                next_board = prev_board.copy()
                next_board.push(mv)
                obs_ok = consistent_with(next_board, prev_board, obs, self.perspective)
                counts = _opp_piece_counts(next_board, self.perspective)
                count_ok = not _violates_count_constraint(
                    counts, self.opp_remaining_counts
                )
                expanded.append((next_board, prev_weight * p, obs_ok, count_ok))

        # Tier 1: obs + constraint
        primary_p = [b for b, _, obs_ok, c_ok in expanded if obs_ok and c_ok]
        primary_w = [w for _, w, obs_ok, c_ok in expanded if obs_ok and c_ok]
        # Tier 2: constraint only (relax obs)
        constraint_p = [b for b, _, _, c_ok in expanded if c_ok]
        constraint_w = [w for _, w, _, c_ok in expanded if c_ok]

        # Diagnostic: how many particles the constraint pruned (regardless of obs match).
        self.last_constraint_pruned = sum(1 for _, _, _, c_ok in expanded if not c_ok)

        if primary_p:
            chosen_particles = primary_p
            chosen_weights = primary_w
        elif constraint_p:
            chosen_particles = constraint_p
            chosen_weights = constraint_w
        elif expanded:
            chosen_particles = [b for b, _, _, _ in expanded]
            chosen_weights = [w for _, w, _, _ in expanded]
        else:
            self.particles = []
            self.weights = []
            return

        self.particles, self.weights = _resample(
            chosen_particles, chosen_weights, self.target_n, self.rng
        )

    def marginal_piece_at(
        self, square: chess.Square
    ) -> dict[chess.Piece | None, float]:
        """Marginal distribution over what occupies `square` (None = empty)."""
        if not self.particles:
            return {}
        total = sum(self.weights)
        if total <= 0:
            return {}
        result: dict[chess.Piece | None, float] = {}
        for board, weight in zip(self.particles, self.weights):
            piece = board.piece_at(square)
            result[piece] = result.get(piece, 0.0) + weight / total
        return result

    def collapsed(self) -> bool:
        """True if no particle survived the most recent update; signals a tracker bug or rule mismatch."""
        return not self.particles


def _resample(
    particles: list[chess.Board],
    weights: list[float],
    target_n: int,
    rng: random.Random,
) -> tuple[list[chess.Board], list[float]]:
    total = sum(weights)
    if total <= 0:
        return [], []
    probs = [w / total for w in weights]
    indices = rng.choices(range(len(particles)), weights=probs, k=target_n)
    new_particles = [particles[i].copy() for i in indices]
    new_weights = [1.0 / target_n] * target_n
    return new_particles, new_weights
