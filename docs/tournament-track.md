# Tournament Track

This document defines a staged path from engine events to human PvP
tournaments. It is a product and architecture planning note, not a commitment to
build PvP tournaments during v1.

Bichess should not copy mature chess-platform tournament scope all at once.
Tournaments touch identity, persistence, pairings, standings, spectator policy,
forfeits, moderation, abuse controls, and public event expectations. The safe
path is to prove the tournament substrate with engines first, then graduate it
to constrained human events only after private-alpha live play is reliable.

## Product Goal

Build tournament-shaped infrastructure that supports Fog of War without
weakening hidden-information safety.

The track should answer:

- Which participants entered?
- Which format and pairing policy was used?
- Which games were created?
- Which results count, and which games were aborted?
- Can every result link to a replay?
- What could live spectators see?
- Is the event reproducible or auditable?

## Reference Posture

Lichess/lila is a useful reference, not a parity target.

Useful lila areas:

- `modules/tournament`: Arena-style events, waiting users, live pairings,
  leaderboards, featured games, schedules, and tournament context.
- `modules/swiss`: fixed-round events, rounds, pairings, byes, standings,
  tiebreaks, CSV/TRF export, and manual pairing support.
- `ui/tournament` and `ui/swiss`: event page shape, standings, pairings,
  podium/header, and finished-event views.
- `ui/round`: how tournament context appears inside a live game.

Bichess should borrow concepts selectively:

- event status: created, started, finished
- participant rows
- pairing rows that link to canonical games
- standings derived from pairings and results
- round metadata for Swiss/round-robin formats
- color history and repeat-pairing avoidance where relevant

Bichess should defer mature platform surfaces:

- public tournament lobby
- open registration at scale
- ratings and rating restrictions
- chat
- moderation tooling
- prizes
- public matchmaking pools
- team battles
- broad social/profile dependencies

## Core Data Model

Use a format-neutral event backbone so engine events and PvP tournaments share
the same concepts.

Candidate tables:

```text
tournaments
tournament_participants
tournament_rounds
tournament_pairings
tournament_standings
```

### `tournaments`

Represents the event shell.

Fields should cover:

- id
- name
- status: created, started, finished, aborted
- kind: engine-event, private-pvp, public-pvp
- format: match, round-robin, swiss, arena
- variant/ruleset: Fog of War
- starting-position policy
- time control
- visibility: private, link, public
- created_by / owner metadata when accounts exist
- starts_at, started_at, finished_at
- config JSON for format-specific policy

### `tournament_participants`

Represents who or what can be paired.

Participant subject types:

- `engine-version`
- `guest`
- `user`
- `manual`

Rules:

- engine events should use exact `engine_versions` identities;
- guest/user PvP participants must not inherit live-game authority from event
  membership alone;
- display labels are attribution, not authority;
- seat authority for each PvP game still comes from room-scoped seat tokens.

### `tournament_pairings`

Represents a scheduled or completed game.

Fields should cover:

- tournament id
- round number or arena sequence
- white participant
- black participant
- game id / room id
- status: pending, running, completed, aborted, forfeit
- result: white-wins, black-wins, draw, non-scoring
- termination
- scoring flags
- seed/opening policy reference for engine games

Rules:

- canonical game truth remains in `games` and `events`;
- tournament pairings link to game ids rather than duplicating game state;
- infrastructure aborts are distinct from scoring game results;
- forfeits are tournament-level outcomes unless a real game produced the result.

### `tournament_standings`

Standings can be stored as a projection or computed from pairings.

Initial fields:

- points
- wins/losses/draws
- forfeits
- aborted/non-scoring count
- tiebreak fields when format requires them

For early versions, recomputing standings from pairings is preferable to making
standings the source of truth.

## Phase 1: Engine Events

Purpose: prove tournament infrastructure without human account, moderation, or
live PvP risks.

Scope:

- fixed engine-version roster
- EvE games only
- owner/admin-created events
- fixed time control
- fixed seed/opening policy
- round-robin or mirrored match format
- standings page
- replay links for every completed game
- public-safe engine/version metadata

Formats:

- baseline-vs-candidate mirror match
- small round robin
- regression cup against pinned opponents and seeds

Verification:

- every participant is an exact engine version;
- every pairing creates or links a canonical EvE game;
- completed pairings link to replay;
- aborted worker/infrastructure games are non-scoring;
- engine timeout, illegal move, or protocol failure is recorded distinctly from
  infrastructure failure;
