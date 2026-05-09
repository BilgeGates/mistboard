# Product Reference: Lichess And Bichess

This document maps Lichess as the mature open-source chess-platform reference
and clarifies what "parity for Fog of War" means for Bichess.

It is a public product-reference note, not a private operating plan. Private
timelines, relationship planning, and sensitive gap analysis belong outside the
public repository.

## Reference Posture

Lichess is the mature baseline for online chess product quality: fast play,
clear game rooms, deep replay and analysis, learning surfaces, watching, public
community, open-source posture, and a broad ecosystem.

Bichess should borrow proven chess UX patterns and reusable open-source
components where they fit. Bichess should not become a broad Lichess clone.
Fog of War changes the core product because hidden information must be enforced
by the server and understood after the game.

Decision rule:

> Use Lichess as the mature chess-platform reference; translate only the pieces
> that help people play, finish, review, understand, or advance Fog of War.

## Lichess Product Surface

Lichess publicly exposes a broad chess platform:

- Play: lobby games, direct challenges, clocks, correspondence, standard chess,
  and chess variants.
- Competition: arena tournaments, Swiss tournaments, team events, and simuls.
- Watch: broadcasts, Lichess TV, current games, streamers, and video library.
- Learn: chess basics, practice, coordinates, puzzles, puzzle modes, studies,
  and coaches.
- Analysis and tools: analysis board, engine analysis, mistakes review, board
  editor, opening explorer, tablebases, PGN import/export, advanced search, and
  shareable studies.
- Community: player profiles, players directory, teams, forum, blog, messaging,
  friends, and challenges.
- Platform: accounts, profile identity, mobile apps, accessibility, themes,
  translations, public database, API, source code, and donation-supported
  operations.

Official references:

- <https://lichess.org/features>
- <https://lichess.org/about>

## Bichess Translation

| Lichess surface | User job | Bichess Fog equivalent | Priority posture |
|---|---|---|---|
| Play a game | Start and finish a chess game quickly | Link-based Fog of War rooms with server-enforced player views | Private-alpha core |
| Challenge a friend | Share a game with a known opponent | Anonymous friend challenge URL with seat authority and reconnect recovery | Private-alpha core |
| Watch games | Observe interesting games | EvE and finished Fog games with perspective replay and truth reveal | Private-alpha core |
| Game room UX | Understand seat, turn, clocks, status, and result | Board-first Fog room with clear White/Black view, hidden squares, clocks, reconnect, and postgame handoff | Private-alpha core |
| Replay | Step through a finished game | White view, Black view, and full-truth replay | Private-alpha core |
| Analysis board | Understand why a game turned | Fog-specific review: visibility, hidden move information, king exposure, scouting value | Later alpha |
| Engine analysis | Evaluate moves with Stockfish | Uncertainty-aware Fog engines and benchmarked bot analysis | Research/engine core |
| Studies | Share annotated analysis | Fog review artifacts, annotations, visibility moments, research examples | Later alpha |
| Puzzles and training | Improve tactical skill | Fog-specific exercises: scouting, king exposure, missed captures, visibility inference | Backlog |
| Opening explorer | Study common positions | Fog corpora and opening/start-position datasets, including future Draft960 starts | Research backlog |
| Player profiles | Understand identity, history, strength, and public activity | Future Bichess profiles for signed-in players, engine authors, engine versions, annotations, and public contributions | Later alpha |
| Tournaments and matchmaking | Find games at scale | Explicitly deferred for v1 | Defer |
| Ratings and profiles | Persistent competitive identity | Guest/signed-in persistence may come first; ratings are not v1 | Defer |
| Chat, teams, forums | Community coordination | Not needed for private-alpha Fog validation | Defer |
| API/database | Build ecosystem tools | Public corpora, engine metadata, benchmark results, reproducible experiments | Research/engine core |

## Bichess Differences

Bichess is not only "Lichess but Fog of War." The product has different
technical and research responsibilities.

### Hidden-Information Correctness

Classical chess can show the same board to everyone. Fog of War cannot.

