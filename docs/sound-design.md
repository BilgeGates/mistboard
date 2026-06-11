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

## Terminal sequencing (decided 2026-06-11, `terminalSoundPlan`)

A king/general capture is its own fanfare for the winner — the submit-time
arpeggio already played, so the `win` jingle is suppressed. The loser gets a
`king-fall` sting (descending arpeggio; Explosion pitched down in file
sets), then `lose` after a beat — capture-death feels different from
flag-fall. Draws play `draw` in every family. Capturing a shrouded `?` that
turns out to be the king plays plain `capture`, then the win fanfare lands a
beat later as the reveal — deliberate, keep it.

`low-time` fires once per game when the seated player's clock first dips
under max(10s, 10% of initial) capped at 30s (`maybePlayLowTimeSound`,
called from each family's clock tick). `game-start` fires for the seated
creator when the room flips from waiting (no clock) to playing —
chess room only for now: the DMX/crossroads views carry no clock, so the
transition is invisible to their observers until the verticalization
refactor unifies room state.

**Cannon boom (shipped):** your own cannon captures play `cannon-capture`
(synth boom in every set by design — no file mapping). Leak-safe: it only
ever describes your own piece. The opponent side stays the sanitized
`captured`.

## Open design questions (settle by audition, not on paper)

- **Hidden vs visible opponent move.** Should a fully hidden move (no view
  change at all — the most common move in a dark game) sound different from
  a visible one, e.g. a muffled "something moved in the mist"? All
  visibility classes derive from the view delta, so it leaks nothing.
  Prototype in the lab before shipping: hidden moves are the most common
  kind, so any distracting variant is fatigue.

## Family specials (remaining candidates)

- **Flying general** resolves as a general capture under no-check FoW
  rules — already the `king-capture` class, nothing separate needed.
- **Crossroads is the exception to "no check sounds":** it is
  perfect-information, so check/checkmate exist there (Check.mp3 ships in
  all four adopted sets). Its race win (king reaches the far rank)
  currently shares the `win` sound with checkmate; a distinct flavor is
  possible.
- **Shogi4** would need drop + evolve sounds if it ever gets live play.

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
