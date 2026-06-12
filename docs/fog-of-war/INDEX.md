# Fog Of War Document Index

Quick reference for what each file in this directory covers and how current it
is. Current product direction and launch gates live in
[`../ROADMAP.md`](../ROADMAP.md); this directory holds rules, design references,
implementation records, and article drafts.

## Status Labels

| Status | Meaning |
|---|---|
| `current` | Matches implemented behavior or current public product state. |
| `public-alpha` | Live or visible, but casual-only or still gated. |
| `candidate` | Future ruleset or design idea, not a current commitment. |
| `reference` | Useful public background, not kept as planning state. |
| `historical` | Implementation or migration record retained for provenance. |
| `draft` | Authoring material that should become product/article copy or move out of public docs. |

## Rules And Runtime Notes

| File | Status | Use it for |
|---|---|---|
| [`rulesets.md`](rulesets.md) | `current` | Mistboard Fog of War ruleset contract. Treat as authoritative when changing move generation, visibility, replay, payloads, or engine harnesses. |
| [`rules-edge-cases.md`](rules-edge-cases.md) | `current` | Regression target list for hidden occupancy inference, pawn diagonals, en passant visibility, castling under fog, no-check king semantics, and terminal reveal boundaries. |
| [`dark-mini-xiangqi-rules.md`](dark-mini-xiangqi-rules.md) | `public-alpha` | Public rules source for Dark Mini Xiangqi: 7x7 board, no-check general-capture play, cannon/horse fog visibility, and relationship to full Dark Xiangqi. |
| [`dark-mini-xiangqi-plan.md`](dark-mini-xiangqi-plan.md) | `historical` plus `public-alpha` status record | Dark Mini Xiangqi launch/integration record: separate `GameSpec`, rules/fog decisions, live-runtime milestones, engine/PvE, and current public-alpha status. |
| [`dark-mini-xiangqi-runtime-design.md`](dark-mini-xiangqi-runtime-design.md) | `historical` | Runtime design note for the DMX spike: adapter boundary, fail-closed flagging, and implementation slices. The initial hidden-runtime wording is historical; current DMX is public alpha. |
| [`dark-xiangqi-rules.md`](dark-xiangqi-rules.md) | `candidate` | Working ruleset for the flag-gated Dark Xiangqi development spike: no-check xiangqi geometry, general capture, cannon target visibility, no-capture draw. |
| [`dark-xiangqi-live-integration-plan.md`](dark-xiangqi-live-integration-plan.md) | `historical` | Flag-gated live-runtime integration plan for Dark Xiangqi: runtime boundary, unsupported surfaces, implementation slices, and regression matrix. |
| [`dark-shogi-rules.md`](dark-shogi-rules.md) | `candidate` | Candidate Dark Shogi ruleset: king capture, fog visibility, Lao Tzu-style drops, hidden opponent hands, promotion redaction, and replay safety boundaries. |

## Engine And Research Track

The redacted engine protocol and engine-vs-engine orchestration are implemented
in this repo. The first-party engine internals and local development loop live
outside the public repo, so belief and lab-loop pages are public-safe design
references or boundary notes, not in-repo workflows.

| File | Status | Use it for |
|---|---|---|
| [`engine-extraction-plan.md`](engine-extraction-plan.md) | `historical` | Public/private boundary for engine work: public platform and protocol, private first-party engine, phased extraction plan. The extraction has already happened. |
| [`engine-roadmap.md`](engine-roadmap.md) | `reference` | Public-facing engine interface notes: FUCI protocol and `PlayerView`-only engine contract. |
| [`engine-architecture-roadmap.md`](engine-architecture-roadmap.md) | `reference` | Long-arc engine architecture: belief layer, analysis workers, synthesis, anytime protocol, learning loop, and research families. |
| [`engine-algorithm-family.md`](engine-algorithm-family.md) | `reference` | Why Fog of War is structurally an imperfect-information problem rather than a normal chess-variant engine problem. |
| [`engine-deep-cfr-feasibility.md`](engine-deep-cfr-feasibility.md) | `reference` | Scoping analysis for Deep CFR and neural CFR approaches in Fog of War chess. |
| [`engine-equilibrium-value-corpus.md`](engine-equilibrium-value-corpus.md) | `reference` | Architectural sketch for offline equilibrium-value training data and value-net leaf evaluation. |
| [`belief-particle-engine.md`](belief-particle-engine.md) | `reference` | Public-safe design sketch for particle-based belief state: hard facts, soft evidence, particle budget, diversity. |
| [`engine-experiments.md`](engine-experiments.md) | `reference` | EvE infrastructure and generalized experiment orchestration: job queue, worker protocol, engine versions, and claim protocol. |
| [`engine-lab-loop.md`](engine-lab-loop.md) | `historical` | Boundary note that the engine's local learning loop moved out of the public repo. |
| [`eve-roadmap.md`](eve-roadmap.md) | `reference` | Engine-vs-engine infrastructure: storage model, EvE side tables, restart semantics, and fair compute rules. |

## Product, Learning, And Content

| File | Status | Use it for |
|---|---|---|
| [`ui-polish-roadmap.md`](ui-polish-roadmap.md) | `reference` | UI quality bar for fog feel, reveal moments, belief overlays, onboarding, and viewer/exploration surfaces. |
| [`beginner-tutorial-curriculum.md`](beginner-tutorial-curriculum.md) | `draft` | Detailed curriculum draft for future interactive tutorial content. Current implemented tutorial content lives in app code. |
| [`fog-of-war-chess-page.md`](fog-of-war-chess-page.md) | `draft` | Draft content for evergreen `/fog-of-war-chess` and engine-play public pages. Not canonical rules. |
| [`positioning-and-seo.md`](positioning-and-seo.md) | `reference` | Public documentation topics useful to users and contributors. |

## Reference Library

| File | Status | Use it for |
|---|---|---|
| [`landscape.md`](landscape.md) | `reference` | Related work pointers: Kriegspiel, RBC, Dark Chess, and search terms. |
| [`research-questions.md`](research-questions.md) | `reference` | Open research questions about hidden-information play, engine evaluation, and belief modeling. |
