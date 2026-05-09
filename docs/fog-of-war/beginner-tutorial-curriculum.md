# Beginner Tutorial Curriculum

This document sketches the first Fog of War learning path for Bichess. It uses
Lichess's beginner tutorial as a product reference: short stages, concrete board
goals, immediate feedback, visible progress, and learning by moving pieces.

The content should not be a generic chess course. Bichess should teach the Fog
mental model:

- unknown squares are not empty squares
- pieces are scouts as much as attackers
- no check warning means king safety is an active responsibility
- direct king capture replaces checkmate as the beginner win condition
- hidden moves still leave information behind
- last-seen information is useful but stale
- postgame perspective replay is part of understanding the game

## Product Shape

Beginner tutorials should be authored, deterministic, and playable without an
account. Progress can start in local storage and later become account-backed.

Lichess reference structure:

- **Map.** The `/learn` page is a category grid.
- **Lesson / stage.** A tile such as "The rook" opens one focused lesson.
- **Chapter / level.** The progress cells inside the lesson are authored boards
  with a goal, starting FEN, target squares, arrows/shapes, scoring, and
  optional success/failure checks.
- **Sequence.** A chapter can be a single move target, a multi-move target
  chase, or a scripted line with player and opponent moves.

Bichess should use the same product skeleton with Fog semantics:

- **Map.** Beginner Fog path, later practice paths, and replay/review training.
- **Lesson.** One concept, such as "Your Pieces Create Vision."
- **Chapter.** One composed Fog board that teaches and tests a smaller skill.
- **Sequence step.** Teach, guided move, challenge, feedback, reveal, or mastery
  check inside that chapter.

Each chapter should contain:

- a scoped `PlayerView`, not an omniscient board by default
- one board goal in plain language
- legal-move highlights when the goal is movement-oriented
- fogged unknown squares
- success and failure feedback
- a short "show why" reveal after completion or failure
- optional truth replay for the final step of each lesson

The initial release should feel closer to Lichess's `ui/learn` than to puzzle
rush: one concept at a time, low pressure, quick recovery from mistakes, and
clear progression. Advanced training can later mine lessons from real games.

## Recommended First Path

The first public path should start with a Lichess-like **Fog Pieces** category,
where each piece gets its own lesson tile and multiple composed-board chapters.
The old shorthand "Your Pieces Create Vision" is the category promise, not
necessarily one giant lesson.

Initial map shape:

1. Fog Pieces
2. Fog Fundamentals
3. Fog Intermediate
4. Fog Advanced
5. What Next?

The first playable path through those categories should teach:

1. How each piece moves through fog
2. Capture, protection, and combat
3. The Fog version of check, out of check, and mate
4. Board setup, castling, en passant, and drawn positions
5. Piece value, deeper threats, practice, puzzles, videos, people, and engines

The path should start with friendly pieces only. The player first learns how
their own king, queen, rooks, bishops, knights, and pawns create vision. Enemy
pieces should enter only after movement and vision feel familiar, so the first
danger lesson lands as a Fog twist rather than as unexplained punishment.

That set is enough to teach a player the core mental shift before their first
real game. The longer catalogue below can become the expanded beginner course.

Lichess-inspired category outline:

- **Fog Pieces.** Rook, bishop, queen, king, knight, pawn. About six movement
  chapters each.
- **Fog Fundamentals.** Capture, protection, combat, check in one, out of check,
  mate in one. In Bichess, this is where hidden enemies and direct king capture
  become explicit.
- **Fog Intermediate.** Board setup, castling, en passant rights, stalemate and
  draw mechanics.
- **Fog Advanced.** Piece value under uncertainty, check/capture in two, memory
  and scouting drills.
- **What Next?** Register, practice, puzzles, videos, play people, play machine.

## Fog Pieces Category

Purpose: teach each friendly piece as a movement tool on a fogged board before
introducing captures, protection, scouting choices, or serious danger.

This category should mirror the Lichess beginner shape:

- map section: **Fog Pieces**
- lesson tiles: rook, bishop, queen, king, knight, pawn
- each lesson: 5-8 chapters represented by progress cells
- each chapter: one composed board with a teaching sequence, challenge, and
  mastery check

The piece lessons should start like Lichess's piece lessons: simple movement,
short target paths, and friendly blockers. The Fog twist should be present in
the board rendering, not in the cognitive load. Players should feel that pieces
move through darkness before we ask them to reason about hidden enemies.

Out of scope for the first piece category:

- enemy reveals
- capture and defense
- check, mate, or king capture
- scouting relevance decisions
- last-seen memory
- hidden move inference

Those belong in Fundamentals, Intermediate, and Advanced.

### Piece Lesson 1 - The Rook

Lesson promise: rooks reveal straight lines, but blockers and bad direction
choices matter.

Narrative: the rook is the cleanest Fog scout. It turns files and ranks into
lit corridors.

Chapters:

- **Up The File.** Move the rook straight up to a highlighted square.
- **Back Down.** Move the rook back down the same file.
- **Across The Rank.** Move the rook sideways to a highlighted square.
- **Stop Before The Blocker.** A friendly piece blocks the path; move to the
  last legal square before it.
- **Turn The Corner.** Two-step sequence: move vertically, then horizontally.
- **Rook Trail.** Follow several highlighted squares with straight rook moves.

Teaching/challenge balance:

- Early chapters can show arrows.
- Middle chapters should offer two or three legal rook moves and ask which
  reveals the relevant corridor.
- Final chapter should remove arrows and use only target squares.

Fog twist:

- The rook moves through fog by making clear straight-line moves. Long-range
  scouting and enemy reveals are taught later, after movement feels natural.

### Piece Lesson 2 - The Bishop

Lesson promise: bishops move diagonally through fog.

Narrative: the bishop teaches angled movement. After the rook's files and ranks,
the player learns that a piece can cross the board only on matching diagonals.

Chapters:

- **Up Right.** Move the bishop up and right to a highlighted square.
- **Up Left.** Move the bishop up and left to a highlighted square.
- **Back Down.** Move the bishop back down the same diagonal.
- **Stop Before The Blocker.** A friendly piece blocks the diagonal; move to the
  last legal square before it.
- **Change Diagonals.** Two-step sequence: move along one diagonal, then use the
  new diagonal.
- **Bishop Trail.** Follow several highlighted squares with diagonal bishop
  moves.

Teaching/challenge balance:

- Start with arrows; end with color/diagonal reasoning.
- Wrong legal bishop moves should show what they reveal, then invite retry.

Fog twist:

- The bishop moves through fog by following clear diagonals. Diagonal scouting
  and hidden corner reveals are taught later, after movement feels natural.

### Piece Lesson 3 - The Queen

Lesson promise: the queen moves like a rook and a bishop.

Narrative: the queen is the first piece that combines earlier lessons. The
player already knows straight rook lines and diagonal bishop lines; now one
piece can use both.

Chapters:

- **Up The File.** Move the queen straight up like a rook.
- **Across The Rank.** Move the queen sideways like a rook.
- **Diagonal Line.** Move the queen diagonally like a bishop.
- **Choose The Line.** Choose the queen move that reaches the marked diagonal
  target.
- **Stop Before The Blocker.** A friendly piece blocks the path; move to the
  last legal square before it.
- **Queen Lantern Trail.** Follow several markers that appear one step at a
  time, mixing file, rank, and diagonal moves.

Teaching/challenge balance:

- The queen lesson should feel like synthesis, not tactics.
- It should avoid danger until later lessons, because the first category is
  still about movement.

Fog twist:

- The queen can reveal many legal destinations, but this lesson uses targets to
  keep attention on legal movement. The lantern trail lets markers appear one
  step at a time so the path feels discovered through fog without introducing
  enemy pieces.

### Piece Lesson 4 - The King

Lesson promise: the king moves one square at a time.

Narrative: after long-range pieces, the king slows the lesson down. The player
learns that the king can step in every direction, but only one square.

