"""Eager enumeration of positions consistent with observation history."""

from __future__ import annotations

import random
from typing import Iterator

import chess

from ..observation import Observation, consistent_with

try:
    import fow_rust as _fow_rust
    _HAS_RUST = True
except ImportError:
    _HAS_RUST = False


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
        # Per-call telemetry, set on every update_*_move. Lets the engine
        # / bakeoff strategy capture pre-dedup and pre-cap |P| sizes
        # without instrumenting inside the Rust hot path.
        #   last_raw_count: size of the Rust hot-path output BEFORE
        #     Python's set() dedup. Equals total (prev, move) pairs that
        #     survived consistency check — likely-large for opp moves,
        #     equals last_pre_cap_count for own moves (1-to-1 mapping).
        #   last_pre_cap_count: size of new P AFTER dedup, BEFORE
        #     _maybe_downsample. The "natural" |P| we'd carry if cap
        #     were infinite.
        #   last_was_downsampled: bool, True iff the cap fired this call.
        self.last_raw_count: int = 0
        self.last_pre_cap_count: int = 1
        self.last_was_downsampled: bool = False

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
        if _HAS_RUST:
            # Canonicalize castling encoding before crossing into Rust.
            # python-chess's `move in board.pseudo_legal_moves` is fuzzy:
            # it accepts BOTH standard (e1g1) and Chess960/Shredder
            # (e1h1) castling encodings via `is_pseudo_legal`. Our Rust
            # check is direct tuple equality and only matches the
            # standard encoding that gen_pseudo_legal_moves emits.
            # Without this normalization, replaying historical game
            # files (which use e1h1) crashes with "P empty" at the
            # first castle. Live bakeoff isn't affected (strategies
            # emit standard encoding) but offline diff infra is.
            if self._positions:
                sample = chess.Board(next(iter(self._positions)))
                move = _canonicalize_castling(move, sample)
            kept = _fow_rust.update_own_move_rust(
                list(self._positions),
                self.perspective == chess.WHITE,
                move.from_square,
                move.to_square,
                move.promotion or 0,
            )
            self.last_raw_count = len(kept)
            new_positions: set[str] = set(kept)
        else:
            new_positions = set()
            for fen in self._positions:
                board = chess.Board(fen)
                if board.turn != self.perspective:
                    continue
                if move not in board.pseudo_legal_moves:
                    continue
                board.push(move)
                new_positions.add(board.fen())
            self.last_raw_count = len(new_positions)

        self.last_pre_cap_count = len(new_positions)
        if not new_positions:
            raise RuntimeError(
                f"P became empty after own move {move.uci()}; no candidate "
                f"position admitted it. This is a soundness violation."
            )
        prev_dc = self.downsample_count
        self._positions = self._maybe_downsample(new_positions)
        self.last_was_downsampled = self.downsample_count > prev_dc

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
        perspective_white = self.perspective == chess.WHITE

        if _HAS_RUST:
            obs_w, obs_b = _obs_piece_bitmasks(observation)
            obs_visibility = int(observation.visibility_mask)
            obs_own_idx = (
                -1 if observation.own_capture_square is None
                else int(observation.own_capture_square)
            )
            obs_opp_idx = (
                -1 if observation.opp_capture_landing_square is None
                else int(observation.opp_capture_landing_square)
            )
            kept = _fow_rust.update_opp_move_rust(
                list(self._positions),
                opp == chess.WHITE,
                perspective_white,
                obs_visibility,
                obs_w[0], obs_w[1], obs_w[2], obs_w[3], obs_w[4], obs_w[5],
                obs_b[0], obs_b[1], obs_b[2], obs_b[3], obs_b[4], obs_b[5],
                obs_own_idx, obs_opp_idx,
            )
            self.last_raw_count = len(kept)
            new_positions: set[str] = set(kept)
        else:
            new_positions = set()
            raw = 0
            for fen in self._positions:
                prev = chess.Board(fen)
                if prev.turn != opp:
                    continue
                for move in prev.pseudo_legal_moves:
                    nxt = prev.copy()
                    nxt.push(move)
                    if consistent_with(nxt, prev, observation, self.perspective):
                        raw += 1
                        new_positions.add(nxt.fen())
            self.last_raw_count = raw

        self.last_pre_cap_count = len(new_positions)
        if not new_positions:
            raise RuntimeError(
                "P became empty after opp move; no (predecessor, move) pair "
                "produced an observation-consistent position. This is a "
                "soundness violation."
            )
        prev_dc = self.downsample_count
        self._positions = self._maybe_downsample(new_positions)
        self.last_was_downsampled = self.downsample_count > prev_dc

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


def _canonicalize_castling(move: chess.Move, sample_board: chess.Board) -> chess.Move:
    """Normalize king→rook castling encoding (e.g., e1h1) into the
    king→destination encoding (e.g., e1g1) that python-chess's standard
    pseudo_legal_moves emits. Only rewrites when the king is actually
    on its starting square in the sample board (which means it's on
    that square in EVERY P entry at this ply, since own piece positions
    are deterministic). Pass-through for all other moves."""
    if move.promotion or move.drop:
        return move
    fs, ts = move.from_square, move.to_square
    king_mask = sample_board.kings & sample_board.occupied_co[sample_board.turn]
    if fs == chess.E1 and king_mask & (1 << fs):
        if ts == chess.H1:
            return chess.Move(fs, chess.G1)
        if ts == chess.A1:
            return chess.Move(fs, chess.C1)
    elif fs == chess.E8 and king_mask & (1 << fs):
        if ts == chess.H8:
            return chess.Move(fs, chess.G8)
        if ts == chess.A8:
            return chess.Move(fs, chess.C8)
    return move


def _obs_piece_bitmasks(observation: Observation) -> tuple[list[int], list[int]]:
    """Extract observation.visible_pieces into two 6-element bitmask lists
    indexed by (piece_type - 1): [pawn, knight, bishop, rook, queen, king].
    Returned as (white_masks, black_masks). One-time cost per
    update_opp_move call — avoids per-(prev, move) dict iteration."""
    obs_w = [0] * 6
    obs_b = [0] * 6
    for sq, piece in observation.visible_pieces.items():
        bb = 1 << sq
        if piece.color:
            obs_w[piece.piece_type - 1] |= bb
        else:
            obs_b[piece.piece_type - 1] |= bb
    return obs_w, obs_b
