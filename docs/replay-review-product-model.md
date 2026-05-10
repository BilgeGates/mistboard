# Replay And Review Product Model

Replay is a core Mistboard product surface. In Fog of War, a normal move list is
not enough: players need to understand what each side could see, what was hidden,
and what became clear only after the game ended.

This document defines replay/review product semantics. Implementation tasks live
in the private-alpha priority docs and feature-specific roadmaps.

## Product Goal

Help players, engine authors, and researchers answer:

- What did White see?
- What did Black see?
- What was actually true?
- When did a player learn or miss critical information?
- Why did a move make sense under that player's uncertainty?

## Canonical Perspectives

### White View

White view shows the game as White was allowed to see it at each ply.

Rules:

- board state is derived from White's `PlayerView`
- hidden Black pieces are not shown until visible
- move information should not reveal hidden opponent truth before rules allow it
- legal destinations, when shown, are White-scoped

### Black View

Black view mirrors White view from Black's allowed information.

Rules:

- board state is derived from Black's `PlayerView`
- hidden White pieces are not shown until visible
- move information should not reveal hidden opponent truth before rules allow it
- legal destinations, when shown, are Black-scoped

### Truth View

Truth view shows canonical board state.

Rules:

- truth is always available for finished games
- truth may be available for intentionally public EvE contexts
- truth must not be exposed for unfinished private PvP games
- truth is the debugging and research reference, not the live player view

## Live Room Vs Review Page

### Live Room

Primary job: let the current player play the game safely.

Live room owns:

- current seat view
- legal move input
- clocks and turn status
- reconnect/session state
- terminal result display
- handoff to review after finish

Live room should not become a broad analysis surface. Before terminal state, it
must preserve hidden-information boundaries.

### Review Page

Primary job: let someone inspect a finished or intentionally public game.

Review page owns:

- replay controls
- perspective switching
- full-truth reveal
- stable share URL
- move/timeline display
- future annotations and visibility-history affordances

The review page can be richer than the live room because terminal games may
expose full truth.

## Move List Semantics

Fog move lists are not the same as classical chess move lists.

Principles:

- During live private play, move lists must not reveal hidden opponent moves.
- In White/Black review perspective, move display should match what that side
  could infer at that ply.
- In truth perspective, move display may show the canonical move sequence.
- If the UI cannot express a move without leaking perspective-inconsistent
  information, prefer a neutral or hidden-move placeholder.

Examples:

- "White moved" can be safe when exact origin/destination was hidden.
- Exact UCI/coordinate moves are appropriate in truth view and postgame full
  event replay.
- Player-perspective notation may need Fog-specific labels instead of normal
  algebraic notation.

## Minimum Private-Alpha Review Experience

Private alpha requires:

- stable review URL for a finished game
- controls for first, previous, next, latest
- White view, Black view, and truth view are available or clearly represented
- terminal result and termination reason are visible
- live room clearly points to review after finish
- replay loading fails gracefully when a game is not public or not found

Not required for private alpha:

- engine analysis
- mistake review
- visibility timeline
- annotations
- studies
- puzzles
- public collections

## Later Review And Analysis Layers

After private-alpha play and review are stable, Mistboard can add Fog-specific
understanding tools.

Candidate layers:

- visibility timeline
- visibility-difference view
- missed king-capture chances
- king exposure markers
- high-information scouting moves
- uncertainty/risk labels
- annotations
- review queues
- engine disagreement markers
- shareable clips or moments

These layers should build on replay semantics rather than replacing them.

## Data Contracts

Replay depends on:

- append-only `GameEvent` history
- deterministic `replayGameEvents`
- `PlayerView` projection for each color
- full canonical truth after terminal state
- persisted game summary metadata

Data-contract rules:

- event history is canonical for replay reconstruction
- live private event access is restricted before terminal state
- finished games may expose full event history
- review URLs should address stable game ids
- replay should tolerate older event shapes when possible

## Engine And Research Review

Engine games add extra review needs:

- show engine family/version labels
- show allowed observation policy when relevant
- link games to benchmark jobs or corpora
- support annotations and review status
- distinguish engine failure, infrastructure failure, and normal game result

For EvE games, truth may be public by design. The UI should label that clearly so
users do not confuse EvE truth visibility with live PvP policy.

## Product Boundaries

Replay/review should not weaken hidden-information safety.

Guardrails:

- do not send live private truth to make replay UI easier
- do not show hidden move details in a live player view
- do not conflate spectator, player, debug, EvE, and finished-game modes
- do not add engine-analysis claims before benchmark methodology is clear
- do not let review controls mutate the live game

## Open Questions

- Should White/Black review panes collapse to truth at terminal ply, or preserve
  each side's final fogged view with truth as a separate mode?
- What is the right Fog-specific notation for hidden or partially observed moves?
- Should review default to the player's own perspective, full truth, or the last
  live perspective after game end?
- How should annotations attach to perspective: White view, Black view, truth,
  or all?
- Which visibility-history features are needed before public alpha?