Chapters:

- **One Step Up.** Move the king one square forward.
- **Side Step.** Move the king one square sideways.
- **Diagonal Step.** Move the king one square diagonally.
- **From The Corner.** Move the king out of a corner, where it has fewer legal
  moves.
- **Occupied Square.** A friendly piece occupies one adjacent square; move
  around it.
- **King Walk.** Follow several one-square markers through fog.

Teaching/challenge balance:

- Do not introduce king capture, check, or danger here.
- Make the challenge about movement limits, not fear.

Fog twist:

- The king's legal world is small. Fog makes that small movement bubble visible
  without turning the first king lesson into a danger lesson.

### Piece Lesson 5 - The Knight

Lesson promise: knights move in L-shaped jumps.

Narrative: the knight is the first piece that makes movement feel non-linear.
It does not slide through fog; it jumps from pocket to pocket.

Chapters:

- **First L.** Move the knight to a basic L-shaped target.
- **Other L.** Move the knight to a different L-shaped target from the center.
- **Jump The Wall.** Friendly pieces sit nearby, but the knight jumps over them.
- **From The Edge.** Move a knight from the edge, where it has fewer jumps.
- **Choose The Pocket.** Pick the marked knight landing square among several
  legal pockets.
- **Pocket Trail.** Follow several L-shaped markers through fog.

Teaching/challenge balance:

- This lesson should include more prediction than sliding-piece lessons.
- Wrong legal moves are useful because they still demonstrate valid pockets.

Fog twist:

- The knight's path is never a corridor. Fog makes each landing square feel like
  a pocket discovered by jumping, not by sliding.

### Piece Lesson 6 - The Pawn

Lesson promise: pawns move forward and never backward.

Narrative: pawns are the weirdest beginner piece, so the first lesson keeps them
calm: forward movement, first double step, blockers, and no backward movement.
Diagonal captures wait for Fundamentals, where enemy pieces enter.

Chapters:

- **One Step.** Move a pawn one square forward.
- **First Double.** Move a pawn two squares from its starting rank.
- **After The First Move.** A pawn that already moved advances one square.
- **Blocked Pawn.** A friendly piece blocks one pawn; move the unblocked pawn.
- **No Backward.** Continue forward from an advanced square.
- **Forward Trail.** Follow several forward pawn markers.

Teaching/challenge balance:

- Keep the first pawn lesson movement-only.
- Save diagonal capture, en passant, and promotion for Fundamentals and
  Intermediate.

Fog twist:

- Pawns expose forward movement in Fog. Empty diagonals and diagonal captures
  are important, but they are introduced only once enemy pieces enter.

### Piece Category Capstone - First Reveal

Lesson promise: use the right piece to reveal one hidden enemy.

Narrative: the player has learned the tools. Now they choose the right scout.

Chapters:

- **Choose The Scout.** Present rook, bishop, knight, and pawn options. One move
  reveals the marked hidden region.
- **Line Or Jump.** Ask whether a line piece or knight can see around a blocker.
- **Relevant Vision.** Choose the move that reveals the target region, not the
  move that reveals the most total squares.
- **First Enemy Appears.** Reveal a harmless enemy piece and attribute the
  reveal to the friendly scout.
- **Ready For Danger.** Show a preview card for the next category: hidden pieces
  can be dangerous, not merely discoverable.

This capstone can either be a seventh tile in the Fog Pieces category or the
final chapter of the last piece lesson. A separate tile is cleaner if we follow
Lichess's map style closely.

First implementation order:

1. Rook movement lesson, six chapters
2. Bishop movement lesson, six chapters
3. Queen movement lesson, six chapters
4. King movement lesson, six chapters
5. Knight movement lesson, six chapters
6. Pawn movement lesson, six chapters

That subset proves the Lichess-like lesson engine: target squares, one-move
chapters, multi-step sequences, friendly blockers, fog recomputation, retry
feedback, and progress through a focused piece lesson. Enemy pieces and
information-scouting choices move into Fundamentals.

### First Build Authored Arrangements

These arrangements are implementation sketches for the first playable Fog Pieces
prototype. They use mini-boards rather than full opening positions. That is
intentional: the goal is to isolate the visibility rule with no tactical noise.

Current rules assumption: Fog visibility is derived from own piece squares plus
legal destination squares. Sliding pieces reveal until blocked. Knights reveal
legal jumps. Pawns reveal empty forward moves and diagonal captures, but not
empty diagonal attack squares.

The target squares below were sanity-checked against the current
`fogOfWarVariant.getPlayerView` visibility behavior.

Notation:

- `truth` is the canonical board.
- `targets` are instructional UI markers, not pieces.
- `accepted` lists the move or moves that advance the step.
- `preview` means show the shape without revealing hidden enemy truth.
- all first-build chapters use White perspective.

#### Rook Arrangement A - Up The File

Teaching goal: the rook moves straight up through fog.

Truth:

```ts
{
  b1: { color: 'white', role: 'king' },
  e2: { color: 'white', role: 'rook' }
}
```

Sequence:

1. Teach: select the rook on `e2`; highlight the clear file.
2. Guide: show target `e7`.
3. Move: accepted `e2e7`.
4. Check: pulse the straight path up the `e`-file.

Why it works:

- This is the closest Fog equivalent to Lichess's first rook chapter.
- It teaches one clean rook movement before adding choice.

#### Rook Arrangement B - Back Down

Teaching goal: the rook can move straight backward too.

Truth:

```ts
{
  b1: { color: 'white', role: 'king' },
  e7: { color: 'white', role: 'rook' }
}
```

Sequence:

1. Teach: the same file works in both directions.
2. Guide: show target `e2`.
3. Move: accepted `e7e2`.
4. Check: pulse the straight path down the `e`-file.

Why it works:

- It prevents the first lesson from feeling like rooks only go forward.
- It gives the player a second simple win before adding horizontal movement.

#### Rook Arrangement C - Across The Rank

Teaching goal: the rook moves horizontally across ranks.

Truth:

```ts
{
  b1: { color: 'white', role: 'king' },
  b4: { color: 'white', role: 'rook' }
}
```

Sequence:

1. Teach: ranks run left and right.
2. Guide: show target `g4`.
3. Move: accepted `b4g4`.
4. Check: pulse the fourth rank.

Why it works:

- It completes the basic rook movement shape: files and ranks.
- It is still a direct target move, not yet a reasoning puzzle.

#### Rook Arrangement D - Stop Before The Blocker

Teaching goal: rooks cannot jump over friendly pieces.

Truth:

```ts
{
  b1: { color: 'white', role: 'king' },
  e2: { color: 'white', role: 'rook' },
  e5: { color: 'white', role: 'knight' }
}
```

Sequence:

1. Teach: the knight on `e5` blocks the file.
2. Challenge: move the rook to the last clear square before the blocker.
3. Move: accepted `e2e4`; soft-failure `e2e3`.
4. Check: `e6` stays unavailable because the knight blocks the path.

Why it works:

- It introduces blockers gently, using only friendly pieces.
- It teaches legality before asking the player to use blockers tactically.

#### Rook Arrangement E - Turn The Corner

Teaching goal: a rook can turn a corner only by using two straight moves.

Truth:

```ts
{
  b1: { color: 'white', role: 'king' },
  a2: { color: 'white', role: 'rook' }
}
```

Sequence:

1. Teach: the rook cannot bend in one move.
2. Move: accepted `a2a6`.
3. Continue: show target `f6`.
4. Move: accepted `a6f6`.
5. Check: the path was vertical first, horizontal second.

Why it works:

- It gives the lesson its first real sequence without adding enemies.
- It mirrors Lichess's "collect targets" style while preserving Fog rendering.

#### Rook Arrangement F - Rook Trail

Teaching goal: combine vertical and horizontal rook moves through a short path.

Truth:

```ts
{
  b1: { color: 'white', role: 'king' },
  c2: { color: 'white', role: 'rook' }
}
```

