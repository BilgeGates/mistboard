"""Particle-filter belief state for fog of war chess."""

from __future__ import annotations

from collections import defaultdict
import random
from dataclasses import dataclass, field

import chess

from .move_priors import OpponentMovePrior
from .observation import Observation, consistent_with
from .visibility import visible_piece_map, visible_squares


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


def _is_light_square(square: chess.Square) -> bool:
    """True if `square` is a light square (a1 = dark; alternates standard)."""
    return (chess.square_file(square) + chess.square_rank(square)) % 2 == 1


def _opp_bishop_color_counts(
    board: chess.Board, perspective: chess.Color
) -> dict[bool, int]:
    """Count opp bishops by square color (True=light, False=dark)."""
    counts = {True: 0, False: 0}
    opp = not perspective
    for sq, piece in board.piece_map().items():
        if piece.color == opp and piece.piece_type == chess.BISHOP:
            counts[_is_light_square(sq)] += 1
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
    # v0.7.0: bishop-color preservation. Opp bishops never change square
    # color (impossible in standard chess; under-promotion to bishop is the
    # only counter-example). Tracked separately from opp_remaining_counts
    # because the CSP reseed needs to assign bishops to color-correct
    # hidden squares. Initial: {True: 1, False: 1} for canonical start.
    opp_bishop_colors_remaining: dict[bool, int] = field(
        default_factory=lambda: {True: 1, False: 1}
    )
    # Diagnostics: count of particles dropped by the count constraint on the
    # most recent Stage-B update. Surfaced in the trace for observability.
    last_constraint_pruned: int = 0
    # v0.7.0: count of times CSP reseed fired across the most recent update
    # cycle (Stage A + Stage B). Surfaced in the trace.
    last_csp_reseed_fired: int = 0
    last_csp_reseed_count: int = 0
    # v0.7.2: count of times continuity repair avoided generic CSP reseed.
    # Generic CSP is deliberately treated as a last resort because it preserves
    # hard facts but can scramble previously good hidden-piece tracks.
    last_repair_fired: int = 0
    last_repair_count: int = 0

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
        # Seed opp_remaining_counts and opp_bishop_colors from the actual seed
        # board so non-canonical starts (FENs, Draft960) initialize correctly.
        opp_counts = _opp_piece_counts(seed_board, perspective)
        opp_bishop_colors = _opp_bishop_color_counts(seed_board, perspective)
        return cls(
            perspective=perspective,
            move_prior=move_prior,
            target_n=target_n,
            particles=[seed_board],
            weights=[1.0],
            rng=rng or random.Random(),
            opp_remaining_counts=opp_counts,
            opp_bishop_colors_remaining=opp_bishop_colors,
        )

    def register_capture(
        self,
        piece_type: chess.PieceType,
        square: chess.Square | None = None,
    ) -> None:
        """We just captured an opp piece of `piece_type`. Decrement the bound.

        Called by the strategy in `observe_own_move` when the move just played
        landed on a visible enemy piece (or was an en-passant capture). The
        bound is a hard truth: opponent now has one fewer piece of this type
        on the board (modulo promotion, which v0.6.0 does not track).

        v0.7.0: when `square` is provided and the captured piece is a bishop,
        decrement the matching color's count in `opp_bishop_colors_remaining`.
        Used by the CSP reseed to assign hidden bishops to color-correct
        squares. (For en-passant captures of pawns, the square is the pawn's
        actual square, not the move's to-square — pass that.)
        """
        if piece_type in self.opp_remaining_counts:
            self.opp_remaining_counts[piece_type] = max(
                0, self.opp_remaining_counts[piece_type] - 1
            )
        if piece_type == chess.BISHOP and square is not None:
            color_light = _is_light_square(square)
            self.opp_bishop_colors_remaining[color_light] = max(
                0, self.opp_bishop_colors_remaining.get(color_light, 0) - 1
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

        If step 2 wipes every particle, the pushed particles are stale against
        hard post-own-move evidence. Reseed from the observation instead of
        carrying an impossible belief forward; post-move visible pieces and
        move-affordance facts are current truth, not optional hints.
        """
        # Reset per-update CSP diagnostics; they're set if reseed fires below.
        self.last_csp_reseed_fired = 0
        self.last_csp_reseed_count = 0
        self.last_repair_fired = 0
        self.last_repair_count = 0

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
        elif pushed and observation is not None:
            # v0.7.0: step 2 would wipe belief. Older builds rolled back to
            # the pushed particles, but that meant belief could contradict
            # what our own move just revealed (e.g. a newly visible rook still
            # represented as a queen). First try an identity-preserving repair:
            # force current hard observation facts into each pushed particle,
            # keep hidden history that remains legal, and validate by
            # recomputing fog. Fall back to generic CSP only if repair fails.
            repaired: list[chess.Board] = []
            repaired_weights: list[float] = []
            for board, weight in zip(pushed, pushed_weights):
                repaired_board = _repair_particle_to_observation(
                    board,
                    observation,
                    self.opp_remaining_counts,
                    self.opp_bishop_colors_remaining,
                    self.perspective,
                    side_to_move=not self.perspective,
                    rng=self.rng,
                )
                if repaired_board is not None:
                    repaired.append(repaired_board)
                    repaired_weights.append(weight)

            if repaired:
                self.particles, self.weights = _resample(
                    repaired, repaired_weights, self.target_n, self.rng
                )
                self.last_repair_fired += 1
                self.last_repair_count = len(repaired)
            else:
                self.particles, self.weights = _csp_reseed(
                    observation,
                    self.opp_remaining_counts,
                    self.opp_bishop_colors_remaining,
                    self.perspective,
                    side_to_move=not self.perspective,
                    n=min(self.target_n, 64),
                    rng=self.rng,
                )
                self.last_csp_reseed_fired += 1
                self.last_csp_reseed_count = len(self.particles)
        elif pushed:
            self.particles = pushed
            self.weights = pushed_weights
        elif observation is not None:
            # v0.7.0: step 1 wiped everything — `my_move` was not pseudo-legal
            # in any particle. Reseed via CSP using observation + opp piece-
            # count + bishop-color constraints. Replaces v0.6.3's degenerate
            # single-particle visibility-only seed with N rich particles that
            # have plausible hidden-square hypotheses, so Stage B can expand
            # opp moves immediately and per-particle eval sees realistic
            # boards.
            self.particles, self.weights = _csp_reseed(
                observation,
                self.opp_remaining_counts,
                self.opp_bishop_colors_remaining,
                self.perspective,
                side_to_move=not self.perspective,
                n=min(self.target_n, 64),
                rng=self.rng,
            )
            self.last_csp_reseed_fired += 1
            self.last_csp_reseed_count = len(self.particles)
        else:
            self.particles = []
            self.weights = []

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
        # Reset per-update CSP diagnostics; they're set if Trigger-B fires below.
        self.last_csp_reseed_fired = 0
        self.last_csp_reseed_count = 0
        self.last_repair_fired = 0
        self.last_repair_count = 0

        expanded: list[tuple[chess.Board, float, bool, bool, bool]] = []
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
                hard_obs_ok = _matches_hard_observation(
                    next_board, prev_board, obs, self.perspective
                )
                counts = _opp_piece_counts(next_board, self.perspective)
                count_ok = not _violates_count_constraint(
                    counts, self.opp_remaining_counts
                )
                expanded.append(
                    (next_board, prev_weight * p, obs_ok, hard_obs_ok, count_ok)
                )

        # Tier 1: obs + constraint
        primary_p = [b for b, _, obs_ok, _, c_ok in expanded if obs_ok and c_ok]
        primary_w = [w for _, w, obs_ok, _, c_ok in expanded if obs_ok and c_ok]
        # Tier 2: hard observation + constraint. Relax only the soft visibility
        # mask shape; never relax visible pieces, own captures, or game-over.
        constraint_p = [b for b, _, _, hard_ok, c_ok in expanded if hard_ok and c_ok]
        constraint_w = [w for _, w, _, hard_ok, c_ok in expanded if hard_ok and c_ok]

        # Diagnostic: how many particles the constraint pruned (regardless of obs match).
        self.last_constraint_pruned = sum(
            1 for _, _, _, _, c_ok in expanded if not c_ok
        )

        if primary_p:
            chosen_particles = primary_p
            chosen_weights = primary_w
        elif constraint_p:
            chosen_particles = constraint_p
            chosen_weights = constraint_w
        elif expanded:
            # v0.7.2 Trigger B: all expanded opponent moves missed hard
            # observation. Before generic CSP, try the same continuity repair
            # Stage A uses: force current hard facts into count-valid expanded
            # worlds, preserve hidden history that still fits, then recompute
            # fog exactly. This is allowed to break exact opponent-move
            # reachability, but it keeps stable pawn/piece tracks instead of
            # random-filling from scratch.
            repaired: list[chess.Board] = []
            repaired_weights: list[float] = []
            for board, weight, _, _, count_ok in expanded:
                if not count_ok:
                    continue
                repaired_board = _repair_particle_to_observation(
                    board,
                    obs,
                    self.opp_remaining_counts,
                    self.opp_bishop_colors_remaining,
                    self.perspective,
                    side_to_move=self.perspective,
                    rng=self.rng,
                )
                if repaired_board is not None:
                    repaired.append(repaired_board)
                    repaired_weights.append(weight)

            if repaired:
                self.particles, self.weights = _resample(
                    repaired, repaired_weights, self.target_n, self.rng
                )
                self.last_repair_fired += 1
                self.last_repair_count = len(repaired)
                return

            # Generic CSP remains the final emergency path. It preserves hard
            # facts but discards identity continuity, so repeated rows should
            # still enter the annotation queue.
            self.particles, self.weights = _csp_reseed(
                obs,
                self.opp_remaining_counts,
                self.opp_bishop_colors_remaining,
                self.perspective,
                side_to_move=self.perspective,
                n=min(self.target_n, 64),
                rng=self.rng,
            )
            self.last_csp_reseed_fired += 1
            self.last_csp_reseed_count = len(self.particles)
            return
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

    def marginal_piece_field(
        self, min_prob: float = 0.05
    ) -> dict[chess.Square, list[tuple[chess.Piece | None, float]]]:
        """Sparse per-square marginal distributions.

        For normal debug capture, include only squares where belief assigns at
        least `min_prob` probability to a non-empty piece. Once a square is
        included, keep all distribution entries at or above `min_prob`,
        including `None`, so the UI can show uncertainty vs emptiness. Passing
        `min_prob=0.0` returns every square's full distribution.
        """
        field: dict[chess.Square, list[tuple[chess.Piece | None, float]]] = {}
        if min_prob < 0:
            min_prob = 0.0
        for sq in chess.SQUARES:
            marginal = self.marginal_piece_at(sq)
            if not marginal:
                continue
            non_empty_peak = max(
                (prob for piece, prob in marginal.items() if piece is not None),
                default=0.0,
            )
            if min_prob > 0 and non_empty_peak < min_prob:
                continue
            entries = [
                (piece, prob)
                for piece, prob in marginal.items()
                if min_prob <= 0 or prob >= min_prob
            ]
            entries.sort(
                key=lambda item: (
                    item[0] is None,
                    -item[1],
                    "" if item[0] is None else item[0].symbol(),
                )
            )
            field[sq] = entries
        return field

    def top_k_clusters(self, k: int = 5) -> list[tuple[str, float, int]]:
        """Top-K unique particle worlds as `(fen, normalized_weight, count)`."""
        if k <= 0 or not self.particles:
            return []
        total = sum(self.weights)
        if total <= 0:
            return []
        weights_by_fen: dict[str, float] = defaultdict(float)
        counts_by_fen: dict[str, int] = defaultdict(int)
        for board, weight in zip(self.particles, self.weights):
            fen = board.fen()
            weights_by_fen[fen] += weight
            counts_by_fen[fen] += 1
        clusters = [
            (fen, weight / total, counts_by_fen[fen])
            for fen, weight in weights_by_fen.items()
        ]
        clusters.sort(key=lambda item: (-item[1], item[0]))
        return clusters[:k]

    def collapsed(self) -> bool:
        """True if no particle survived the most recent update; signals a tracker bug or rule mismatch."""
        return not self.particles


def _matches_hard_observation(
    next_board: chess.Board,
    prev_board: chess.Board,
    obs: Observation,
    perspective: chess.Color,
) -> bool:
    """True iff non-relaxable observation facts match.

    The full visibility mask can be noisy for belief recovery because it
    encodes many move-affordance negatives. Visible pieces are different:
    if the player sees a black pawn on b6, a particle without that pawn is
    impossible. Same for own pieces that disappeared and game-over.
    """
    for sq in obs.visibility_mask:
        if next_board.piece_at(sq) != obs.visible_pieces.get(sq):
            return False

    own_before = {
        sq for sq, p in prev_board.piece_map().items() if p.color == perspective
    }
    own_after = {
        sq for sq, p in next_board.piece_map().items() if p.color == perspective
    }
    captures = own_before - own_after

    if obs.own_capture_square is None:
        if captures:
            return False
    elif captures != {obs.own_capture_square}:
        return False

    if obs.opp_capture_landing_square is not None:
        landing_piece = next_board.piece_at(obs.opp_capture_landing_square)
        if landing_piece is None or landing_piece.color == perspective:
            return False

    if obs.game_over is not None and next_board.king(perspective) is not None:
        return False

    return True


def _required_hidden_opp_squares_from_observation(
    observation: Observation,
    perspective: chess.Color,
) -> set[chess.Square]:
    """Hidden squares that hard observation says must contain opp pieces."""
    required = set(
        _required_hidden_opp_blockers_from_pawn_affordance(observation, perspective)
    )
    landing = observation.opp_capture_landing_square
    if landing is not None and landing not in observation.visible_pieces:
        required.add(landing)
    return required


def _required_hidden_opp_blockers_from_pawn_affordance(
    observation: Observation, perspective: chess.Color
) -> set[chess.Square]:
    """Squares that must contain hidden opp pieces due to pawn move affordance.

    Fog visibility includes destinations of pseudo-legal own moves. Therefore,
    if an own pawn's forward square is not visible, and no own piece sits there,
    the square is not merely unknown: it is occupied by a hidden opponent piece
    blocking the pawn. Same for a starting-rank double push when the one-step
    square is visibly empty but the two-step destination is not visible.
    """
    visibility_set = set(observation.visibility_mask)
    visible_pieces = observation.visible_pieces
    direction = 8 if perspective == chess.WHITE else -8
    start_rank = 1 if perspective == chess.WHITE else 6
    required: set[chess.Square] = set()

    for sq, piece in visible_pieces.items():
        if piece.color != perspective or piece.piece_type != chess.PAWN:
            continue

        one_step = sq + direction
        if not 0 <= one_step < 64:
            continue
        one_step_piece = visible_pieces.get(one_step)
        if one_step_piece is not None and one_step_piece.color == perspective:
            continue
        if one_step not in visibility_set:
            required.add(one_step)
            continue

        rank = chess.square_rank(sq)
        two_step = sq + 2 * direction
        if rank != start_rank or not 0 <= two_step < 64:
            continue
        one_step_empty = one_step in visibility_set and one_step not in visible_pieces
        two_step_piece = visible_pieces.get(two_step)
        own_piece_on_two_step = (
            two_step_piece is not None and two_step_piece.color == perspective
        )
        if one_step_empty and not own_piece_on_two_step and two_step not in visibility_set:
            required.add(two_step)

    return required


def _choose_required_blocker_piece_type(
    square: chess.Square,
    remaining_counts: dict[chess.PieceType, int],
    remaining_bishops_by_color: dict[bool, int],
    rng: random.Random,
) -> chess.PieceType | None:
    candidates: list[chess.PieceType] = []
    for pt, count in remaining_counts.items():
        if count <= 0:
            continue
        if pt == chess.PAWN and chess.square_rank(square) in {0, 7}:
            continue
        if pt == chess.BISHOP:
            if remaining_bishops_by_color.get(_is_light_square(square), 0) <= 0:
                continue
        candidates.extend([pt] * count)
    if not candidates:
        return None
    return rng.choice(candidates)


def _repair_particle_to_observation(
    board: chess.Board,
    observation: Observation,
    opp_remaining_counts: dict[chess.PieceType, int],
    opp_bishop_colors_remaining: dict[bool, int],
    perspective: chess.Color,
    side_to_move: chess.Color,
    rng: random.Random,
) -> chess.Board | None:
    """Minimally repair a pushed particle against current hard observation.

    Used before generic CSP reseed for Stage A post-own-move mismatches. The
    repair is intentionally conservative:

    - all own pieces are forced to the observed visible-piece map;
    - every visible square is forced to its observed piece or observed empty;
    - hidden opponent pieces are preserved unless they violate count/color
      bounds or are needed as movement-affordance blockers;
    - the candidate must exactly recompute the observation before it survives.

    This is not a full legal-reachability solver. It is a local continuity
    repair that keeps good hidden history when hard current facts changed.
    """
    repaired = board.copy()
    visibility_set = set(observation.visibility_mask)
    visible_pieces = observation.visible_pieces
    opp = not perspective

    # Own pieces are always visible to the player. Any perspective-colored
    # piece missing from the visible map is stale.
    for sq, piece in list(repaired.piece_map().items()):
        if piece.color == perspective and visible_pieces.get(sq) != piece:
            repaired.remove_piece_at(sq)

    # Visible squares are hard facts: either an exact piece or exact emptiness.
    for sq in visibility_set:
        expected = visible_pieces.get(sq)
        if expected is None:
            repaired.remove_piece_at(sq)
        else:
            repaired.set_piece_at(sq, expected)

    for sq, piece in visible_pieces.items():
        repaired.set_piece_at(sq, piece)

    required_hidden_opp_squares = _required_hidden_opp_squares_from_observation(
        observation, perspective
    )
    if not _repair_required_blockers(
        repaired,
        required_hidden_opp_squares,
        visibility_set,
        opp,
        rng,
    ):
        return None

    if not _trim_opp_excess_hidden_pieces(
        repaired,
        visible_pieces,
        opp_remaining_counts,
        opp_bishop_colors_remaining,
        perspective,
        required_hidden_opp_squares,
        rng,
    ):
        return None

    repaired.turn = side_to_move
    if _violates_count_constraint(
        _opp_piece_counts(repaired, perspective), opp_remaining_counts
    ):
        return None
    if _violates_bishop_color_constraint(
        repaired, perspective, opp_bishop_colors_remaining
    ):
        return None
    if (
        visible_squares(repaired, perspective) != observation.visibility_mask
        or visible_piece_map(repaired, perspective) != visible_pieces
    ):
        return None
    return repaired


def _repair_required_blockers(
    board: chess.Board,
    required_blockers: set[chess.Square],
    visibility_set: set[chess.Square],
    opp: chess.Color,
    rng: random.Random,
) -> bool:
    """Ensure hidden movement-affordance blockers are occupied by opp pieces."""
    blocker_squares = list(required_blockers)
    rng.shuffle(blocker_squares)
    for sq in blocker_squares:
        current = board.piece_at(sq)
        if current is not None and current.color == opp:
            if _piece_can_occupy_hidden_square(current, sq):
                continue
            board.remove_piece_at(sq)
        elif current is not None:
            board.remove_piece_at(sq)

        candidates = [
            cand_sq
            for cand_sq, piece in board.piece_map().items()
            if piece.color == opp
            and cand_sq not in visibility_set
            and cand_sq not in required_blockers
            and _piece_can_occupy_hidden_square(piece, sq)
        ]
        if not candidates:
            return False
        from_sq = rng.choice(candidates)
        piece = board.remove_piece_at(from_sq)
        if piece is None:
            return False
        board.set_piece_at(sq, piece)
    return True


def _piece_can_occupy_hidden_square(piece: chess.Piece, square: chess.Square) -> bool:
    if piece.piece_type == chess.PAWN and chess.square_rank(square) in {0, 7}:
        return False
    if piece.piece_type == chess.BISHOP:
        # A bishop's color complex is identity-preserving in ordinary play.
        return True
    return True


def _trim_opp_excess_hidden_pieces(
    board: chess.Board,
    visible_pieces: dict[chess.Square, chess.Piece],
    opp_remaining_counts: dict[chess.PieceType, int],
    opp_bishop_colors_remaining: dict[bool, int],
    perspective: chess.Color,
    required_blockers: set[chess.Square],
    rng: random.Random,
) -> bool:
    """Remove hidden opp pieces that exceed hard count/color bounds."""
    opp = not perspective
    protected = set(visible_pieces) | set(required_blockers)

    for piece_type, count in _opp_piece_counts(board, perspective).items():
        excess = count - opp_remaining_counts.get(piece_type, 0)
        if excess <= 0:
            continue
        candidates = [
            sq
            for sq, piece in board.piece_map().items()
            if piece.color == opp
            and piece.piece_type == piece_type
            and sq not in protected
        ]
        if len(candidates) < excess:
            return False
        rng.shuffle(candidates)
        for sq in candidates[:excess]:
            board.remove_piece_at(sq)

    for color_light, allowed in opp_bishop_colors_remaining.items():
        squares = [
            sq
            for sq, piece in board.piece_map().items()
            if piece.color == opp
            and piece.piece_type == chess.BISHOP
            and _is_light_square(sq) == color_light
        ]
        excess = len(squares) - allowed
        if excess <= 0:
            continue
        candidates = [sq for sq in squares if sq not in protected]
        if len(candidates) < excess:
            return False
        rng.shuffle(candidates)
        for sq in candidates[:excess]:
            board.remove_piece_at(sq)

    return True


def _violates_bishop_color_constraint(
    board: chess.Board,
    perspective: chess.Color,
    bound: dict[bool, int],
) -> bool:
    counts = _opp_bishop_color_counts(board, perspective)
    return any(count > bound.get(color_light, 0) for color_light, count in counts.items())


def _csp_reseed(
    observation: Observation,
    opp_remaining_counts: dict[chess.PieceType, int],
    opp_bishop_colors_remaining: dict[bool, int],
    perspective: chess.Color,
    side_to_move: chess.Color,
    n: int,
    rng: random.Random,
) -> tuple[list[chess.Board], list[float]]:
    """Generate up to `n` particles satisfying hard constraints from observation.

    v0.7.0 belief-recovery primitive. Replaces v0.6.3's degenerate visibility-
    only reseed when Stage A's step 1 wipes belief. See
    `docs/build-log/2026-05-07-fow-csp-reseed-design.md`.

    Hard constraints:
      - Visible squares match `observation.visible_pieces` exactly.
      - Per-type opp piece count ≤ `opp_remaining_counts[type]`.
      - Hidden bishops assigned to squares of the right color (per
        `opp_bishop_colors_remaining`).
      - Pawns never on rank 1 or 8 (no on-board promotion artifact).
      - One opp king total (visible or hidden).

    Algorithm: random-fill with rejection (Option A from the design doc).
    Each particle is generated independently; visible pieces are placed first,
    then hidden pieces are assigned to shuffled hidden squares respecting
    constraints. If a particle can't be completed (no valid square for some
    piece), reject and retry. Caps total attempts at `n * 10` to bound
    worst-case work.

    Returns equal-weight particles. If zero particles can be generated under
    the constraints (rare — usually means observation is already inconsistent
    with `opp_remaining_counts`), falls back to a single visibility-only
    particle so belief stays alive.
    """
    visibility_set = set(observation.visibility_mask)
    visible_pieces = observation.visible_pieces
    hidden_squares = [sq for sq in chess.SQUARES if sq not in visibility_set]
    required_blockers = _required_hidden_opp_squares_from_observation(
        observation, perspective
    )
    opp = not perspective

    # Tally what's visible so we know what's left to place on hidden squares.
    visible_opp_by_type: dict[chess.PieceType, int] = defaultdict(int)
    visible_bishop_colors: dict[bool, int] = {True: 0, False: 0}
    for sq, piece in visible_pieces.items():
        if piece.color == opp:
            visible_opp_by_type[piece.piece_type] += 1
            if piece.piece_type == chess.BISHOP:
                visible_bishop_colors[_is_light_square(sq)] += 1

    # Pieces to assign to hidden squares.
    hidden_counts: dict[chess.PieceType, int] = {}
    for pt, total in opp_remaining_counts.items():
        deficit = max(0, total - visible_opp_by_type[pt])
        hidden_counts[pt] = deficit

    # Bishops by color — placed first because their constraint is tightest.
    hidden_bishops_light = max(
        0, opp_bishop_colors_remaining.get(True, 0) - visible_bishop_colors[True]
    )
    hidden_bishops_dark = max(
        0, opp_bishop_colors_remaining.get(False, 0) - visible_bishop_colors[False]
    )

    particles: list[chess.Board] = []
    max_attempts = n * 10
    attempts = 0

    while len(particles) < n and attempts < max_attempts:
        attempts += 1
        board = chess.Board.empty()
        for sq, piece in visible_pieces.items():
            board.set_piece_at(sq, piece)

        # Per-attempt shuffle so each particle samples a different hidden layout.
        squares_shuffled = list(hidden_squares)
        rng.shuffle(squares_shuffled)
        used: set[chess.Square] = set()
        remaining_counts = dict(hidden_counts)
        remaining_bishops_by_color = {
            True: hidden_bishops_light,
            False: hidden_bishops_dark,
        }
        valid = True

        # 0. Required hidden blockers from move-affordance evidence.
        # Example: if our pawn cannot push one square forward, and our own
        # piece is not on that square, the square must contain a hidden opp
        # piece. Put those pieces down before random fill so CSP reseed does
        # not erase hard "fog from movement restriction" facts.
        blocker_squares = list(required_blockers)
        rng.shuffle(blocker_squares)
        for sq in blocker_squares:
            if sq in used:
                continue
            pt = _choose_required_blocker_piece_type(
                sq, remaining_counts, remaining_bishops_by_color, rng
            )
            if pt is None:
                valid = False
                break
            board.set_piece_at(sq, chess.Piece(pt, opp))
            used.add(sq)
            remaining_counts[pt] -= 1
            if pt == chess.BISHOP:
                remaining_bishops_by_color[_is_light_square(sq)] -= 1
        if not valid:
            continue

        # 1. Light-square bishops.
        for _ in range(remaining_bishops_by_color[True]):
            placed = False
            for sq in squares_shuffled:
                if sq in used or not _is_light_square(sq):
                    continue
                board.set_piece_at(sq, chess.Piece(chess.BISHOP, opp))
                used.add(sq)
                remaining_counts[chess.BISHOP] -= 1
                placed = True
                break
            if not placed:
                valid = False
                break
        if not valid:
            continue

        # 2. Dark-square bishops.
        for _ in range(remaining_bishops_by_color[False]):
            placed = False
            for sq in squares_shuffled:
                if sq in used or _is_light_square(sq):
                    continue
                board.set_piece_at(sq, chess.Piece(chess.BISHOP, opp))
                used.add(sq)
                remaining_counts[chess.BISHOP] -= 1
                placed = True
                break
            if not placed:
                valid = False
                break
        if not valid:
            continue

        # 3. Other pieces (pawns + non-bishop). Pawns get rank constraint.
        hidden_to_place_non_bishop = [
            pt
            for pt, count in remaining_counts.items()
            if pt != chess.BISHOP
            for _ in range(count)
        ]
        rng.shuffle(hidden_to_place_non_bishop)
        for pt in hidden_to_place_non_bishop:
            placed = False
            for sq in squares_shuffled:
                if sq in used:
                    continue
                if pt == chess.PAWN:
                    rank = chess.square_rank(sq)
                    if rank == 0 or rank == 7:
                        continue
                board.set_piece_at(sq, chess.Piece(pt, opp))
                used.add(sq)
                placed = True
                break
            if not placed:
                valid = False
                break
        if not valid:
            continue

        board.turn = side_to_move
        if (
            visible_squares(board, perspective) != observation.visibility_mask
            or visible_piece_map(board, perspective) != observation.visible_pieces
        ):
            continue
        particles.append(board)

    if not particles:
        # Couldn't generate any constraint-satisfying particle. Fall back to
        # a single visibility-only board so belief at least stays alive.
        # Happens when opp_remaining_counts has more pieces than fit on
        # hidden_squares, which should not occur in normal play.
        fallback = chess.Board.empty()
        for sq, piece in visible_pieces.items():
            fallback.set_piece_at(sq, piece)
        fallback.turn = side_to_move
        particles = [fallback]
    elif len(particles) < n:
        # Full visibility validation is intentionally stricter than the early
        # v0.7.0 CSP fill. In tight positions it may find only a few valid
        # worlds inside the attempt budget. Keep the engine's expected particle
        # count stable by resampling those valid worlds with replacement; the
        # unique-particle diagnostic still exposes low diversity.
        particles = [rng.choice(particles).copy() for _ in range(n)]

    weights = [1.0 / len(particles)] * len(particles)
    return particles, weights


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
