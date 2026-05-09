# 2026-05-07 — v0.7.0 CSP belief reseed — design

A design entry. The next Tier-1 release replaces v0.6.3's degenerate
visibility-only fallback (one particle, hidden squares empty) with a
constraint-satisfaction reseed that generates N rich particles consistent
with everything we know about opp piece configuration. This position-based
belief approach is cheaper to ship after v0.6.x banked the constraints
(`opp_remaining_counts`) that make the CSP tractable.

## Motivation

v0.6.3's reseed ships a single particle from `observation.visible_pieces`
when Stage A's step 1 wipes belief. Hidden squares are empty in that
particle, so:

- Stage B can't expand opp moves the engine couldn't see (no pieces to
  expand from).
- Pre-eval per-particle scoring sees a board missing 60% of opp's force —
  the eval is wrong on average, biased toward "opp has nothing left."
- Belief diversity is 1 unique particle until Stage B's expansion fans it
  back out, which takes 4-8 plies to recover meaningful breadth.

The right reseed is a **distribution over hidden squares** consistent
with hard constraints:

1. `visible_pieces` matches observation exactly.
2. Hidden squares may have ANY piece consistent with chess rules.
3. `opp_remaining_counts` (the v0.6.0 constraint) caps how many of each
   opp piece type total exist on the board.
4. Bishop color preservation (opp's initial light-squared and dark-squared
   bishops, if not captured, must remain on their colors).
5. Pawn rank constraint (no pawns on rank 1 or 8).
6. King exists exactly once per side.

A particle generated under these constraints has the visible state right
and a *plausible* hypothesis for hidden pieces. It's wrong about hidden
positions in the same way it always was, but rich enough that Stage B's
expansion produces meaningful breadth immediately.

## When to trigger

Three candidate triggers. Pick the loosest necessary set and revisit
after measurement.

**Trigger A — Stage-A wipe (replaces v0.6.3's reseed).** When
`update_after_own_move`'s step 1 produces empty (`my_move` not pseudo-legal
in any particle). This is the high-confidence collapse case; we've already
proven (v0.6.3) that *any* recovery beats `particles=[]`. CSP reseed at
this trigger is strictly better than v0.6.3.

**Trigger B — Stage-B observation wipe.** When `update_after_opp_move`
falls all the way to "all expansions" rollback (no particle satisfies
obs+constraint, no particle satisfies constraint-only). v0.6.0 added this
fallback; v0.7.0 should reseed instead.

**Trigger C — diversity collapse without total wipe.** When
`unique_count` drops below a threshold (e.g., 5) even if particles > 0.
This is preemptive — adds CSP particles to a thin belief before it
collapses entirely. Risk: spurious diversity at moments when belief is
*correctly* concentrated (just before a forced sequence).

**Recommendation for v0.7.0:** Triggers A + B. Skip C — overlaps with
v0.6.0's three-tier fallback in update_after_opp_move and adds noise at
moments belief is rightfully tight.

## What to constrain

Hard constraints (always enforced; particle violating any is rejected
during generation):

- **Visible match.** Visible squares match `observation.visible_pieces`
  exactly (including empty visible squares).
- **Piece-count cap.** Per piece type T, opp piece count on the particle
  ≤ `opp_remaining_counts[T]`. Promotion edge cases under-counted (the
  v0.6.0 caveat carries over).
- **King uniqueness.** Exactly one opp king on the board (visible or
  hidden).
- **No pawns on rank 1 or 8.** Standard chess rule; pawns there must be
  promoted, which would have been observed.
- **Bishop color.** Opp's bishops (visible + hidden) split across light
  and dark squares as observed at game start, modulo captures. Tracked
  separately as `opp_bishop_colors_remaining: {LIGHT: int, DARK: int}`.

Soft constraints (used as sampling priors when available; particle isn't
rejected if it violates):

- **Spatial locality.** Opp pieces are more likely on squares near where
  we last saw them. (Requires tracking last-seen positions — a separate
  module.)
- **Move-history reachability.** A particle should be reachable from the
  canonical start by *some* sequence of legal moves consistent with what
  we've observed. This is hard to enforce exactly; CSP would only check a
  weak version (no pawn jumped a file without capturing, etc.).

**Recommendation for v0.7.0:** Hard constraints only. Spatial locality
deferred — needs a per-piece tracker that doesn't exist yet.

## How to sample

Three algorithmic options. Each has the same correctness contract (output
particles satisfy hard constraints) but different efficiency / diversity
profiles.

### Option A — Random fill with rejection

```
For each particle slot in 1..N:
  Place visible_pieces on a fresh empty board.
  Compute hidden_squares = SQUARES \ visibility_mask.
  Compute pieces_to_place by piece type from opp_remaining_counts
    minus what's already visible.
  Shuffle hidden_squares.
  For each piece in pieces_to_place:
    Find next hidden square consistent with constraints
      (pawns: rank 2-7; bishops: matching color; etc.).
    Place piece there.
    If no valid square remains: reject particle, restart slot.
  Set turn to opp.
  Validate king count. If invalid, restart slot.
  Add to particle list.
```

