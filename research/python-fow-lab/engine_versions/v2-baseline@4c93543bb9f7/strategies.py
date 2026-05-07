"""Concrete fog-of-war strategies for the self-play harness."""

from __future__ import annotations

import random
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path

# Bumped when Tier-1's decision behaviour materially changes. Major = new
# architectural layer; minor = behavioural change (new short-circuit,
# evaluator tweak, prior change); patch = refactor with no behaviour delta.
# Written into bake-off manifests so we can A/B across versions.
TIER1_VERSION = "0.6.0"


def tier1_commit() -> str:
    """Short git SHA of the working tree, suffixed with `-dirty` if uncommitted edits exist."""
    repo_root = Path(__file__).resolve().parents[3]
    try:
        sha = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], cwd=repo_root, text=True
        ).strip()
        status = subprocess.check_output(
            ["git", "status", "--porcelain"], cwd=repo_root, text=True
        )
        return f"{sha}-dirty" if status.strip() else sha
    except (subprocess.CalledProcessError, FileNotFoundError):
        return "unknown"

import chess

from .belief import BeliefState
from .engine import EvaluatorBuilder, best_action
from .move_priors import OpponentMovePrior, uniform_prior
from .observation import Observation
from .selfplay import PerspectiveView


def _visibility_board(view: PerspectiveView) -> chess.Board:
    """Synthesize a board containing only the pieces this perspective can see."""
    board = chess.Board.empty()
    for sq, piece in view.visible_piece_map.items():
        board.set_piece_at(sq, piece)
    return board


def _squares_attacked_by_visible_enemy(view: PerspectiveView) -> set[chess.Square]:
    """Squares the visible enemy pieces could move to next turn.

    Built from a synthetic board with only visible pieces, with side-to-move
    flipped to enemy. Intentionally ignores hidden enemies — the short-circuit
    fires only on threats the perspective can directly observe.
    """
    board = _visibility_board(view)
    board.turn = not view.perspective
    return {move.to_square for move in board.pseudo_legal_moves}


def _king_defense_moves(view: PerspectiveView) -> list[chess.Move]:
    """If own king is on a square attacked by a visible enemy piece, return moves that resolve the attack.

    A resolving move ends with own king on a square that no visible enemy piece
    can capture next turn. This generalises across king-flight, attacker-
    capture, and sliding-piece blocking — each is detected by simulating the
    move on the visibility-only board and re-checking attacks on the king's
    new square. Returns [] when the king isn't visibly attacked OR no
    resolving move exists (don't fire the short-circuit then).
    """
    own_color = view.perspective
    own_king_squares = [
        sq
        for sq, piece in view.visible_piece_map.items()
        if piece.color == own_color and piece.piece_type == chess.KING
    ]
    if not own_king_squares:
        return []

    pre_attacked = _squares_attacked_by_visible_enemy(view)
    if not any(sq in pre_attacked for sq in own_king_squares):
        return []

    resolving: list[chess.Move] = []
    for own_move in view.own_legal_moves:
        sim = _visibility_board(view)
        sim.turn = own_color  # _visibility_board defaults to WHITE; push needs the perspective to-move
        if not sim.is_pseudo_legal(own_move):
            # En-passant or castling-edge cases that don't reconcile on a
            # visibility-only board. Fall through to main eval on those.
            continue
        sim.push(own_move)
        king_after: chess.Square | None = None
        for sq, piece in sim.piece_map().items():
            if piece.color == own_color and piece.piece_type == chess.KING:
                king_after = sq
                break
        if king_after is None:
            continue
        sim.turn = not own_color
        post_attacked = {m.to_square for m in sim.pseudo_legal_moves}
        if king_after not in post_attacked:
            resolving.append(own_move)
    return resolving


