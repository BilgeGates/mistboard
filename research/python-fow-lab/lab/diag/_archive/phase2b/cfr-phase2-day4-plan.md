# CFR Phase 2 — Day 4 plan

Pre-implementation contract for `FowFactoredMarginalsEncoder` +
`FowRegretNet` + the deep_cfr.py extensions they imply. Written
2026-05-20. Supersedes the open questions in
`cfr-phase2-spec.md` §"Open design questions" where this doc gives
a concrete answer.

## What's load-bearing

Three decisions must be pinned before code:

1. **Where the factored marginals come from at each node.**
2. **How the deep_cfr.py regret-net call signature stretches to FoW.**
3. **How the avg strategy is accumulated when info-set count is huge.**

The spec ducks (2) and (3). Day 4 is the first time it matters.

## Decision 1 — marginals propagation (Option C, refined)

### What the encoder is asked to do

At every CFR-traversed node, return a feature tensor describing
the to-move player's information set. Per spec, ~900 floats:
- 64 × 12 = 768 factored marginals over opp pieces (P(piece type at
  square | the player's belief)).
- 64 own-piece-visible mask (1 where own piece sits — trivial from
  truth + perspective).
- 64 last-seen heatmap (decayed since-last-seen).

The 768 is the load-bearing part.

### The Option C / Option A trade

- **Option A — fresh BeliefState per node.** Replay observation
  history from root through a real particle filter. Correct but
  ~50-100ms per node × 27k nodes × 50 iters = 18-37h **per position**.
  Won't fit in an overnight smoke.
- **Option B — observation-history embedding.** Abandon
  BeliefState; encode raw observations and learn the belief
  representation. This is Phase 3's job.
- **Option C — root-once + cheap update.** Build a real
  `BeliefState` at the subgame root once. Derive root factored
  marginals from `BeliefState.marginal_piece_at()`. At descendant
  nodes, propagate marginals by a cheap closed-form rule below.

We take Option C. Phase 2 is a correctness gate — we accept some
approximation error vs particle-filter truth in exchange for being
able to actually run the gate.

### What "factored marginals" carry

The 768-dim block stores `P_opp[s, p]` only — probability that
opp-piece type `p` is on square `s`. Own pieces are deterministic
(the SubgameNode's truth board names them exactly), so they get
the 64-dim own-mask block, not 768 dims of redundant marginals.

`p` ranges over the 6 opp piece types (P, N, B, R, Q, K) plus an
implicit "empty/own-piece" category. 64 × 6 = 384, not 768. Spec
says 768 ("12 piece types"); that includes both colors. We
include 12 piece-type slots for compatibility with Phase 3's
encoder boundary — even though half (own color) are deterministic.
6 slots are computed from belief; 6 are read from truth.

### The propagation rule

Each `SubgameNode` carries two factored marginal tables, one per
player perspective: `marginals_white`, `marginals_black`. Each is a
[64, 6] tensor over opp piece types from that player's POV.

Root: built from a `BeliefState` per player (see "Building the
root BeliefState" below).

`apply(move m, played by player T)` produces a child node with
updated marginals:

**T's marginals (their view of opp pieces):**

- If `m` is a capture and the captured square is in T's
  observation: T sees the opp piece type at `to`. Their `P_opp[to,
  *]` collapses to 0 for that piece type at `to` (because T
  captured it — it's no longer there). Other entries at `to` go to
  zero too (square is now own-occupied).
- T's marginals over *other* opp squares are unchanged at this
  half-move. T hasn't given opp a move yet.

**Opp's marginals (their view of T's pieces):**

- T's `from` square was an own-piece square in opp's representation
  (zero in `P_opp[from, *]`). Now it's empty from T's POV. From
  opp's POV:
  - If `from` is in opp's *new* visibility (post-T's-move): opp
    sees `from` is empty. No P_opp update needed (it was already
    0 there).
  - If `from` is NOT in opp's new visibility: opp doesn't know T
    moved away. But opp's `P_opp[from, *]` was already 0 (own
    pieces). No update.
- T's `to` square:
  - If `to` is in opp's new visibility: opp sees T's piece. We
    don't store T-piece marginals in opp's `P_opp` (those are
    opp's own pieces, deterministic). We DO need to zero
    `P_opp[to, *]` if it was nonzero — but wait, `to` was an
    opp-piece square in opp's view from opp's perspective means
    P_opp[to, *] referred to T's pieces. Wait, `P_opp` is "opp
    pieces" from THIS player's POV. So opp's `P_opp` = opp's
    belief about T's pieces. T just moved a piece to `to`. If opp
    sees `to`, opp can read T's piece type and `P_opp[to, T_piece]`
    becomes 1, rest at `to` becomes 0.
  - If `to` is NOT in opp's new visibility: opp doesn't know. We
    approximate: leave opp's `P_opp[to, *]` unchanged. (Strictly,
    opp should slightly increase P_opp mass at squares reachable
    from `from`, but this is the approximation we accept.)
- If T captured an opp piece visible to opp: opp sees the capture.
  `P_opp[to, *]` collapses (relevant when capture is on a square
  opp can see).
- If T captured an opp piece NOT visible to opp: opp does NOT
  learn this directly. Approximation: leave `P_opp` unchanged.
  (Strictly, this is wrong — opp will see one of their pieces
  vanish if they re-check inventory. We accept the leak.)
- If T's move puts a T-piece into opp's `P_opp` view (entered new
  visibility): collapse like the `to` case above.
- If T's move removed a T-piece from opp's view (left old
  visibility): we need to expand `P_opp` for that piece — but
  approximation: skip. Phase 2 accepts that vanished-into-fog
  pieces stay where opp last saw them in marginals.

**Symmetric for opp's move.**

The approximation accepts: factored marginals lag the true
particle belief on hidden-information events. The property test
(below) tells us how badly.

### Building the root BeliefState

The smoke harness reconstructs `board_before` (the known truth at
the subgame root). Per `cfr_phase1_smoke.py`. From that truth,
build per-player initial belief:

```python
def root_marginals(board_before, perspective):
    bs = BeliefState.initial(
        perspective=perspective,
        move_prior=uniform_prior_or_sf_distilled,
        target_n=64,  # smaller than production; the gate is about CFR not belief
        start_board=board_before,
    )
    # bs is a singleton-particle belief at the truth board.
    # For Phase 2, we accept that — the subgame root has perfect info
    # about the truth from the to-move player's frame.
    return extract_factored_marginals(bs)
```

This means at the subgame root, marginals are essentially the
truth board (modulo opp's visibility mask). The marginal-update
rule then creates fog as the subgame walks forward.

Phase 3 will replace this with belief replayed through actual
prior observation history from the real game.

## Decision 2 — deep_cfr.py regret-net signature

The current `deep_cfr.py` calls:

```python
regrets_pred = net(feat.unsqueeze(0)).squeeze(0)  # [num_actions]
```

The net output is fixed-size over `encoder.num_actions`. Spec
describes a per-action head that takes `(info_features,
action_features)`. These are incompatible.

**Pragmatic choice for Phase 2:** keep the fixed-output signature.

For FoW chess UCI move space: `num_actions = 4672` (64 from × 64
to × promotions). The output head is 256→4672 = ~1.2M params, not
that bad. The downside is most heads are never trained (illegal
in most positions), but `_strategy_from_regrets` masks them out.

`FowRegretNet`:
- Input: 768 + 64 + 64 = 896-dim info-set feature vector.
- Body: 896 → 512 → 512 → 256 (ReLU between).
- Head: 256 → 4672 regrets.
- Params: ~896×512 + 512×512 + 512×256 + 256×4672 = ~460k + 260k + 130k + 1.2M ≈ 2M.

Within the spec's ~5-10M target band; smaller is fine — Phase 2 is
a correctness gate, not a strength gate.

If Gate 2b fails on capacity grounds (loss plateaus, evidence of
underfitting), revisit the per-action head architecture in
Phase 3 where it co-evolves with the belief encoder.

## Decision 3 — avg strategy accumulation

`deep_cfr.py` accumulates avg strategy in `strategy_sum[info_set_id]
+= current_strategy`. For Kuhn (12 info sets), this is a 12-key
dict. For FoW, `info_set_id` is `(to_move, observation_history)`
— astronomical.

**Three approaches:**

1. **Linear CFR weighting** — derive avg strategy from regret nets
   themselves via final-iter weighting. Doesn't store. Spec calls
   this out as "simpler variants derive avg strategy via
   time-weighted accumulation."
2. **Avg-strategy network** — separate net `strategy_net(info_feat)
   → action_probs`, trained on `(info_feat, current_strategy)`
   samples like Brown et al.
3. **Tabular avg over compressed info-set keys** — hash
   `info_set_id` to a smaller bucket. Loses info; hacky.

**Pragmatic choice for Phase 2:** option 2 (avg-strategy network).
Add `FowStrategyNet`, same input shape as `FowRegretNet`, output
softmaxed over legal actions. Train identically to the regret net
but with cross-entropy or MSE-on-probabilities loss.

Reason: Linear CFR weighting requires sampling from the regret
nets at evaluation time and averaging across iterations — fiddly
and needs all iterations' nets retained (heavy). Avg-strategy net
is simpler at the conceptual level and is the canonical Brown et
al. approach.

`deep_cfr.py` needs a small extension: when `avg_strategy_net` is
provided (FoW path), train it on the same loop; the existing
`strategy_sum` tabular accumulation runs only when
`avg_strategy_net` is None (Kuhn path).

## Files this implies

### New / modified

- `src/fow_chess/cfr/encoders.py` — implement
  `FowFactoredMarginalsEncoder`. Carries no node-level state
  itself; reads marginals from the node (Decision 1 puts them on
  `SubgameNode` via the propagation rule).
- `src/fow_chess/cfr/walker.py` — extend `SubgameNode` with
  optional `marginals_white`, `marginals_black` fields. Default
  to `None` for backward compat with Kuhn and tabular CFR.
  `apply(move)` applies the propagation rule if marginals are
  present.
- `src/fow_chess/cfr/regret_net.py` — implement `FowRegretNet`
  per Decision 2.
- `src/fow_chess/cfr/strategy_net.py` (NEW) — `FowStrategyNet`,
  identical shape to FowRegretNet.
- `src/fow_chess/cfr/deep_cfr.py` — accept optional
  `avg_strategy_net_factory`; when provided, train it on the
  trajectory's current-strategy samples; skip tabular
  `strategy_sum`.
- `tests/test_cfr_fow_encoder.py` (NEW) — property test for the
  marginal-update rule. Generates random move sequences from
  known starts, compares to a freshly-derived BeliefState. Pass
  threshold: L1 divergence between marginal-rule output and
  particle-filter output ≤ 0.3 per square, averaged across
  squares, at depth 3.
- `lab/diag/cfr_phase2b_smoke.py` (NEW) — Phase 2b smoke. Same
  shape as `cfr_phase1_smoke.py`, swapping `solve_subgame` for
  `solve_subgame_deep_cfr` and wiring the FoW encoder + nets.

### Day 4 work order

1. Write this doc (done).
2. Implement marginal-update rule in `walker.py`. Pure function;
   does not require encoder yet.
3. Write property test for the marginal-update rule. Run it.
   Decide if Option C survives or we fall back to Option A.
4. Implement `FowFactoredMarginalsEncoder` reading from
   propagated marginals.
5. Implement `FowRegretNet` and `FowStrategyNet`.
6. Extend `deep_cfr.py` to thread the strategy net.
7. Single-position smoke (5-10 iters) to confirm no crashes.
8. 38-position overnight smoke = Gate 2b.

Steps 2-3 are the gate. If the marginal-update rule's L1 error is
catastrophic (>0.6 mean), we punt to Option A (BeliefState per
node) and accept the slowdown — Gate 2b may need fewer positions
or shorter iterations to fit overnight.

## Anti-patterns this doc heads off

- **Don't bake a 4672-output regret net into the spec yet.** If
  Phase 2 passes, it might still need to migrate to per-action
  heads in Phase 3. The choice here is Phase 2 expedience.
- **Don't skip the property test.** A wrong marginal-update rule
  will silently feed garbage to the regret net; gate failure will
  be unattributable.
- **Don't pre-build BeliefStates per node "just in case".** The
  whole point of Option C is to avoid per-node particle filter
  work. If the rule's error is acceptable, stay there.
