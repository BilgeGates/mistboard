"""Evaluators for Tier-1 fog-of-war engines.

Evaluators exposed:

- `material_evaluator()` — fast, pure-Python centipawn material balance.
  Always usable, no external dependencies, no quirks. The Tier-1 baseline
  uses this.

- `visibility_threat_evaluator(threat_lambda)` — material minus threats from
  visible opp pieces only (observed truth, no particle aggregation). Builder
  form; closes over `PerspectiveView` per move.

- `stockfish_evaluator(...)` — Stockfish via raw UCI subprocess. Sends
  positions, parses `info`-line scores, never reads or validates `bestmove`
  — that's the failure path in python-chess's wrapper, which rejects moves
  Stockfish emits for FOW positions where side-to-move is in check (FOW
  doesn't enforce check escape). Falls back to material on timeout or
  subprocess errors.
"""

from __future__ import annotations

import os
import pty
import select
import subprocess
import time
from contextlib import contextmanager
from typing import Iterator

import chess

from .engine import Evaluator, EvaluatorBuilder
from .selfplay import PerspectiveView

_KING_CAPTURE_SCORE = 100_000.0  # Bigger than any centipawn eval Stockfish returns.

_PIECE_VALUES = {
    chess.PAWN: 100,
    chess.KNIGHT: 320,
    chess.BISHOP: 330,
    chess.ROOK: 500,
    chess.QUEEN: 900,
    chess.KING: 0,  # Kings handled by the king-capture short-circuit.
}


def material_score(board: chess.Board, perspective: chess.Color) -> float:
    """Centipawn material balance from `perspective`'s POV."""
    total = 0
    for piece in board.piece_map().values():
        sign = 1 if piece.color == perspective else -1
        total += sign * _PIECE_VALUES[piece.piece_type]
    return float(total)


def material_evaluator() -> Evaluator:
    """Evaluator that scores a candidate move by post-move material balance.

    Includes the king-capture short-circuit so Tier-1 always grabs an
    available king capture without needing Stockfish.
    """

    def evaluate(
        board: chess.Board, move: chess.Move, perspective: chess.Color
    ) -> float:
        target = board.piece_at(move.to_square)
        if target is not None and target.piece_type == chess.KING:
            return (
                _KING_CAPTURE_SCORE
                if target.color != perspective
                else -_KING_CAPTURE_SCORE
            )

        advanced = board.copy()
        advanced.push(move)
        return material_score(advanced, perspective)

    return evaluate


def threat_aware_evaluator(threat_lambda: float = 0.3) -> Evaluator:
    """Material balance minus a discount for `perspective`'s pieces opp can capture.

    For each candidate post-move position, sums the values of `perspective`'s
    non-king pieces that opp's pseudo-legal moves could capture (each piece
    counted once even if multiply attacked, since opp only captures one per
    turn). Subtracts `threat_lambda * threatened_value` from the material
    balance. With a lambda around 0.3, this approximates the expected loss
    from a moderately-active opponent without over-penalizing every threat.

    Threat counting depends on opponent piece positions, which differ across
    belief particles — this is the first evaluator that returns
    particle-dependent scores for non-capture moves, making per-particle
    voting and risk_aversion meaningful.
    """

    def evaluate(
        board: chess.Board, move: chess.Move, perspective: chess.Color
    ) -> float:
        target = board.piece_at(move.to_square)
        if target is not None and target.piece_type == chess.KING:
            return (
                _KING_CAPTURE_SCORE
                if target.color != perspective
                else -_KING_CAPTURE_SCORE
            )

        advanced = board.copy()
        advanced.push(move)
        if advanced.king(chess.WHITE) is None or advanced.king(chess.BLACK) is None:
            return 0.0

        base = material_score(advanced, perspective)

        # advanced.turn is now opp; iterate their pseudo-legal moves and
        # collect the squares of `perspective`'s pieces under attack.
        threatened_squares: set[int] = set()
        for m in advanced.pseudo_legal_moves:
            tgt = advanced.piece_at(m.to_square)
            if tgt is not None and tgt.color == perspective and tgt.piece_type != chess.KING:
                threatened_squares.add(m.to_square)

        threat_value = sum(
            _PIECE_VALUES[advanced.piece_at(sq).piece_type] for sq in threatened_squares
        )
        return base - threat_lambda * threat_value

    return evaluate


