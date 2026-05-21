# CFR Phase 2 — Deep CFR Architecture Spec

Pre-implementation contract for replacing the tabular regret tables from
Phase 1 with a neural regret network (Brown et al. 2019 *Deep CFR*).
Phase 2 stays local on Mac CPU — see "Local Mac feasibility" below.

The decision shaped by the user 2026-05-20: derisk Deep CFR locally
before any Modal/GPU spend. Phase 2 runs at **$0**. Modal/GPU is
reserved for Phase 3 (neural belief encoder + larger training corpus).

## Purpose

Validate that **neural function approximation of regret tables** works
for FoW at smoke scale. Two gates:

- **Gate 2a:** Kuhn poker — Deep CFR converges to the known Nash value
  (−1/18) within tolerance. Same correctness gate as tabular but with
  the regret network in place of a regret dict.
- **Gate 2b:** FoW 38-position smoke — Deep CFR matches or exceeds
  tabular Phase 1b's argmax-match-suggested rate (28.9%) and
  direction-correct rate (82%).

If both pass: Deep CFR is correctly implemented, the architecture
generalizes to imperfect-info-chess scale, and the bootstrap loop
(Phase 3+) is worth the GPU investment.

If either fails: stop, document, decide between fixing the
implementation or accepting that neural CFR doesn't scale to FoW at
our resource level.

## Existing substrate (no changes needed)

- `src/fow_chess/cfr/walker.py` — `SubgameNode`, info-set IDs,
  observation history tracking.
- `src/fow_chess/cfr/tabular.py` — tabular CFR. Baseline for Gate 2b
  comparison. Stays in tree as production CFR until Deep CFR ships.
- `src/fow_chess/cfr/leaf_eval.py` — `material_leaf_eval` (Phase 1)
  and `hybrid_fog_leaf_eval` (Phase 1b). Used as leaf evaluator at the
  depth bound in both tabular and Deep CFR.
- `tests/test_cfr_walker.py`, `tests/test_cfr_kuhn.py`,
  `tests/test_cfr_fow_smoke.py` — existing test coverage; should
  continue to pass after Phase 2 lands.

## New modules

### `src/fow_chess/cfr/regret_net.py`

PyTorch regret network. One per traversing player.

