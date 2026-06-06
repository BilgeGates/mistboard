# Shogi4 — rules

Shogi4 is a 4×4 drop-shogi played with animal tiles. It plays much like ordinary
shogi shrunk to sixteen squares: pieces step in marked directions, captured pieces
switch sides and drop back into play, and you win by taking the king. The one rule
shogi players won't recognize is that a piece may hop over a friendly piece, added
so your own pieces don't jam each other on a board this small.

Oca Studios released Shogi4 into the public domain as part of its "Four" series
(classic games remixed for children), free as a print-and-play set and as an app.
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

(0 is the moving piece, 1 the friendly piece it leaps, 2 the landing square.) A
Carp can jump only straight forward, a Raccoon-dog only on a diagonal, the royal in
any of its eight directions; from the opening position the royal can already leap
the Carp in front of it.

The limits are tight. You leap your own piece, never an enemy. You leap exactly
one, with no chaining over two in a row. The landing square has to be empty or hold
an enemy you capture, so you can't jump onto a third friendly piece. And the jump
only exists where the piece could already step, so a Carp never hops sideways or
backward, a Raccoon-dog never over an orthogonal neighbor, and nothing jumps off
the edge when there is no square two beyond.

This rule is Shogi4's own, absent from Dōbutsu shōgi, the 3×4 game it otherwise
resembles. On so small a board it keeps your own pieces from boxing each other in.

## Capturing, farms, and drops

Move onto an enemy piece to capture it. It goes to your farm (your hand) and
becomes yours to drop later; if it was evolved, it reverts first, so a captured Koi
returns as a plain Carp, not a silver. The royal is the one piece never
captured-and-kept; taking it ends the game.

On your turn, instead of moving a piece on the board, you may call a piece from
your farm onto any empty square, where it joins your side. A drop never captures:
it lands on an empty square, and the far row (the opponent's back rank) is closed
to drops even when it sits empty. Nothing else is barred: two of your Carps may
share a file, and since a drop is a whole move, you can set one down next to the
enemy royal to attack it.

## Winning

You win by capturing the opposing royal, the Crane or the Pheasant. That is the
only victory condition. There is no check, no checkmate, and no win for reaching
the far side.

Nothing guards the royal for you. You may step it onto a square an enemy attacks,
and you may leave it there; the rules never force a defensive move. A position that
would be checkmate in ordinary shogi is only a position here until someone plays
the capture. You win the moment the opposing royal sits where you can reach it,
whether you take it with a plain step or by leaping a friendly piece onto it.

There is no stalemate. Because moving the king into capture range is legal, a lack
of safe moves never ends the game: you simply make the unsafe move and play on until
a king is taken. A side with no legal move at all, boxed in with nothing to drop,
loses rather than draws.

## Repetition and draws

The original rules address neither repetition nor a move-count limit. Our convention
fills the gap: a position reached three times is an automatic draw. This rule is
ours, not Oca's, and changes none of the rules above.

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

Shogi4 and its tile art are by Oca Studios, which released its whole "Four" series
into the public domain. That release, not any third-party listing, is what puts the
game in the public domain. The BoardGameGeek entry is a catalog reference, not the
basis for the public-domain claim.

We recovered the exact rules from Oca's official Shogi4 app, decompiling it to read
the move logic directly: the friendly-jump geometry, the single drop restriction,
and king-capture as the sole win all come from there. Oca's public rules page and
starting-position graphic — now reachable only through the Internet Archive, since
the live site is down — corroborate the board and the basic moves. The only
addition beyond the app is the repetition convention noted above.

- Rules page (Internet Archive, captured 2024-09-26):
  https://web.archive.org/web/20240926113424/https://www.ocastudios.com/four/shogi/
- BoardGameGeek: https://boardgamegeek.com/boardgame/146291/shogi4