Sequence:

1. Move: accepted `c2c6`.
2. Move: accepted `c6h6`.
3. Move: accepted `h6h3`.
4. Move: accepted `h3d3`.
5. Check: each move is one straight segment.

Why it works:

- It gives the player a small movement course.
- It is the mastery check for the first piece lesson.

#### Bishop Arrangement A - Up Right

Teaching goal: the bishop moves up and right on a diagonal.

Truth:

```ts
{
  e1: { color: 'white', role: 'king' },
  c1: { color: 'white', role: 'bishop' }
}
```

Sequence:

1. Teach: bishops move diagonally.
2. Guide: show target `g5`.
3. Move: accepted `c1g5`.
4. Check: pulse `d2`, `e3`, `f4`, `g5`, `h6`.

Why it works:

- It mirrors the first rook chapter but changes the geometry.
- It gives a clean first diagonal with no decision pressure.

#### Bishop Arrangement B - Up Left

Teaching goal: the bishop can move along the other rising diagonal.

Truth:

```ts
{
  e1: { color: 'white', role: 'king' },
  f1: { color: 'white', role: 'bishop' }
}
```

Sequence:

1. Teach: the bishop can climb diagonally in either direction when clear.
2. Guide: show target `b5`.
3. Move: accepted `f1b5`.
4. Check: pulse `e2`, `d3`, `c4`, `b5`, `a6`.

Why it works:

- It prevents the bishop from feeling like it has only one diagonal direction.
- It stays movement-first.

#### Bishop Arrangement C - Back Down

Teaching goal: the bishop can move backward on the same diagonal.

Truth:

```ts
{
  e1: { color: 'white', role: 'king' },
  g5: { color: 'white', role: 'bishop' }
}
```

Sequence:

1. Teach: bishops can move back down diagonals too.
2. Guide: show target `c1`.
3. Move: accepted `g5c1`.
4. Check: pulse the same diagonal in reverse.

Why it works:

- It completes directional comfort before adding blockers.

#### Bishop Arrangement D - Stop Before The Blocker

Teaching goal: bishops cannot jump over friendly pieces.

Truth:

```ts
{
  e1: { color: 'white', role: 'king' },
  c1: { color: 'white', role: 'bishop' },
  f4: { color: 'white', role: 'knight' }
}
```

Sequence:

1. Teach: the knight on `f4` blocks the diagonal.
2. Challenge: move the bishop to the last clear square before the blocker.
3. Move: accepted `c1e3`; soft-failure `c1d2`.
4. Check: `g5` remains unavailable because the knight blocks the path.

Why it works:

- It reuses the rook blocker idea with diagonal geometry.
- It teaches legality before scouting or tactics.

#### Bishop Arrangement E - Change Diagonals

Teaching goal: use two bishop moves to reach a new diagonal.

Truth:

```ts
{
  e1: { color: 'white', role: 'king' },
  b2: { color: 'white', role: 'bishop' }
}
```

Sequence:

1. Teach: a bishop cannot bend during one move.
2. Move: accepted `b2e5`.
3. Continue: show target `b8`.
4. Move: accepted `e5b8`.
5. Check: the bishop used one diagonal first, then another.

Why it works:

- It adds a simple multi-step route without adding enemies.
- It teaches how bishops navigate by changing diagonal from a new square.

#### Bishop Arrangement F - Bishop Trail

Teaching goal: combine diagonal bishop moves through a short path.

Truth:

```ts
{
  e1: { color: 'white', role: 'king' },
  d2: { color: 'white', role: 'bishop' }
}
```

Sequence:

1. Move: accepted `d2h6`.
2. Move: accepted `h6e3`.
3. Move: accepted `e3b6`.
4. Move: accepted `b6d8`.
5. Check: every move is diagonal.

Why it works:

- It gives the player a small diagonal movement course.
- It is the mastery check for the bishop lesson.

#### Knight Arrangement A - First L

Teaching goal: the knight moves in an L shape.

Truth:

```ts
{
  e1: { color: 'white', role: 'king' },
  b1: { color: 'white', role: 'knight' }
}
```

Sequence:

1. Teach: knights move two squares one way and one square sideways.
2. Guide: show target `c3`.
3. Move: accepted `b1c3`; soft-failure `b1a3` or `b1d2`.
4. Check: pulse the knight's new landing pockets.

Why it works:

- It starts with one clear L-shaped jump.

#### Knight Arrangement B - Other L

Teaching goal: the knight has several L-shaped jumps from the center.

Truth:

```ts
{
  e1: { color: 'white', role: 'king' },
  d4: { color: 'white', role: 'knight' }
}
```

Sequence:

1. Teach: from the center, a knight has many possible pockets.
2. Challenge: show target `f5`.
3. Move: accepted `d4f5`; soft-failure `d4f3` or `d4b5`.
4. Check: pulse the new pockets from `f5`.

Why it works:

- It asks for a tiny choice without tactics.

#### Knight Arrangement C - Jump The Wall

Teaching goal: nearby friendly pieces do not block a knight.

Truth:

```ts
{
  e1: { color: 'white', role: 'king' },
  b1: { color: 'white', role: 'knight' },
  b2: { color: 'white', role: 'pawn' },
  c2: { color: 'white', role: 'pawn' }
}
```

Sequence:

1. Teach: knights jump over nearby pieces.
2. Challenge: show target `c3`.
3. Move: accepted `b1c3`; soft-failure `b1a3` or `b1d2`.
4. Check: the knight jumped despite the pawns.

Why it works:

- It makes the knight feel meaningfully different from line pieces.

#### Knight Arrangement D - From The Edge

Teaching goal: a knight on the edge has fewer legal jumps.

Truth:

```ts
{
  e1: { color: 'white', role: 'king' },
  a1: { color: 'white', role: 'knight' }
}
```

Sequence:

1. Teach: edge squares reduce the knight's options.
2. Challenge: show target `b3`.
3. Move: accepted `a1b3`; soft-failure `a1c2`.
4. Check: pulse the new pockets from `b3`.

Why it works:

- It teaches board-edge limits without danger.

#### Knight Arrangement E - Choose The Pocket

Teaching goal: choose the marked knight landing pocket.

Truth:

```ts
{
  g1: { color: 'white', role: 'king' },
  e4: { color: 'white', role: 'knight' }
}
```

Sequence:

1. Teach: knights land in pockets rather than corridors.
2. Challenge: show target `d6`.
3. Move: accepted `e4d6`; soft-failure `e4f6` or `e4c5`.
4. Check: pulse the pockets from `d6`.

Why it works:

- It builds prediction while staying movement-only.

#### Knight Arrangement F - Pocket Trail

Teaching goal: follow a short trail of knight jumps.

Truth:

```ts
{
  e1: { color: 'white', role: 'king' },
  b1: { color: 'white', role: 'knight' }
}
```

Sequence:

1. Move: accepted `b1c3`.
2. Move: accepted `c3e4`.
3. Move: accepted `e4f6`.
4. Move: accepted `f6h5`.
5. Check: each marker appears as a new pocket.

Why it works:

- It gives the knight a Fog-native movement course.
- The trail feels like jumping between small islands of visibility.

#### Queen Arrangement A - Up The File

Teaching goal: the queen moves straight like a rook.

Truth:

```ts
{
  b1: { color: 'white', role: 'king' },
  d2: { color: 'white', role: 'queen' }
}
```

Sequence:

1. Teach: the queen can move straight up the file.
2. Guide: show target `d7`.
3. Move: accepted `d2d7`.
4. Check: pulse `d3`, `d4`, `d5`, `d6`, `d7`, `d8`.

Why it works:

- It connects queen movement to the rook lesson.
- It keeps the first queen move obvious.

#### Queen Arrangement B - Across The Rank

Teaching goal: the queen moves sideways like a rook.

Truth:

```ts
{
  b1: { color: 'white', role: 'king' },
  c4: { color: 'white', role: 'queen' }
}
```

