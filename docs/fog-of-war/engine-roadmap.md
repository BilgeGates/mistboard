# Fog Of War Engine Notes

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

The Belief Particle Engine subtrack is documented in
`docs/fog-of-war/belief-particle-engine.md`. Its first contract is that belief
state may be uncertain, but it must not contradict hard facts in the observation
stream.

Internal compute budgets, training plans, research bets, and platform strategy belong outside the public repository.
