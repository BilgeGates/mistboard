# Deep CFR Feasibility Scoping

Companion to `engine-algorithm-family.md`. This page records the back-of-envelope analysis of whether Counterfactual Regret Minimization (CFR) and its neural variants — DeepStack, Libratus, ReBeL, Deep CFR — can be applied to Fog of War chess, and at what level.

Contributor-safe: no private compute budgets, funding plans, or internal launch strategy.

## TL;DR

**Live decision-time Deep CFR (the DeepStack / ReBeL shape applied at every move): soft no-go** for FoW chess at the current engineering and compute scale. Three load-bearing risks — Public Belief State (PBS) framework does not apply cleanly, compute is at the edge of the live move budget, and there is no starting equilibrium-aware value net to bootstrap from. Stacking all three for a live-feasible system is unrealistic.

**Offline Deep CFR for equilibrium-value training data generation: strong yes.** Sidesteps all three live-game risks. Becomes Bet C in the research portfolio — see `engine-equilibrium-value-corpus.md` for the architectural sketch.

## The structural concern: Public Belief State

Public Belief State (PBS), used by ReBeL and DeepStack to make decision-time subgame CFR tractable, requires a non-trivial *public state* — information that is common knowledge between the players. Players hold private belief over hidden state conditioned on the public state, and CFR subgames are rooted at public states.

In poker, the public state is rich: community cards, betting history, pot size, position. Most of the strategically-relevant information *is* public.

In FoW chess, the public state is essentially empty:

- Move counter, clock, captured-pieces summary, terminal-reveal events.
- That is roughly it. No common-knowledge board state.

Each player sees their own pieces and the squares those pieces threaten or move to; nothing more. Two paths around this:

- **Adapt PBS to FoW.** Define public state generously — moves played to mutually-visible squares, captures involving visible pieces, terminal-reveal info. Whether this provides a strong enough anchor for informative subgames is open. Research-grade work; days-to-weeks just to sketch correctly.
- **Drop PBS and use Deep CFR without public-state factorization.** Brown et al. 2019's Deep CFR does not require PBS — it is a more general neural CFR formulation. Tradeoff: less sample efficient, more compute, no natural decomposition of the game tree into subgames. Becomes essentially "CFR on the whole game tree with neural function approximation everywhere."

Both paths are architecturally heavyweight. Neither is "drop ReBeL into the engine and turn it on."

## Scale comparison

| Quantity | Poker (HUNL) | FoW chess (mid-game) |
|---|---|---|
| Raw information-set count | ~10¹⁷ | ~10²⁰+ (rough) |
| After abstraction | ~10⁷–10⁸ | no natural abstraction available |
| Belief support per info set | ~1–100 hands | ~10⁸–10¹⁰ positions |
| Action branching | ~3–17 (with bet-sizing abstraction) | ~20–40 legal moves |
| Game length | ~4 betting rounds | ~40–80 plies |

The killer row is "no natural abstraction." Poker's tractability depends substantially on bet-sizing abstraction — continuous bet amounts collapse to a discrete set of buckets. Chess has no analog; legal moves are already discrete and there is no equivalence relation that collapses meaningfully different moves into a single class.

## Subgame size estimates

Assume FoW middlegame branching factor 30, naive depth-d expansion of a subgame tree:

| Depth | Nodes | Notes |
|---|---|---|
| 2 | 900 | Trivial; probably too shallow for strategic value |
| 3 | 27,000 | Marginal; one full ply of opponent response visible |
| 4 | 810,000 | Standard tabular-CFR scale; reasonable for offline solve |
| 5 | 24,000,000 | Borderline tractable with sampling |
| 6 | 729,000,000 | Naive expansion infeasible; needs heavy pruning |

External sampling — standard CFR variance reduction — samples one action per opponent node and expands all our actions. This reduces tree size by roughly the opponent-branching factor per opponent ply. Depth-6 with external sampling lands at ~7×10⁵ visited nodes per iteration.