Sequence:

1. Teach: the queen can also move across ranks.
2. Guide: show target `h4`.
3. Move: accepted `c4h4`.
4. Check: pulse the fourth rank.

Why it works:

- It reinforces rook-like movement before adding diagonals.

#### Queen Arrangement C - Diagonal Line

Teaching goal: the queen moves diagonally like a bishop.

Truth:

```ts
{
  e1: { color: 'white', role: 'king' },
  d1: { color: 'white', role: 'queen' }
}
```

Sequence:

1. Teach: the queen can move on diagonals too.
2. Guide: show target `h5`.
3. Move: accepted `d1h5`.
4. Check: pulse `e2`, `f3`, `g4`, `h5`.

Why it works:

- It completes the queen's movement identity: rook plus bishop.

#### Queen Arrangement D - Choose The Line

Teaching goal: choose the queen line that reaches the marked target.

Truth:

```ts
{
  b1: { color: 'white', role: 'king' },
  d4: { color: 'white', role: 'queen' }
}
```

Sequence:

1. Teach: the queen has straight and diagonal options.
2. Challenge: show target `h8`.
3. Move: accepted `d4h8`; soft-failure `d4h4` or `d4d8`.
4. Check: pulse the diagonal path.

Why it works:

- It introduces a tiny choice without switching into tactics.

#### Queen Arrangement E - Stop Before The Blocker

Teaching goal: even the queen cannot jump over pieces.

Truth:

```ts
{
  b1: { color: 'white', role: 'king' },
  d2: { color: 'white', role: 'queen' },
  d6: { color: 'white', role: 'bishop' }
}
```

Sequence:

1. Teach: the bishop on `d6` blocks the file.
2. Challenge: move the queen to the last clear square before the blocker.
3. Move: accepted `d2d5`; soft-failure `d2d4`.
4. Check: `d7` remains unavailable because the bishop blocks the path.

Why it works:

- It reuses the blocker idea for the most powerful sliding piece.

#### Queen Arrangement F - Queen Lantern Trail

Teaching goal: combine file, rank, and diagonal queen moves through fog.

Truth:

```ts
{
  b1: { color: 'white', role: 'king' },
  d1: { color: 'white', role: 'queen' }
}
```

Sequence:

1. Move: accepted `d1d5`.
2. Move: accepted `d5h5`.
3. Move: accepted `h5e8`.
4. Move: accepted `e8b5`.
5. Check: each marker appears one step at a time.

Why it works:

- It gives the queen a Fog-native movement course.
- The hidden thing is a training marker, not an enemy, so the lesson stays
  beginner-safe.

#### King Arrangement A - One Step Up

Teaching goal: the king moves one square forward.

Truth:

```ts
{
  e2: { color: 'white', role: 'king' }
}
```

Sequence:

1. Teach: the king moves one square at a time.
2. Guide: show target `e3`.
3. Move: accepted `e2e3`.
4. Check: pulse the king's adjacent movement bubble.

Why it works:

- It teaches the king without fear, check, or enemies.

#### King Arrangement B - Side Step

Teaching goal: the king moves one square sideways.

Truth:

```ts
{
  d4: { color: 'white', role: 'king' }
}
```

Sequence:

1. Teach: the king can step sideways.
2. Guide: show target `e4`.
3. Move: accepted `d4e4`.
4. Check: pulse the new adjacent bubble.

Why it works:

- It separates sideways movement from diagonal movement.

#### King Arrangement C - Diagonal Step

Teaching goal: the king moves one square diagonally.

Truth:

```ts
{
  d3: { color: 'white', role: 'king' }
}
```

Sequence:

1. Teach: the king can step diagonally too.
2. Guide: show target `e4`.
3. Move: accepted `d3e4`.
4. Check: pulse the new adjacent bubble.

Why it works:

- It completes the king's basic movement shape.

#### King Arrangement D - From The Corner

Teaching goal: the king has fewer legal moves on the edge of the board.

Truth:

```ts
{
  a1: { color: 'white', role: 'king' }
}
```

Sequence:

1. Teach: a corner king has only a few legal squares.
2. Challenge: show target `b2`.
3. Move: accepted `a1b2`; soft-failure `a1a2` or `a1b1`.
4. Check: pulse the expanded movement bubble from `b2`.

Why it works:

- It teaches board edges without introducing danger.

#### King Arrangement E - Occupied Square

Teaching goal: the king cannot move onto a friendly piece.

Truth:

```ts
{
  e2: { color: 'white', role: 'king' },
  e3: { color: 'white', role: 'rook' }
}
```

Sequence:

1. Teach: the rook on `e3` occupies a square the king cannot enter.
2. Challenge: show target `d3`.
3. Move: accepted `e2d3`; soft-failure `e2d2` or `e2f3`.
4. Check: the king moved around the occupied square.

Why it works:

- It introduces friendly occupancy before any capture rules.

#### King Arrangement F - King Walk

Teaching goal: follow a short path of one-square king moves.

Truth:

```ts
{
  e1: { color: 'white', role: 'king' }
}
```

Sequence:

1. Move: accepted `e1e2`.
2. Move: accepted `e2f3`.
3. Move: accepted `f3f4`.
4. Move: accepted `f4e5`.
5. Check: every move is one square.

Why it works:

- It gives the king a small movement course.
- It keeps the king lesson calm before later king-capture fundamentals.

#### Pawn Arrangement A - One Step

Teaching goal: a pawn moves one square forward.

Truth:

```ts
{
  e1: { color: 'white', role: 'king' },
  e3: { color: 'white', role: 'pawn' }
}
```

Sequence:

1. Teach: White pawns move toward higher ranks.
2. Guide: show target `e4`.
3. Move: accepted `e3e4`.
4. Check: pulse `e5` as the next forward square.

Why it works:

- It teaches forward movement without captures or special rules.

#### Pawn Arrangement B - First Double

Teaching goal: a pawn may move two squares from its starting rank.

Truth:

```ts
{
  e1: { color: 'white', role: 'king' },
  d2: { color: 'white', role: 'pawn' }
}
```

Sequence:

1. Teach: from the starting rank, a pawn can move one or two squares if clear.
2. Challenge: show target `d4`.
3. Move: accepted `d2d4`; soft-failure `d2d3`.
4. Check: after the move, the pawn continues one square at a time.

Why it works:

- It introduces the double step before en passant exists.

#### Pawn Arrangement C - After The First Move

Teaching goal: a pawn away from its starting rank moves one square.

Truth:

```ts
{
  e1: { color: 'white', role: 'king' },
  d4: { color: 'white', role: 'pawn' }
}
```

Sequence:

1. Teach: after the first move, the double step is gone.
2. Guide: show target `d5`.
3. Move: accepted `d4d5`.
4. Check: pulse `d6` as the next forward square.

Why it works:

- It prevents players from overgeneralizing the double step.

#### Pawn Arrangement D - Blocked Pawn

Teaching goal: a pawn cannot move forward into an occupied square.

Truth:

```ts
{
  e1: { color: 'white', role: 'king' },
  d3: { color: 'white', role: 'pawn' },
  d4: { color: 'white', role: 'bishop' },
  f3: { color: 'white', role: 'pawn' }
}
```

Sequence:

1. Teach: the d-pawn is blocked by the bishop on `d4`.
2. Challenge: move the unblocked f-pawn.
3. Move: accepted `f3f4`.
4. Check: the blocked d-pawn cannot move forward.

Why it works:

- It teaches occupancy before captures.

#### Pawn Arrangement E - No Backward

Teaching goal: pawns continue forward and do not move backward.

Truth:

```ts
{
  e1: { color: 'white', role: 'king' },
  e5: { color: 'white', role: 'pawn' }
}
```

Sequence:

1. Teach: pawns do not retreat.
2. Guide: show target `e6`.
3. Move: accepted `e5e6`.
4. Check: pulse `e7` as the next forward square.

Why it works:

- It makes pawn direction explicit.

