# Equilibrium-Value Training Corpus — Architectural Sketch

Companion to `engine-algorithm-family.md` and `engine-deep-cfr-feasibility.md`. This page sketches an architecture for generating Fog of War equilibrium-value training data via offline Deep CFR, then using that data to train a value net that serves as the leaf evaluator inside online search.

Contributor-safe: no private compute budgets, funding plans, or internal launch strategy.

## Why this and not online CFR

Live decision-time Deep CFR is soft no-go at our scale (see `engine-deep-cfr-feasibility.md`). The offline variant sidesteps the three live-game risks — no Public-Belief-State requirement, no live compute constraint, no bootstrap-from-nothing problem. What it produces is the missing ingredient for any high-strength FoW engine: training labels with the right kind of ground truth.

Per-position evaluation labels from perfect-info chess engines (Stockfish on truth boards) are systematically wrong for FoW because they do not see fog, do not reason about belief, and do not value information. Outcome labels are too noisy at the per-position level. Distillation labels (fow_evaluator into a net) just memorize the corpus distribution. All three failed in prior iterations for the same structural reason: **in imperfect-information games, "the value of a position" is not well-defined; only "the value of an information set under equilibrium play" is.**

CFR is the algorithm family that computes information-set values under equilibrium play. Running it offline lets us *create* the ground truth we have been missing.

## The pipeline

```
Self-play games (current best engine)
        │
        ▼
Info-set sampling
        │
        ▼
Per-info-set offline Deep CFR solve
        │
        ▼
(info_set, equilibrium_value) training pairs
        │
        ▼
Value net training
        │
        ▼
New value net plugged in as:
  - leaf eval inside PIMC / ISMCTS
  - replacement for fow_evaluator
  - target for distillation into faster nets
        │
        └──→ feeds back into self-play (next iteration)
```

## Stage-by-stage detail

### 1. Info-set sampling

Generate self-play games with the current best engine (initially v0.9.5; iterates as the loop runs).

For each game:

- At each ply, both player perspectives produce a distinct info set: `(observation history, belief snapshot, true position)`.
- Sample N info sets per game, stratified across game phase (opening, early middlegame, late middlegame, endgame) to avoid corpus skew toward whichever phase produces the most plies.
- Store one row per sampled info set with the full observation event log, the belief filter snapshot at that ply, and the ground-truth board (for offline analysis; never used in live decisions).

Concrete numbers: 1000 games × 10 sampled info sets per game = 10k info sets per generation pass. Generation pass takes hours, not days, given current engine throughput.

### 2. Belief representation for the value-net input

This is the load-bearing architecture choice. Three candidate representations:

**Option A — Particle list (most compatible with current substrate).**
The value net consumes the particle cloud directly as a set. Architecture: set transformer with attention over particles, then an aggregation head that produces a single value. Pros: directly plugs into existing belief filter; minimal new infrastructure. Cons: representational capacity bounded by particle count; the same underlying truth-in-set undersizing that limits PIMC limits this representation too.

**Option B — Factored marginals.**
The value net consumes a `64 × 12` tensor of `P(piece type on square)`. Architecture: 2D CNN or board-shaped transformer. Pros: linear in board size, not exponential in position count; matches the representation used in the Obscuro paper. Cons: discards inter-piece correlation structure.

**Option C — Observation-history transformer.**
The value net consumes the raw sequence of observation events. Architecture: transformer over events, learns belief implicitly. Pros: no separate belief filter required in the value path; representation capacity grows with model size. Cons: long sequences; cannot reuse existing belief filter as warm start; harder to debug.

Recommendation for first build: **Option A** — cheapest path, compatible with the substrate, easiest to debug. Run Option B as a parallel experiment once Option A is validated end-to-end. Option C is the right long-term target if Options A and B both ceiling.

### 3. Offline Deep CFR on sampled subgames

For each sampled info set:

- Construct a depth-bounded subgame rooted at that info set. Depth 3 is the cheap default (see feasibility scoping); depth 4 if compute allows.
- Initialize CFR regret tables (or regret network for Deep CFR).
- Run Deep CFR iterations: sample trajectories through the subgame, compute counterfactual values at leaves using the current value net, update regret estimates, retrain the regret network on accumulated samples.
- After convergence (or a fixed iteration budget), extract the equilibrium strategy at the root.
- Compute the equilibrium value: the expected outcome under the equilibrium strategy.
- Emit one training pair: `(info_set_representation, equilibrium_value)`.

Variance reduction: external sampling on opponent nodes (sample one opponent action per node, expand all our actions). Standard CFR variant; cuts compute by an order of magnitude with modest variance increase.

### 4. Value net training

Train the value net on the accumulated `(info_set_representation, equilibrium_value)` corpus.

- Loss: MSE between predicted value and CFR-computed equilibrium value.
- Held-out split: positions from games not used in CFR data generation.
- Validation metric: correlation with held-out CFR values, AND OOD probe pass rate from `eval_ood_probes.py` (the annotation-derived positional probes are an external validator).

Save weights as `lab/nets/value/cfr-v{N}/weights.npz`. This becomes the leaf evaluator for the next round of CFR.

### 5. Bootstrap loop

```
v0_net = train_random_init_net(target = fow_evaluator)    # warm start from hand-tuned eval
v0_engine = current_best_engine                            # v0.9.5 today

for iteration i in [1..N]:
    games_i      = generate_self_play(engine = best_engine_to_date)
    info_sets_i  = sample_info_sets(games_i, stratified)
    pairs_i      = []
    for info_set in info_sets_i:
        eq_value = deep_cfr_solve(info_set, leaf_eval = v_{i-1}_net)
        pairs_i.append((info_set, eq_value))
    v_i_net = train_value_net(pairs_i ∪ all_prior_pairs, init = v_{i-1}_net)
    candidate_engine = plug_in(v_i_net) into PIMC / drop-in for fow_evaluator
    if bake_off(candidate_engine vs best_engine_to_date) shows improvement:
        best_engine_to_date = candidate_engine

exit when convergence (Elo plateau across two consecutive iterations) OR compute budget exhausted
```

