# Dark Shogi Ruleset Candidate

> Status: candidate future ruleset. Not implemented and not a public Mistboard
> game mode.
> Canonical source: [`../ROADMAP.md`](../ROADMAP.md) for committed variant
> sequencing.
> Last reviewed: 2026-06-12.

Summary: candidate ruleset for research and future runtime planning. A hidden
`dark-shogi` `GameSpec` placeholder exists, but the rules are not implemented,
not a public Mistboard game mode, and not a compatibility claim with any
existing hidden-shogi platform.

Dark Shogi applies Mistboard's hidden-information model to shogi while keeping
the product rule: the server owns canonical truth, clients receive only
recipient-scoped views, and hidden opponent state must not leak through legal
move lists, event history, or replay.

For a visual sketch of the candidate rules, open
[`prototypes/dark-shogi-prototype.html`](./prototypes/dark-shogi-prototype.html)
directly in a browser. The prototype is scripted and intentionally separate
from production runtime code.

For manual exploration, open
[`prototypes/dark-shogi-freeplay.html`](./prototypes/dark-shogi-freeplay.html).
That prototype supports local move/drop experiments and perspective event
redaction without touching production runtime code.

## Relationship To Existing Hidden Shogi

This candidate is closest to fog-style shogi: each player has vision generated
by their own pieces. It is not tsuitate shogi, where players mostly see only
their own material and receive limited referee feedback.

The important distinction from normal shogi and many hidden-shogi variants is
the objective:

- Normal shogi is checkmate-based.
- Dark Shogi is king-capture-based.

Check, checkmate, and pawn-drop-mate adjudication are deliberately removed
because they can reveal hidden attack information. A player may move into check,
leave their king attacked, or drop a piece that attacks the enemy king. The game
ends only when a king is actually captured.

## Board, Pieces, And Movement

- The board is the standard 9x9 shogi board.
- Initial placement and piece movement follow standard shogi.
- Promotions follow standard shogi eligibility unless this document says
  otherwise.
- Captured pieces enter the capturer's hand in their unpromoted form.
- The server stores the canonical full board, hands, side to move, promotion
  states, and event log.

## Visibility

A player can see:

- Their own board pieces, including promotion state.
- Squares attacked or movable by their own board pieces under the true board.
- Opponent pieces that occupy visible squares.
- Their own hand exactly.

A player cannot see:

- Opponent pieces outside visible squares.
- Empty or occupied status of hidden squares.
- Opponent hand contents during live play.
- Hidden opponent moves, drops, captures, or promotions.
- Whether an unseen opponent reserve piece has been spent.

Sliding pieces reveal along their true legal ray until the first blocker. If the
first blocker is an opponent piece, that opponent piece is visible. Squares
beyond the blocker are not visible through that line.

## Hands And Captures

Each player sees their own hand exactly.

The opponent's hand is hidden during live play. The live UI should not summarize
known or inferred opponent reserve contents as a hand counter, because a hidden
drop would force that counter either to lie or to reveal that reserve spending
happened in the fog.

If the opponent drops a piece onto a square you can see, the appeared piece is
visible as board state. If the opponent drops a piece in the fog, the live
payload must not reveal the drop, the spent piece type, or any opponent-hand
delta. A full-truth postgame view may reveal both hands after the game ends.

## Drops

Dark Shogi uses a Lao Tzu-style drop policy: pieces may be dropped only on
visible empty squares.

Drop rules:

- A player may drop only a piece from their own hand.
- A drop square must be visible to the dropping player.
- A drop square must be empty in the canonical position.
- Drops cannot capture.
- Standard no-future-move restrictions apply: pawns and lances cannot be dropped
  on the final rank; knights cannot be dropped on the final two ranks.
- The standard duplicate-unpromoted-pawn-on-a-file restriction applies.
- The normal pawn-drop-mate ban does not apply, because Dark Shogi has no
  checkmate rule.

A pawn drop that attacks the king is legal. It is not an immediate win. The
opponent may respond, ignore it, or fail to notice; the game ends only if the
king is later captured.

Blind drop attempts into hidden squares are out of scope for the candidate
ruleset. If a future experiment allows them, failed attempts must return only a
generic failure and must not identify whether the target square was occupied.

## Promotion

Promotion is part of a piece's hidden or visible identity.

- A piece may promote under normal shogi promotion-zone eligibility.
- Mandatory promotion still applies when a piece would otherwise have no future
  legal move.
- Your own promoted pieces are always visible to you.
- An opponent's promoted piece is visible only when that piece is on a visible
  square.
- Hidden opponent move events do not announce whether promotion occurred.
- If a promoted piece is captured, it enters the capturer's hand unpromoted.

The first implementation should prefer explicit action input for optional
promotion, for example `promote: true | false`, rather than inferring from UI
state.

## Events And Redaction

Event history is still the replay and reconnect source of truth, but outbound
event views are recipient-scoped.

- The acting player may receive their full move or drop event.
- The opponent receives a fresh player view after the action.
- Hidden opponent action coordinates are not sent to the opponent.
- Hidden opponent drops are not sent as "drop" events to the opponent.
- Hidden opponent promotions are not announced to the opponent.
- Visible resulting board facts may appear in the opponent's player view.
- If an opponent move starts in fog and results in a visible board change, the
  live view should update the board only. Do not add a move-arrival event line
  that implies a hidden origin, path, or action timing beyond the fresh view.

For example, if an opponent drops a silver in the fog, the recipient should not
learn that a silver was spent. If the recipient later sees that square, the
silver appears as board state.

## Terminal State And Replay

The live game ends when a king is captured.

Candidate postgame behavior:

- The terminal event records the captured king and winner in canonical history.
- Player-perspective replay preserves fog for earlier plies.
- A full-truth postgame view may reveal the final board and both hands after the
  game is over.
- Public replay/export must be added only after tests prove that live seated
  payloads and historical player views remain redacted correctly.

## Draws

Initial candidate draw rules:

- Fourfold repetition over canonical board placement, promotion states, hands,
  and side to move is a draw.
- Perpetual-check rules do not apply because check is not a rules concept.
- Impasse and entering-king declaration rules are deferred.
- A maximum-ply or progress-clock draw can be added later if playtesting shows
  that games stall.

## Implementation Boundaries

Do not implement Dark Shogi by extending chess `VariantId` or by reusing chess
`PlayerView` directly. It should be a separate `GameSpec` and runtime family
when implementation starts.

Minimum future runtime concepts:

- shogi board geometry,
- shogi piece roles and promoted roles,
- canonical hands,
- recipient-scoped hand views,
- move actions,
- drop actions,
- promotion choice,
- king-capture terminal events,
- replay-derived state.

## Regression Targets

Any implementation must assert:

- legal drop lists do not reveal hidden empty squares,
- opponent hand state is not transmitted live,
- hidden opponent drops do not decrement public counters,
- hidden opponent promotions are not announced,
- pawn drops that attack the king are legal,
- check, checkmate, and pawn-drop-mate are not used for legality or termination,
- visible-square drops still enforce canonical occupancy,
- captured promoted pieces enter hand unpromoted,
- recipient event history hides opponent action coordinates,
- replay can reconstruct canonical state without sending canonical truth to the
  wrong client.

## References

- [Kiri Shogi](https://kirishogi.com/)
- [Shogi Quest](https://play.google.com/store/apps/details?id=fm.wars.shogiquest)
- [GNU Shogi rules summary](https://www.gnu.org/software/gnushogi/manual/The-rules-of-shogi.html)