#### Pawn Arrangement F - Forward Trail

Teaching goal: follow a short trail of forward pawn moves.

Truth:

```ts
{
  e1: { color: 'white', role: 'king' },
  b2: { color: 'white', role: 'pawn' }
}
```

Sequence:

1. Move: accepted `b2b4`.
2. Move: accepted `b4b5`.
3. Move: accepted `b5b6`.
4. Move: accepted `b6b7`.
5. Check: the first move can be double; the rest are one square.

Why it works:

- It gives the pawn a movement course without adding captures.
- Diagonal capture and en passant remain for later categories.

#### Capstone Arrangement - First Harmless Reveal

Teaching goal: choose the right scout to reveal a hidden enemy.

Truth:

```ts
{
  g1: { color: 'white', role: 'king' },
  a2: { color: 'white', role: 'rook' },
  c1: { color: 'white', role: 'bishop' },
  e4: { color: 'white', role: 'knight' },
  g7: { color: 'black', role: 'rook' }
}
```

Targets:

- hidden region: `g7`

Sequence:

1. Teach: show three scout options without revealing truth:
   `a2a7`, `a2g2`, `c1g5`, `e4f6`.
2. Challenge: ask "Which scout sees the marked hidden square?"
3. Move: accepted `a2a7` or `a2g2`; soft-failure `c1g5` or `e4f6`.
4. Reveal: after either rook move, black rook on `g7` appears along the rook line.
5. Attribution: show "Your rook sees the rook on g7."
6. Check: offer a quick replay: before move, after move, why it appeared.

Why it works:

- It is the first enemy reveal, but the enemy is harmless and cannot punish the
  player in this category.
- It asks the player to apply line, diagonal, and jump vision together.
- It sets up the next category: hidden pieces can later be dangerous.

Implementation note:

- The capstone should preview scout shapes, not truth. If a preview would expose
  the hidden enemy piece, show only target/shape overlays until the move is
  committed.

### Category Sequencing

MVP sequence:

1. Rook Arrangement A - up the file
2. Rook Arrangement B - back down
3. Rook Arrangement C - across the rank
4. Rook Arrangement D - stop before the blocker
5. Rook Arrangement E - turn the corner
6. Rook Arrangement F - rook trail

Full Fog Pieces sequence:

1. Rook A-F
2. Bishop A-F
3. Queen A-F
4. King A-F
5. Knight A-F
6. Pawn A-F

Design rhythm:

- Begin each lesson with one Lichess-like "move to target" chapter.
- Add reverse-direction movement before asking for choice.
- Add a friendly blocker chapter for pieces that can be blocked.
- Include one multi-step route chapter.
- End the piece with a small target trail.

The player should feel increasing fluency, not increasing punishment. Danger,
capture, protection, and hidden enemy reveals start in Fundamentals.

## Lesson Catalogue

### 1. Your Pieces Create Vision Category Overview

Core idea: your visible board is built from your pieces and their legal moves.

Why it deserves the first lesson: Fog is easier to learn when the player starts
with agency. Before introducing threats, captures, and hidden enemies, the
player should understand that every friendly piece is also a sensor.

Chapters:

- **The board starts with your army.** Show only friendly pieces and fog. Ask the
  player to click each piece type and watch its visible squares.
- **Rook lantern.** Move a rook along a rank or file to collect vision targets,
  Lichess-style, without enemy pieces yet.
- **Bishop beam.** Move a bishop diagonally and show how diagonal vision changes
  the fog boundary.
- **Knight jump.** Move a knight to show that jumping also creates non-linear
  vision.
- **Queen floodlight.** Move a queen and reveal a large area, making the power
  of long-range pieces obvious.
- **King bubble.** Move the king one square and show its small, fragile vision
  zone.
- **Pawn eyes.** Show that pawns reveal empty forward moves and diagonal
  captures, but not empty diagonal attack squares.
- **First reveal.** Only after all friendly pieces are familiar, move one scout
  and reveal a single enemy piece.

Interaction notes:

- This lesson can use Lichess-style arrows and star targets, but the targets
  should represent vision objectives.
- Start with friendly pieces only; do not punish the player for hidden enemies
  before they understand their own tools.
- The board should update fog immediately after every move.
- The "why" view should highlight the piece that creates each newly visible
  square.

#### Piece Category Detailed Scope

Working title: **Your Pieces Create Vision**

Player promise: after this lesson, a player can look at a Fog board and
understand that their own pieces are producing the visible map.

Tone: calm, tactile, and exploratory. This should feel like learning to use a
lantern, not like walking into traps.

Completion target: 3-5 minutes for a first-time player, under 90 seconds for a
returning player.

Primary mechanic:

- The player moves or selects friendly pieces.
- The board highlights the squares those pieces currently make visible.
- Fog updates immediately after a move.
- Vision targets replace Lichess-style apples/stars.

Out of scope for Lesson 1:

- no king capture
- no losing states caused by hidden enemies
- no opponent turn except the final authored reveal if needed
- no belief/candidate overlays
- no explanation of hidden move notation

Teaching loop:

- **Show.** Demonstrate the piece's vision with an obvious highlight or ghosted
  move before asking for input.
- **Guide.** Ask the player to make one constrained move with visible targets.
- **Challenge.** Remove one layer of guidance and ask the player to choose the
  move that reveals the right squares.
- **Check.** Confirm mastery with a tiny question or replay: "Which piece sees
  this square?" or "Which move lights up the file?"

Lesson 1 should not be hard, but it should ask the player to think. A chapter
that only says "move here" is a demo, not a lesson. The challenge should be
small: choose between two legal moves, predict which squares will become
visible, or identify which piece created a reveal.

Challenge ladder:

- Chapter 1.1: recognize that different pieces create different vision.
- Chapter 1.2: choose the rook move that lights the target file.
- Chapter 1.3: choose the bishop diagonal that reaches the target region.
- Chapter 1.4: choose the knight jump that sees over blockers.
- Chapter 1.5: choose the queen move that reveals the most relevant area.
- Chapter 1.6: notice the king's vision is small and needs support.
- Chapter 1.7: distinguish empty forward pawn visibility from diagonal capture
  visibility.
- Chapter 1.8: use any learned scout pattern to reveal one hidden piece.

##### Chapter 1.1 - The Board Starts With Your Army

Goal text: "Your pieces decide what you can see."

Teaching beat:

- Start with a static board and no enemy pieces.
- When the player selects a rook, bishop, knight, king, or pawn, dim unrelated
  highlights and show only that piece's contribution to vision.
- Use a one-line prompt: "This rook sees in straight lines."

Challenge beat:

- Ask: "Which piece sees the marked square?"
- The player must select the correct friendly piece.
- Repeat for two or three piece types, with the marked square changing shape:
  straight line, diagonal, knight jump, adjacent king square, pawn forward move,
  or pawn capture.

Mastery check:

- Complete when the player correctly identifies three vision sources.
- If they select the wrong piece, show that piece's real vision and leave the
  marked square unclaimed.

Board intent:

- White has a small set of friendly pieces: king, rook, bishop, knight, pawn.
- No enemy pieces are visible or relevant.
- Fog covers all squares outside White's legal visibility.

Interaction:

- The player clicks each friendly piece.
- Selecting a piece highlights the squares it contributes to vision.
- No move is required.

Success:

- Complete after the player inspects three or more piece types, or after a
  "next" button appears once all required pieces have been inspected.

Feedback:

- Highlight the selected piece's vision.
- Briefly pulse newly explained squares.
- Avoid prose beyond the chapter goal and a short completion message.

Implementation notes:

- This chapter needs selectable read-only board behavior.
- It may use a synthetic mini-position rather than a legal full-game position if
  that keeps the concept clear, but the generated visibility should still use
  the same visibility rules as live Fog.

##### Chapter 1.2 - Rook Lantern

Goal text: "Move the rook to light up the file."

Teaching beat:

