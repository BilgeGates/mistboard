# CFR Phase 3 — Learned Belief Encoder + Amortized Training Spec

Pre-implementation contract. The structural successor to Phase 2:
replace the hand-engineered factored-marginals encoder with a
**learned belief encoder** that takes raw observation history and
produces a representation, trained **end-to-end with the regret net
via gradient flow**, on a corpus of positions large enough that the
encoder generalizes.

Phase 2 trained a fresh regret net per position. Phase 3 trains ONE
encoder + ONE regret net on a corpus. This is the major structural
break, not the GPU spend.

This spec is written 2026-05-21 against the Phase 2 substrate at
commits 105368c (Day 4) + 2bd8b83 (Gate 2b verdict). Read
`cfr-phase2-spec.md` and `cfr-phase2-day4-plan.md` first for the
substrate context.

## Purpose

Test the thesis that **learned belief encoding** improves Deep CFR's
FoW play over Phase 2's hand-engineered marginals. Two gates:

- **Gate 3a — corpus convergence.** Training loss + held-out val loss
  on the assembled corpus stabilizes within the budget. Sanity gate
  that the architecture trains at all.
- **Gate 3b — smoke improvement.** Phase 3 model evaluated on the same
  38-position Gate 2b smoke achieves **argmax-match rate ≥ 0.389**
  (+10pp over Phase 1b's 0.289) AND **per-position solve time ≤ 60s
  on GPU**.

### Chess-judgable success criteria (added 2026-05-22)

The "+10pp argmax-match" gate is metric-driven and we've shown the
underlying metric is noisy (the 100-iter partial showed gate metrics
don't move with more compute; the both-miss inspection showed ~50% of
suggested moves are themselves questionable in chess terms). So we
ALSO commit to a chess-judgable success criterion that Brian can
score independently of the argmax-match metric:

- **Mandatory pre-commit:** before Phase 3 training begins, Brian
  reviews a random subset of 10 positions from the Phase 2b
  100-iter result via `cfr_review_packet.py`, and commits to a
  baseline "Phase 2b chess-quality" score: N/10 positions where
  Phase 2b's argmax is either (a) the best available move or (b)
  reasonable + no better alternative exists. Record this as the
  Phase 3 chess-quality bar.
- **Phase 3 chess success:** Phase 3's model evaluated on the SAME
  10 positions scores **≥ N+2 / 10** on the same chess-judgable
  rubric. Brian's judgment is the gate; the argmax-match metric is
  a secondary signal.
- **Phase 3 chess failure:** Phase 3 model scores ≤ N on the same
  10 positions. Architecture didn't help in chess terms even if it
  moves the metric.
- **Phase 3 mixed:** N+1 / 10 (one position improvement). Treat as
  inconclusive; don't auto-promote to Phase 4.

This forces us to specify "this works" in terms Brian can grade
before any GPU spend, and decouples our continue/stop decision from
the noisy argmax-match-suggested metric.

If both pass: CFR-direction is the engine track's primary investment;
move toward a production deployment plan.

If Gate 3a fails: training-pipeline bug or architecture mismatch.
Debug; no spend escalation.

If Gate 3a passes but Gate 3b fails: the learned belief representation
doesn't beat hand-engineered marginals at our scale. Two paths:
either (a) the corpus is too small to amortize, increase it; or
(b) the family-direction thesis is overstated — reconsider before
further spend.

## Cost ceiling

**$40-60 Modal spend.** Within the $100 phased-plan ceiling, $0 of
which has been spent on Phases 1+2.

Compute model:
- Modal A10G @ $1.10/hr → up to ~50 hours of total training.
- Modal A100 @ $4.30/hr → up to ~12 hours.

Default plan: **A10G**. Larger budget for iteration; A10G's bf16
throughput is plenty for the model sizes Phase 3 needs. A100 only if
batch latency dominates wall time in the training loop.

## What changes vs Phase 2

### Phase 2 (current)

- Fresh `FowRegretNet` + `FowStrategyNet` per position.
- Encoder = static `FowFactoredMarginalsEncoder` (no learned params).
- Marginals derived via the snap-to-truth propagation rule (Day 4).
- Train 50 iters × 100 trajectories per position; no cross-position
  generalization.

### Phase 3

- **One** belief encoder + regret net + strategy net, trained across
  a corpus of positions.
- Encoder learns belief representation from raw observation history.
- Per-position inference: encoder + regret net → strategy, no
  retraining per position.
- Target inference wall: ≤ 60s per position on GPU (a single batched
  forward pass over the subgame tree, no training loop).

## Architecture

### Belief encoder

**Input** — sequence of Observation events from the subgame root,
plus the to-move player's perspective + own-truth board state at
root. Each Observation gets tokenized to a fixed-shape event vector.

**Observation token** (~96 dims):
- 64-dim visibility mask (binary)
- 64×6 = 384-dim visible-piece-by-type (sparse, mostly zero)
- 1-dim own-capture flag + 6-dim captured-piece-type one-hot (if any)
- 1-dim opp-capture-landing flag + 6-dim landing-piece-type one-hot
  (if any)
- 1-dim game-over flag + 4-dim termination-reason one-hot

Total per-token: ~470 dims. Sparse; could embed first.

**Encoder body** — Transformer encoder. Sequence length = up to 64
observations (chess games rarely exceed 32 moves, so 64 is a safe
upper bound). Hidden dim 256, 4 layers, 8 heads. ~2.5M params.

**Output** — per-square belief representation: `[64, hidden_dim]`,
read by the regret net. Plus a `[hidden_dim]` summary token for
position-level features.

### Regret + strategy nets

Same architectures as Phase 2's `FowRegretNet` / `FowStrategyNet`,
but the input is now `[64, hidden_dim]` from the encoder + per-action
features (move from/to/promotion as one-hots, 133 dims as Phase 2
spec described — finally used). Output unchanged: per-action regret /
per-action probability.

This gives us **shared belief features across positions**. The
encoder learns "what does this observation history mean about opp
pieces"; the regret net learns "given this belief, what's the
counterfactual best action."

### Total params

- Belief encoder (Transformer 4×256×8): ~2.5M
- Regret net (per-action MLP head over encoder output + action
  features): ~3M
- Strategy net (same shape as regret net): ~3M

Total ~8.5M. Comfortably trains on A10G in bf16.

## Training corpus

**Phase 2 used 38 annotated blunder positions.** Phase 3 needs more
to amortize. Three sources, combined:

1. **The 38 annotated blunder positions** (existing corpus). Each
   produces one subgame per CFR run; for training we need many
   *trajectories per position*. Phase 2 already generates these
   (samples list in deep_cfr.py).

2. **Self-play positions.** Run v0.9.5 against itself (or against
   Random) for N games; sample positions at varied plies. Aim for
   200-500 positions. The point isn't "blunders" — it's distribution
   coverage.

3. **Lichess FoW puzzles** (deferred — would need scraping; only if
   the above two are insufficient).

**Subgame depth.** Phase 2 uses depth 3. Phase 3 should try depth
3-5 and pick the best by val loss. Depth scales compute roughly
linearly; should fit in budget.

**Total training samples.** Each subgame produces ~thousands of
(info_set_features, regrets) pairs. With ~300 positions × ~3k
samples = ~1M samples. Manageable on A10G.

## Modal setup

**Function**: a single Modal function that loads the corpus, builds
the model, trains via gradient steps, evaluates against the Gate 2b
smoke, saves checkpoints.

**Image**: Python 3.12 + torch + the project's local package mounted
via `Mount.from_local_dir`.

**Hardware**: A10G with 24GB VRAM. Plenty for 8.5M params + batched
samples.

**Persistence**: Modal Volume for checkpoints + training logs.
Periodic snapshots every ~10 min so we can resume after preemption.

**Scheduled runs**: don't use Modal cron — fire single training jobs
manually, monitor via Modal UI.

## Implementation milestones (~1 week wall, ~$30-50 compute)

- **Day 1** (local, $0): observation tokenizer + token-vocabulary
  unit tests. Just shape correctness; no training.
- **Day 2** (local, $0): Transformer encoder forward pass on synthetic
  inputs. Verify gradients flow.
- **Day 3** (local, $0): regret + strategy net heads consuming
  encoder output; training loop on a single position to confirm
  loss decreases.
- **Day 4** (Modal, ~$5 spent): cross-position training pipeline.
  Load 38 positions, batch trajectories, train for ~1h. Confirm
  convergence on training loss + a held-out val loss is reasonable.
- **Day 5** (Modal, ~$10 spent): Gate 3a — full corpus training
  run. ~12h training. Save checkpoint.
- **Day 6** (Modal, ~$10 spent): Gate 3b — evaluate on Phase 2b's
  38-position smoke. Direct comparison: load Phase 3 model,
  per-position inference, compute argmax_match + direction. Compare
  to Phase 2b numbers.
- **Day 7** (Modal + local, ~$10 spent): if Gate 3b passes,
  hyperparameter sweep (1-2 small ablations: depth 3 vs 5,
  encoder width 256 vs 512). If Gate 3b fails, diagnose +
  decide on direction.

## Open design questions

1. **Encoder supervision.** Do we train belief encoder ONLY through
   regret-loss gradient flow, or also add an auxiliary loss
   predicting BeliefState marginals (supervised on production belief
   filter output)? Auxiliary loss could speed convergence and force
   the encoder to learn "real" belief. Risk: it might overcommit to
   the hand-engineered belief representation we're trying to escape.
   Default: start without auxiliary, add if Gate 3a struggles.

2. **One encoder or two.** Per-player belief encoders (one for white,
   one for black) vs a single shared encoder conditioned on
   perspective. Shared is simpler + has 2× the data per gradient
   step. Default: shared, perspective as input feature.

3. **Subgame depth.** 3 (Phase 2 default), 5, or adaptive. Deeper =
   more belief uncertainty to learn but slower. Default: 3 for Day 5
   first run, escalate to 5 if Day 6 results look depth-bound.

4. **Self-play corpus quality.** Random-move positions vs v0.9.5
   self-play vs mixed. Random gives variance; v0.9.5 self-play gives
   game-realistic distributions. Default: 50/50 mix.

5. **Inference batch size.** Per-position inference walks the subgame
   tree, batching encoder calls. Need to figure out the right batch
   shape — naive depth-first walks underutilize GPU. Default: BFS
   with batch-per-depth, fall back to depth-first if memory thrashes.

## Anti-patterns to refuse

- **Don't pre-train per position.** Phase 3's whole point is
  amortization. If you find yourself training per position, you're
  back in Phase 2 with extra steps.
- **Don't reach for A100 before A10G is saturated.** $4.30/hr vs
  $1.10/hr; A10G is plenty for 8.5M params.
- **Don't change the gate metric mid-flight.** Gate 3b is
  argmax-match ≥ 0.389 against the same 38-position smoke.
  Phase 2 inspection showed the metric is noisy in our favor;
  this means the bar might be unfair, not that we should move it.
  If the metric is genuinely broken, write that up and propose a
  successor *before* the spend.
- **Don't conflate Gate 3a with Gate 3b.** Loss going down is
  necessary but not sufficient; smoke improvement is the real test.
- **Don't burn the rest of the budget on hyperparameter search.**
  If Day 5 Gate 3a passes and Day 6 Gate 3b fails by a meaningful
  margin (say 0.30 vs 0.389 target), debug structurally rather
  than sweeping LR/width/depth.

## Phase 3 success → Phase 4 entry

Phase 4 (not specified here) would be a production deployment
target: train a larger model at chess.com 2200-level strength,
deploy as the Mistboard engine, retire the v0.9.5 chess-family
ceiling. Phase 4's spend ceiling and design await Phase 3's verdict.

## Out of scope for Phase 3

- **Chess-family hand-tuning** (per the algorithm-family realization
  memory — out of scope across the entire CFR direction).
- **Multi-particle BeliefState at root** for inference. Phase 3 still
  builds root from truth-singleton (cheating, like Phase 2). True
  FoW play with real belief is Phase 4 work.
- **Production engine integration.** Phase 3 is a research validation
  gate, not a deployment.
- **Adversarial training** (CFR vs CFR self-play with the trained
  model). Interesting but not within this budget.

## Pre-launch checklist

Before running the Day 5 Modal training:
- [ ] Day 1-3 local development complete; single-position training
      loss decreases.
- [ ] Day 4 cross-position pipeline runs locally on CPU for 10 min
      without crashing.
- [ ] Corpus assembly script tested + checkpointed locally.
- [ ] Modal account configured; volume mounted; sample function
      tested with a 5-minute run.
- [ ] Spend monitor: alert at $20 / $40 / $55 thresholds.
- [ ] Deep dive (background: b1vtiibhl) result reviewed — if it
      shows under-convergence at 50 iters, factor that into Phase 3
      iteration count.

[[engine-algorithm-family-realization-2026-05-20]] ·
[[engine-cfr-phased-plan-2026-05-20]] ·
[[engine-cfr-phase2-gate2b-passed]] ·
[[engine-distributed-foundations]] (Phase 2 baselining lessons)
