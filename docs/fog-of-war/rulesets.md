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