- First show a rook with a ghost line along one rank/file.
- Move preview highlights the squares that would become visible.
- The prompt says: "Rooks reveal straight lines."

Challenge beat:

- Put two legal rook destinations on the board.
- One destination reveals the marked file; the other reveals irrelevant squares.
- Ask the player to choose the move that lights the marked file.

Mastery check:

- Complete when the player chooses the rook move that makes every file target
  visible.
- If the player chooses the weaker move, show the smaller revealed area and
  prompt: "That move sees squares, but not the file we need."

Board intent:

- White rook starts on a central or side file with empty lines.
- Vision targets sit on squares the rook can reveal by moving in straight
  lines.
- No enemy pieces.

Interaction:

- Player moves the rook to one or two target squares.
- Fog expands along ranks/files after each move.

Success:

- Complete when all rook vision targets have become visible.

Failure:

- No hard failure. If the player moves away from the target path, keep legal
  play but re-highlight the next target.

Feedback:

- Show a line highlight from rook origin to destination.
- After completion, briefly show all squares the rook now sees.

Implementation notes:

- This chapter can closely mirror Lichess's rook apple pattern, but the target
  copy should say "vision" or "light" rather than "collect."

##### Chapter 1.3 - Bishop Beam

Goal text: "Bishops see diagonally."

Teaching beat:

- Show a bishop's current diagonal vision.
- Preview two diagonal moves and pulse the newly visible diagonal after each
  hover or selection.
- If a blocker is present, show the beam stopping at the blocker.

Challenge beat:

- Place two target clusters in fog.
- One cluster is reachable by the bishop's diagonal vision; the other is not.
- Ask the player to move the bishop so the diagonal target cluster becomes
  visible.

Mastery check:

- Complete when the chosen bishop move reveals the target diagonal.
- If the player chooses the wrong diagonal, show what changed and keep the
  target cluster unclaimed.

Board intent:

- White bishop starts with two or more diagonal options.
- Fog boundary changes visibly when the bishop moves.
- Include one friendly blocker in an optional later step to show lines stop.

Interaction:

- Player moves the bishop onto a highlighted diagonal square.
- Optional second move asks the player to choose the diagonal that reveals more
  target squares.

Success:

- Complete when the bishop reveals the target diagonal.

Failure:

- No hard failure. Non-target legal bishop moves are allowed but do not advance.

Feedback:

- Draw a diagonal beam before and after the move.
- If using a blocker, highlight the blocker as the reason the beam stops.

Implementation notes:

- If the first implementation needs to stay small, skip the blocker here and use
  a later "blockers matter" micro-chapter.

##### Chapter 1.4 - Knight Jump

Goal text: "Knights reveal in jumps."

Teaching beat:

- Show blockers around the knight and then show the knight's L-shaped vision
  ignoring those blockers.
- Use jump markers instead of long lines so the mechanic looks different from
  rook and bishop vision.

Challenge beat:

- Mark two hidden pockets.
- Ask the player which knight jump sees over the blockers into the marked
  pocket.
- The wrong jump is legal but reveals the wrong pocket.

Mastery check:

- Complete when the knight reveals the marked pocket.
- Ask one tiny follow-up: "Did the blockers stop the knight?" The expected
  answer is demonstrated by the board, not a text quiz if avoidable.

Board intent:

- White knight sits near the center.
- Vision targets are on L-shaped destination/visibility squares.
- Friendly blockers may surround the knight to make the jump contrast obvious.

Interaction:

- Player moves the knight to a target square.
- Board highlights the non-linear visible squares created by the knight.

Success:

- Complete when the knight reaches the target and the new visible squares pulse.

Failure:

- No hard failure. Wrong legal knight moves can be accepted if they still reveal
  the concept, but the authored target should be clearer.

Feedback:

- Show small jump markers rather than long arrows.
- Emphasize that blockers do not stop knight movement or knight vision.

Implementation notes:

- This is the chapter most likely to help players understand that "vision" means
  legal movement, not a generic radius.

##### Chapter 1.5 - Queen Floodlight

Goal text: "Queens can open a lot of the map."

Teaching beat:

- Show that the queen combines rook and bishop vision.
- Preview one straight-line queen move and one diagonal queen move.
- Count the relevant vision targets each move would reveal.

Challenge beat:

- Offer three queen moves: one reveals many irrelevant squares, one reveals a
  small relevant cluster, and one reveals the largest relevant cluster.
- Ask the player to choose the move that sees the target region, not simply the
  move that sees the most total squares.

Mastery check:

- Complete when the queen reveals the target region.
- If the player chooses broad but irrelevant vision, label it: "Lots of light,
  wrong area."

Board intent:

- White queen starts in a constrained but safe area.
- One queen move reveals many vision targets at once.
- Still no enemy threat.

Interaction:

- Player chooses the queen move that reveals the most highlighted targets.

Success:

- Complete when the queen move reveals the target area.

Failure:

- Soft failure only. If the player chooses a weaker queen move, show fewer
  revealed targets and invite retry.

Feedback:

- Count visible targets before and after the move.
- Use a broad but restrained reveal animation so this feels powerful.

Implementation notes:

- This chapter can introduce qualitative move feedback: "This sees more."
- Avoid teaching queen material value; the point is board illumination.

##### Chapter 1.6 - King Bubble

Goal text: "Your king sees only nearby squares."

Teaching beat:

- Show the king's one-square vision bubble.
- Contrast it with a nearby rook or bishop's longer vision without introducing
  enemy danger.

Challenge beat:

- Ask the player to choose between moving the king to inspect one adjacent square
  and moving a helper piece to inspect several squares around the king.
- The right answer depends on the prompt: first move the king, then use help.

Mastery check:

- Complete when the player demonstrates both facts: the king can inspect nearby
  squares, but a helper sees farther.
- This sets up later king safety without saying "you lose."

Board intent:

- White king has a few legal one-square moves.
- Fog boundary around the king is small compared with rook/bishop/queen.
- No enemy pieces and no check semantics.

Interaction:

- Player moves the king one square and observes the small vision bubble shift.

Success:

- Complete after one legal king move into a highlighted target.

Failure:

- No failure in Lesson 1. Do not introduce king danger yet.

Feedback:

- Highlight the king's adjacent visible squares.
- Completion copy should set up Lesson 3 later: "The king sees little, so it
  needs help."

Implementation notes:

- Do not mention check or king capture here. Keep this chapter about limited
  vision and future vulnerability.

##### Chapter 1.7 - Pawn Eyes

Goal text: "Pawns reveal forward moves and diagonal captures."

Teaching beat:

- Show two visual treatments: empty forward move targets and diagonal capture
  targets.
- Use a prompt like: "The pawn sees forward when it can move, and sees diagonal
  enemies when it can capture."

Challenge beat:

- Mark one forward square and one diagonal enemy.
- Ask the player first to identify the empty forward square, then identify the
  diagonal enemy that is visible because it can be captured.

Mastery check:

- Complete when the player distinguishes the forward move from the diagonal
  capture reveal.
- If they pick an empty diagonal square, show that it stays fogged under the
  current rules.

Board intent:

- White pawn has a forward move and one diagonal enemy capture.
- Empty diagonal attack squares remain fogged.

Interaction:

- Player selects the pawn to inspect vision.
- Player then compares the empty forward square with the visible diagonal enemy.

Success:

- Complete when the player identifies the forward move and diagonal capture.

Failure:

- No hard failure.

Feedback:

- Use two visual treatments: forward move target and diagonal capture target.
- Keep en passant and promotion out of this chapter.

Implementation notes:

- This chapter should establish the pawn mental model before the expanded
  "Pawn Vision Is Strange" lesson handles edge cases.

##### Chapter 1.8 - First Reveal

Goal text: "Now use vision to find one hidden piece."

Teaching beat:

- Recap: "Rooks see lines. Bishops see diagonals. Knights jump. Pawns reveal
  forward moves and diagonal captures."
