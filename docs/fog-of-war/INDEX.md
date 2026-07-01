# Fog Of War Document Index

Public rules reference for Mistboard's Fog of War chess. These files are the
contract to treat as authoritative when changing move generation, visibility,
replay, payloads, or engine harnesses.

| File | Use it for |
|---|---|
| [`rulesets.md`](rulesets.md) | The Mistboard Fog of War ruleset contract. |
| [`rules-edge-cases.md`](rules-edge-cases.md) | Regression target list: hidden occupancy inference, pawn diagonals, en passant visibility, castling under fog, no-check king semantics, and terminal reveal boundaries. |
| [`dark-mini-xiangqi-rules.md`](dark-mini-xiangqi-rules.md) | Rules source for Dark Mini Xiangqi: 7x7 board, no-check general-capture play, and cannon/horse fog visibility. |

The player-facing rules for every live variant are published at
[mistboard.com/rules](https://mistboard.com/rules). Design references,
implementation records, engine research, and article drafts are kept in private
notes rather than the public repository.