## Compute estimates per live decision

Assumptions: ~10M-parameter value net, GPU forward pass ~1ms, 500–1000 CFR iterations per decision (DeepStack uses 1000–10000; Deep CFR can converge in fewer iterations with more training data).

| Configuration | Per-iter cost | Iterations | Per-decision wall | Vs. 5s live budget |
|---|---|---|---|---|
| Depth 3, full expansion, 1000 iter, GPU | 27ms | 1000 | 27s | 5× over |
| Depth 3, full expansion, 200 iter, GPU | 27ms | 200 | 5.4s | edge |
| Depth 3, external sampling, 500 iter, GPU | 2.7ms | 500 | 1.4s | **feasible** |
| Depth 4, external sampling, 500 iter, GPU | 27ms | 500 | 13s | 2.5× over |
| Depth 4, full expansion, 500 iter, GPU | 270ms | 500 | 135s | 25× over |

Tentative finding: depth-3 sampled neural CFR at decision time is at the edge of feasibility for live play (~1–3s budget). Depth-4 needs sampling AND a faster network OR a longer move budget (~30s — viable for correspondence play or offline analysis, not live blitz).

These estimates are soft. Real implementations carry constant factors — forward-pass batching, particle expansion, JIT warmup, subprocess startup — that can shift them 3–10× in either direction.

## What FoW has going for it

- Discrete, deterministic moves. No stochastic transitions; simpler tree than card-deal games.
- Existing belief filter as input to CFR's "belief over hidden state" requirement.
- Existing diagnostic tools and corpus generation pipeline as substrate.
- Smaller action space than raw poker (no continuous bet sizing).

## What FoW has working against it

- Empty public state (the PBS concern above).
- No natural action abstraction.
- Longer games than poker → more nodes in any depth-bounded subgame.
- Larger belief support per info set (10⁸ vs ~100).
- No starting equilibrium-aware value net to plug in as the CFR leaf evaluator — the bootstrap problem.

## Recommendation

**Live decision-time Deep CFR: soft no-go.** The PBS problem alone is research-grade work; stacking compute-at-the-edge and the bootstrap problem on top makes this a multi-month research investment for an uncertain payoff.

**Offline Deep CFR for equilibrium-value training data: strong yes.** Sidesteps all three live-game risks:

- No live compute constraint (runs as a batch GPU job).
- No PBS requirement (offline Deep CFR doesn't need public-state factorization since we are not solving subgames at decision time, we are sampling info sets for training data).
- The bootstrap problem becomes a training-loop problem (start with a weak value net, iterate).

The output is a corpus of `(info set, equilibrium value)` training pairs. A standard value net trained on this corpus serves as a much better leaf evaluator than `fow_evaluator`, Stockfish-on-truth, or outcome-distillation — because the labels carry equilibrium-aware FoW knowledge instead of perfect-info-chess or noisy-outcome knowledge.

See `engine-equilibrium-value-corpus.md` for the architectural sketch of the offline pipeline.

## Open questions that this scoping does not answer

- Does Deep CFR converge on FoW-sized information sets? Poker proved it at smaller scale; the convergence guarantee transfers in theory but the practical compute requirement is unknown.
- What is the right subgame depth for offline use? Depth 3 is compute-feasible but may not capture enough strategic content.
- What belief representation should the value net consume? Particle list, factored marginals, observation-history embedding — all viable, none obviously dominant.
- How many training pairs are enough? Poker engines train on 10⁷+ pairs; FoW may need similar or more.

These become the questions for the Bet C sketch and any subsequent prototyping.

## Reading

See `engine-algorithm-family.md` for the broader framing and the literature pointers (Zinkevich et al. 2007 on CFR convergence, Brown et al. 2019 on Deep CFR, Brown et al. 2020 on ReBeL, Moravčík et al. 2017 on DeepStack).