**Pros:** simple, easy to test. Each particle independent → trivially
parallel.

**Cons:** rejection rate scales with constraint tightness. In late-game
positions where opp has 2-3 pieces total, almost every random placement
satisfies constraints; in early-game with 14 pieces, the rejection
rate stays low because hidden_squares is also large. Expected fine.

**Worst case:** when `opp_remaining_counts` for any piece type ≤ visible
count of that type for that piece (i.e., we already see all remaining
of that type), the only thing to place is the *other* piece types — which
shouldn't fail.

### Option B — Constraint propagation (AC-3)

Maintain a domain per hidden square (set of pieces that could go there).
Iteratively reduce domains by enforcing arc consistency. Once domains
stabilize, sample one particle by choosing a piece per square from its
domain.

**Pros:** propagation captures non-local constraints (bishop color, pawn
rank).

**Cons:** higher per-particle cost; harder to randomize. Risk of
generating identical particles when domains reduce to singletons.

### Option C — Backtracking with smart variable ordering

Process pieces in order of constraint-tightness (king first, then bishops
by color, then pawns by rank constraints, then minor/major pieces). At
each step, choose a hidden square uniformly from valid squares for that
piece. If no valid square, backtrack one piece.

**Pros:** never produces invalid particles. Natural diversity if random
square choice. No rejection cycles.

**Cons:** more code than A.

**Recommendation for v0.7.0:** **Option A.** Simplicity beats
optimization here. We can swap to C if profile shows A's rejection rate
> 30%.

## Integration

Replace v0.6.3's reseed branch in `BeliefState.update_after_own_move`:

```python
elif observation is not None:
    self.particles, self.weights = _csp_reseed(
        observation,
        self.opp_remaining_counts,
        self.perspective,
        n=self.target_n,
        rng=self.rng,
    )
```

Add the same call in `update_after_opp_move`'s "all expansions" rollback
branch (Trigger B).

Track in trace: `csp_reseed_fired: bool`, `csp_reseed_count: int`. Belief
debug viz (the design doc landed earlier today) renders these specially —
a CSP reseed should be visually obvious in the heatmap.

## File sites

- `research/python-fow-lab/src/fow_chess/belief.py` — add `_csp_reseed()`
  function at module level (not a method, since it's pure transform).
  Replace v0.6.3's visibility-only fallback in `update_after_own_move`.
  Add Trigger B in `update_after_opp_move`.
- `research/python-fow-lab/src/fow_chess/strategies.py` — `_emit_trace`
  surfaces csp_reseed_fired/count.
- `research/python-fow-lab/tests/test_belief.py` — three tests:
  CSP reseed satisfies hard constraints; CSP reseed at Stage A wipe
  produces ≥1 valid particle; bishop-color constraint pruned.

## Open questions

1. **What N for the reseed?** `target_n` (the existing 256/512 default)
   or smaller (e.g., 64)? Larger N gives richer belief but increases per-
   reseed compute. Soft cap to `min(target_n, 64)` for v1, scale up
   if measurement shows the smaller pool degrades belief quality.
2. **Bishop color tracking — where does it live?** New
   `opp_bishop_colors_remaining` dict on BeliefState, or derived on the
   fly from initial position + capture history? Initial position only
   has 1 light + 1 dark per side, captures decrement when we capture a
   bishop on a known square. v0.6.x's `register_capture(BISHOP)` doesn't
   track which color was taken. Adds 1-2 LOC to capture detection
   (square color of the capture); lock that in for v0.7.0.
3. **What happens when opp_remaining_counts is wrong?** v0.6.0 doesn't
   track promotions — opp pawn → opp queen leaves us with `queen=1`
   when reality is `queen=2`. CSP reseed would generate particles with
   max 1 queen, never the truth. Mitigation: track promotions via the
   "we observed a pawn on rank 8" signal in opp's move stream. Defer
   to v0.7.1 unless mirror data shows promotions are common.

## Validation plan

After v0.7.0 ships, re-run `bakeoff-v0.6.3-mirror` (and a fresh
v0.7.0-mirror) and compare:

- Belief collapses (Stage A): expect → 0.
- Avg unique particles pre-B / post-B: expect ≥ v0.6.0 baseline.
- Stockfish-truth agreement: expect to hold or improve.
- Win rate vs prior version: target +0–3pp.

The CSP reseed is also a good fit for the belief debug viz validation
target. Loading a v0.7.0-mirror game with verbose-belief in the lab UI
should make the reseed events visually obvious — large diversity jumps
on specific plies — and let us audit whether the reseeded particles look
reasonable.

## Lesson (anticipated)

If the visibility-only reseed had been the architectural choice from
day one, we'd never have built `opp_remaining_counts` — it solves a
problem visibility-only doesn't have. v0.6.x's incremental adds
(piece-count tracking → constraint filter → reseed) exposed the
constraint set we needed to do CSP correctly. Shipping the
patches in order builds the constraint vocabulary; the architectural
move comes after, when the constraints are concrete instead of
hypothetical. This is a recurring pattern: the right architectural
move is one or two patches downstream of the first plausible
opportunity.
