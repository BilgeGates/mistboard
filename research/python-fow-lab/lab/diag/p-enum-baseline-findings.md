# P enumerator baseline findings (2026-05-23)

Phase A3 of the Obscuro replication.
Companion to `lab/diag/p-enum-baseline-stats.json`.

## TL;DR

| Gate | Result |
|---|---|
| **Correctness:** truth-in-P held at every ply | **0 violations / 486 plies** ✓ |
| **|P| cardinality matches Obscuro's reported range** | mean 9.8-12.8K, max 950K ✓ |
| Median per-ply update time | 77 ms |
| p99 per-ply update time | 126 s |
| Max per-ply update time | 281 s |

Eager full-`P` enumeration is **correct** on real adversarial FoW
play. It is **not** fast enough to use directly inside a live engine
when |P| > ~10⁵ — the tail of the update-time distribution makes that
infeasible without restriction. This is exactly the design constraint
KLUSS (A5) is built to handle: restrict the active subgame to a small
neighborhood of the current infoset, regardless of how large the full
|P| has grown.

## Setup

* 35 real Tier-1 engine bakeoff games from 4 directories
  (`feedback/mirror-mcts-200-depth8/`, `mirror-mcts-v0.1/`,
  `mirror-mcts-v0.2/`, `mirror-v0.9.1-2026-05-16/`).
* 486 plies of valid replay total. Game lengths 7-40 plies.
* `_MAX_P_SIZE = 200_000` per-game early-exit (stats up to bail
  still recorded).
* 14 games (40%) hit the bail before game end — concentrated in
  the longer 12+ ply games. The other 21 games (60%) ran to game end
  or natural king-capture without |P| explosion.

## Cardinality stats

|P_white| from white's POV (uncertainty about black):

| stat | value |
|---|---|
| min | 1 |
| median | 191 |
| mean | 12,774 |
| p90 | 15,403 |
| p99 | 441,227 |
| max | 950,161 |

|P_black| from black's POV (uncertainty about white):

| stat | value |
|---|---|
| min | 1 |
| median | 20 |
| mean | 9,842 |
| p90 | 21,706 |
| p99 | 184,816 |
| max | 446,657 |

**Comparison to Obscuro paper** (Zhang & Sandholm 2026):

| | Obscuro reported | Our enumerator (35-game sample) |
|---|---|---|
| avg \|P\| | ≈ 17K | mean 9.8-12.8K |
| max \|P\| | ~10⁶ | 950K (just under 10⁶) |

We're in the right neighborhood. Lower mean is consistent with our
sample including many short games (engine bakeoffs that ended in
quick king-capture). The 10⁶ ceiling matches.

## Per-update time stats

Per-ply enumerator update (own or opp move):

| stat | value |
|---|---|
| min | 0.7 ms |
| median | 77 ms |
| mean | 6,541 ms |
| p90 | 8.3 s |
| p99 | 125.8 s |
| max | 281.5 s |

Update time scales roughly linearly in |P_prev| × (avg branching factor).
Most plies update in < 100 ms; the long tail comes from positions
where |P| has already grown into the 100K+ range and each new opp
move expands to the full pseudo-legal-move set per candidate.

## What this means for downstream stages

1. **A4 (one-sided GT-CFR)** — operates on the *imperfect-information
   subgame*, not on full P. KLUSS will restrict the relevant nodes.
   We do NOT need a faster enumerator before A4; we need the
   restricting mechanism around it.

2. **A5 (KLUSS)** — this is where the |P| explosion is meant to be
   handled. KLUSS keeps only nodes within distance < 2 in the
   knowledge graph of the current infoset. Even when |P| is 10⁶
   globally, the KLUSS-active subgame is small (Obscuro reports
   hundreds to thousands of infosets, not millions).

3. **Per-move latency** — at p99 = 125 s per enumerator update, we
   could not use this enumerator naively in live PvP (3+2 time
   control). But the enumerator is incremental — each move appends
   one update. Cumulative cost amortizes across the game IF we keep
   `PEnumerator` instances alive across moves. Live latency = one
   update, not full re-enumeration.

4. **No sampling fallback yet** — Obscuro's approach: sample
   `I ⊆ P` of a few hundred positions even though full |P| is up
   to 10⁶. We can add a sampling fallback in A5 if KLUSS alone
   doesn't bound active reasoning enough.

## Caveats

* `_MAX_P_SIZE` bail means we don't validate truth-in-P past the
  bail point for 14 games. Truth-in-P held at every ply *up to*
  the bail — but extrapolating past it requires either a faster
  enumerator or the KLUSS restriction.
* Sample is engine-vs-engine bakeoff games, not human PvP. Human
  play tends toward longer games with more positional structure;
  fog clears differently. Need a human-PvP corpus for full coverage.
* The asymmetry |P_white| > |P_black| is artifact of our sample:
  white-as-tier1 vs random/mcts opponents had more diverse opp moves
  than the reverse. Both sides would equalize on a balanced corpus.

## Next steps

A3 is structurally done. The enumerator is correct, fast in the
median, and the failure modes are understood. The next move is **A4
(one-sided GT-CFR)** — the tree-expansion scheduler that consumes
`P` and grows the search tree adaptively. After A4 we have all the
pieces to start A5 (KLUSS) where |P| explosion becomes manageable.

`p_enum_replay_stats.py` saves stats to
`p-enum-baseline-stats.json` for any future regression comparison.