Bichess must treat hidden information as a server-enforced security and rules
boundary:

- server owns canonical truth
- players receive only their `PlayerView`
- hidden opponent pieces and hidden move details are not sent before they are visible
- spectators and replay modes are explicitly separated from live player views
- postgame reveal happens only after terminal state or in intentionally public
  engine contexts

### Perspective Replay

Fog games are hard to understand from a normal move list. Bichess needs review
surfaces that show:

- what White saw
- what Black saw
- what was true
- when visibility changed
- which moves carried information, risk, or missed opportunity

This makes replay and review more central to Bichess than a generic move viewer.

### Engine Development

Bichess should actively encourage Fog engine development, not treat engines as
only a consumer feature.

Product surfaces should support:

- engine registry and versioned engine identities
- EvE games and benchmark corpora
- bake-offs between engine versions
- reproducible experiment configs
- review queues for suspicious or interesting engine games
- public benchmark reports when results are ready to share

### Academic And Research Use

Fog of War chess is a hidden-information game with research value. Bichess
should make that legible and reproducible:

- public corpora and manifests
- visibility and belief-state experiments
- annotation data
- benchmark protocols
- reproducible self-play and evaluation reports
- clear separation between shipped product and offline research sidecars

### Transparency, Isolation, And Fairness

Bichess needs public trust surfaces that explain how games and engine work are
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
- keep Draft960, Bid For White, and other experiments clearly framed as Fog
  features or lab work rather than confusing primary modes
- publish known limitations when they affect player expectations or research interpretation

The standard is not just "trust the site." The standard is that contributors,
engine authors, researchers, and players can inspect the rules, payload policy,
benchmark methods, and game artifacts well enough to evaluate claims.

## Parity Definition

Near-term parity with Lichess does not mean matching every platform feature.
For Bichess private alpha, parity means the Fog-specific versions of the core
play loop are understandable and reliable:

1. Create or open a room link.
2. Join as White or Black.
3. Play with clear clocks, turns, and hidden-square semantics.
4. Recover from ordinary reconnects.
5. Finish the game.
6. Review from each player perspective and full truth.
7. Share the finished game.

Research parity is separate:

1. Run and identify engine versions.
2. Produce reproducible EvE games.
3. Review and annotate engine games.
4. Publish corpora and benchmark methods.
5. Enable external contributors to build better Fog engines.

## Deferred Lichess Surfaces

These are valuable in a mature chess platform but should stay deferred until
Fog private-alpha safety, play, review, and research loops are strong:

- public matchmaking
- ratings
- tournaments
- simuls
- chat and messaging
- teams and forums
- broad social profiles
- generic classical analysis surfaces
- monetization or billing
- full mobile/native app parity
- broad internationalization

## Profile Gap

Profiles are an important part of Lichess because they connect identity,
history, public activity, ratings, games, studies, teams, and community trust.

Bichess currently does not have an equivalent product surface. That is acceptable
for anonymous private alpha, but the gap matters once signed-in persistence,
engine authorship, public games, annotations, and research artifacts become more
important.

Future Bichess profile work should likely split identity types:

- human player profile: games, public replays, annotations, and eventual strength signals
- engine author profile: submitted engines, versions, benchmark history, and reports
- engine profile: versioned identity, config, play signature, results, and known limitations
- contributor/research profile: corpora, annotations, experiments, and public reports

Ratings and broad social features remain deferred, but profile identity is still
a product primitive to revisit after guest/signed-in persistence and private
alpha safety are stable.

## Build-Vs-Borrow Rule

Before building generic chess-platform behavior from scratch, check whether
Lichess has a proven library, UX convention, or protocol pattern that Bichess can
adapt.

Borrow:

- board interaction patterns and libraries where license-compatible
- game-room UX conventions
- replay control expectations
- share/challenge/reconnect patterns
- accessibility and mobile lessons

Build custom:

- hidden-information payload policy
- Fog visibility and replay semantics
- Fog engine evaluation
- belief/visibility research surfaces
- public corpora and reproducible experiment tooling
