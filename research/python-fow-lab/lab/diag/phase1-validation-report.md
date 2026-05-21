# Phase 1 Validation Report — Tabular CFR vs fow_evaluator

Validation experiment for the Bet C bootstrap loop sketched in
`docs/fog-of-war/engine-equilibrium-value-corpus.md`. The pre-commit gate
asks: **does tabular CFR's equilibrium output give a better positional
signal than fow_evaluator's direct output?** If yes, the offline Deep CFR
loop is worth building. If no, the architecture needs redesign before
scaling.

## TL;DR

**Soft no-go for CFR + material leaf at depth 3.** Argmax-match-human-
suggested rate is 24% for CFR vs 26% for fow_evaluator — essentially
equivalent. The original Phase 1 hypothesis (CFR's argmax cleanly beats
fow's argmax on annotated blunder positions) is **not supported** by
n=38 well-formed positions.

Three honest interpretations:

1. **Material leaf is too weak.** Run Phase 1b with a fow-derived leaf
   evaluator and re-test.
2. **Argmax-match-human is too strict.** Many positions have multiple
   reasonable improvements over the played blunder; CFR and fow may pick
   different "best" moves that are equally defensible. No ground truth.
3. **CFR doesn't add real value over chess-family heuristics on FoW** at
   this search depth.

Without ground truth or further leaf-eval experiments we can't
distinguish these. **Recommendation: run Phase 1b before committing to
Bet C bootstrap loop.**

## Setup

Substrate (committed 2026-05-20 in `acf5ec3`):

- `src/fow_chess/cfr/walker.py` — `SubgameNode`: truth board + per-player
  observation history + depth. `info_set_id()` is a pure function of
  `(to_move, observation_history)` — no truth leakage. Property tests in
  `tests/test_cfr_walker.py` (17 passing).
- `src/fow_chess/cfr/tabular.py` — vanilla CFR with external sampling on
  opponent nodes, generic over node duck-type, chance-node support.
  Validated on Kuhn poker: value converges to −1/18 within 0.05 tolerance
  at 5000 iterations; info-set count = 12 (analytical).
- `src/fow_chess/cfr/leaf_eval.py` — `material_leaf_eval`: tanh-normalized
  material balance.

## Methodology

### Position corpus

`feedback/annotations.jsonl` holds 194 human annotations across multiple
bake-offs. Severity distribution: 83 major, 67 minor, 31 good, 13 neutral.

Filter (`_is_well_formed` in `cfr_phase1_smoke.py`):

1. Severity ∈ {major, minor}.
2. `suggested_move_uci` ≠ null.
3. Tag `"opponent-blunder"` excluded (suggested move is for opponent, not
   played-color).
4. Board reconstruction must succeed (some annotations involve castling
   or en-passant edge cases where our reconstruction loses fidelity).
5. Suggested move must be pseudo-legal in the reconstructed `board_before`.

Result: 38 well-formed positions (20 major + 18 minor).

### Board reconstruction

The annotation provides `board_fen_after` (placement after the played
move). We synthesize a full FEN with default castling/ep/halfmove and
reverse the played move by trying each candidate captured piece on the
destination square; the unique candidate whose forward application
reproduces `board_fen_after` is accepted. See `_reconstruct_board_before`.

Castling rights are not strictly recoverable — this excludes a few
castling-suggested annotations (e.g. `a3b5 → e1g1`) at filter time.

### CFR settings

- Depth bound: 3 plies from root.
- Iterations: 500.
- Value estimate: 500 Monte-Carlo rollouts under accumulated average
  strategy.
- Leaf eval: `material_leaf_eval` (tanh material in [-1, 1]).
- External sampling on opponent nodes; enumerate on traverser nodes.

### Metrics

For each position:

- `direction_correct`: evaluator ranks suggested > played.
- `argmax_match_suggested`: evaluator's top move equals the human's
  suggested move.

Reported aggregate: hit rate of each metric across the 38 positions for
both evaluators.

## Results

### Aggregate

|  | CFR | fow_evaluator |
|---|---|---|
| Direction hit rate (suggested > played) | 71% | 74% |
| Argmax matches suggested | **24%** | **26%** |
| Total wall (14 workers, parallel) | 575 s | — |
| Average per-position CFR wall | 175 s | — |

CFR and fow are essentially equivalent on both metrics.

### Argmax disagreement structure

```
                              | matched suggested
  -----------------------------+-----------------------
  CFR == fow argmax            |  5/ 9 (56%)
  CFR != fow argmax            |  9/29 (31%, at least one)
  -----------------------------+-----------------------
  Both match suggested:        |  5
  CFR only matches:            |  4
  fow only matches:            |  5
  Neither matches:             | 24  (63% of all positions)
```

The two evaluators agree on argmax only **24% of the time**. They are
independently producing different rankings; the disagreement isn't
small-magnitude noise.

In 63% of positions, neither evaluator picks the human's suggested move
as the top choice. This isn't a CFR failure — it's that argmax-match-
human is a strict metric. Human "suggested" is one opinion among
multiple reasonable improvements over the played blunder.

### CFR confidence buckets

| CFR top-action prob | n | CFR argmax match | fow argmax match | CFR dir correct |
|---|---|---|---|---|
| [0.00, 0.30) diffuse | 7 | 0% | 0% | 71% |
| [0.30, 0.50) soft | 8 | 12% | 0% | 50% |
| [0.50, 0.80) medium | 9 | 44% | 56% | 89% |
| [0.80, 1.01] strong | 14 | 29% | 36% | 71% |

CFR is confident (≥0.5 top-action probability) in 23/38 positions —
about 60%. But high confidence doesn't translate to high argmax-match
rate. CFR is often confidently picking a move that's neither played nor
suggested.

Sample of CFR confident-but-different cases:

- `g8f6 → c7c6`: CFR picks d8d5 at 98% prob; fow also picks d8d5.
- `g7g6 → c7c6`: CFR picks d8d5 at 95%; fow also picks d8d5.
- `c3b1 → h4f3`: CFR picks h5f7 at 86%; fow picks suggested h4f3.

When CFR is confident and disagrees with the human, fow often agrees with
CFR's choice — suggesting both evaluators see something the human missed
or that the human's "suggested" was one of multiple reasonable options.

## Interpretation

The original hypothesis was: CFR's search + regret minimization extracts
strategic content that fow_evaluator's 1-ply scoring misses, so CFR
should match human judgment more often.

**The data doesn't support this for the specific architecture tested**
(depth 3 + material leaf). Three real interpretations remain:

1. **Material leaf is too weak.** It captures only material balance,
   not fog-specific value (king threats through fog, visibility trade-
   offs, fog risk). CFR's search amplifies whatever the leaf evaluator
   knows; if the leaf is chess-only, the search produces chess-only
   answers. **A fow_evaluator-derived leaf might change the picture.**
2. **Argmax-match-human is too strict a metric.** Many positions admit
   multiple reasonable improvements over the played blunder. We have no
   ground truth that the human's "suggested" is the *uniquely best*
   alternative; in 63% of positions both evaluators reject it.
3. **CFR doesn't add value over chess-family heuristics on FoW.** This
   would be a strong negative result; it would mean Bet C's bootstrap
   loop is unlikely to converge to a stronger value net than what
   fow_evaluator already encodes.

Without ground truth or further experiments we can't distinguish (1)
from (3). Interpretation (2) is partially true regardless and means the
metric should be reconsidered for Phase 1b.

## Recommendations

**Phase 1b — repeat the smoke with a fow-derived leaf evaluator.** Two
implementation options:

- **Cheap**: hybrid position eval `material_score + fog_discount_term`
  (both already exist in `evaluator.py` and are position-only/fast).
  Adds the simplest fog-specific signal without the cost of running
  full `fow_evaluator` at every leaf.
- **Expensive but principled**: full `fow_evaluator` wrapped as a
  position score via `max over legal moves of fow_evaluator(board, move,
  perspective)`. Requires caching to make tractable; ~50× slower per
  leaf than `material_leaf_eval`.

Start with the cheap version. If it moves the argmax-match rate
meaningfully (≥10pp lift over fow_evaluator standalone), Bet C is alive
and worth building. If it doesn't, interpretation (3) is more likely
true and Bet C needs structural redesign.

**Phase 1c (optional, only if Phase 1b passes)** — re-test the metric
itself by hand-validating ~10 cases where neither evaluator matches the
human. Are those cases where the evaluator's choice is actually defensible?
This calibrates how much weight to put on argmax-match-human as a metric.

## Phase 2 (Bet C bootstrap loop) entry conditions

Before committing to Phase 2:

- Phase 1b shows ≥10pp argmax-match rate improvement over fow_evaluator
  standalone on n≥30 positions.
- Per-position solve time at the chosen settings ≤ 60s (so a 10k-position
  training corpus is tractable in ≤ 10 hours per loop iteration on
  parallel workers).
- The CFR confidence signal is calibrated — high-confidence outputs
  should be reliably correct on a held-out hand-verified set.

If any of these don't hold, the bootstrap loop's training signal is
noisy and the loop is unlikely to converge.

## Artifacts

- `cfr-phase1-smoke-results.json` — full per-position results from the
  38-position run.
- `cfr_deep_dive.py` — single-position deep-dive script used to surface
  the timing data and the reconstruction edge cases.
- `cfr_phase1_smoke.py` — parallel multi-position smoke harness.
- `cfr-walker-test-plan.md` — mechanics-correctness contract for the
  walker.
- Commit `acf5ec3` — substrate (walker, tabular CFR, leaf eval, tests).
