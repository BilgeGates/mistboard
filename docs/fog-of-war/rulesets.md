# Rulesets

Fog of war chess is not one perfectly standardized game. Treat each ruleset as
an explicit contract.

## Baseline Visibility Model

A player can see:

- Their own pieces.
- Squares attacked or movable by their own pieces under the current board state.
- Opponent pieces that occupy visible squares.

A player cannot see:

- Opponent pieces outside visible squares.
- Empty or occupied status of hidden squares.
- Opponent king location unless it is visible.

## Mistboard Fog of War Ruleset

Status: implemented.

- The server owns the canonical full board.
- Players receive only their own player view during live play.
- Legal moves are pseudo-legal chess moves generated from the true board. Check constraints are removed: kings may move through, into, or remain in attacked squares.
- The primary win condition is king capture.
- The 50-move rule is enforced automatically as a draw.
- Threefold repetition is enforced automatically as a draw.
- Repetition identity is based on true board placement, side to move, castling rights, and en-passant square. Clocks, move number, halfmove clock, and visibility state are not part of repetition identity.
- Draws are currently persisted as generic `draw` termination; we do not yet distinguish `fifty-move-rule` from `threefold-repetition` in the database.
- Each player sees a running tally of opponent pieces they have personally captured. No other material information is revealed: surviving opponent material, opponent's own captures, and pieces lost in the fog are not surfaced. The tally is a UI memory aid for facts the player already witnessed at the moment of capture.

Known subtle rule-risk areas are tracked in
[`rules-edge-cases.md`](./rules-edge-cases.md). Treat that document as part of
the rules contract when changing move generation, visibility, replay, payloads,
or engine harnesses.

## Configuration: Draft960 Hidden Starts

Status: implemented. Composes on top of the Mistboard Fog of War Ruleset above.

When this configuration is active, the canonical starting position is replaced with two independently-chosen Chess960 back-ranks — one per player — and neither back-rank is revealed to the opponent until the game ends.

### Pregame draft

- Each player is offered a distinct random sample of 3 Chess960 starts. The two offers are drawn independently; they may overlap by coincidence but neither offer is conditioned on the other.
- Each player picks one of their three offered starts.
- Neither the offer nor the choice is visible to the opponent at any point during the draft or the game.
- Both choices are committed to the server before play begins. Choices cannot be changed after both players have selected.

### Initial position

- White's back-rank is white's chosen Chess960 arrangement on rank 1; pawns on rank 2.
- Black's back-rank is black's chosen Chess960 arrangement on rank 8; pawns on rank 7.
- The two back-ranks are independent. Pieces on opposite back-ranks need not occupy the same files; bishop pairs, queen sides, and king positions may differ between the two players.
- Castling rights derive from each player's own back-rank rook positions, encoded per-side in X-FEN.

### Visibility

- A player sees their own back-rank fully and knows their own castling rights.
- The opponent's back-rank is fogged at t=0 under the baseline visibility model. Because the opponent's back-rank is not common knowledge, the fog at t=0 contains genuine uncertainty about piece arrangement — not only piece location.
- Observed opponent pieces during play are evidence about the opponent's back-rank. A player infers the opponent's back-rank from accumulated observation. The server does not annotate or assist this inference.

### Postgame

- On game end, the server reveals both players' chosen back-ranks alongside the standard postgame reveal.
- Replay supports both per-side perspectives (preserving each player's initial back-rank uncertainty) and a full-truth mode that shows both back-ranks from t=0.

## Variant Design Note: Reserves And Drops

Status: research note for future `GameSpec` entries. Not implemented as a
public Mistboard game mode.

Reserve/drop variants add a second hidden-information boundary: a drop can only
land on an empty square, but hidden squares must not become an accidental
occupancy oracle unless that reveal is part of the ruleset. The current
taxonomy models two published approaches from the SchemingMind fog/crazyhouse
family:

- **Sun Tzu chess** (`dropPolicy: any-legal-square`): reserve pieces may be
  dropped on any legal empty square. A player with at least one reserve piece
  therefore sees the empty squares where that reserve piece can legally land.
  This intentionally reveals terrain and makes reconstruction of the opponent's
  hidden position easier.
- **Lao Tzu chess** (`dropPolicy: seen-squares-only`): reserve pieces may be
  dropped only on visible squares. Hidden squares are not legal drop targets, so
  the action list does not reveal whether a hidden square is empty or occupied.
  This preserves fog more strongly, at the cost of a smaller drop action space.

For future reserve-heavy games such as dark shogi, the Lao Tzu-style rule is the
safer default research baseline: expose drops only on visible empty squares
unless the ruleset deliberately chooses Sun Tzu-style empty-square revelation.
If a future ruleset allows blind drop attempts, failed drops must not return
occupancy-specific errors to the client.

External references:

- [SchemingMind variant index](https://www.schemingmind.com/home/knowledgebase.aspx?article_id=84)
- [Sun Tzu Chess](https://www.schemingmind.com/home/knowledgebase.aspx?article_id=137)
- [Lao Tzu Chess](https://www.schemingmind.com/home/knowledgebase.aspx?article_id=128)

Fog variants of other traditions (dark xiangqi, dark shogi, and others) apply
the same server-owned hidden-information model to a different movement geometry,
with king or general capture replacing checkmate to avoid check-based
information leaks. Their player-facing rules are published at
[mistboard.com/rules](https://mistboard.com/rules).
