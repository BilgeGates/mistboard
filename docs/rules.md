# Rules

> Status: current public rules hub.
> Canonical implementation: `packages/game/src/variants.ts` and related variant
> rule modules.
> Last reviewed: 2026-06-12.

Mistboard's public rules documentation should answer two questions quickly:

1. What can people play today?
2. Which candidate rulesets are research or future planning rather than current
   product commitments?

## Current Public Rulesets

| Ruleset | Status | Detail |
|---|---|---|
| Fog of War chess | Current flagship ruleset | [Fog of War baseline](#fog-of-war-chess), [rulesets.md](fog-of-war/rulesets.md), [rules-edge-cases.md](fog-of-war/rules-edge-cases.md) |
| Draft960 hidden starts | Built as a Fog of War pregame configuration, not a standalone launch surface | [Draft960 hidden starts](#draft960-hidden-starts) |
| Dark Mini Xiangqi | Public alpha, casual-only | [dark-mini-xiangqi-rules.md](fog-of-war/dark-mini-xiangqi-rules.md), [dark-mini-xiangqi-plan.md](fog-of-war/dark-mini-xiangqi-plan.md) |

## Candidate And Historical Rulesets

These notes are useful public reference material, but they are not current
homepage or rated-ladder commitments.

| Ruleset | Status | Detail |
|---|---|---|
| Dark Xiangqi | Flag-gated development spike | [dark-xiangqi-rules.md](fog-of-war/dark-xiangqi-rules.md) |
| Kriegspiel | Planned variant, rules article drafted | `/rules/kriegspiel`, [planned variant engine locks](#planned-variant-engine-locks) |
| Jieqi | Planned variant, rules article drafted | `/rules/jieqi`, [planned variant engine locks](#planned-variant-engine-locks) |
| Banqi | Planned variant, rules article drafted | `/rules/banqi`, [planned variant engine locks](#planned-variant-engine-locks) |
| Dark Shogi | Candidate future ruleset | [dark-shogi-rules.md](fog-of-war/dark-shogi-rules.md) |
| Shogi4 | Rules reference for a small shogi-family game | [shogi4-rules.md](shogi4-rules.md) |

Current product direction and launch gates live in [ROADMAP.md](ROADMAP.md), not
in individual candidate rules files.

## Planned Variant Engine Locks

These are implementation-facing rule locks for the next tenant/game-rule
modules. They do not change product launch priority. The rules articles are the
player-facing copy; this section records the server and engine contract.

### Cross-Variant State And Wire Rules

- The server owns canonical truth for every planned variant.
- Hidden setup randomness must be replay-deterministic. Store either the
  resolved hidden layout in canonical state plus a setup seed, or store a seed
  and canonical shuffle algorithm version. Event replay must rebuild the same
  game without asking an external random source.
- Player views must be derived from canonical state. Never send unrevealed
  identities, rejected hidden tries, or captured-piece private knowledge to a
  player who should not know them.
- The move/event log is the reconnect and replay source of truth. If an event
  contains private information, define a per-seat redaction function before
  exposing the tenant.
- These variants should enter through the generic tenant contract, not the old
  chess-only `Variant` interface.

### Kriegspiel

Ruleset target: ICC Wild 16 style Kriegspiel, matching the draft article.

Locked:

- Board and movement are orthodox chess.
- Objective is checkmate. The king is never captured.
- The player sees only their own pieces.
- The player is not sent a legal-move list. A turn is an attempt loop:
  rejected tries are reported only to the mover, and the clock continues to run
  until a legal move is accepted.
- Legal tries enforce the full standard chess rules: pins, check, castling,
  promotion, en passant, stalemate, insufficient material, repetition, and the
  fifty-move rule.
- Accepted non-capture moves tell the opponent only that a move happened.
- Captures are announced to both players by captured category and square:
  pawn or piece, never exact piece identity.
- Check announcements are sent to both players by direction from the checked
  king: rank, file, long diagonal, short diagonal, knight. Double checks
  announce both.
- Pawn tries are automatic counts at the start of a turn, not optional
  "any?" queries.
- Promotion is not announced.
- En passant is announced as an ordinary pawn capture, without an en passant
  flag.
- Rejected-try handling is server-authoritative. The client may suppress
  obviously impossible drags as a UI affordance, but every submitted try is
  classified by the server.
- Rejected tries are private responses to the mover, not room events. The
  opponent receives no signal for rejected attempts.
- Use private rejection classes rather than fractured client logic: malformed
  input, impossible from the mover's visible board, and illegal against the
  hidden canonical position. Accepted moves are the only turn events exposed to
  the room.

### Jieqi

Ruleset target: Guangdong/Tencent-style Jieqi.

Locked:

- Board is the full 9x10 xiangqi board. Red moves first.
- Generals start face-up on the normal general points.
- Each side shuffles its own fifteen non-general pieces onto its own normal
  non-general starting points. Piece ownership/color is public; hidden
  identity is not.
- Every occupied point is public. Unrevealed pieces render as owned piece
  backs, not fog.
- An unrevealed piece has an origin role from the starting point it currently
  occupies. Its first move, capture, and attack use that origin role.
- The first move still obeys the origin role's normal xiangqi restrictions:
  horse legs, elephant eyes, cannon screens, advisor palace limits, elephant
  river limits, and facing-general constraints.
- After that first move resolves, the moving piece reveals to both players and
  uses its true identity from then on.
- Revealed advisors and elephants keep their movement shape but lose palace
  and river restrictions.
- Revealed soldiers use normal soldier direction by color from their current
  point: forward before crossing, forward or sideways after crossing, never
  backward.
- If an unrevealed piece is captured before it moves, only the capturer learns
  its identity. The owner learns that one owned dark piece was removed.
- A hidden piece capturing a hidden piece produces two information effects:
  the moving piece reveals to both after the move, while the captured hidden
  identity is private to the capturer.
- Objective and legality use standard xiangqi check rules, not Dark Xiangqi's
  general-capture rule. Illegal self-check moves are rejected.
- Facing generals are illegal except as allowed by standard xiangqi move
  legality. Dark pieces block the file like any occupied point.
- The no-capture progress draw is 60 full moves, meaning 120 plies/half-moves,
  per the Guangdong/Tencent ruleset (Tencent 天天象棋 auto-draws at 120 captureless
  plies). The adopted Pikafish Jieqi engine hardcodes a shorter 40-move rule
  (`rule40 >= 80`), so the engine build must be patched to draw at 120 plies to
  match the server; otherwise the engine treats a still-live position as drawn
  ~40 plies early. Keep the unit explicit (60 moves = 120 plies) so the server
  and engine agree on draw adjudication.

Open implementation blocker:

- Repetition/chase adjudication needs a concrete classifier before rated or
  public competitive play. The player article is already locked against a
  generic threefold or fourfold auto-result: perpetual check and direct
  perpetual chase are forbidden, while ordinary repeated positions are not an
  automatic generic loss. Public Jieqi references describe the result as
  xiangqi-style long-beat adjudication rather than a generic fold count. For
  the first rules module, implement the no-capture draw and expose repetition
  telemetry, then add the chase classifier before enabling rated play.

### Banqi

Ruleset target: Taiwanese Banqi.

Locked:

- Board is a 4x8 square grid. Pieces occupy squares, not intersections.
- Canonical setup shuffles all thirty-two xiangqi pieces face-down onto the
  grid.
- Seats are first-player and second-player until the first flip assigns colors.
  The first player owns the color revealed by the first flip; the second player
  owns the other color.
- A turn is exactly one action: flip one face-down piece, move one owned
  revealed piece one square orthogonally to an empty square, or capture with
  one owned revealed piece.
- Face-down pieces occupy squares and block movement. They cannot be captured
  in the Taiwanese ruleset.
- Non-cannon rank order is General > Advisor > Elephant > Chariot > Horse >
  Soldier.
- Non-cannon pieces capture adjacent revealed enemy pieces of the same or lower
  rank, except soldier can capture general and general cannot capture soldier.
- Cannon movement is one square orthogonally when not capturing.
- Cannon capture ignores rank and travels any distance along a row or column.
  Exactly one piece must stand between the cannon and the captured square (the
  screen); the screen may be friendly, enemy, or face-down. The target is the
  first occupied square beyond the screen, and the cannon captures it only if it
  holds a revealed enemy piece. If that first square beyond the screen holds a
  friendly or a face-down piece, the line is blocked and there is no capture: the
  cannon never sees past it to a piece farther along. Consistent with the
  face-down rule above, a face-down piece is never a capture target, including by
  cannon.
- A cannon cannot capture an adjacent piece. As a target, an adjacent cannon can
  be captured by general, advisor, elephant, chariot, or horse, but not by
  soldier. A cannon can capture another cannon only by the screen-capture rule.
- Win when the opponent has no legal action on their turn. The general is not
  royal.
- Automatic draw after 50 plies with no flip and no capture.
- No separate perpetual-chase loss in the initial Mistboard ruleset.

Open implementation detail:

- Because color assignment happens after the first flip, the room/engine layer
  needs a pre-color seat model or a one-time seat-to-piece-color binding event.

## Fog Of War Chess

Working rule baseline:

- Players see their own pieces.
- Players see squares their pieces can legally move to from the canonical
  server position, even while waiting for the opponent.
- Pawn vision follows legal pawn movement, not generic attack maps:
  - empty forward pawn moves are visible;
  - empty diagonal pawn attack squares stay fogged;
  - diagonal enemy pieces are visible when capturable;
  - a directly blocked pawn does not reveal the blocking piece unless another
    piece can see that square.
- Visible opponent pieces are shown only when occupying a visible square.
- Hidden opponent moves are not sent in live player views.
- There is no check or checkmate.
- Legal moves are pseudo-legal chess moves: a king may move through, into, or
  remain in attacked squares.
- The game ends when a king is captured.
- The game is automatically drawn when the 50-move rule is reached.
- The game is automatically drawn on threefold repetition.
- The terminal king-capture state is postgame reveal: fog is lifted for the main
  board, debug player/opponent views, spectators, and replay at that final
  state.
- Earlier replay positions keep the player-specific fog view until the replay
  reaches the terminal state.
- Castling is legal even through, into, or out of attacked squares when the
  normal occupancy and castling-rights requirements are met.
- En passant is legal. The en passant destination and threatened pawn are
  visible to the capturing player until that turn ends.
- Promotion uses normal chess promotion choices; opponents only see the promoted
  piece if they can see the promotion square.
- The server owns the full board.
- Live clients receive only their own player view.
- Live spectators receive a neutral no-board view.
- Live move history is withheld because hidden opponent moves can reveal hidden
  information.
- Finished games expose full-truth board state and event history for replay.

Subtle rule-risk areas such as hidden occupancy inference, en passant
visibility, castling representation, no-check king semantics, and terminal
reveal boundaries are tracked in
[rules-edge-cases.md](fog-of-war/rules-edge-cases.md).

## Draft960 Hidden Starts

Draft960 is a Fog of War pregame configuration. Each player independently
drafts their own Chess960 back rank before play begins. The opponent's back rank
is never revealed during the game.

Pregame:

1. The server generates a private offer of three legal Chess960 back ranks for
   each player independently. The two offers are drawn separately; they are not
   conditioned on each other and are not visible to the opponent.
2. Each player privately selects one of their three offered back ranks.
3. Neither the offer nor the choice is visible to the opponent at any point.
4. Both choices are locked before play begins and cannot be changed.

Starting position:

- White's back rank is White's chosen Chess960 arrangement on rank 1; pawns are
  on rank 2.
- Black's back rank is Black's chosen Chess960 arrangement on rank 8; pawns are
  on rank 7.
- The two back ranks are independent. Piece files need not match between sides.
- Castling rights derive from each player's own back-rank rook positions.

During play:

- A player knows their own back rank and castling rights, but not the
  opponent's.
- Opponent pieces become visible only under normal Fog of War visibility rules.
- A player can infer the opponent's back-rank arrangement from accumulated
  observation, but the server provides no annotation or assistance.

Postgame:

- On game end, both players' chosen back ranks are revealed alongside the
  standard Fog of War reveal.
- Replay supports per-side perspectives, preserving each player's initial
  back-rank uncertainty, and a full-truth mode that shows both back ranks from
  move one.
