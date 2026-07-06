# Dobutsu Chess Theme Note

_Last updated: 2026-07-05_

This records where the Dobutsu chess theme experiment landed. It is a visual
direction note, not a committed product surface.

## Current Preview

Dev-only route:

```text
/dobutsu-chess-preview
```

The preview renders a normal chessboard using chessground, but swaps chess piece
graphics for existing Dobutsu-style animal PNGs from the xiangqi set.

Current visual settings:

- raw transparent animal art, no surrounding xiangqi disc
- no drop shadow
- piece image size set to `112%` of each cell, centered
- explicit rectangular 8x8 checkerboard background

Current temporary role mapping:

| Chess role | Existing Dobutsu asset |
|---|---|
| King | Xiangqi general |
| Queen | Fortress treasure |
| Rook | Xiangqi chariot |
| Bishop | Xiangqi elephant |
| Knight | Xiangqi horse |
| Pawn | Xiangqi soldier |

## What Worked

The no-disc treatment is a useful style proof. The animals can sit directly on a
chessboard without needing the cream xiangqi piece base, and the larger
shadowless treatment feels closer to a native board skin than a piece-token
overlay.

The strongest reuse candidates are:

- knight from horse
- rook from chariot
- pawn from soldier, if the repeated pawn row remains readable
- king from general, if the leader reads clearly enough

## What Did Not Work

The xiangqi remap should not be treated as a production chess set. It reuses
graphics whose original movement meanings do not always match chess:

- bishop mapped to elephant is misleading. The chess bishop is a long diagonal
  slider, while the xiangqi elephant is a short diagonal piece with blocking and
  river constraints.
- queen mapped to treasure is semantically wrong. The queen is the most active
  mobile piece, while the treasure reads as a passive objective or prize.
- king mapped to general is close in hierarchy, but the chess king needs to read
  as central and vulnerable, not merely senior.
- pawn mapped to soldier is acceptable but generic. It may need simpler,
  purpose-built art for dense rows.

## Direction If Resumed

Treat the current page as a style proof, then make a chess-native sibling set
rather than shipping a xiangqi remap.

The new set should keep the Dobutsu visual language:

- rounded animal heads
- thick dark outline
- simple face geometry
- transparent PNGs
- side color carried by the animal fill
- no disc by default

But the roles should be chess-native:

| Chess role | Visual brief |
|---|---|
| King | calm leader, central, protected, with a small crown or crest cue |
| Queen | most ornate and mobile, active power rather than treasure |
| Rook | sturdy, blocky, fortress or charge silhouette |
| Bishop | diagonal, wise, light, clearly not the xiangqi elephant |
| Knight | horse can stay, tuned for chess knight identity |
| Pawn | smallest and simplest repeated troop |

Recommended next experiment:

1. Keep the current preview route as the comparison baseline.
2. Regenerate only the weak semantic slots first: queen, bishop, possibly pawn.
3. Compare baseline vs regenerated art on opening density, midgame cluster, and
   small/fog stress boards.
4. Only promote into a selectable chess piece set if the regenerated roles are
   readable without labels.
