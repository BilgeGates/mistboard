# Chess Platform Reference

> Status: reference. This translates common chess-platform patterns into
> Mistboard priorities; it is not a parity checklist.
> Canonical source: [ROADMAP.md](ROADMAP.md) for current commitments.
> Last reviewed: 2026-06-12.

This document translates mature online chess platform patterns into Mistboard
priorities.

It is a public product-reference note, not a private operating plan. Private
timelines, relationship planning, legal analysis, and sensitive gap analysis
belong outside the public repository.

## Reference Posture

Mature chess platforms set useful expectations for speed, clarity, reliability,
accessibility, replay, analysis, learning, and community safety.

Mistboard should learn from common chess product conventions where they help
people play, finish, review, understand, or advance Fog of War. Mistboard should
not pursue general chess-platform parity as a goal.

Fog of War changes the product because hidden information must be enforced by
the server and understood after the game.

Decision rule:

> Translate only the platform patterns that strengthen Fog of War play, review,
> learning, research, or integrity.

## Mature Platform Surfaces

Large chess platforms often expose:

- Play: lobby games, direct challenges, clocks, correspondence, standard chess,
  and variants.
- Competition: arena tournaments, Swiss tournaments, team events, and simuls.
- Watch: broadcasts, current games, streamers, and video libraries.
- Learn: chess basics, practice, coordinates, puzzles, puzzle modes, studies,
  and coaches.
- Analysis and tools: analysis boards, engine analysis, mistakes review, board
  editors, opening explorers, tablebases, PGN import/export, advanced search,
  and shareable studies.
- Community: player profiles, directories, teams, forums, blogs, messaging,
  friends, and challenges.
- Platform: accounts, profile identity, mobile apps, accessibility, themes,
  translations, public databases, APIs, source code, and funding operations.

These surfaces are not automatically Mistboard requirements.

## Learning Rail Translation

Mature chess onboarding usually splits learning into a few repeatable rails:

- rules onboarding: board setup, piece movement, legal moves, castling,
  promotion, en passant, check, and checkmate
- guided practice: short lessons around tactical and strategic motifs
- puzzle loops: repeated tactical exercises with ratings, streaks, themes, or
  speed modes
- progress loops: completed lessons, saved progress, ratings, streaks, badges,
  or other return hooks
- play handoff: move from lesson to real games, then from games to review

The product distinction is useful but not binding. Lightweight learn-by-doing
flows reduce friction. Curriculum-heavy flows make progression and motivation
clear. Mistboard should borrow both instincts without copying a generic chess
course.

For Fog of War, the handoff cannot be "learn the rules, then play normal
chess." The first-run loop should be:

1. first legal Fog move
2. first visibility explanation
3. first reveal
4. first hidden danger
5. first king capture
6. first meaningful Fog decision
7. first game or guided mini-game
8. first review of an information mistake
9. first reason to return for another lesson, puzzle, replay, or game

The transferable rule is:

> Normal chess onboarding teaches tactics on a public board. Fog onboarding
> teaches players to create, deny, and exploit vision.

## Fog Translation

| Platform surface | User job | Mistboard Fog equivalent | Priority posture |
|---|---|---|---|
| Play a game | Start and finish a chess game quickly | Link-based Fog of War rooms with server-enforced player views | Private-alpha core |
| Challenge a friend | Share a game with a known opponent | Friend challenge URL with seat authority and reconnect recovery | Private-alpha core |
| Watch games | Observe interesting games | Finished Fog games, engine games, perspective replay, and truth reveal | Private-alpha core |
| Game room UX | Understand seat, turn, clocks, status, and result | Board-first Fog room with clear player view, hidden squares, clocks, reconnect, and postgame handoff | Private-alpha core |
| Replay | Step through a finished game | White view, Black view, and full-truth replay | Private-alpha core |
| Analysis board | Understand why a game turned | Fog-specific review: visibility, hidden move information, king exposure, scouting value | Later alpha |
| Engine analysis | Evaluate moves | Uncertainty-aware Fog engines and benchmarked bot analysis | Research/engine core |
| Studies | Share annotated analysis | Fog review artifacts, annotations, visibility moments, research examples | Later alpha |
| Puzzles and training | Improve tactical skill | Fog-specific exercises: scouting, king exposure, missed captures, visibility inference | Backlog |
| Opening explorer | Study common positions | Fog corpora and start-position datasets, including future Draft960 starts | Research backlog |
| Player profiles | Understand identity, history, strength, and public activity | Profiles for signed-in players, engine authors, engine versions, annotations, and public contributions | Later alpha |
| Tournaments and matchmaking | Find games at scale | Deferred until the Fog play and review loop is reliable | Defer |
| Ratings | Persistent competitive identity | Future Fog-specific strength signals after reliable play, integrity, and moderation planning | Defer |
| Chat, teams, forums | Community coordination | Not needed for private-alpha Fog validation | Defer |
| API/database | Build ecosystem tools | Public corpora, engine metadata, benchmark results, reproducible experiments | Research/engine core |

