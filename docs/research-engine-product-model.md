# Research And Engine Product Model

> Status: reference product model for the engine ecosystem.
> Canonical source: [ROADMAP.md](ROADMAP.md) for current engine-track timing and
> gates.
> Last reviewed: 2026-06-12.

Mistboard should make Fog of War engine development and research a visible product
surface, not only internal infrastructure. This document defines the public
product model for engines, EvE games, corpora, annotations, and benchmark
artifacts.

It does not define provider topology, private deployment details, or operational
runbooks.

## Product Goal

Enable people to build, compare, review, and cite Fog of War engines and data.

The product should answer:

- Which engine played this game?
- Which exact version/config played it?
- What was the engine allowed to observe?
- What seed, time control, and opening policy were used?
- Can this benchmark or corpus be audited?
- What did reviewers or annotations identify?

## Identity Model

Engine authors are normal signed-in Mistboard user accounts.

There should not be a separate engine-author account system. Instead:

- a user account may own engine families and engine versions
- engine upload or execution can require an account permission/flag
- publishing or running engines may require approval or review
- public user profiles can include engine-author sections when relevant

Open question:

- what approval process is required before a user can upload, publish, or run an engine?

## Core Entities

### Engine Family

An engine family is the named project or bot line.

Examples:

- built-in random legal engine
- built-in capture seeker
- Tier-1 Python engine line
- future community engine submissions

Public metadata:

- engine family id
- display name
- owner user account
- description
- license, if publishable
- source or artifact reference, if public
- current published versions

### Engine Version

An engine version is the exact playable identity used in a game or benchmark.

Public metadata:

- version id
- engine family id
- owner user account
- version label
- config hash
- play signature
- allowed observation policy
- build/source/artifact reference when publishable
- known limitations
- created/published time

Engine version identity is mandatory for meaningful benchmark claims.

### Engine Game

An engine game is a canonical Fog game where at least one seat is engine-owned.

Public metadata:

- game id / room id
- game mode: PvE or EvE
- engine versions for each engine seat
- human/guest/signed-in identity only when intentionally public
- seed
- time control
- opening/start policy
- result and termination
- ply count
- worker/job metadata safe for public display
- links to replay, annotations, and benchmark context

### Benchmark Job

A benchmark job is a reproducible set of engine games run for a purpose.

Purposes:

- smoke
- regression
- bakeoff
- calibration
- mining

Public metadata:

- job id
- purpose
- engine versions compared
- target game count
- completed game count
- failed/aborted game count
- seed policy
- time control
- opening policy
- resource policy summary
- result summary
- links to games and report

Provider account setup, private networking, deploy triggers, and incident
operations should not be public metadata.

### Corpus / Manifest

A corpus is a named, reproducible collection of games or positions.

Public metadata:

- corpus id
- description
- generation method
- included game ids or artifact references
- engine versions involved
- seed ranges
- time controls
- known biases or limitations
- license/reuse terms if applicable

### Annotation

An annotation is human or tool feedback attached to a game, position, ply, or
engine behavior.

Annotation visibility modes:

- private
- shared by link
- public

Public annotation metadata:

- game id
- ply
- perspective
- annotator account, when public
- category
- severity or score, if used
- free-text note, if intentionally published
- linked engine version or benchmark job, if relevant

## Public Product Surfaces

### Lab

Purpose: let authorized reviewers browse engine games, review candidates, and
understand current engine work. The planned canonical route is `/lab` (not yet
implemented); the shipped admin engine surfaces today are the `/engines` roster
and the `/engine/:id` profile. These are admin-gated while the tooling is still
owner-operated.

Minimum gated surface:

- recent EvE games
- game replay with White, Black, and truth perspectives
- engine/version labels
- result, termination, and ply count
- filter by review status when available

Later:

- review queue
- annotation UI
- bakeoff comparisons
- benchmark summaries
- engine/version pages

### Engine Family Page

Purpose: explain a bot line or engine project.

May show:

- owner user account
- description
- versions
- public games
- benchmark reports
- source/artifact links
- known limitations

### Engine Version Page

Purpose: make an exact playable engine identity inspectable.

May show:

- config hash
- play signature
- observation policy
- benchmark record
- game list
- changelog
- known limitations

### Benchmark Report Page

Purpose: publish a claim about engine behavior or strength.

Must show enough metadata to audit the claim:

- engine versions
- seeds
- time controls
- opening/start policy
- game count
- failure counts
- scoring method
- result summary
- links to game sample
- known limitations

Avoid publishing leaderboard-like claims until methodology is stable.

### Corpus Page

Purpose: make datasets citeable and reusable.

May show:

- corpus manifest
- generation method
- download/artifact links
- representative games
- known biases
- version history

## Viewer Split

`/game/:id` is the broadly accessible finished-game viewer. It should not require
lab access for ordinary replay, perspective review, result, clocks, and move
list.

`/lab` is the gated index/work queue for engine and review work. It links into
the same game viewer with optional panels enabled when the game has eligible
artifacts and the user has the right capability.

Engine-specific panels are artifact-level features, not generic PvP replay
features:

- belief inspector: only when engine belief artifacts exist;
- trace/decision rows: only when engine trace artifacts exist;
- engine metadata: only for engine-owned seats or imported engine artifacts.

Annotations are generic game-review infrastructure. They may attach to any
finished game, ply, position, or artifact, but engine-training feedback is only
one consumer of that annotation layer.

## Allowed Observation Policy

Every engine version or benchmark should state what the engine was allowed to
observe.

Common policies:

- `player-view-only`: engine receives only the legal `PlayerView` for its seat
- `truth`: engine receives canonical truth; only appropriate for explicitly
  truth-based experiments, debugging, or public EvE contexts where labeled
- `analysis-offline`: engine analyzes finished games after truth reveal

Product rule:

> Do not compare engines unless their allowed observation policies are compatible
> or the difference is explicitly part of the experiment.

## Publishability Checklist

A benchmark or research artifact is publishable when it includes:

- engine family and version ids
- owner/author account where public
- config hash or equivalent reproducibility marker
- allowed observation policy
- seed policy
- time control
- opening/start policy
- game count
- failure/abort counts
- result and scoring method
- known limitations
- links to representative games or corpus manifest

## Deferred Decisions

Do not block current engine work on these:

- open engine submission UI
- approval workflow details
- engine sandboxing implementation details
- public engine leaderboard
- rating engines
- monetization or prizes
- tournament formats

## Stage Guidance

Stage 1: Private Alpha

- keep engine work mostly as internal/private-alpha support
- show recent EvE games where useful
- use engine metadata enough to debug and review games

Stage 2: Public Alpha

- make public engine games and benchmark claims understandable
- add public-safe reports when methodology is stable

Stage 3: Research / Engine Alpha

- make engine identity, versions, benchmark jobs, corpora, and annotations
  first-class public surfaces
- support user-account-owned engine families
- support review queues and annotation workflows

Stage 4: Early Platform

- add engine author sections to normal user profiles
- consider engine submission and approval workflows
- consider leaderboards only after benchmark methodology is credible

## Open Questions

- What permission or approval should a signed-in account need before uploading
  or running an engine?
- Which engine artifacts can be public source links, and which are private
  binaries/configs?
- What is the minimum sandbox/isolation statement that can be public without
  exposing private operations?
- Which annotation categories should become public benchmark metadata?
- When is a benchmark methodology stable enough for rankings or leaderboards?
