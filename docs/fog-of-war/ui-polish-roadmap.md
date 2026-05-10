# UI Polish Roadmap

The goal of this track is that a curious chess player — including a top GM — opens a Fog of War game, understands what they are looking at within ten seconds, and *wants to make a move*. First impressions matter unusually much because FOW is a new genre; there is no muscle memory to fall back on.

This roadmap is parallel to engine and platform work but pulls forward when those tracks add features that need a visual surface. It is a quality bar, not a sequence of unrelated polish chores.

## Strategic Frame

Three things have to be true for the UI to do its job:

1. **The fog feels real.** Hidden squares should not feel like a missing texture or a bug. They should feel like *a chosen UI affordance* — atmospheric, intentional, communicative.
2. **Reveals are visceral.** When a piece appears (an enemy enters visibility), the player should feel it. The reveal is the core dramatic event of FOW; it cannot be a quiet sprite swap.
3. **Belief, when shown, clarifies.** Showing inferred candidate locations or recently-revealed memory should reduce confusion, not add it. The default UI must be playable without belief overlays; belief is opt-in clarity.

These three are the quality bar. Every UI phase below feeds into one of them.

## Phases

### U1 — Fog Feel

Build:

- Hidden-square rendering that is unmistakably *fogged*, not blank. Atmospheric, slightly animated (subtle drift), legible at a glance.
- Visible/hidden boundary clarity. The player should always know the edge of their vision without thinking about it.
- Color-blind-safe variants. Don't ship a UI that fails for ~8% of players.

Observe:

- Ten-second test: a chess player who has never seen FOW understands which squares are theirs to see and which are not, without instruction.
- Does the fog feel like a UI affordance or a bug?

Gate to U2: a non-FOW chess player gets oriented in under ten seconds, in a recorded test session.

### U2 — Reveal Moments

Build:

- Animated entry of revealed pieces (slide-in, fade, with timing that respects clock pressure).
- Audio cue for reveals, opt-out toggle.
- Reveal log (small, persistent panel: "your pawn on e4 saw a black rook on d6").
- Hidden-move animations on the opponent side (something happened, you can't see what).

Observe:

- Does the player notice reveals during fast play, or do they miss critical info?
- Is the audio cue useful or annoying? Default-off vs default-on.

Gate to U3: in a watched playtest session, the player visibly reacts to reveals during play.

### U3 — Belief & Memory Overlays

Build:

- Optional overlay: last-seen positions of opponent pieces, with a fade indicating staleness.
- Optional overlay: candidate squares an enemy could be on, computed from move legality and recent visibility loss.
- Toggle UI that does not clutter the default board.

Observe:

- Whether overlays improve play quality (measured on win rate against a fixed engine baseline) or degrade it (cognitive load).
- Which overlays players actually keep on.

Gate to U4: belief overlays are usable enough that an intermediate player wins more games with them on than off.

### U4 — Onboarding

Build:

- A 60-second interactive tutorial that lands a brand-new player into a real game state where they have to make one fog-aware decision.
- Inline explanation of FOW-specific rules (king capture vs check, vision rules, en passant).
- "First game" state with light hand-holding and graceful drop-out.
- Beginner lesson path based on `docs/fog-of-war/beginner-tutorial-curriculum.md`.

Observe:

- Drop-off rate at each tutorial step.
- First-game completion rate (player makes 10+ moves in their first real game).

Gate to U5: brand-new player completes a full FOW game on first session at >50% rate.

### U5 — Viewer and Exploration

The viewer is the primary content artifact and the primary returning-user surface. It is *not* just replay polish — Mistboard builds its own analysis and exploration UI rather than leaning on external tools. When a public article, forum post, or video links to Mistboard, it should land on a replay/viewer surface that makes the game legible without private context.

Build:

- Per-perspective replay (white view, black view, omniscient view, side-by-side).
- Move-by-move belief reconstruction with the player's actual information state at each ply.
- Shareable replay URLs that load instantly.
- Embed-friendly viewer widget for blog posts and forum threads.
- **Position editor** — set up an arbitrary FOW position from FEN-like notation; choose perspective; explore.
- **Move tree exploration** — try alternative moves from any ply; see how the engine evaluates each branch.
- **Belief overlays in exploration mode** — visualize the candidate distribution over hidden squares; toggle layers (last-seen / move-legality-implied / engine-belief).
- **Engine analysis on demand** — drop a Fog engine onto any position in the viewer; see its eval, recommended move, and belief reasoning.

Observe:

- How often viewer URLs get shared per game played, and how often non-author traffic enters via shared URLs.
- Embed traffic from external sites, articles, forum posts, and videos.
- Time spent in exploration mode vs replay mode — exploration time correlates with the audience that sticks around.

Gate: (a) a clip-quality replay is shareable in under three clicks from the postgame screen; (b) an arbitrary FOW position is reachable from a sharable URL and explorable with engine analysis in the viewer.

Strategic note: the viewer is where external content lands its click-throughs. If the viewer feels thin, the public knowledge loop leaks. If it feels deep, every public artifact compounds.

## Anti-Patterns

- **Polishing the default chess board.** This is a FOW-first product. Effort spent making the perfect-info board prettier than mature general chess boards is wasted.
- **Belief overlays that confuse more than they clarify.** Default to *no* overlays. Add them as opt-in. If a default overlay fails the ten-second test, kill it.
- **Animation budget bloat.** Reveals should be visceral but fast. A reveal that takes 800ms is a reveal that gets in the way during a 3+0 game.
- **Skinning over substance.** Color tweaks and font choices are not what makes the UI feel right. Fog feel, reveals, and belief clarity are.
