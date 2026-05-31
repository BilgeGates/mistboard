# Fog of War — Document Index

Quick reference for what each file in this directory covers and whether it
reflects current implemented behavior or future planning.

## Implemented — read these to understand current behavior

| File | Contents |
|------|----------|
| [`rulesets.md`](rulesets.md) | The Mistboard Fog of War ruleset contract. Treat as authoritative when changing move generation, visibility, replay, payloads, or engine harnesses. |
| [`rules-edge-cases.md`](rules-edge-cases.md) | Subtle rule-risk areas: hidden occupancy inference, pawn diagonals, en passant visibility, castling under fog, no-check king semantics, terminal reveal boundaries. Regression target list is here. |
| [`dark-xiangqi-rules.md`](dark-xiangqi-rules.md) | Working ruleset for the Dark Xiangqi development spike: no-check xiangqi geometry, general capture, cannon target visibility, no-capture draw. |
| [`dark-xiangqi-live-integration-plan.md`](dark-xiangqi-live-integration-plan.md) | Flag-gated live-runtime integration plan for Dark Xiangqi: runtime boundary, unsupported surfaces, implementation slices, and regression matrix. |
| [`dark-mini-xiangqi-runtime-design.md`](dark-mini-xiangqi-runtime-design.md) | Hidden Dark Mini Xiangqi runtime direction: adapter boundary, fail-closed flagging, current skeleton, and implementation slices. |

## Planning — future game specs

| File | Contents |
|------|----------|
| [`dark-mini-xiangqi-rules.md`](dark-mini-xiangqi-rules.md) | Draft public rules article for Dark Mini Xiangqi: 7x7 board, no-check general-capture play, cannon/horse fog visibility, and relationship to full Dark Xiangqi. |
| [`dark-mini-xiangqi-plan.md`](dark-mini-xiangqi-plan.md) | Candidate launch plan for Dark Mini Xiangqi: separate `GameSpec`, rules/fog decisions, live-runtime milestones, UX gates, and engine deferrals. |
| [`dark-shogi-rules.md`](dark-shogi-rules.md) | Candidate Dark Shogi ruleset: king capture, fog visibility, Lao Tzu-style drops, hidden opponent hands, promotion redaction, and replay safety boundaries. |

## Planning — engine and research track

These describe planned work for the engine protocol, benchmark, and first-party
engine track. Not yet implemented in the main product.

| File | Contents |
|------|----------|
| [`engine-extraction-plan.md`](engine-extraction-plan.md) | Public/private boundary for engine work: public platform and protocol, private first-party engine, phased extraction plan. |
| [`engine-roadmap.md`](engine-roadmap.md) | Public-facing engine interface notes: FUCI protocol, `PlayerView`-only engine contract. |
| [`engine-architecture-roadmap.md`](engine-architecture-roadmap.md) | Long-arc architecture: belief layer, analysis workers, synthesis, anytime protocol, learning loop. Research map covering CFR-family approaches as load-bearing direction, plus PIMC, ISMCTS, neural approaches. |
| [`engine-algorithm-family.md`](engine-algorithm-family.md) | Why FoW is structurally a poker-family problem (imperfect information) rather than a chess variant. CFR vs PIMC tradeoffs, strategy fusion, candidate research directions, what carries over from chess-family work. |
| [`engine-deep-cfr-feasibility.md`](engine-deep-cfr-feasibility.md) | Scoping analysis: can Deep CFR be applied to FoW chess and at what level? Public-Belief-State concern, scale comparison vs poker, per-decision compute estimates. Conclusion: soft no-go on live decision-time CFR; strong yes on offline CFR for training-data generation. |
| [`engine-equilibrium-value-corpus.md`](engine-equilibrium-value-corpus.md) | Architectural sketch for generating equilibrium-value training data via offline Deep CFR, then training a value net on that data for use as a leaf evaluator. Bootstrap loop, belief representation options, compute estimates, pre-commit validation experiment. |
| [`belief-particle-engine.md`](belief-particle-engine.md) | Particle-based belief state specification: hard facts, soft evidence, particle budget, diversity. Detailed spec for the Tier-2+ engine. |
| [`engine-experiments.md`](engine-experiments.md) | EvE infrastructure: job queue, worker protocol, engine_versions, eve_jobs tables, claim protocol. |
| [`engine-lab-loop.md`](engine-lab-loop.md) | Iterative development loop for the engine: annotation cycle, artifact retention, rung rollout. |
| [`eve-roadmap.md`](eve-roadmap.md) | Engine-vs-engine infrastructure: storage model, EvE side tables, restart semantics, fair compute rules. |

## Planning — product and learning track

| File | Contents |
|------|----------|
| [`ui-polish-roadmap.md`](ui-polish-roadmap.md) | UI quality bar: fog feel (U1), reveal moments (U2), belief overlays (U3), onboarding (U4), viewer/exploration (U5). |
| [`beginner-tutorial-curriculum.md`](beginner-tutorial-curriculum.md) | Detailed spec for a future interactive tutorial: piece lessons, Fog fundamentals, onboarding spine. Not yet implemented. |

## Reference and research

| File | Contents |
|------|----------|
| [`landscape.md`](landscape.md) | Related work pointers: Kriegspiel, RBC, Dark Chess, and search terms. |
| [`research-questions.md`](research-questions.md) | Open research questions about hidden-information play, engine evaluation, and belief modeling. |
| [`positioning-and-seo.md`](positioning-and-seo.md) | Topics Mistboard's public pages should cover for search discoverability. |
| [`fog-of-war-chess-page.md`](fog-of-war-chess-page.md) | Draft content for the `/fog-of-war-chess` evergreen article page. |