## Mistboard Differences

Mistboard has different technical and research responsibilities from a general
chess platform.

### Hidden-Information Correctness

Classical chess can show the same board to everyone. Fog of War cannot.

Mistboard must treat hidden information as a server-enforced security and rules
boundary:

- server owns canonical truth
- players receive only their `PlayerView`
- hidden opponent pieces and hidden move details are not sent before they are visible
- spectators and replay modes are explicitly separated from live player views
- postgame reveal happens only after terminal state or in intentionally public
  engine contexts

### Perspective Replay

Fog games are hard to understand from a normal move list. Mistboard needs review
surfaces that show:

- what White saw
- what Black saw
- what was true
- when visibility changed
- which moves carried information, risk, or missed opportunity

This makes replay and review more central than a generic move viewer.

### Engine Development

Mistboard should actively encourage Fog engine development, not treat engines as
only a consumer feature.

Product surfaces should support:

- engine registry and versioned engine identities
- EvE games and benchmark corpora
- bake-offs between engine versions
- reproducible experiment configs
- review queues for suspicious or interesting engine games
- public benchmark reports when results are ready to share

### Academic And Research Use

Fog of War chess is a hidden-information game with research value. Mistboard
should make that legible and reproducible:

- public corpora and manifests
- visibility and belief-state experiments
- annotation data
- benchmark protocols
- reproducible self-play and evaluation reports
- clear separation between shipped product and offline research sidecars

### Transparency, Isolation, And Fairness

Mistboard needs public trust surfaces that explain how games and engine work are
kept fair and verifiable.

For human games:

- define the Fog of War rules clearly
- explain that the server owns canonical truth
- explain what a client can and cannot receive before terminal state
- document spectator, replay, and postgame reveal policy
- make clock, draw, king-capture, and reconnect behavior inspectable in public rules docs

For engine games and benchmarks:

- identify engine versions, configs, seeds, and time controls
- separate engine execution from the web server
- describe what an engine is allowed to observe during play
- publish enough metadata for benchmark games to be reproduced or audited
- distinguish engine failure, infrastructure failure, and game result
- make review/annotation methods transparent when publishing benchmark claims

For game design:

- document rule choices and why they exist
- distinguish implemented rules from experimental lab surfaces
- keep Draft960 and other experiments clearly framed as Fog
  features rather than confusing primary modes
- publish known limitations when they affect player expectations or research interpretation

The standard is not just "trust the site." The standard is that contributors,
engine authors, researchers, and players can inspect the rules, payload policy,
benchmark methods, and game artifacts well enough to evaluate claims.

## Private-Alpha Completeness

Private-alpha completeness does not mean matching every platform feature. It
means the Fog-specific core play loop is understandable and reliable:

1. Create or open a room link.
2. Join as White or Black.
3. Play with clear clocks, turns, and hidden-square semantics.
4. Recover from ordinary reconnects.
5. Finish the game.
6. Review from each player perspective and full truth.
7. Share the finished game.

Research completeness is separate:

1. Run and identify engine versions.
2. Produce reproducible EvE games.
3. Review and annotate engine games.
4. Publish corpora and benchmark methods.
5. Enable external contributors to build better Fog engines.

## Deferred Platform Surfaces

These are valuable in a mature chess product but should stay deferred until Fog
private-alpha safety, play, review, and research loops are strong:

- public matchmaking
- ratings
- tournaments
- simuls
- chat and messaging
- teams and forums
- broad social profiles
- generic classical analysis surfaces
- monetization or billing
- full mobile/native app scope
- broad internationalization

## Profile Gap

Profiles are useful because they connect identity, history, public activity,
strength signals, games, annotations, and community trust.

Mistboard currently does not need a broad profile surface for anonymous private
alpha. The gap matters once signed-in persistence, engine authorship, public
games, annotations, and research artifacts become more important.

Future profile work should split identity types:

- human player profile: games, public replays, annotations, and eventual strength signals
- engine author profile: submitted engines, versions, benchmark history, and reports
- engine profile: versioned identity, config, play signature, results, and known limitations
- contributor/research profile: corpora, annotations, experiments, and public reports

Ratings and broad social features remain deferred, but profile identity is still
a product primitive to revisit after guest/signed-in persistence and private
alpha safety are stable.

## Build-Vs-Borrow Rule

Before building generic chess-platform behavior from scratch, ask whether the
pattern is a common convention, license-compatible, and useful for Fog of War.

Borrow:

- board interaction conventions and libraries where license-compatible
- game-room UX expectations
- replay control expectations
- share/challenge/reconnect patterns
- accessibility and mobile lessons

Build custom:

- hidden-information payload policy
- Fog visibility and replay semantics
- Fog engine evaluation
- belief/visibility research surfaces
- public corpora and reproducible experiment tooling