The chicken-and-egg problem (need a value net to run CFR; need CFR to train the value net) is solved by the warm start: v0_net is trained to imitate `fow_evaluator`, which is hand-tuned and imperfect but better than random. Subsequent iterations improve.

### 6. How the value net plugs back into the engine

Multiple non-exclusive integration points:

- **Drop-in replacement for `fow_evaluator`** in 1-ply `best_action`. Cheapest integration; immediate test of whether the learned eval beats the hand-tuned one.
- **Leaf evaluator inside PIMC depth-2 or depth-3.** Still inherits PIMC's strategy fusion limit, but with a much stronger leaf the aggregation produces better decisions.
- **Leaf evaluator inside ISMCTS** if/when that search variant gets prototyped.
- **Policy prior input** to the move-ordering heuristic.
- **Live shallow CFR** (depth 2-3 sampled, ~1-3s/move) if the live-feasibility experiments validate.

The value net does not lock in any single search architecture. It is a strong, equilibrium-aware leaf — usable inside any search that has leaves.

## Compute estimates

Per info-set CFR solve, depth 3, external sampling, 500 iterations:

- ~3000 forward passes through the value net per solve.
- @ 1ms/pass on GPU (small net) = ~3 seconds per info set.

Per-iteration cost:

- 10k info sets × 3s = ~8 GPU-hours per iteration.
- Self-play generation: a few hours on existing pool.
- Value-net training: ~1 hour on GPU per iteration.
- Total: ~10 GPU-hours per iteration.

Full bootstrap loop:

- ~10 iterations to expected convergence (rough; could be more).
- ~100 GPU-hours total.
- At cloud GPU rates ($0.30–$1.50 per GPU-hour depending on tier) → roughly $30–$150 per bootstrap loop.

Within reasonable bounds for the engine-as-distribution thesis. Compare to prior chess-engine plans that estimated $200+ for Phase A self-play scale; this delivers a qualitatively different artifact (equilibrium-aware value net) at comparable cost.

## What to validate before committing to the full pipeline

Smallest pre-commit experiment, designed to falsify cheaply:

1. Pick 100 hand-curated positions covering the existing annotated corpus + 50 newly chosen positions with clear ground truth (obvious blunders, clear best moves, mate-in-N setups).
2. Run offline Deep CFR on each, depth 3, external sampling, 500 iterations.
3. Compare CFR's computed equilibrium value to:
   - `fow_evaluator`'s value
   - The annotated-correct-move's expected value
   - Stockfish-on-truth (where applicable)
4. Success criterion: CFR's equilibrium value distinguishes blunders from non-blunders better than `fow_evaluator` does (measured against the annotation labels), AND the per-position solve takes less than 5 seconds on GPU.

Estimated cost: ~5–10 GPU-hours of compute, ~3–5 days of research engineering. This is the gate before any production-scale compute spend.

If this experiment passes, scale to 10k info sets. If it fails (CFR returns garbage, takes too long, or doesn't beat `fow_evaluator` on the targeted comparison), redesign before scaling.

## Risks

- **Deep CFR may not converge at FoW state-space scale.** Poker proof does not transfer automatically. Mitigation: the pre-commit experiment catches this before scaling.
- **Belief representation choice may be wrong.** Options A/B/C all have failure modes. Mitigation: A is cheapest, B runs in parallel, C is the fallback.
- **Bootstrap loop may oscillate or diverge** if early iterations produce garbage labels. Mitigation: warm-start v0_net from `fow_evaluator`; keep best-engine-to-date frozen until a candidate beats it in a real bake-off.
- **Value net overfits to specific game phases or opponent styles** in the self-play corpus. Mitigation: stratified info-set sampling; diversify generators by mixing in adversarial opponents (e.g., engines with different parameter settings).
- **Compute exceeds budget if iteration count is higher than estimated.** Mitigation: explicit per-iteration ROI check; stop the loop if Elo gain per iteration drops below threshold.

## Dependencies

- **Substrate:** belief filter, particle store, Postgres corpus pipeline, OOD probe suite. All in place.
- **New infrastructure:** offline Deep CFR implementation. ~2–3 weeks of research engineering from scratch.
- **Compute:** GPU access. Current Railway setup is CPU-only; would need cloud GPU rental or a different host for the GPU portion of the loop.

## Relationship to other bets

- **Bet D — large-corpus opp policy via co-training.** Complementary, not alternative. The opp policy net produces the prior CFR uses when sampling opponent actions. Bet D should run in parallel; its output strengthens Bet C's inner loop.
- **Bet A — neural belief encoder.** Could become the value-net input representation (Option C above). Synergistic if pursued together, but each is independently valuable.
- **Bet B — live decision-time Deep CFR.** Soft no-go per feasibility scoping. Bet C is the pivot — same algorithm family applied offline rather than online.

## Status

Sketch only. No code written. No pre-commit experiment run. The next concrete step is the validation experiment described above. Whether to run it should be a deliberate decision, not a default — it commits ~3–5 days of research-engineering time, and a "no" answer reshapes the whole engine roadmap.

## Reading

See `engine-algorithm-family.md` and `engine-deep-cfr-feasibility.md` for context. Primary algorithmic references: Brown et al. 2019 (Deep CFR), Moravčík et al. 2017 (DeepStack), Brown et al. 2020 (ReBeL). Zinkevich et al. 2007 for the CFR convergence proof that underwrites the whole approach.
