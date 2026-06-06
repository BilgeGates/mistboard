# Shogi4 — rules

Shogi4 is a 4×4 drop-shogi played with animal tiles. Oca Studios released it into
the public domain as part of its "Four" series (classic games remixed for
children), free as a print-and-play set and as an app. It keeps shogi's signature
rule (captured pieces change sides and return to play) on a board small enough to
learn in a minute.

These rules are recovered from Oca's own materials and the official app; see
[Source and license](#source-and-license) for the provenance.

## The board and setup

The board is 4×4, sixteen squares. A farm zone sits to either side of the grid,
off the playing area, holding each player's captured pieces.

Each player has five pieces: a Carp, a Tapir, a Raccoon-dog, a Fox, and a royal.
One player's royal is a Crane, the other's a Pheasant; the two are themed
differently and move the same. The first player's tiles face up the board, the
second player's face down it (a tile's owner is shown by its orientation, not its
color).

```
     a   b   c   d
 4   t   r   f   k     second player  (Pheasant)
 3   .   .   .   p
 2   P   .   .   .
 1   K   F   R   T     first player   (Crane)
```

Uppercase is the first player, lowercase the second. Each royal starts in a corner
(K on a1, k on d4) with its Carp one square ahead of it.

## The pieces

Every piece moves exactly one square per turn, in the directions printed on its
tile. The Fox and Raccoon-dog cover the orthogonal and diagonal lines, but they
step one square at a time; nothing slides.

Each diagram shows the piece (●) and the squares it can step to (✦), with forward
pointing up. The second player's tiles are flipped, so their forward points down
the board.

**Carp** — one step straight forward. A pawn.

```
. ✦ .
. ● .
. . .
```

**Fox** — one step to any orthogonal neighbor.

```
. ✦ .
✦ ● ✦
. ✦ .
```

**Raccoon-dog** — one step to any diagonal neighbor.

```
✦ . ✦
. ● .
✦ . ✦
```

**Tapir** — one step forward or to either forward diagonal.

```
✦ ✦ ✦
. ● .
. . .
```

**Crane / Pheasant** (the royal) — one step in any of the eight directions. A king.
Its capture ends the game, and it never evolves.

```
✦ ✦ ✦
✦ ● ✦
✦ ✦ ✦
```

## Evolution

A non-royal piece evolves the moment it reaches the far row (the opponent's back
rank). Flip its tile to the evolved side; the change is mandatory and lasts as
long as the piece stays on the board. Royals never evolve.

| Base | Evolves to | Moves as |
|---|---|---|
| Carp | Koi | a silver |
| Tapir | Baku | a silver |
| Raccoon-dog | Tanuki | a silver |
| Fox | Kitsune | a gold |

A **silver** (Koi, Baku, Tanuki) steps one square forward, to either forward
diagonal, or to either back diagonal: five directions, no sideways and no straight
back.

```
✦ ✦ ✦
. ● .
✦ . ✦
```

A **gold** (Kitsune) steps one square in any direction except the two back
diagonals: six directions.

```
✦ ✦ ✦
✦ ● ✦
. . .
```

Each evolved form only adds directions to its base, so a promoted piece keeps
everything it could do and gains more. A Carp can never strand itself by promoting:
even forced onto the far row it becomes a silver and still has moves.

## Jumping over a friendly piece

A piece blocked by one of its own can leap it. For any direction the piece may
move, if a friendly piece sits on the adjacent square, the piece may instead land
two squares away in that same direction:

```
 2  .            2  ●     the piece leaps its own ally
 1  △     →      1  .     onto the empty square two ahead
 0  ●            0  .
```

(0 is the moving piece, 1 the friendly piece it leaps, 2 the landing square.) The
landing square must be empty or hold an enemy, which is then captured. You leap
exactly one piece, one square beyond it: no chaining, and you can leap only your
own, never an enemy. A Carp can jump only straight forward, a Raccoon-dog only on a
diagonal, the royal in any of its eight directions (at the start, the royal can
already leap the Carp in front of it).

This rule is Shogi4's own, absent from Dōbutsu shōgi, the 3×4 game it otherwise
resembles. On so small a board it keeps your own pieces from boxing each other in.

## Capturing, farms, and drops

Move onto an enemy piece to capture it. The captured piece goes to your farm (your
hand), and if it was evolved it reverts to its base form. The royal is the one
piece never captured-and-kept; taking it ends the game.

On your turn, instead of moving a piece on the board, you may call a piece from
your farm: place it on any empty square as your own. The only square you can't drop
onto is the far row (the opponent's back rank). Everything else is legal: there's
no limit on doubled Carps in a file, and a drop may set up the immediate capture of
the king.

## Winning

You win by capturing the opposing royal, the Crane or the Pheasant. That is the
only victory condition. There is no check, no checkmate, and no win for reaching
the far side. Moving your royal into capture range is legal, and leaving it there
is legal; the game ends only when a royal is actually taken. You win by playing the
capture your opponent left open.

## Repetition and draws

Oca's rules state no repetition rule. For competitive and solved play this document
adopts the standard convention: a game that repeats forever, with neither side able
to force a capture, is a draw. This convention is ours, not Oca's, and it changes
none of the rules above.

## Quick reference

For shogi players, the pieces correspond to orthodox movement:

| Shogi4 | base move | shogi equivalent | evolves to |
|---|---|---|---|
| Carp | forward step | pawn | Koi (silver) |
| Fox | orthogonal step | wazir | Kitsune (gold) |
| Raccoon-dog | diagonal step | ferz | Tanuki (silver) |
| Tapir | forward + forward diagonals | — | Baku (silver) |
| Crane / Pheasant | any of 8 | king | — (never) |

Win = capture the king. Drop on any empty square except your far row. A piece may
leap one adjacent friendly piece in a direction it can already move.

## Source and license

Shogi4 and its artwork are by Oca Studios ("Four" series) and are in the public
domain.

- Rules page: https://ocastudios.com/four/shogi/
- BoardGameGeek: https://boardgamegeek.com/boardgame/146291/shogi4

The ruleset here was recovered from Oca's rules page and starting-position graphic,
and confirmed against the official Android app, whose game logic was decompiled to
settle the finer points: the friendly-jump geometry, the single drop restriction,
and king-capture as the sole win. Where the app and the prose materials agree, this
document follows them; the only addition is the repetition convention noted above.
