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

## Open Ruleset Questions

- Are check announcements hidden, transformed, or removed?
- Can a king move into check if the checking piece is hidden?
- Is the game won by checkmate, king capture, or another terminal condition?
- Are illegal moves rejected based on full board state or only player-visible state?
- Are castling rights visible, inferable, or hidden?
- How are en passant targets represented under partial visibility?
- Does a failed attempted move leak information?

## Candidate Rulesets

### Chess.com Style

Status: needs verification before implementation.

Known direction:

- The board is partially hidden according to player visibility.
- Standard chess movement remains the base.
- Check and terminal-condition behavior must be verified before depending on it.

### Engine-Lab Style

Status: proposed for experiments.

Principles:

- Legal move generation uses true board state.
- Visibility uses attacked squares plus own occupied squares.
- Terminal condition is configurable: checkmate-like, king-capture-like, or platform-compatible.

## Configuration: Draft960 Hidden Starts

Status: proposed for the Fog of War + Draft960 product configuration. Composes on top of any candidate ruleset's visibility and termination rules.

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

