# Fog of War Rules Edge Cases

This document tracks rule edges where Fog of War correctness can diverge from
ordinary chess expectations. Treat these as intentional design surfaces, not
incidental implementation details.

The canonical Mistboard ruleset is:

- The server owns the full board.
- Live players receive only their `PlayerView`.
- Visibility is based on own pieces plus pseudo-legal destination squares from
  the true board.
- Legal moves are pseudo-legal true-board chess moves.
- Check and checkmate do not exist.
- King capture wins.

## Key Risk Areas

### Hidden Occupancy Inference

Visibility intentionally hides opponent pieces outside visible squares, but move
availability can still reveal facts about hidden occupancy.

Examples:

- A pawn with no forward move may imply that its forward square is occupied,
  even if that blocker is not visible.
- A sliding piece's ray stops at the first occupied square. If the stopping
  square is visible, the occupant can be shown. If the ray ends before an
  expected square or a destination is absent, the move list can still imply a
  blocker.
- Missing capture moves can imply that a diagonal pawn target is empty or
  friendly-occupied under the true board.

Current contract: Mistboard exposes legal moves generated from the true board to
the player whose turn it is. Any inference produced by the provided legal move
set is part of the game unless the ruleset is changed.

Implementation risk: accidental extra probes must not add more information than
the intended legal-move payload. Rejected move attempts, drag previews, server
errors, timing differences, or client-side hints must not become hidden-board
oracles.

Study questions:

- Which inferences from the active player's legal moves are intended?
- Should off-turn players receive any equivalent negative information? Current
  player views show visibility off-turn but legal moves are empty.
- Do UI affordances reveal hidden blockers beyond `PlayerView.legalMoves`?

### Pawn Vision

Pawns are the least attack-map-like piece in this ruleset.

Current contract:

- Empty forward pawn moves are visible.
- Empty diagonal pawn attack squares stay fogged.
- Diagonal enemy pieces are visible when capturable.
- A directly blocked pawn does not reveal the blocker unless another piece can
  see that square.
- En passant is a special capture and has its own visibility rule.

Implementation risk: using generic attacked squares for pawns will reveal empty
diagonals that should stay hidden. Using only normal legal moves without the
en-passant captured-pawn exception will hide a pawn that the capturing player is
entitled to know can be captured.

Regression targets:

- Empty pawn diagonals remain hidden.
- Diagonal enemy pieces are visible.
- Direct blockers are not included in `visibleSquares`.
- Missing forward moves are understood as intended legal-move inference, not
  board rendering.

### En Passant

En passant creates a visible destination square and a capturable pawn on a
different square.

Current contract:

- The capturing side can see the en-passant destination.
- The capturing side can see the captured pawn square until the turn ends.
- The pushing side does not see its own en-passant target merely because it
  exists.
- En-passant square participates in repetition identity.

Implementation risk: en-passant state is easy to leak to the wrong side because
the canonical board contains an `enPassantSquare` that is not itself a piece.

Regression targets:

- Pushing side does not gain visibility of the en-passant target.
- Capturing side sees both destination and threatened pawn.
- En-passant capture resets the halfmove clock.
- En-passant target affects repetition only while available.

### Castling Representation

Mistboard accepts castling both as king-to-rook-square and king-to-king-destination
where supported by the rules adapter.

Current contract:

- Castling is legal through, into, or out of attacked squares.
- Castling still requires normal occupancy and castling-rights conditions.
- The king-to-rook-square representation is canonical for fog castling
  legal moves, event logs, and detection, with king-to-destination aliases
  accepted as input for UI compatibility.

Settled decision (2026-06-03, do not revisit for standard dark-chess):

We reviewed gating castling legality on the mover's vision, so that a player
who can see an attacker on the king, through, or landing square would be barred
from castling (closer to standard chess). Rejected. Unrestricted castling stays.

Rationale:

- The "no castling through check" rule is a corollary of check/checkmate, which
  fog deletes (king-capture is the win condition). Removing the castling
  restriction is the consistent consequence, not an oversight.
- Restricting castling alone is ad hoc: fog already lets the king step into a
  visible attack and lets a player ignore a visible check with any other move.
  Patching castling only fixes the most salient instance and invites a slide
  back toward re-implementing check inside fog.
- It would fork the established ruleset (chess.com Fog of War, pychess, and the
  Obscuro / Gehnen academic baselines all use "no check, castle freely"),
  breaking engine cross-comparison and the "canonical place to play the
  category" positioning. Our moat is the engine and analysis, not rule parity.

A variant where all visible information binds like standard chess (king steps,
leaving check, and castling together, not castling alone) is a legitimate but
separate, clearly-labeled variant, gated post-M1. It is not a patch to the
default ruleset. The surprise a chess player feels on castling out of visible
check is an onboarding/legibility gap, addressed by teaching "there is no check
in dark chess," not by changing the rule.

Implementation risk: castling can diverge across TypeScript game rules, Python
engine lab code, replay logs, and UI move input. Visibility may include the rook
square, the king destination, or both depending on which move representation is
used.

Study questions:

- Should fog visibility for castling include only the rook square, only the king
  destination, or both?
- Should event logs store the user-requested alias or the normalized move?
- Do TypeScript and Python visibility helpers agree for Chess960 castling?

### No-Check King Semantics

Fog of War removes check constraints.

Current contract:

- Kings may be adjacent.
- Kings may move into attacked squares.
- Kings may remain attacked.
- Castling may pass through attacked squares.
- A king can be captured like another piece, and that move ends the game.

Implementation risk: libraries, UI logic, engine logic, and evaluator code often
assume kings cannot be captured and that check filters legal moves. Those
assumptions are wrong for Mistboard fog.

Regression targets:

- Legal king moves are not filtered by attacked squares.
- A king capture is legal and terminal.
- Adjacent kings do not automatically end the game before a capture move.
- Engine/research code uses pseudo-legal moves where the product rules require
  them.

### Terminal Reveal Boundaries

Finished Fog games reveal full truth. Live games do not.

Current contract:

- Live seated players receive only their player-specific view.
- Live spectators receive no board, a public perspective, or truth only in modes
  whose policy explicitly allows it.
- After terminal state, replay/review can expose full truth.
- Earlier replay positions preserve the relevant fog view until the terminal
  state is reached.

Implementation risk: some code paths call the variant directly while others use
server payload policy. Full-truth reveal is partly a server payload/replay
policy, not only a pure variant rule.

Regression targets:

- Finished-state payloads reveal truth.
- Earlier replay slices do not retroactively reveal hidden information.
- Live PvP spectators do not receive board truth.
- PvE/EvE policies are explicit and covered by tests.

### Draw And King-Capture Precedence

Multiple terminal conditions can become true on the same move.

Current contract: if a move captures a king, the result is `king-captured` even
if the same move would also reach the 50-move rule or threefold repetition.

Implementation risk: reordering terminal checks can silently change game
outcomes and benchmark data.

Regression targets:

- King capture takes precedence over automatic draw checks.
- 50-move and threefold still fire when no king is captured.
- Repetition identity uses true board, side to move, castling rights, and
  en-passant square.

## Review Standard

When changing rules, payloads, replay, engine harnesses, or board UI, ask:

1. Does this expose more information than the documented `PlayerView`?
2. Does this depend on standard-check legality where fog requires pseudo-legal
   movement?
3. Does this keep TypeScript product rules and Python research rules aligned, or
   intentionally document the difference?
4. Does this edge case have a regression test or a QA checklist item?