- Show two possible scout moves and preview only their vision shapes, not the
  hidden truth.

Challenge beat:

- Place one harmless enemy piece behind fog.
- Offer two or three legal scout moves from different piece types.
- Ask the player to choose the move most likely to reveal the marked hidden
  region.

Mastery check:

- Complete when an enemy piece appears and the player identifies which friendly
  piece sees it.
- This should be the first "aha" reveal of the course, not a punishment.

Board intent:

- Return to a simple position with one friendly scout and one hidden enemy piece.
- The enemy piece is harmless in this chapter.
- The correct move reveals the enemy.

Interaction:

- Player moves a friendly piece to reveal the hidden enemy.
- When the enemy appears, the UI identifies which friendly piece sees it.

Success:

- Complete when the enemy piece becomes visible.

Failure:

- Soft failure only. If the player moves elsewhere, keep the piece hidden and
  ask them to try a move that sees more.

Feedback:

- Reveal animation should be noticeable but not alarming.
- Show attribution: "Your knight on e4 sees d6."
- Offer a one-click "show why" that highlights the vision line or jump.

Implementation notes:

- This is the bridge into Lesson 2. It proves hidden space can contain pieces,
  but it should not punish the player yet.

##### Piece Category Data Shape

The first implementation probably needs a small authored lesson schema. It
should represent the Lichess-like hierarchy explicitly:

- lesson id and title
- chapter ids and titles
- per-chapter starting board
- per-chapter sequence steps
- perspective color for each chapter
- current player view or enough data to compute it at each step
- allowed move policy per step: read-only inspect, one expected move, accepted
  move set, or scripted reveal
- vision target squares per step
- optional selected-piece explanation
- success condition and soft-failure message
- completion message and optional reveal attribution

Example conceptual shape:

```ts
type TutorialLesson = {
  id: string;
  title: string;
  chapters: TutorialChapter[];
};

type TutorialChapter = {
  id: string;
  title: string;
  perspective: 'white' | 'black';
  initialBoard: Board;
  steps: TutorialStep[];
};

type TutorialStep = {
  id: string;
  goal: string;
  mode: 'teach' | 'inspect' | 'move' | 'challenge' | 'reveal' | 'check';
  requiredInspections?: Square[];
  acceptedMoves?: Uci[];
  visionTargets?: Square[];
  revealAttribution?: {
    scout: Square;
    revealed: Square;
  };
  feedback: {
    success: string;
    softFailure?: string;
  };
};
```

The schema should stay smaller than a general puzzle engine. Lesson 1 mostly
needs inspection, authored moves, target highlighting, immediate recompute of Fog
visibility, and short step transitions inside a chapter.

##### Piece Category MVP Cut

If the first build needs to be very small, ship four chapters:

1. The Board Starts With Your Army
2. Rook Lantern
3. Knight Jump
4. First Reveal

That cut teaches the essential mechanic: friendly pieces produce vision, and
vision can uncover hidden enemies. Bishop, queen, king, and pawn chapters can
fill out the complete beginner lesson once the interaction model works.

### 2. Unknown Is Not Empty

Core idea: Fogged squares are unknown, not safe.

Why it deserves a full lesson: once the player understands their own pieces,
this is the first danger lesson. It corrects the most common beginner mistake:
treating unseen squares as empty.

Chapters:

- **Friendly vision recap.** Show a familiar own-piece position from Lesson 1,
  then place one enemy beyond the fog.
- **The first enemy reveal.** Move a scout to uncover the hidden enemy and show
  that fogged space can contain real pieces.
- **The tempting empty square.** Offer a move into fog that appears safe. On
  failure, reveal the hidden enemy piece that made the move losing.
- **Safe square, unsafe square.** Give two legal king or queen moves: one stays
  inside known safety, one steps into an unseen attack.
- **Unknown capture.** Let the player capture a visible piece only if the
  destination is known enough to survive.
- **Truth reveal.** Replay the position from the player view, then truth view,
  so the player sees that the board was never empty.

Interaction notes:

- Use strong fog boundary styling.
- Failure feedback should not shame the player; it should say what information
  was missing.
- The first failure should come after at least one successful enemy reveal.
- The final prompt should ask the player to choose the safe move without showing
  truth until after the choice.

### 3. No Check, Capture The King

Core idea: Fog games end by king capture, and there may be no check warning.

Why it deserves a full lesson: classical chess intuition is actively dangerous
here. Players must stop waiting for check/checkmate semantics.

Chapters:

- **Check is not the signal.** Show a position that would be check-like in
  classical chess, but the UI does not announce check.
- **Find the king.** Reveal an enemy king with a scouting move.
- **Capture to win.** Make the direct king capture and show terminal feedback.
- **Your king can be captured too.** Let the player make a greedy move that
  exposes their king; reveal the opponent capture.
- **Race condition.** Present a one-move tactical choice: capture the enemy king
  now or lose next turn.

Interaction notes:

- The win feedback should be decisive and short: "King captured."
- Avoid teaching checkmate patterns in this lesson.
- Use one chapter to explicitly contrast "what a chess player expects" with
  "what Fog actually does," but keep the explanation on the board.

### 4. Scout Before You Grab

Core idea: information can be worth more than material.

Why it deserves a full lesson: normal beginner tactics overvalue captures. Fog
requires the player to ask what a move reveals or hides before counting material.

Chapters:

- **Two good-looking moves.** Offer a pawn capture and a scouting knight move.
  The scouting move reveals a king threat or avoids a trap.
- **The bait piece.** A visible rook is free, but capturing it exposes the king
  or misses a direct king capture.
- **Vision before value.** Ask the player to choose the move that reveals the
  most relevant squares, not the most material.
- **Safe capture test.** Capture only after confirming the destination and king
  safety.
- **Review label.** After the lesson, tag each candidate move as material,
  information, safety, or losing.

Interaction notes:

- This is the first lesson where move evaluation should be qualitative, not just
  pass/fail.
- Do not require engine analysis. Author the position so the teaching point is
  unambiguous.

### 5. Last Seen Is A Clue

Core idea: remembered pieces are clues, not facts.

Why it deserves a full lesson: memory overlays can help only if players
understand their limitations. This lesson prepares users for optional belief and
last-seen UI.

Chapters:

- **See it, lose it.** Reveal an enemy piece, then let it move or disappear into
  fog.
- **Faded marker.** Show the last-seen square with age styling.
- **Could it still be there?** Ask whether the piece must, may, or cannot be on
  its old square.
- **Cover likely squares.** Move a piece to watch both the last-seen square and
  a likely destination.
- **Bad memory trap.** Punish a move that treats a stale marker as certain.

Interaction notes:

- This is the first lesson that should introduce a memory overlay, but it should
  be framed as optional help rather than default truth.
- The "show why" view can draw candidate arrows from the last-seen square.

### 6. Opponent Moved, But Where?

Core idea: a hidden opponent move is still an information event.

Why it deserves a full lesson: Fog move lists are confusing until players learn
that "Black moved" can be the honest, correct amount of information.

Chapters:

- **Hidden move placeholder.** Opponent moves in fog; the move list says only
  that a move happened.
- **What changed?** Ask the player to identify whether a piece appeared,
  disappeared, a visible square changed, or nothing changed.
- **Legal movement narrows it.** Show candidate origins/destinations for a
  known piece that vanished.
- **No visible change matters too.** Teach that a hidden move that changes
  nothing visible still consumes a turn and changes tactical timing.
- **Respond under uncertainty.** Choose a move that stays safe against multiple
  possible hidden moves.

Interaction notes:

- Keep candidate overlays simple. Beginner lessons should not become full CSP
  visualizations.
- Use labels like "possible" and "known," never "probably" unless there is a
  model behind it.

### 7. Hide Your King

Core idea: your own visibility is a resource.

Why it deserves a full lesson: Fog is not only about finding the opponent. A
beginner who learns to keep their king unseen will understand the defensive half
of the game.

Chapters:

- **What can they see?** Briefly flip to the opponent perspective after a move.
- **Do not reveal the king.** Choose between developing moves where one exposes
  the king to an enemy line.
- **Screening piece.** Move a piece to scout without opening a line to the king.
- **King relocation.** Move the king to a safer hidden zone.
- **Tradeoff.** Choose between revealing more enemy territory and keeping the
  king concealed.

Interaction notes:

- Perspective flip should be short and explicit so it does not feel like the
  live game is leaking information.
- This lesson should connect naturally to replay review: after the exercise,
  show what each side knew.

### 8. Why Did That Piece Appear?

Core idea: reveals have causes.

Why it deserves a full lesson: players notice new pieces but often miss which
friendly piece or line created visibility. Teaching attribution makes reveals
legible.

Chapters:

- **Reveal by movement.** Move a piece; an enemy appears.
- **Identify the scout.** Ask which friendly piece sees the enemy.
- **Reveal by blocker removal.** Capture or move a blocker and expose a line.
- **Reveal by enemy movement.** Opponent moves into your vision.
- **Reveal log.** Show a small log entry such as "your knight on e4 saw d6."

Interaction notes:

- This lesson is a bridge between onboarding and future reveal-log UI.
- It can be shorter than the others if combined with Lesson 2, but it is strong
  enough to stand alone if reveal moments become a major UI feature.

### 9. Pawn Vision Is Strange

Core idea: pawns are the least intuitive Fog scouts.

Why it deserves a full lesson: pawn movement, capture diagonals, double moves,
promotion, and en passant all create beginner confusion under hidden
information.

Chapters:

- **Forward move, diagonal sight.** Show that a pawn moves forward but sees
  capture diagonals.
- **Empty diagonal stays hidden.** Show that empty diagonal attack squares remain
  fogged under Bichess's current visibility rule.
- **Double move changes vision.** Move a pawn two squares and observe new
  visible squares.
- **En passant edge case.** Use the simplest legal en passant scenario and show
  what each side can see.
- **Promotion reveal.** Promote a pawn and show the sudden expansion of vision.

Interaction notes:

- En passant may be too much for the first six lessons, but belongs in the
  expanded beginner path because it is a rules edge case users will distrust if
  unexplained.
- Keep diagrams concrete; prose-only explanation will not land.

### 10. Hunt The King

Core idea: winning is often a search problem.

Why it deserves a full lesson: this is the Fog-native replacement for early
checkmate drills. It is also inherently fun.

Chapters:

- **Small search zone.** Enemy king is hidden in a limited region. Find a move
  that reveals part of it.
- **Use the right scout.** Choose between pieces with different vision shapes.
- **Cut off escape squares.** Move to reduce where the king could be.
- **Capture once found.** End with a direct king capture.
- **Fewest moves challenge.** Replay the same hunt with a move-count score.

Interaction notes:

- This can become the most game-like beginner lesson.
- Avoid random placement in the tutorial version. Randomized hunts can come
  later as practice.

### 11. Fog Forks

Core idea: Fog tactics can target information, not only material.

Why it deserves a full lesson: it gives experienced chess players a familiar
pattern with a new twist.

Chapters:

- **Classical fork refresher.** A simple knight fork on visible pieces.
- **Information fork.** A move reveals two important hidden areas.
- **King plus material.** A move attacks material while checking a likely king
  zone.
- **Wrong fork.** A material fork loses because it exposes the player's king.
- **Choose the Fog fork.** Select the move that combines safety, reveal, and
  threat.

Interaction notes:

- This should come after the absolute beginner path.
- It is useful for players who already know chess tactics and need to translate
  them into Fog terms.

### 12. Edge Of Vision

Core idea: the border of known and unknown space is where decisions happen.

Why it deserves a full lesson: it makes the fog visual language actionable. The
player learns to reason about expansion, not just pieces.

Chapters:

- **Find the frontier.** Highlight the current vision boundary.
- **Expand toward danger.** Move a piece to reveal a critical file or diagonal.
- **Expand without overextending.** Reveal more squares while keeping a defender
  near the king.
- **Bad expansion.** A move reveals many irrelevant squares but misses the
  important zone.
- **Good frontier move.** Choose the move that reveals the best boundary.

Interaction notes:

- This lesson can use heat or outline styling, but it should not require belief
  math.
- It pairs well with board-polish work around fog boundaries.

### 13. What Can They See?

Core idea: each side has a different legal information state.

Why it deserves a full lesson: perspective asymmetry is essential to
understanding why opponents make moves that look strange from truth view.

Chapters:

- **White view.** Show what White sees.
- **Black view.** Flip to what Black sees from the same truth position.
- **Same square, different meaning.** A square is safe-looking to one side and
  dangerous to the other.
- **Move with empathy.** Pick a move that denies the opponent useful vision.
- **Replay comparison.** Step through player view and truth view.

Interaction notes:

- This is partly a replay tutorial.
- It should be included before asking users to review finished games.

### 14. Postgame Truth Reveal

Core idea: review is how Fog games become understandable.

Why it deserves a full lesson: Bichess depends on perspective replay as a core
product surface. Teaching it early reduces postgame confusion.

Chapters:

- **Play a tiny line.** Make two or three moves with hidden information.
- **White view replay.** Step through what White knew.
- **Black view replay.** Step through what Black knew.
- **Truth view.** Reveal canonical board state.
- **Find the missed fact.** Ask what information the player missed during play.

Interaction notes:

- This should reuse the actual review/replay component when available.
- It can be the final onboarding step before sending the player to a real game.

### 15. First Real Fog Decision

Core idea: bridge from tutorial to play.

Why it deserves a full lesson: onboarding should end with a real position, not a
toy exercise. The player should leave knowing what a normal first decision feels
like.

Chapters:

- **Position briefing.** Show a plausible midgame `PlayerView`.
- **Candidate moves.** Offer three or four legal moves with no truth reveal.
- **Choose and commit.** Player selects a move.
- **Outcome explanation.** Label the move as safe, informative, risky, or losing.
- **Try a real game.** Hand off to Play or Watch with the concept fresh.

Interaction notes:

- The first version can be authored as one position with fixed feedback.
- Later versions can draw positions from curated finished games.

## Chapter Depth Assessment

Most ideas have enough depth for full lessons. The strongest standalone lessons
are:

- Your Pieces Create Vision
- Unknown Is Not Empty
- No Check, Capture The King
- Scout Before You Grab
- Last Seen Is A Clue
- Opponent Moved, But Where?
- Hide Your King
- Hunt The King
- What Can They See?
- Postgame Truth Reveal

Ideas that could be shorter modules or combined:

- Why Did That Piece Appear? can merge into Your Pieces Create Vision unless
  reveal logs become a near-term UI priority.
- Edge Of Vision can merge into Scout Before You Grab for the first release.
- Fog Forks should wait until after the beginner path because it assumes
  tactical literacy.
- Pawn Vision Is Strange is important, but en passant and promotion can be split
  out if the first tutorial gets too long.

## Implementation Implications

The lesson engine should support:

- authored stages and chapters
- initial canonical truth plus perspective color
- deterministic opponent replies
- expected move sets and accepted alternatives
- safe failure states
- per-chapter overlays: arrows, circles, fog highlights, last-seen markers, and
  candidate squares
- per-chapter feedback copy
- optional truth reveal after a choice
- local progress

It should avoid:

- random puzzle generation in the beginner path
- engine-dependent evaluation for first-release lessons
- default belief overlays before the player has learned last-seen uncertainty
- long prose panels that teach rules without board interaction

## Open Product Questions

- Should the first path be required before a user's first live game, or merely
  recommended?
- Should beginner lesson progress live only in local storage until accounts
  exist?
- Should lesson examples use standard Fog starts, Draft960 starts, or authored
  artificial mini-positions?
- How much truth reveal is healthy before a player has finished a real game?
- Which lesson should become the 60-second public `/learn` experience first?
