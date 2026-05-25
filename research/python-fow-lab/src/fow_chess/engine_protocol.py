"""Python mirror of `packages/game/src/engine-protocol.ts`.

This is the wire-format the engine speaks to the Mistboard server. The
TypeScript file is the canonical contract; this Python module mirrors it
so the engine side can parse + emit the same JSON shapes.

When the public TS spec changes, update this file to match. A pair of
serialization round-trip tests should pin the parity (Phase 2 work).

Why dataclasses + TypedDict
  - TypedDicts give us JSON-shape types matching the TS exactly (the wire
    format)
  - Dataclasses give us ergonomic in-engine objects (`EngineObservation`
    instances with attribute access, `__eq__`, etc.)
  - Converters between the two (`from_dict` / `to_dict`) keep wire-format
    handling at the boundary

This file MUST stay free of imports from `fow_chess` engine internals —
it's a pure protocol module. The engine adapter (separate file) does the
mapping between protocol-level Observation and the engine's internal
`fow_chess.observation.Observation`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Optional, TypedDict


# ---------------------------------------------------------------------------
# JSON wire types (TypedDict) — match the TS file 1:1
# ---------------------------------------------------------------------------

ProtocolVersion = Literal["1"]
Color = Literal["white", "black"]
PieceLetter = Literal["P", "N", "B", "R", "Q", "K"]


class VisiblePieceJson(TypedDict):
    type: PieceLetter
    color: Color


class GameOverJson(TypedDict):
    winner: Optional[Color]
    reason: str


class EngineObservationJson(TypedDict, total=False):
    ply: int
    kind: Literal["initial", "own_move", "opp_move"]
    own_move: Optional["MoveJson"]
    visibility_mask: str  # "0x..." 64-bit hex
    visible_pieces: list[tuple[int, VisiblePieceJson]]
    own_capture_square: Optional[int]
    opp_capture_landing_square: Optional[int]
    game_over: Optional[GameOverJson]


class EngineClockJson(TypedDict):
    remaining_ms: Optional[int]
    increment_ms: int


class MoveJson(TypedDict, total=False):
    from_: int  # 'from' is a Python keyword — wire format uses "from" via from-aliased
    to: int
    promotion: Optional[PieceLetter]


class EngineTurnRequestJson(TypedDict, total=False):
    protocolVersion: ProtocolVersion
    gameId: str
    engineId: str
    sessionId: str
    color: Color
    ply: int
    engineSeed: int
    clock: EngineClockJson
    legalMoves: list[MoveJson]
    observationTranscript: list[EngineObservationJson]
    latestObservationDelta: EngineObservationJson


class EngineTurnResponseJson(TypedDict, total=False):
    protocolVersion: ProtocolVersion
    gameId: str
    sessionId: str
    move: MoveJson
    diagnostics: dict


# ---------------------------------------------------------------------------
# Dataclass mirrors — what engine code actually holds
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class VisiblePiece:
    type: PieceLetter
    color: Color


@dataclass(frozen=True)
class GameOver:
    winner: Optional[Color]
    reason: str


@dataclass(frozen=True)
class EngineObservation:
    ply: int
    kind: Literal["initial", "own_move", "opp_move"]
    visibility_mask: int  # held as int internally; serialized to "0x…" hex
    visible_pieces: tuple[tuple[int, VisiblePiece], ...] = field(default_factory=tuple)
    own_capture_square: Optional[int] = None
    opp_capture_landing_square: Optional[int] = None
    game_over: Optional[GameOver] = None
    # Present when kind == 'own_move' — the move the engine made this ply.
    # Required for the engine to deterministically advance its belief set
    # during cold-start transcript replay. Null for 'initial' and 'opp_move'.
    own_move: Optional["Move"] = None


@dataclass(frozen=True)
class EngineClock:
    remaining_ms: Optional[int]
    increment_ms: int


@dataclass(frozen=True)
class Move:
    from_square: int
    to_square: int
    promotion: Optional[PieceLetter] = None


@dataclass(frozen=True)
class EngineTurnRequest:
    protocol_version: ProtocolVersion
    game_id: str
    engine_id: str
    session_id: str
    color: Color
    ply: int
    engine_seed: int
    clock: EngineClock
    legal_moves: tuple[Move, ...]
    observation_transcript: Optional[tuple[EngineObservation, ...]] = None
    latest_observation_delta: Optional[EngineObservation] = None


@dataclass(frozen=True)
class EngineTurnResponse:
    protocol_version: ProtocolVersion
    game_id: str
    session_id: str
    move: Move
    diagnostics: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Wire-format ⇄ dataclass conversion
# ---------------------------------------------------------------------------


def _hex_mask(n: int) -> str:
    return f"0x{n & 0xFFFFFFFFFFFFFFFF:016x}"


def _parse_mask(s: str) -> int:
    return int(s, 16) if s.startswith("0x") else int(s)


def observation_to_json(o: EngineObservation) -> EngineObservationJson:
    out: EngineObservationJson = {
        "ply": o.ply,
        "kind": o.kind,
        "own_move": move_to_json(o.own_move) if o.own_move is not None else None,
        "visibility_mask": _hex_mask(o.visibility_mask),
        "visible_pieces": [
            (sq, {"type": p.type, "color": p.color}) for sq, p in o.visible_pieces
        ],
        "own_capture_square": o.own_capture_square,
        "opp_capture_landing_square": o.opp_capture_landing_square,
        "game_over": (
            {"winner": o.game_over.winner, "reason": o.game_over.reason}
            if o.game_over is not None
            else None
        ),
    }
    return out


def observation_from_json(d: EngineObservationJson) -> EngineObservation:
    go_json = d.get("game_over")
    go = None
    if go_json is not None:
        go = GameOver(winner=go_json.get("winner"), reason=go_json["reason"])
    own_move_json = d.get("own_move")
    own_move = move_from_json(own_move_json) if own_move_json is not None else None
    return EngineObservation(
        ply=d["ply"],
        kind=d["kind"],
        visibility_mask=_parse_mask(d["visibility_mask"]),
        visible_pieces=tuple(
            (sq, VisiblePiece(type=vp["type"], color=vp["color"]))
            for sq, vp in d.get("visible_pieces", [])
        ),
        own_capture_square=d.get("own_capture_square"),
        opp_capture_landing_square=d.get("opp_capture_landing_square"),
        game_over=go,
        own_move=own_move,
    )


def move_to_json(m: Move) -> MoveJson:
    out: MoveJson = {"from_": m.from_square, "to": m.to_square}
    if m.promotion is not None:
        out["promotion"] = m.promotion
    return out


def move_from_json(d: MoveJson) -> Move:
    # JSON-key "from" is reserved in Python; we accept both "from_" and "from".
    from_sq = d.get("from_", d.get("from"))  # type: ignore[arg-type]
    if from_sq is None:
        raise ValueError("MoveJson missing 'from' / 'from_'")
    return Move(
        from_square=from_sq,
        to_square=d["to"],
        promotion=d.get("promotion"),
    )


def request_to_json(r: EngineTurnRequest) -> EngineTurnRequestJson:
    out: EngineTurnRequestJson = {
        "protocolVersion": r.protocol_version,
        "gameId": r.game_id,
        "engineId": r.engine_id,
        "sessionId": r.session_id,
        "color": r.color,
        "ply": r.ply,
        "engineSeed": r.engine_seed,
        "clock": {
            "remaining_ms": r.clock.remaining_ms,
            "increment_ms": r.clock.increment_ms,
        },
        "legalMoves": [move_to_json(m) for m in r.legal_moves],
    }
    if r.observation_transcript is not None:
        out["observationTranscript"] = [
            observation_to_json(o) for o in r.observation_transcript
        ]
    if r.latest_observation_delta is not None:
        out["latestObservationDelta"] = observation_to_json(r.latest_observation_delta)
    return out


def request_from_json(d: EngineTurnRequestJson) -> EngineTurnRequest:
    transcript_json = d.get("observationTranscript")
    delta_json = d.get("latestObservationDelta")
    return EngineTurnRequest(
        protocol_version=d["protocolVersion"],
        game_id=d["gameId"],
        engine_id=d["engineId"],
        session_id=d["sessionId"],
        color=d["color"],
        ply=d["ply"],
        engine_seed=d["engineSeed"],
        clock=EngineClock(
            remaining_ms=d["clock"]["remaining_ms"],
            increment_ms=d["clock"]["increment_ms"],
        ),
        legal_moves=tuple(move_from_json(m) for m in d["legalMoves"]),
        observation_transcript=(
            tuple(observation_from_json(o) for o in transcript_json)
            if transcript_json is not None
            else None
        ),
        latest_observation_delta=(
            observation_from_json(delta_json) if delta_json is not None else None
        ),
    )


def response_to_json(r: EngineTurnResponse) -> EngineTurnResponseJson:
    return {
        "protocolVersion": r.protocol_version,
        "gameId": r.game_id,
        "sessionId": r.session_id,
        "move": move_to_json(r.move),
        "diagnostics": dict(r.diagnostics),
    }


def response_from_json(d: EngineTurnResponseJson) -> EngineTurnResponse:
    return EngineTurnResponse(
        protocol_version=d["protocolVersion"],
        game_id=d["gameId"],
        session_id=d["sessionId"],
        move=move_from_json(d["move"]),
        diagnostics=dict(d.get("diagnostics", {})),
    )