def visibility_threat_evaluator(threat_lambda: float = 0.3) -> EvaluatorBuilder:
    """Material balance minus a threat discount counted from visible opp pieces only.

    Counter to `threat_aware_evaluator`, which counts threats from every
    particle's hypothesized opp positions (and hallucinates because particles
    disperse opp pieces across many plausible squares), this builder uses the
    PerspectiveView's `visible_piece_map` to count threats only from opp
    pieces the perspective actually sees.

    Implementation: per particle, evaluate as

        base = material_score(advanced, perspective)
        threats = pseudo-legal-moves on a synthetic board containing
                  (own pieces post-move) ∪ (visible opp pieces still on the
                  board after our move)
        score = base - threat_lambda * sum(threatened own piece values)

    Material balance is still computed on the particle (so capture moves on
    hidden squares retain particle sensitivity). Threat counting uses observed
    truth and ignores hidden hypothesized opp pieces, sidestepping the
    hallucination problem.

    Per-particle voting becomes near-degenerate with this evaluator for non-
    capture moves — that's intentional. The structural fix for belief-noise-
    driven heuristics is to not aggregate over noisy particles; aggregate
    over observed truth instead.
    """

    def build(view: PerspectiveView) -> Evaluator:
        perspective = view.perspective
        visible_opp_pieces: dict[chess.Square, chess.Piece] = {
            sq: piece
            for sq, piece in view.visible_piece_map.items()
            if piece.color != perspective
        }

        def evaluate(
            board: chess.Board, move: chess.Move, perspective_: chess.Color
        ) -> float:
            target = board.piece_at(move.to_square)
            if target is not None and target.piece_type == chess.KING:
                return (
                    _KING_CAPTURE_SCORE
                    if target.color != perspective_
                    else -_KING_CAPTURE_SCORE
                )

            advanced = board.copy()
            advanced.push(move)
            if (
                advanced.king(chess.WHITE) is None
                or advanced.king(chess.BLACK) is None
            ):
                return 0.0

            base = material_score(advanced, perspective_)

            visibility_board = chess.Board.empty()
            for sq in chess.SquareSet(advanced.occupied_co[perspective_]):
                piece = advanced.piece_at(sq)
                if piece is not None:
                    visibility_board.set_piece_at(sq, piece)
            for sq, piece in visible_opp_pieces.items():
                if advanced.piece_at(sq) is None:
                    continue  # captured by `move`, no longer threatens
                visibility_board.set_piece_at(sq, piece)
            visibility_board.turn = not perspective_

            threatened: set[int] = set()
            for m in visibility_board.pseudo_legal_moves:
                tgt = visibility_board.piece_at(m.to_square)
                if (
                    tgt is not None
                    and tgt.color == perspective_
                    and tgt.piece_type != chess.KING
                ):
                    threatened.add(m.to_square)
            threat_value = sum(
                _PIECE_VALUES[visibility_board.piece_at(sq).piece_type]
                for sq in threatened
            )

            return base - threat_lambda * threat_value

        return evaluate

    return build


class _UCIEngine:
    """Minimal UCI client over a Stockfish subprocess.

    Sends `position` and `go`, parses `info`-line scores, ignores `bestmove`.
    Bypasses python-chess's `engine.analyse` because that path validates
    bestmove against the position and crashes on FOW positions where
    side-to-move is in check (Stockfish emits a move that doesn't reconcile
    with the position python-chess validates against).

    Reads stdout via `select` so the analyse loop has a real wall-clock
    timeout — Stockfish has been observed to deadlock on some FOW positions,
    and python-chess's `Limit(time=...)` only bounds Stockfish's compute, not
    its response time.
    """

    def __init__(self, path: str = "stockfish", threads: int = 1) -> None:
        self.path = path
        self.threads = threads
        self.proc: subprocess.Popen[bytes] | None = None
        self._master_fd: int | None = None
        self._buffer: str = ""
        self._open()

    def _open(self) -> None:
        # Stockfish block-buffers stdout when its output is a pipe; give it a
        # pty so it line-buffers. Stdin stays a regular pipe (we control that
        # side and flush after every command).
        master_fd, slave_fd = pty.openpty()
        self._master_fd = master_fd
        self.proc = subprocess.Popen(
            [self.path],
            stdin=subprocess.PIPE,
            stdout=slave_fd,
            stderr=subprocess.DEVNULL,
            close_fds=True,
        )
        os.close(slave_fd)
        self._send("uci")
        self._wait_for_token("uciok", timeout=5.0)
        self._send(f"setoption name Threads value {self.threads}")
        self._send("isready")
        self._wait_for_token("readyok", timeout=5.0)

    def _send(self, cmd: str) -> None:
        if self.proc is None or self.proc.stdin is None:
            raise BrokenPipeError("UCI engine not running")
        self.proc.stdin.write((cmd + "\n").encode("utf-8"))
        self.proc.stdin.flush()

    def _readline(self, timeout: float) -> str | None:
        if self._master_fd is None:
            return None
        deadline = time.monotonic() + timeout
        while True:
            if "\n" in self._buffer:
                line, self._buffer = self._buffer.split("\n", 1)
                return line + "\n"
            rem = deadline - time.monotonic()
            if rem <= 0:
                return None
            ready, _, _ = select.select([self._master_fd], [], [], rem)
            if not ready:
                return None
            try:
                chunk = os.read(self._master_fd, 4096)
            except OSError:
                return None
            if not chunk:
                return None
            self._buffer += chunk.decode("utf-8", errors="replace")

    def _wait_for_token(self, token: str, timeout: float) -> None:
        deadline = time.monotonic() + timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(f"UCI: timed out waiting for {token}")
            line = self._readline(remaining)
            if line is None:
                raise TimeoutError(f"UCI: timed out waiting for {token}")
            stripped = line.strip()
            if stripped == token or stripped.startswith(token + " "):
                return

    def evaluate_fen(
        self, fen: str, depth: int, movetime_ms: int, slack_seconds: float = 0.5
    ) -> float | None:
        """Score a position from side-to-move's POV in centipawns, or None on timeout."""
        self._send(f"position fen {fen}")
        self._send(f"go depth {depth} movetime {movetime_ms}")

        last_score: float | None = None
        deadline = time.monotonic() + (movetime_ms / 1000.0) + slack_seconds
        got_bestmove = False
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            line = self._readline(remaining)
            if line is None:
                break
            stripped = line.strip()
            if stripped.startswith("info "):
                parsed = _parse_info_score(stripped)
                if parsed is not None:
                    last_score = parsed
            elif stripped.startswith("bestmove"):
                got_bestmove = True
                break

        if not got_bestmove:
            # Bail Stockfish out so it's ready for the next position.
            self._send("stop")
            drain_deadline = time.monotonic() + 0.5
            while True:
                rem = drain_deadline - time.monotonic()
                if rem <= 0:
                    break
                line = self._readline(rem)
                if line is None:
                    break
                stripped = line.strip()
                if stripped.startswith("info "):
                    parsed = _parse_info_score(stripped)
                    if parsed is not None:
                        last_score = parsed
                elif stripped.startswith("bestmove"):
                    break
        return last_score

    def close(self) -> None:
        if self.proc is None:
            return
        try:
            self._send("quit")
        except Exception:  # noqa: BLE001
            pass
        if self.proc.stdin is not None:
            try:
                self.proc.stdin.close()
            except Exception:  # noqa: BLE001
                pass
        try:
            self.proc.wait(timeout=2.0)
        except Exception:  # noqa: BLE001
            try:
                self.proc.kill()
            except Exception:  # noqa: BLE001
                pass
        self.proc = None
        if self._master_fd is not None:
            try:
                os.close(self._master_fd)
            except OSError:
                pass
            self._master_fd = None