- standings recompute from persisted pairings and games.

## Phase 2: Engine Swiss And Benchmark Events

Purpose: add fixed-round tournament mechanics and public benchmark credibility.

Scope:

- rounds
- byes
- round start/end state
- tiebreaks
- event report pages
- reproducibility metadata
- optional CSV or machine-readable export

Useful lila reference:

- Swiss pairings and scoring concepts from `modules/swiss`;
- standings recomputation from pairing sheets;
- byes and tiebreak handling.

Verification:

- round pairings are deterministic from event state and pairing policy where
  possible;
- byes score consistently;
- benchmark reports include engine versions, seeds, time controls, opening
  policy, game counts, failure counts, scoring, and known limitations.

## Phase 3: Private PvP Events

Purpose: let invited humans play tournament-shaped Fog of War without opening a
public competitive platform.

Scope:

- organizer-created private event
- fixed participant list
- link-scoped event page
- round robin or Swiss before Arena
- no ratings
- no public tournament lobby
- no chat
- no public matchmaking
- pairings create normal Fog rooms
- standings update from completed games

Fog-specific live policy:

- tournament membership does not grant truth access;
- live PvP games remain private to seated players before terminal state;
- event pages may show safe status such as pending/running/completed;
- full replay links become available only after terminal state according to the
  normal replay policy;
- admin-debug truth remains a separate capability.

Verification:

- a paired player receives room/seat authority only for that game;
- non-paired participants cannot observe live hidden truth;
- completed games attach to standings and review links;
- reconnect and duplicate-tab behavior remain the same as normal PvP rooms;
- forfeits and no-shows do not require fake game events.

## Phase 4: Account-Backed PvP Tournaments

Purpose: add persistent human identity only where it improves event management.

Scope:

- signed-in registration
- withdrawals
- no-show/forfeit handling
- participant history
- public/private event visibility
- organizer controls
- publishable finished-event pages

Still deferred:

- ratings
- prizes
- team battles
- chat
- public open tournament lobby
- broad moderation workflows

Requirements before pickup:

- seat-token authority is already stable;
- signed-in identity does not grant live room access by itself;
- private-alpha QA gates pass;
- publication state for games/events is explicit.

## Phase 5: Arena-Style Events

Purpose: support Lichess-style repeated live pairings only after the platform
can handle broader public activity.

Arena adds:

- join/withdraw during the event
- waiting pool
- repeated live pairings
- anti-repeat pairing logic
- color-history balancing
- late-entry rules
- streak/scoring policy, if desired
- stronger abuse and operations expectations

Useful lila reference:

- `modules/tournament/arena`
- waiting users
- live pairing generation
- color history
- leaderboard updates

Do not start here. Arena is the most platform-like tournament format and should
follow engine events, private PvP events, and account-backed event management.

## Stage Guidance

Stage 1: Private Alpha

- no public PvP tournaments
- engine events may exist as owner/admin tools for EvE and Engine Lab
- tournament docs should not distract from live Fog safety

Stage 2: Public Alpha

- public or link-scoped engine events can support benchmark transparency
- private PvP events may be tested with invited players if live play is stable
- event pages must preserve live hidden-information policy

Stage 3: Research / Engine Alpha

- engine tournaments become publishable benchmark events
- engine versions, configs, seeds, time controls, and observation policies must
  be inspectable
- tournament reports should link to corpora and representative games

Stage 4: Early Platform

- account-backed PvP tournaments become plausible
- human profiles may show public event results
- Arena-style public events remain conditional on moderation, reliability, and
  fairness obligations

## First Recommended Implementation Slice

Build **engine round-robin events** first.

Work:

- add tournament/event schema for engine-version participants;
- add a round-robin materializer that creates EvE tasks;
- link completed EvE games back to pairings;
- compute standings from pairings and game summaries;
- expose a read-only event page or API with roster, pairings, standings, and
  replay links.

Non-goals:

- PvP registration
- public tournament lobby
- ratings
- chat
- team battles
- Arena pairings
- account/session work

This slice proves the shared tournament backbone while serving the existing
engine and research roadmap.

## Open Questions

- Should the table and API name be `tournaments`, `events`, or
  `competitions`?
- Should engine benchmark events be public by default or link-scoped until
  methodology stabilizes?
- Which tiebreaks matter for engine Swiss events?
- Should private PvP events support guests, signed-in users, or both?
- What safe live status can an event page show for an unfinished PvP game?
- When should forfeits be first-class tournament outcomes?