def _queen_save_moves(view: PerspectiveView) -> list[chess.Move]:
    """If own queen is on a square attacked by a visible enemy, return moves that resolve the threat.

    Mirrors the king-defense logic: simulate every legal move on the
    visibility-only board; a resolving move ends with all own queens on
    squares no visible enemy can capture next turn. This generalises across
    queen-flight, attacker-capture, and sliding-piece blocking — captures of
    the attacker by any of our pieces fall out for free, which the v0.4.0
    corpus showed was the missed case (e.g., g24 p22: pawn could have taken
    the attacking knight, but the old queen-save only considered queen-moves).

    Returns [] when the queen isn't visibly attacked OR no resolving move
    exists (don't fire the short-circuit then).
    """
    own_color = view.perspective
    own_queen_squares = [
        sq
        for sq, piece in view.visible_piece_map.items()
        if piece.color == own_color and piece.piece_type == chess.QUEEN
    ]
    if not own_queen_squares:
        return []

    pre_attacked = _squares_attacked_by_visible_enemy(view)
    if not any(sq in pre_attacked for sq in own_queen_squares):
        return []

    resolving: list[chess.Move] = []
    for own_move in view.own_legal_moves:
        sim = _visibility_board(view)
        sim.turn = own_color
        if not sim.is_pseudo_legal(own_move):
            continue
        sim.push(own_move)
        queens_after = [
            sq
            for sq, piece in sim.piece_map().items()
            if piece.color == own_color and piece.piece_type == chess.QUEEN
        ]
        if not queens_after:
            # Our move somehow lost the queen — not a save.
            continue
        sim.turn = not own_color
        post_attacked = {m.to_square for m in sim.pseudo_legal_moves}
        if all(q not in post_attacked for q in queens_after):
            resolving.append(own_move)
    return resolving


def _prefer_queen_promotion(moves: list[chess.Move]) -> list[chess.Move]:
    """Among a set of capture moves, when promotions are present, restrict to queen-promotions.

    Used inside the king-capture and queen-capture short-circuits where the
    `_rng.choice` over capture moves was randomly producing under-promotions
    (g22 p26 minor: rook promotion; g24 p14 major: knight promotion in
    middlegame). Queen is strictly best-or-equal except for niche stalemate
    avoidance — accept that asymmetry.
    """
    if not any(m.promotion is not None for m in moves):
        return moves
    queen_promos = [m for m in moves if m.promotion == chess.QUEEN]
    if queen_promos:
        return queen_promos
    return moves


def _compute_per_move_budget_ms(
    clock_remaining_ms: int,
    increment_ms: int,
    *,
    safety_ms: int = 200,
    moves_remaining_estimate: int = 40,
    soft_cap_ms: int = 10_000,
) -> int:
    """Standard chess time-management heuristic.

    `budget = (clock - safety) / moves_remaining + increment`, clamped to
    [50, soft_cap]. Using 1/40 of the bank per move ensures the engine
    can sustain ~40 moves before the bank depletes, while the increment
    refills the bank so steady-state thinking is bounded by the increment.

    soft_cap protects against single-move blowups when the bank is huge
    (e.g., 60+2 control on the first move would otherwise allow a 4-second
    think; 10s cap is generous and lets even deep positions run).
    """
    usable = max(0, clock_remaining_ms - safety_ms)
    bank_share = usable // moves_remaining_estimate
    budget = bank_share + increment_ms
    return max(50, min(soft_cap_ms, budget))


class RandomStrategy:
    """Picks uniformly at random from legal moves. Baseline opponent."""

    def __init__(self, seed: int = 0) -> None:
        self.rng = random.Random(seed)

    def reset(self, perspective: chess.Color) -> None:
        self.perspective = perspective

    def observe_own_move(self, move: chess.Move, observation: Observation) -> None:
        pass

    def observe_opp_move(self, observation: Observation) -> None:
        pass

    def pick_move(self, view: PerspectiveView) -> chess.Move:
        return self.rng.choice(view.own_legal_moves)


class LegalGreedy:
    """Capture-if-can-else-random-legal. No belief, no Stockfish.

    Ladder-floor reference: every bot above this is provably doing belief work.
    A "capture" here is a move whose target square holds a *visible* opp
    piece — moves into hidden squares are random (the bot doesn't know).
    """

    def __init__(self, seed: int = 0) -> None:
        self.rng = random.Random(seed)

    def reset(self, perspective: chess.Color) -> None:
        self.perspective = perspective

    def observe_own_move(self, move: chess.Move, observation: Observation) -> None:
        pass

    def observe_opp_move(self, observation: Observation) -> None:
        pass

    def pick_move(self, view: PerspectiveView) -> chess.Move:
        captures: list[chess.Move] = []
        for move in view.own_legal_moves:
            target = view.visible_piece_map.get(move.to_square)
            if target is not None and target.color != view.perspective:
                if target.piece_type == chess.KING:
                    return move
                captures.append(move)
        return self.rng.choice(captures or view.own_legal_moves)


