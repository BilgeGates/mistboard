# Fog Of War Engine Notes

> Status: reference notes for public engine-facing boundaries.
> Canonical source: [`../engine-protocol.md`](../engine-protocol.md) for the
> current protocol and [`../ROADMAP.md`](../ROADMAP.md) for sequencing.
> Last reviewed: 2026-06-12.

This public page gives contributors enough context to work on engine-related code without exposing internal research or funding plans.

The core rule is simple:

> A Fog of War engine must consume only the same legal `PlayerView` available to the side it plays.

## Public Invariants

- Engines must not receive canonical hidden board state during live play.
- Engine inputs should be reproducible from public game/event records where possible.
- Benchmarks should identify the engine version, ruleset, corpus, seeds, and time controls.
- Claims about strength should include enough method detail to reproduce or challenge them.

## Public Work Areas

- engine-facing view types
- random and heuristic baselines
- legal-observation belief tracking
- belief particle generation as its own sub-engine
- tournament harness reliability
- benchmark manifests
- reproducibility checks

## Public Engine Surface

The public product surface should present one first-party opponent, **Misty**,
under the formal **Mistboard Engine** identity. Users choose a strength tier,
not an implementation pin:

- Misty Beginner
- Misty Casual
- Misty Strong
- Misty Max

Internal engine IDs, version numbers, quantization choices, model checkpoints,
config hashes, and play signatures remain reproducibility metadata. A tier may
map to a different implementation over time as long as its strength,
latency, and behavior are recalibrated and benchmark records keep the exact
technical identity inspectable.

`python-tier1-v0.9.5` and similar pinned engines are useful as regression
opponents, benchmark baselines, emergency fallbacks, or temporary previews.
They should not become the durable user-facing product taxonomy.

The random engine should stay available for smoke tests and baselines. It should
not be the main player-facing learning opponent unless explicitly surfaced as a
debug or novelty option.

## Fairy-Stockfish And Other UCI Engines

Mistboard uses Fairy-Stockfish as a useful perfect-information engine, not as
the source of truth for hidden-information play. The server and `packages/game`
rules remain authoritative; UCI engines propose moves that the server validates.

Current posture:

- Crossroads Chess is the production FSF runtime dependency. It is
  perfect-information, so FSF can play it directly through `crossroads-chess.ini`.
- Dark Crossroads and the other fog variants should not use FSF as a live bot:
  a perfect-information searcher sees the wrong problem. It can still provide
  comparison games, fixtures, and leaf-evaluation baselines.
- Drop Mini Xiangqi uses FSF as a lab tool for balance exploration. FSF's
  orthodox check semantics are close enough for pressure tests, but not identical
  to Mistboard's general-capture Drop Mini kernel.
- Jieqi and Banqi use the same UCI-subprocess shape, but different engines:
  PikaJieQi for Jieqi and MistyBanqi for Banqi.

Decision: maintain a narrow, upstream-tracking Fairy-Stockfish fork once an
FSF-backed surface remains part of the public runtime. The fork should own build
reproducibility, variant config, small rule patches, and release artifacts. It
should not become a second Mistboard rules engine, and it should not absorb the
hidden-information Misty work.

The practical target is:

- a pinned source ref and binary release for Mistboard deploys,
- license/source hygiene for distributed GPL-family artifacts,
- CI or lab parity checks that compare FSF move generation with the
  corresponding `packages/game` kernel for any launched FSF-backed variant,
- deliberate engine-version bumps in engine registry metadata when config or
  binary behavior changes.

Do not fork just to make experiments easier. Use local `MISTBOARD_FSF_PATH`,
variant INI files, and lab scripts while a variant is still exploratory. Fork
when the engine is serving users, when exact rule agreement matters, or when
local patches become a required part of the product.

Engine tiers are enabled per time control only when they meet that time
control's latency and quality bar. `3+2` remains the primary calibration bucket.
`1+1` and longer controls can be supported for a tier after the serving path can
stay inside the clock at production p95/p99 latency without degrading the
experience. Stronger tiers may support fewer time controls than beginner tiers.

The Belief Particle Engine subtrack is documented in
`docs/fog-of-war/belief-particle-engine.md`. Its first contract is that belief
state may be uncertain, but it must not contradict hard facts in the observation
stream.

The longer-term search and synthesis architecture is documented in
`docs/fog-of-war/engine-architecture-roadmap.md`. It treats move selection as a
hybrid system: belief generation, parallel analysis workers, an explicit
synthesis layer, and annotation-driven regression gates.

Internal compute budgets, training plans, research bets, and platform strategy belong outside the public repository.
