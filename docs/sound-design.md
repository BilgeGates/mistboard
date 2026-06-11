# Sound design

Why Mistboard's game sounds are built the way they are, and what each sound
is allowed to tell the player. Written 2026-06-10 alongside the sound-set
work; the implementation lives in `apps/web/src/live-sound.ts` (policy +
synth tones) and `apps/web/src/sound-sets.ts` (file-set registry).

## The constraint that shapes everything

Under fog, a sound is an information channel, not decoration. On a
perfect-information site (lichess), the move sound describes something the
player already watched happen. On Mistboard the opponent's move is often
invisible, so the sound may be the player's only notification — and it must
not carry more information than the player's `PlayerView` legitimately
contains. Sound classification therefore derives from **view deltas, never
canonical events**, the same trust boundary the renderer obeys. See
`playSanitizedOpponentSound`: when the opponent moves out of vision, the
only question asked is "did my own piece count drop?" — `captured` if yes,
generic `move` if no.

Revealed contexts (EvE watch, finished games, replay) switch to
event-derived sounds, because there is nothing left to hide.

## Vocabulary

| Kind | Trigger | Notes |
|---|---|---|
| `move` | own move, visible opponent move, or hidden opponent move | the workhorse |
| `capture` | you capture | confirmation |
| `captured` | your piece is taken | the alarm bell of dark chess: often a surprise about a square you weren't watching; deliberately distinct from `capture` |
| `castle` | castling (own, or revealed) | |
| `king-capture` | a king falls | the signature dark-chess moment; there is no check or checkmate vocabulary here |
| `win` / `lose` / `draw` | terminal, from your seat | spectators stay silent |
| `low-time` | clock warning | wired post-audition |
| `game-start` | opponent takes the seat / game begins | wired post-audition |

Deliberately absent: check/checkmate (no such rule under fog), error/illegal
(the UI blocks illegal moves), chat/social (no such features), per-move
correspondence notifications (correspondence will use throttled email, never
sounds — decided 2026-06-10).

## Policies

- **Spectators are silent.** Watch pages, EvE, the homepage hero: every
  policy path checks the seat. Sounds belong to participants.
- **Capture is asymmetric.** `capture` and `captured` are different events
  with different emotional weight. File sets that only ship one capture
  sound serve `captured` pitched down (see `sound-sets.ts`).
- **One kit site-wide.** Surveyed precedent: pychess serves chess, xiangqi,
  shogi, janggi from one theme-based kit; only single-family sites
  (lishogi) match sounds culturally. A per-family mapping (wooden clack for
  the xiangqi family) is cheap to add behind `soundFileFor` if wanted later.
- **Hybrid sources.** The default "Mist" set is synthesized in WebAudio
  (zero assets, owns the fog-native identity, especially `king-capture`).
  File sets cover the universal vocabulary; any kind a set does not map
  falls back to the synth tones, never to silence.

## Open design question

Should a fully hidden opponent move (no view change at all — the most
common move in a dark game) sound different from a visible one, e.g. a
muffled "something moved in the mist"? All visibility classes are computable
from the view delta, so it leaks nothing. Parked for audition rather than
decided on paper.

## Auditioning

`/sound-lab` (dev-only route): a sound board (every kind, one click) and a
playthrough mode that replays bundled sample games through the real
fog-sanitized pipeline from a chosen seat, with a live set switcher. The
default sample was picked by density scan (29 captures, 2 castles,
king-capture finish).

## Assets

`apps/web/public/sound/<set>/` — subsets of lichess's AGPL sound sets
(futuristic, nes, piano, sfx; Enigmahack, AGPLv3+). The lichess *default*
set is non-free and must not be adopted. Credits in
`apps/web/public/sound/CREDITS.md`.