@dataclass
class Tier1Strategy:
    """Belief tracker + per-particle evaluator vote.

    The evaluator is taken in via an `EvaluatorBuilder`: a callable that
    produces a per-move Evaluator given the current PerspectiveView. View-
    independent evaluators (material, Stockfish) wrap with
    `engine.static_builder`. Visibility-grounded evaluators close over the
    view to compute threats from observed truth.
    """

    evaluator_builder: EvaluatorBuilder
    move_prior: OpponentMovePrior = field(default=uniform_prior)
    target_n: int = 256
    max_eval_particles: int = 16
    risk_aversion: float = 0.0
    seed: int = 0
    # Per-pick observability. Populated by pick_move; the bake-off harness
    # reads this after each game to dump a per-Tier-1-ply trace JSONL. Each
    # entry: {tier1_move_count, ply, decision_path, particle_count_pre_sample,
    # move_chosen_uci, top_k_scores}. top_k_scores is empty when a short-circuit
    # fired (no main-eval scoring happened).
    trace_log: list[dict] = field(default_factory=list)

    def __post_init__(self) -> None:
        self._rng = random.Random(self.seed)
        self._belief: BeliefState | None = None
        self._tier1_move_count = 0
        # Belief-step diagnostics for the next emit_trace. Captured by
        # observe_own_move (Stage A) and observe_opp_move (Stage B) and
        # consumed (cleared) by the next pick_move's _emit_trace.
        self._pending_belief_steps: dict[str, int] = {}
        # v0.6.0: pending capture detected in pick_move from the pre-move
        # visible_piece_map. Consumed by observe_own_move to update belief's
        # opp_remaining_counts.
        self._pending_capture_type: chess.PieceType | None = None
        # Pre-move visibility snapshot, captured at the start of pick_move and
        # used during capture detection. Avoids needing to plumb the view
        # through observe_own_move.
        self._last_view_visible: dict[chess.Square, chess.Piece] = {}

    def reset(self, perspective: chess.Color) -> None:
        self._belief = BeliefState.initial(
            perspective=perspective,
            move_prior=self.move_prior,
            target_n=self.target_n,
            rng=random.Random(self.seed + (1 if perspective == chess.BLACK else 0)),
        )
        self.trace_log.clear()
        self._tier1_move_count = 0
        self._pending_belief_steps = {}
        self._pending_capture_type = None
        self._last_view_visible = {}

    def _emit_trace(
        self,
        decision_path: str,
        particle_count_pre: int,
        chosen: chess.Move,
        top_k_scores: list[tuple[str, float]] | None = None,
    ) -> None:
        self._tier1_move_count += 1
        # Tier-1 plays half the moves; ply is 2k-1 for white, 2k for black.
        assert self._belief is not None
        is_white = self._belief.perspective == chess.WHITE
        ply = 2 * self._tier1_move_count - (1 if is_white else 0)
        belief_unique = len({p.fen() for p in self._belief.particles}) if self._belief else 0
        # Snapshot opp_remaining_counts as a string-keyed dict (chess.PieceType
        # is an int alias, so JSON serializes — but readability suffers).
        piece_type_names = {
            chess.PAWN: "pawn",
            chess.KNIGHT: "knight",
            chess.BISHOP: "bishop",
            chess.ROOK: "rook",
            chess.QUEEN: "queen",
            chess.KING: "king",
        }
        opp_counts = {
            piece_type_names[pt]: n
            for pt, n in self._belief.opp_remaining_counts.items()
        }
        record = {
            "tier1_move_count": self._tier1_move_count,
            "ply": ply,
            "decision_path": decision_path,
            "particle_count_pre_sample": particle_count_pre,
            "belief_unique_count": belief_unique,
            "move_chosen_uci": chosen.uci(),
            "top_k_scores": [
                {"uci": uci, "score": score} for uci, score in (top_k_scores or [])
            ],
            "opp_remaining_counts": opp_counts,
        }
        # Carry over belief-step diagnostics from the most recent Stage A/B
        # observation updates, then clear so the next pick_move starts fresh.
        record.update(self._pending_belief_steps)
        self._pending_belief_steps = {}
        self.trace_log.append(record)

    def observe_own_move(self, move: chess.Move, observation: Observation) -> None:
        assert self._belief is not None
        # v0.6.0: register the capture detected in pick_move (visible enemy at
        # the destination, or en-passant). Decrements opp_remaining_counts so
        # the next Stage B can prune particles hallucinating extra pieces.
        if self._pending_capture_type is not None:
            self._belief.register_capture(self._pending_capture_type)
            self._pending_capture_type = None
        before = len(self._belief.particles)
        before_unique = len({p.fen() for p in self._belief.particles})
        self._belief.update_after_own_move(move, observation)
        after = len(self._belief.particles)
        after_unique = len({p.fen() for p in self._belief.particles})
        self._pending_belief_steps["belief_pre_stage_a"] = before
        self._pending_belief_steps["belief_pre_stage_a_unique"] = before_unique
        self._pending_belief_steps["belief_post_stage_a"] = after
        self._pending_belief_steps["belief_post_stage_a_unique"] = after_unique

    def _detect_capture_type(
        self,
        move: chess.Move,
        view: PerspectiveView,
    ) -> chess.PieceType | None:
        """Return the type of opp piece captured by `move`, or None if no capture.

        Two cases (FOW visibility-grounded — only fires on captures we observe):
          1. Direct capture: pre-move `view.visible_piece_map[move.to_square]`
             is an enemy piece. Squares we see are guaranteed accurate, so any
             enemy piece there is what the move captures.
          2. En-passant: own pawn moves diagonally to an empty (per visibility)
             square. The captured pawn is on the file of `to_square`, on the
             rank we came from — and is always visible (adjacent diagonal).
             Captured piece type is PAWN.

        Hidden captures (moving into fog and hitting a hidden enemy) return
        None: no observation evidence, so v0.6.0 leaves the bound conservative.
        """
        own_color = view.perspective
        target = view.visible_piece_map.get(move.to_square)
        if target is not None and target.color != own_color:
            return target.piece_type

        from_piece = view.visible_piece_map.get(move.from_square)
        if (
            from_piece is not None
            and from_piece.piece_type == chess.PAWN
            and chess.square_file(move.from_square) != chess.square_file(move.to_square)
            and target is None
        ):
            ep_capture_sq = chess.square(
                chess.square_file(move.to_square),
                chess.square_rank(move.from_square),
            )
            ep_target = view.visible_piece_map.get(ep_capture_sq)
            if (
                ep_target is not None
                and ep_target.color != own_color
                and ep_target.piece_type == chess.PAWN
            ):
                return chess.PAWN

        return None

    def observe_opp_move(self, observation: Observation) -> None:
        assert self._belief is not None
        before = len(self._belief.particles)
        before_unique = len({p.fen() for p in self._belief.particles})
        self._belief.update_after_opp_move(observation)
        after = len(self._belief.particles)
        after_unique = len({p.fen() for p in self._belief.particles})
        self._pending_belief_steps["belief_pre_stage_b"] = before
        self._pending_belief_steps["belief_pre_stage_b_unique"] = before_unique
        self._pending_belief_steps["belief_post_stage_b"] = after
        self._pending_belief_steps["belief_post_stage_b_unique"] = after_unique
        # v0.6.0: how many expanded particles the count-constraint filter killed.
        self._pending_belief_steps["constraint_pruned_stage_b"] = (
            self._belief.last_constraint_pruned
        )

    def pick_move(self, view: PerspectiveView) -> chess.Move:
        assert self._belief is not None
        particle_count_pre = len(self._belief.particles)
        # Snapshot pre-move visibility for capture detection in observe_own_move.
        self._last_view_visible = dict(view.visible_piece_map)

        king_captures = [
            move
            for move in view.own_legal_moves
            if (piece := view.visible_piece_map.get(move.to_square)) is not None
            and piece.color != view.perspective
            and piece.piece_type == chess.KING
        ]
        if king_captures:
            chosen = self._rng.choice(_prefer_queen_promotion(king_captures))
            self._pending_capture_type = self._detect_capture_type(chosen, view)
            self._emit_trace("king-capture", particle_count_pre, chosen)
            return chosen

        # King-defense short-circuit. Symmetric to king-capture: if our king is
        # on a square a visible enemy can capture next turn, restrict to moves
        # that resolve the attack (king flight, attacker capture, or block).
        # Stockfish-eval underweights "own king visibly attacked" because under
        # standard-chess rules it expects opp to be unable to capture the king;
        # in FOW opp will, so we have to bake the rule in here.
        king_defense = _king_defense_moves(view)
        if king_defense:
            chosen = self._rng.choice(king_defense)
            self._pending_capture_type = self._detect_capture_type(chosen, view)
            self._emit_trace("king-defense", particle_count_pre, chosen)
            return chosen

        # Queen-capture short-circuit. Same shape as king-capture: if any legal
        # move lands on a visible enemy queen, take it. Visibility-grounded so
        # it doesn't depend on belief aggregation (which the 2026-05-07 replay-
        # eval showed routinely loses these tactics to vote dilution).
        queen_captures = [
            move
            for move in view.own_legal_moves
            if (piece := view.visible_piece_map.get(move.to_square)) is not None
            and piece.color != view.perspective
            and piece.piece_type == chess.QUEEN
        ]
        if queen_captures:
            chosen = self._rng.choice(_prefer_queen_promotion(queen_captures))
            self._pending_capture_type = self._detect_capture_type(chosen, view)
            self._emit_trace("queen-capture", particle_count_pre, chosen)
            return chosen

        # Queen-save short-circuit. If our queen is on a square a visible enemy
        # piece could capture next turn AND we have a queen move to a square
        # not attacked by any visible enemy piece, take one of those moves.
        # "Safe" is measured against a visibility-only synthesized board —
        # hidden attackers don't fire this.
        queen_save = _queen_save_moves(view)
        if queen_save:
            chosen = self._rng.choice(queen_save)
            self._pending_capture_type = self._detect_capture_type(chosen, view)
            self._emit_trace("queen-save", particle_count_pre, chosen)
            return chosen

        if not self._belief.particles:
            # Belief filter collapsed (no particles consistent with observation).
            # Without this fallback, best_action returns own_legal_moves[0] —
            # deterministic first-alphabetical, worse than random. Score moves
            # on a visibility-only synthesized board instead so visible captures
            # and threats still drive selection.
            chosen = self._fallback_pick_move(view)
            self._pending_capture_type = self._detect_capture_type(chosen, view)
            self._emit_trace("fallback", particle_count_pre, chosen)
            return chosen

        # Compute deadline from clock if we're in a timed regime. Leave a
        # 200ms buffer so we don't accidentally spend the entire clock on
        # this move (the harness debits actual elapsed wall, including
        # python overhead between deadline check and return).
        deadline_monotonic: float | None = None
        if view.clock_remaining_ms is not None:
            usable_clock_ms = max(0, view.clock_remaining_ms - 200)
            budget_ms = _compute_per_move_budget_ms(
                usable_clock_ms, view.increment_ms
            )
            budget_ms = min(budget_ms, usable_clock_ms) if usable_clock_ms > 0 else 50
            deadline_monotonic = time.monotonic() + budget_ms / 1000.0

        evaluator = self.evaluator_builder(view)
        scored: list[tuple[chess.Move, float, float]] = []
        chosen = best_action(
            self._belief,
            evaluator,
            view.own_legal_moves,
            max_particles=self.max_eval_particles,
            risk_aversion=self.risk_aversion,
            rng=self._rng,
            deadline_monotonic=deadline_monotonic,
            out_scored_moves=scored,
        )
        # Top 5 moves by aggregated score; only surface what the trace actually needs.
        scored.sort(key=lambda r: -r[1])
        top_k = [(m.uci(), s) for m, s, _support in scored[:5]]
        self._pending_capture_type = self._detect_capture_type(chosen, view)
        self._emit_trace("main-eval", particle_count_pre, chosen, top_k_scores=top_k)
        return chosen

    def _fallback_pick_move(self, view: PerspectiveView) -> chess.Move:
        """Score moves on a visibility-only board. Used when belief has collapsed."""
        synthesized = chess.Board.empty()
        for sq, piece in view.visible_piece_map.items():
            synthesized.set_piece_at(sq, piece)
        synthesized.turn = view.perspective

        evaluator = self.evaluator_builder(view)
        scored: list[tuple[chess.Move, float]] = []
        best_score = float("-inf")
        for move in view.own_legal_moves:
            try:
                score = evaluator(synthesized, move, view.perspective)
            except (ValueError, AssertionError):
                continue
            scored.append((move, score))
            if score > best_score:
                best_score = score
        if not scored:
            return view.own_legal_moves[0]
        eps = 1e-6
        top = [m for m, s in scored if s >= best_score - eps]
        return self._rng.choice(top)
