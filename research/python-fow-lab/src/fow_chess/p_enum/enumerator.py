"""Eager enumeration of positions consistent with observation history."""

from __future__ import annotations

import random
from typing import Iterator

import chess

from ..observation import Observation, consistent_with


class PEnumerator:
    """Maintains the set P of positions consistent with observation history.

    Eager strategy: enumerate P fully on every update. Memoryless in
    the sense that P at time t depends only on P at time t-1 + the
    update (own move or opp observation). No repair, no fallback —
    if P becomes empty (a soundness leak), updates fail loud rather
    than silently inserting positions.

    Usage::

        e = PEnumerator(chess.WHITE)
        # ... at every ply ...
        if mover_color == perspective:
            e.update_own_move(move)            # known transition
        else:
            obs = observation_from_transition(prev, nxt, perspective)
            e.update_opp_move(obs)             # filtered by obs

    Internal representation: ``self._positions`` is a set of board FEN
    strings (placement + active color + castling + ep + halfmove +
    fullmove) — same dedup key python-chess uses for board equality.

    Args:
        perspective: which color this player IS. The enumerator tracks
            P from their POV; opp moves are filtered through their
            observation.
        starting_board: the canonical game-start board (defaults to
            standard chess starting position).
        max_size: optional cap on |P|. When the post-update set exceeds
            this, we downsample to ``max_size`` uniformly at random
            (reservoir-style — every element has equal probability of
            being kept). When set, the truth-in-P guarantee is no
            longer strict: if the truth happens to be among the dropped
            positions, downstream search reasons over a P that doesn't
            include reality. Trade-off for tractability when |P|
            explodes (per A3 benchmark, real games can hit |P|>200K).
            ``None`` (default) keeps the exact-enumeration guarantee
            from A3.
        rng: deterministic RNG for downsampling. Only used when
            ``max_size`` is set. Defaults to a fresh ``random.Random()``.
    """

    def __init__(
        self,
        perspective: chess.Color,
        *,
        starting_board: chess.Board | None = None,
        max_size: int | None = None,
        rng: random.Random | None = None,
    ) -> None:
        self.perspective = perspective
        if starting_board is None:
            starting_board = chess.Board()
        self._positions: set[str] = {starting_board.fen()}
        self.max_size = max_size
        self._rng = rng if rng is not None else random.Random()
        # Counter — incremented each time downsampling fires.
        self.downsample_count = 0

    @property
    def positions(self) -> frozenset[str]:
        """Frozen snapshot of the current P, as board FEN strings.

        Copies the internal set on every access — safe for callers that
        need immutable-snapshot semantics (engine truth-in-P checks,
        debugging, tests). NOT recommended for downstream consumers
        that just want to iterate; use ``iter_positions()`` for that.
        """
        return frozenset(self._positions)

    def iter_positions(self) -> Iterator[str]:
        """Stream over the current P without copying.

        Yields each board FEN string in P one at a time. No
        materialization beyond the existing internal set. Use this for
        downstream consumers that aggregate or filter (e.g.,
        ``lab/mining/`` puzzle-mining stats) where building a 10⁶-board
        frozenset snapshot would be wasteful.

        Mutation contract: do NOT call ``update_own_move`` /
        ``update_opp_move`` while iterating; doing so invalidates the
        iterator (RuntimeError: set changed size during iteration).
        """
        return iter(self._positions)

    def __iter__(self) -> Iterator[str]:
        """Same as ``iter_positions()``. Lets ``for fen in enumerator:``
        work without going through the snapshot-copy ``positions``
        property."""
        return iter(self._positions)

    @property
    def size(self) -> int:
        return len(self._positions)

    def update_own_move(self, move: chess.Move) -> None:
        """Apply ``move`` (made by the perspective player) to every position
        in P. Positions where the move is not pseudo-legal are dropped.

        Raises:
            RuntimeError: if no position in P admits this move
                (soundness violation — the move couldn't have been
                played from any candidate truth).
        """
        new_positions: set[str] = set()
        for fen in self._positions:
            board = chess.Board(fen)
            if board.turn != self.perspective:
                # Shouldn't happen if caller alternates correctly, but
                # be explicit about the invariant.
                continue
            if move not in board.pseudo_legal_moves:
                continue
            board.push(move)
            new_positions.add(board.fen())
        if not new_positions:
            raise RuntimeError(
                f"P became empty after own move {move.uci()}; no candidate "
                f"position admitted it. This is a soundness violation."
            )
        self._positions = self._maybe_downsample(new_positions)

    def update_opp_move(self, observation: Observation) -> None:
        """Apply an opponent move: for each p in P, enumerate opp's
        pseudo-legal moves, push each, filter by consistency with
        ``observation``.

        Raises:
            RuntimeError: if no (position, move) pair in any current p
                produces a position consistent with the observation
                (soundness violation).
        """
        opp = not self.perspective
        new_positions: set[str] = set()
        for fen in self._positions:
            prev = chess.Board(fen)
            if prev.turn != opp:
                continue
            for move in prev.pseudo_legal_moves:
                nxt = prev.copy()
                nxt.push(move)
                if consistent_with(nxt, prev, observation, self.perspective):
                    new_positions.add(nxt.fen())
        if not new_positions:
            raise RuntimeError(
                "P became empty after opp move; no (predecessor, move) pair "
                "produced an observation-consistent position. This is a "
                "soundness violation."
            )
        self._positions = self._maybe_downsample(new_positions)

    def _maybe_downsample(self, positions: set[str]) -> set[str]:
        """If max_size is set and |positions| > max_size, uniformly
        downsample. Otherwise return positions unchanged."""
        if self.max_size is None or len(positions) <= self.max_size:
            return positions
        # random.sample on a set converts to list internally; we do the
        # same explicitly so the conversion is visible.
        kept = self._rng.sample(list(positions), self.max_size)
        self.downsample_count += 1
        return set(kept)

    def __len__(self) -> int:
        return self.size

    def __contains__(self, fen: str) -> bool:
        return fen in self._positions
