# Dark Mini Xiangqi Rules

_Last updated: 2026-06-09_

Status: alpha public game mode. Dark Mini Xiangqi is live on Mistboard as a
compact hidden-information Xiangqi variant.

Dark Mini Xiangqi is Mini Xiangqi played with Fog of War. Each player sees all
of their own pieces and only the enemy pieces their army can see. The board is
7x7, the piece set is compact, and the game ends by capturing the opposing
general.

The point of the smaller board is not to make Xiangqi casual. It is to keep the
cannon, horse, chariot, soldier, and palace-general tactics that matter most
under hidden information, while reducing empty fog and making the game easier to
learn and analyze.

## Board And Setup

Dark Mini Xiangqi uses a 7 file by 7 rank board.

- Red starts on rank 1.
- Black starts on rank 7.
- Coordinates use files `a` through `g` and ranks `1` through `7`.
- Each side has one general, two chariots, two cannons, two horses, and five
  soldiers.
- Each general is confined to a 3x3 palace.
- There are no advisors, elephants, river, promotions, drops, or reserves.

Initial setup:

- Back rank: chariot, cannon, horse, general, horse, cannon, chariot.
- Soldiers: one rank ahead on files `a`, `c`, `d`, `e`, and `g`.

## How Pieces Move

Legal moves use the true board. Mistboard does not filter moves for check in
this variant.

- A player may move into danger.
- A player may leave their general exposed.
- A general may capture the opposing general along a clear file.
- There is no check announcement.
- There is no checkmate adjudication.

This follows Mistboard's Dark chess rule philosophy: the server should not give
a player warning information that their visible position may not justify.

### General

The general moves one square orthogonally inside its own 3x3 palace.

If the two generals face each other on the same file with no piece between
them, a general may capture the opposing general across that file.

### Chariot

The chariot moves any number of squares orthogonally. It stops at the first
piece it meets and may capture that piece if it belongs to the opponent.

### Cannon

The cannon moves like a chariot when not capturing.

To capture, the cannon needs exactly one intervening piece, called the screen.
It jumps over that screen and captures the first enemy piece beyond it on the
same file or rank.

### Horse

The horse moves one square orthogonally and then one square diagonally outward,
like the Xiangqi horse. It cannot move if the adjacent orthogonal leg square is
occupied.

### Soldier

The soldier moves and captures one square forward or sideways from the start of
the game.

There is no river-crossing rule in Dark Mini Xiangqi because soldiers already
have sideways movement.

## Fog Of War

A player sees:

- all of their own pieces,
- squares their own pieces can see,
- enemy pieces on visible unshrouded squares,
- shrouded occupancy markers for certain blockers and cannon screens.

A player does not see:

- enemy pieces outside visible squares,
- whether a hidden square is empty,
- the role of a shrouded blocker,
- the role of a cannon screen unless another piece sees it normally,
- empty cannon gap squares between a screen and target.

## Cannons And Blockers

The key Fog of War rule is: **screen shrouded, target revealed**.

When a cannon has a capture along a ray:

- empty squares before the screen are visible,
- the screen appears as occupied but unidentified,
- empty squares between the screen and target stay fogged,
- the capturable target is visible.

This gives the player the actionable fact that a cannon capture exists without
revealing the screen's identity or the empty gap behind it.

Horses follow the same privacy principle. If a horse leg is blocked, the blocked
leg square appears occupied but unidentified, and the destinations behind that
leg stay hidden.

## Winning And Draws

The game ends when a general is captured.

- The player who captures the opposing general wins immediately.
- There is no separate checkmate rule.
- If the side to move has no legal move, that side loses by immobilization.

Draws are adjudicated from the true position, not from either player's visible
position.

The first candidate rules are deliberately simple:

- threefold repetition is an automatic draw,
- a no-capture progress clock can draw the game,
- richer Xiangqi perpetual-check and chasing rules are deferred until
  playtesting shows they are needed.

## Why Mini Xiangqi May Work Better Under Fog

Full-board Dark Xiangqi is the parent idea: hidden-information Xiangqi on the
standard 9x10 board. Dark Mini Xiangqi is the compact format being tested first.

The smaller board may be a better fit for Fog of War because:

- contact happens sooner,
- there is less empty darkness to search,
- cannon and horse tactics stay central,
- games are easier to learn from,
- engine and onboarding work are more tractable.

Dark Mini Xiangqi is not a replacement for the full-board idea. It is the
smaller format that may be easier to play, teach, and build engines for first.

## Implementation Note

The intended `GameSpec` id is `dark-mini-xiangqi`.

The launch path should stay conservative: rules and fog tests first, hidden
local play lab second, live runtime only after privacy tests pass, and public
launch only after mobile play, invite/share, and postgame behavior are ready.
