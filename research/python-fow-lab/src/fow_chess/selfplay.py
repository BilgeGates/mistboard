"""Drive a fog-of-war game between two strategies, emitting bichess event logs."""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Any, Protocol

import chess

from .observation import Observation, observation_from_transition

GameEvent = dict[str, Any]


class Strategy(Protocol):
    """Per-game player. Receives observations; returns moves.

    `pick_move` is called when it is this strategy's turn. The harness hands it
    the list of pseudo-legal moves available on the canonical board (not the
    belief — the player's own pieces are fully known to them; legality of
    those moves only depends on own pieces and the squares they attack/occupy,
    which under FOW the player can compute from PlayerView).
    """

    def reset(self, perspective: chess.Color) -> None: ...
    def observe_own_move(self, move: chess.Move) -> None: ...
    def observe_opp_move(self, observation: Observation) -> None: ...
    def pick_move(self, own_legal_moves: list[chess.Move]) -> chess.Move: ...


@dataclass
class GameResult:
    events: list[GameEvent]
    plies: int
    winner: str | None  # 'white' | 'black' | None
    end_reason: str  # 'king-captured' | 'truncated' | 'no-legal-moves'
    truncated: bool


def play_game(
    white: Strategy,
    black: Strategy,
    *,
    max_plies: int = 300,
    room_id: str = "engine-play",
    seed: int = 0,
) -> GameResult:
    """Run one FOW game from the standard start to a terminal state.

    Game-over: a king is captured. Otherwise truncated at max_plies.
    Stalemate-like positions (no pseudo-legal moves) end as 'no-legal-moves'.
    """
    _ = seed  # reserved for future deterministic harness wiring
    board = chess.Board()
    white.reset(chess.WHITE)
    black.reset(chess.BLACK)

    events: list[GameEvent] = [
        {
            "type": "room-created",
            "at": 0,
            "roomId": room_id,
            "variant": "fog-of-war",
            "offer": [],
        }
    ]
    plies = 0
    end_reason = "truncated"

    while plies < max_plies:
        if board.king(chess.WHITE) is None or board.king(chess.BLACK) is None:
            end_reason = "king-captured"
            break

        color = board.turn
        active = white if color == chess.WHITE else black
        passive = black if color == chess.WHITE else white

        own_legals = list(board.pseudo_legal_moves)
        if not own_legals:
            end_reason = "no-legal-moves"
            break

        prev = board.copy()
        move = active.pick_move(own_legals)
        board.push(move)
        plies += 1

        events.append(
            {
                "type": "move-played",
                "at": plies,
                "roomId": room_id,
                "color": "white" if color == chess.WHITE else "black",
                "move": _move_to_event(move, prev),
            }
        )

        active.observe_own_move(move)
        opp = chess.BLACK if color == chess.WHITE else chess.WHITE
        passive.observe_opp_move(observation_from_transition(prev, board, opp))

    truncated = end_reason == "truncated"
    if board.king(chess.WHITE) is None:
        winner = "black"
    elif board.king(chess.BLACK) is None:
        winner = "white"
    else:
        winner = None

    return GameResult(
        events=events,
        plies=plies,
        winner=winner,
        end_reason=end_reason,
        truncated=truncated,
    )


def _move_to_event(move: chess.Move, prev: chess.Board) -> dict[str, Any]:
    out: dict[str, Any] = {
        "from": chess.square_name(move.from_square),
        "to": chess.square_name(move.to_square),
    }

    # Bichess castling representation is "king-takes-friendly-rook" — convert
    # python-chess's standard king-2-square form when emitting.
    if prev.is_castling(move):
        is_kingside = chess.square_file(move.to_square) > chess.square_file(
            move.from_square
        )
        rank = chess.square_rank(move.from_square)
        rook_file = 7 if is_kingside else 0
        out["to"] = chess.square_name(chess.square(rook_file, rank))

    if move.promotion is not None:
        out["promotion"] = {
            chess.QUEEN: "queen",
            chess.ROOK: "rook",
            chess.BISHOP: "bishop",
            chess.KNIGHT: "knight",
        }[move.promotion]

    return out