**Architecture (FoW, ~5–10M params):**
- **Input — info-set features** (~900 floats):
  - Factored marginals: 64 × 12 = 768 (probability of each piece type
    on each square from the player's belief).
  - Own-piece-visible mask: 64 (1 where own piece is, 0 elsewhere).
  - Last-seen heatmap: 64 (per-square decay since last observation).
- **Input — action features** (133 floats per legal action):
  - From-square: 64 one-hot.
  - To-square: 64 one-hot.
  - Promotion: 5 one-hot (none, Q, R, B, N).
- **Hidden:** 2-3 FC layers, width 256-512, ReLU.
- **Output:** scalar regret per action.

The natural shape is: encode info set once → per-action MLP head →
regret per action. Concretely:

```
info_set_emb = info_encoder(info_features)        # [B, 256]
action_embs  = action_encoder(action_features)    # [B, A, 256]
combined     = info_set_emb.unsqueeze(1) + action_embs  # [B, A, 256]
regrets      = output_head(combined).squeeze(-1)  # [B, A]
```

**Architecture (Kuhn, ~10k params):**
- Input: (player_id, own_card, history_length, history_action_seq)
  → small embedding lookup.
- Hidden: 1 FC layer, width 32.
- Output: regret per action (2 actions max in Kuhn).

Kuhn shape is intentionally small so Gate 2a runs in minutes.

### `src/fow_chess/cfr/encoders.py`

Encoders that produce network inputs from game state.

- `encode_info_set_fow(node) -> torch.Tensor` — computes the ~900-float
  info-set vector from a `SubgameNode`. **Key Phase 3 decision:**
  derive factored marginals from a `BeliefState` reconstructed by
  replaying observation history from the subgame root. For Phase 2,
  we can simplify by reading the marginals at the SUBGAME ROOT (built
  by the smoke harness) and propagating manually as we walk. This
  approximation is fine for the gate — Phase 3 will move to a true
  encoder.
- `encode_action(action: chess.Move) -> torch.Tensor` — 133-float
  one-hot.
- `encode_info_set_kuhn(node) -> torch.Tensor` — tiny per-Kuhn-node
  encoder for Gate 2a.

### `src/fow_chess/cfr/deep_cfr.py`

The training loop. Public API mirrors `tabular.solve_subgame`:

```python
@dataclass
class DeepCFRSolution:
    strategy_at_root: dict[Action, float]
    value_at_root: float
    iterations: int
    info_set_count: int  # estimated by counting unique encoded info sets
    regret_net_states: dict  # trained model state_dicts per player


def solve_subgame(
    root,
    depth: int,
    leaf_eval,
    iterations: int = 50,
    trajectories_per_iter: int = 100,
    regret_train_epochs: int = 10,
    regret_batch_size: int = 256,
    regret_lr: float = 1e-3,
    info_encoder,                   # callable: node -> Tensor
    action_encoder,                 # callable: action -> Tensor
    regret_net_factory,             # callable: () -> nn.Module
    avg_strategy_net_factory=None,  # optional separate net for avg strategy
    device: str = "cpu",            # "mps" on Apple Silicon, "cuda" on Modal
    ...
) -> DeepCFRSolution
```

Per iteration (Brown et al. Algorithm 1 with external sampling):

1. For each traversing player T ∈ {WHITE, BLACK}:
   a. Walk `trajectories_per_iter` trajectories from `root`. At T-nodes
      enumerate all actions and compute counterfactual values; at
      non-T nodes sample one action from non-T's current strategy
      (via non-T's regret network).
   b. Per visited T-node, store `(info_set_features, action_features,
      regret)` in T's training set.
   c. Per visited non-T node where T's strategy was sampled, store
      `(info_set_features, sampled_action_index)` in T's avg-strategy
      training set (for the optional separate avg-strategy network).
2. After both players' traversals, train each player's regret network
   on its accumulated samples for `regret_train_epochs` epochs with
   batch size `regret_batch_size`.

After `iterations` rounds:

- Train avg-strategy network on accumulated samples (if used), OR
  derive average strategy directly via Linear-CFR-style time
  weighting.
- Extract `strategy_at_root` by sampling actions from the average
  strategy at the root info set.
- Estimate `value_at_root` via Monte-Carlo rollouts under the average
  strategy (mirror `tabular._rollout_with_avg_strategy`).

### `tests/test_cfr_deep_kuhn.py`

Gate 2a. Mirror of `test_cfr_kuhn.py` with `solve_subgame` swapped to
the Deep CFR version. Looser tolerance (0.10 vs 0.05) to account for
neural-approximation noise. Run on CPU; expect minutes total.

## Local Mac feasibility

**Gate 2a (Kuhn):** Trivial. 12 info sets, ~10k-param network, ~50
training iterations. Minutes on Mac CPU.

**Gate 2b (FoW 38-position smoke):**
- Per Deep CFR iteration on one position:
  - Trajectory collection: ~100 trajectories × ~900 visits each = ~90k
    samples. ~30s with batched inference.
  - Regret-net training: 90k samples × 10 epochs / batch 256 = ~3500
    batch updates. ~5-10 min on CPU.
  - Per iteration: ~6-12 min.
- Convergence: ~30-50 iterations.
- Per position: 3-10 hours.
- Per smoke (38 positions, parallel via multiprocessing on M-series
  cores): one **overnight run** (~5-15 hours wall).

Apple Silicon MPS backend (PyTorch device `"mps"`) accelerates
~2-5× depending on model size; falls back to CPU on Intel Mac.

## File structure summary

```
research/python-fow-lab/
├── src/fow_chess/cfr/
│   ├── walker.py            (existing)
│   ├── tabular.py           (existing)
│   ├── leaf_eval.py         (existing)
│   ├── encoders.py          NEW
│   ├── regret_net.py        NEW
│   └── deep_cfr.py          NEW
└── tests/
    ├── test_cfr_walker.py   (existing)
    ├── test_cfr_kuhn.py     (existing — tabular Kuhn)
    ├── test_cfr_fow_smoke.py (existing — tabular FoW smoke)
    └── test_cfr_deep_kuhn.py NEW (Gate 2a)
```

## Implementation milestones (~1 week)

- **Day 1**: `regret_net.py` + `encoders.py` skeletons. Pure PyTorch
  modules, no game-logic integration yet. Unit tests for shape
  correctness.
- **Day 2**: `deep_cfr.py` training loop scaffold. Wire to tabular's
  walker. Kuhn encoder. Run smoke iteration to confirm no crashes.
- **Day 3**: Gate 2a validation. Tune iteration count and network
  architecture until Kuhn converges to ~−1/18 within tolerance.
- **Day 4**: FoW factored-marginals encoder. Probably the trickiest
  piece — needs `BeliefState` to be derivable per node. Could
  simplify by precomputing marginals at subgame root and propagating
  via existing belief filter updates.
- **Day 5**: First single-position FoW Deep CFR run. Confirm
  end-to-end no crashes; sanity-check the output strategy.
- **Day 6**: Adapt `cfr_phase1_smoke.py` to use Deep CFR. Launch the
  38-position smoke in background overnight.
- **Day 7**: Analyze results. Write Phase 2 report. Decide on Phase 3.

## Open design questions

1. **Sample storage**: in-memory list vs disk-persisted. In-memory is
   simpler for Phase 2 scale; disk needed when training corpora grow
   (Phase 3). Defer.
2. **Per-action embedding vs full action matrix**: per-action is
   conceptually cleaner; matrix is faster batched. Start per-action;
   profile if Gate 2b is too slow.
3. **Separate avg-strategy network**: Deep CFR paper uses one; simpler
   variants derive avg strategy via time-weighted accumulation of
   current strategies. Start without separate net; add if needed.
4. **Linear CFR weighting**: weight later iterations more in the avg
   strategy. Improves convergence. Add in Day 3 tuning if Kuhn is
   slow to converge.
5. **MPS vs CPU on Apple Silicon**: try MPS first; fall back to CPU
   on numerical bugs (MPS has occasional precision issues with
   non-default ops). All math should agree between backends.
6. **Network checkpointing**: save trained regret nets at end of run
   so we can re-evaluate at different positions without retraining.
   Add by Day 5.

## Phase 2 success → Phase 3 entry conditions

If both gates pass, Phase 3 (neural belief encoder + GPU/Modal)
becomes the next conversation. The success criteria for Phase 3
remain as documented in
`engine_cfr_phased_plan_2026_05_20.md` (memory):

- +10pp argmax-match improvement over Phase 1b's best result, AND
- per-position solve time ≤ 60s on GPU.

If Phase 2 fails:
- Gate 2a fail → implementation bug in Deep CFR. Debug locally;
  no budget impact.
- Gate 2b fail → neural function approximation doesn't scale to
  FoW info-set complexity at our setup. Suggests either bigger
  networks (more GPU compute) or that the regret-network
  architecture itself is wrong (different problem than Phase 3
  belief-encoder). Pause and reassess strategic direction.

## Anti-patterns to refuse

- **Don't reach for Modal/GPU before Phase 2 passes.** Mac CPU is
  the gate; spend nothing until we've proven the architecture works.
- **Don't tune network architecture aggressively before Kuhn
  converges.** Kuhn is the algorithmic correctness gate; if vanilla
  Deep CFR can't solve Kuhn, more layers won't help.
- **Don't chase a 100% argmax-match rate on Gate 2b.** The Phase 1c
  hand-validation showed 75% defensible — the metric itself has a
  ceiling. Gate 2b is "match or exceed Phase 1b's 28.9%," not
  "beat human judgment."

## Phase 3 preview (out of scope for Phase 2)

Phase 3 replaces the static "marginals derived from BeliefState"
input encoder with a **learned belief encoder** that takes raw
observation history and produces a representation. Trained
end-to-end with the regret network via gradient flow through
both. Same Bet C bootstrap loop architecture from
`docs/fog-of-war/engine-equilibrium-value-corpus.md`.

This is the GPU-budgeted phase ($40-60). Don't design for Phase 3
in Phase 2 — keep encoders.py boundary clean so the Phase 3
encoder swaps in cleanly.
