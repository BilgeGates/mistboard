# Dark Xiangqi Ruleset

Status: working ruleset for the development spike. The pure rules kernel and
`/xiangqi-spike` lab exist, but Dark Xiangqi is not a public Mistboard game mode
yet.

Dark Xiangqi applies Mistboard's hidden-information model to xiangqi. The
server owns the full position, each player receives only their own view, and the
game is decided by capturing the opposing general.

## Board And Pieces

- Standard xiangqi board: 9 files by 10 ranks.
- Red starts on rank 1; black starts on rank 10.
- Pieces are the standard xiangqi set: general, advisors, elephants, horses,
  chariots, cannons, and soldiers.
- Coordinates use files `a` through `i` and ranks `1` through `10`.

## Legal Moves

Legal moves are xiangqi geometry moves from the true board, with check
constraints removed.

- A player may move into check.
- A player may leave their general exposed.
- Facing generals are allowed.
- There is no check and no checkmate warning.
- The consequence of an exposed general is that the opponent may capture it.

This mirrors Mistboard dark chess: hidden-information play should not require
the server to announce danger the player cannot necessarily see.

## Win Condition

The game ends when a general is captured.

- The moving side wins immediately after capturing the opposing general.
- The captured general is removed from the board.
- There are no stalemate draws.
- If a side somehow has no legal move, the defensive rule is that the side to
  move loses by immobilization.

In normal play, immobilization should be rare because check constraints are
removed; a general can be forced to step into danger rather than drawing by
stalemate.

## Visibility

A player sees:

- All of their own pieces.
- Squares their pieces can see under the Dark Xiangqi visibility rules.
- Opponent pieces on visible squares.

A player does not see:

- Opponent pieces outside visible squares.
- Whether a hidden square is empty or occupied.
- The identity of a hidden blocker or cannon screen unless another piece sees
  it normally.

Visibility is piece-specific and follows legal destinations:

- The general sees legal one-step orthogonal destinations inside its own
  palace, plus a facing enemy general if the file is clear.
- Advisors see their diagonal palace destinations.
- Elephants see legal same-side river destinations. A blocked eye appears as
  occupied but unidentified.
- Horses see legal L-shaped destinations. A blocked leg appears as occupied but
  unidentified.
- Chariots see along orthogonal rays through empty squares and stop at the
  first piece.
- Soldiers see forward, and after crossing the river also see sideways.

## Cannon Vision

Current working rule: **screen shrouded, target revealed**.

When a cannon has a capture along a ray:

- Empty squares before the screen are visible.
- The screen appears as occupied but unidentified unless another piece sees it.
- Empty squares between the screen and target are visible as part of the cannon
  line.
- The capturable target is visible.
- The UI marks the target as cannon-capturable.

This means a player learns the actionable fact: "my cannon can capture that
piece." They also learn where the enabling screen sits, but not what the screen
piece is.

The development spike keeps alternate cannon modes for comparison, but this is
the current candidate for the canonical rule.

## Draws

Draws are adjudicated from the true position, not either player's view.

- Threefold repetition is an automatic draw when the same true position with
  the same side to move occurs three times.
- The no-capture limit is an automatic draw after 60 plies with no capture.
- Soldier moves do not reset the no-capture counter.

The full xiangqi perpetual-chase rule family is intentionally not part of this
working ruleset yet. Repetition is kept simple until playtesting shows whether
the richer orthodox rule is needed.

## Clocks And Results

Timed games can also end by:

- timeout,
- resignation,
- abandonment or server policy outcomes once this variant is integrated into
  the live platform.

Those platform results should reuse Mistboard's existing server-owned state,
event replay, and player-view delivery model.

## Implementation Notes

The current implementation is intentionally parallel to dark chess rather than
forced into chess types:

- Rules kernel: `packages/game/src/variants-xiangqi.ts`
- Rules tests: `packages/game/src/variants-xiangqi.test.ts`
- Development lab: `apps/web/src/xiangqi-spike.ts`

Before Dark Xiangqi becomes a public game mode, it still needs live room
integration, seat-scoped payload tests, replay handling, persistence decisions,
and engine compatibility work.