def _parse_info_score(line: str) -> float | None:
    tokens = line.split()
    for i, t in enumerate(tokens):
        if t == "score" and i + 2 < len(tokens):
            kind = tokens[i + 1]
            try:
                value = int(tokens[i + 2])
            except ValueError:
                return None
            if kind == "cp":
                return float(value)
            if kind == "mate":
                return float(
                    _KING_CAPTURE_SCORE if value > 0 else -_KING_CAPTURE_SCORE
                )
    return None


@contextmanager
def stockfish_evaluator(
    *,
    path: str = "stockfish",
    depth: int = 4,
    time_cap_seconds: float = 0.5,
    threads: int = 1,
) -> Iterator[Evaluator]:
    """Yield a Stockfish-backed Evaluator using raw UCI.

    Bypasses python-chess's `engine.analyse` so FOW positions that produce
    illegal bestmoves don't crash the evaluator pipeline. We never parse
    `bestmove` — only `info`-line scores. Mate scores are clamped to
    ±_KING_CAPTURE_SCORE.

    Falls back to material on timeout, subprocess error, or no parsable score.
    The engine subprocess is restarted on hard errors but kept alive across
    "no score parsed" misses to avoid restart thrashing.
    """
    engine_holder: dict[str, _UCIEngine | None] = {
        "engine": _UCIEngine(path=path, threads=threads)
    }
    movetime_ms = int(time_cap_seconds * 1000)

    def _restart() -> None:
        if engine_holder["engine"] is not None:
            try:
                engine_holder["engine"].close()
            except Exception:  # noqa: BLE001
                pass
        engine_holder["engine"] = None

    def _ensure() -> _UCIEngine:
        if engine_holder["engine"] is None:
            engine_holder["engine"] = _UCIEngine(path=path, threads=threads)
        return engine_holder["engine"]

    try:

        def evaluate(
            board: chess.Board, move: chess.Move, perspective: chess.Color
        ) -> float:
            target = board.piece_at(move.to_square)
            if target is not None and target.piece_type == chess.KING:
                return (
                    _KING_CAPTURE_SCORE
                    if target.color != perspective
                    else -_KING_CAPTURE_SCORE
                )

            advanced = board.copy()
            advanced.push(move)

            if advanced.king(chess.WHITE) is None or advanced.king(chess.BLACK) is None:
                return 0.0

            try:
                eng = _ensure()
                score_from_stm = eng.evaluate_fen(advanced.fen(), depth, movetime_ms)
            except (TimeoutError, OSError, BrokenPipeError):
                _restart()
                return material_score(advanced, perspective)

            if score_from_stm is None:
                return material_score(advanced, perspective)

            # Stockfish reports from advanced.turn (= side to move on `advanced`).
            return (
                score_from_stm
                if advanced.turn == perspective
                else -score_from_stm
            )

        yield evaluate
    finally:
        _restart()
