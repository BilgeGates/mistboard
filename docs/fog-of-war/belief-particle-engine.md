# Belief Particle Engine

The Belief Particle Engine is a subtrack inside the Fog of War engine track. It
is responsible for turning a perspective-safe observation stream into a
weighted set of possible hidden-board states.

The move-selection engine consumes this output. It should not own the hidden
state generator.

## Boundary

Inputs:

- ruleset and starting position;
- our own chosen moves;
- opponent move observations;
- visibility masks;
- visible piece maps;
- own captured-square signal;
- game-over signal;
- capture/accounting facts discovered from legal perspective data.

Outputs:

- weighted board hypotheses;
- marginal piece fields;
- top-K worlds;
- hard-fact violation diagnostics;
- collapse/reseed/pruning/diversity diagnostics;
- optional tactical uncertainty summaries for move selection.

The first contract is strict:

> Belief may be uncertain, broad, or low-confidence, but it must not contradict
> hard facts in the observation stream.

## Hard Facts

Hard facts include:

- our own pieces and their current visible squares;
- visible opponent pieces;
- own pieces that disappeared because the opponent captured them;
- king-capture/game-over signals;
- piece-count facts from captures we performed;
- ruleset facts such as pawn ranks and bishop square color where currently
  modeled.

When hard facts conflict with all existing particles, the engine should recover
by generating new hypotheses from the observation. It should not preserve stale
particles that keep impossible own pieces on the board.

Soft evidence includes broad visibility mismatch, low-confidence hidden-piece
placement, and prior weights. Soft evidence can be relaxed to keep belief alive.
Hard facts cannot.

## Current Implementation

The current local implementation is still a particle filter:

- `BeliefState.update_after_own_move` applies our own move, filters by
  observation, and CSP-reseeds if no particle supports the move.
- `BeliefState.update_after_opp_move` expands opponent pseudo-legal moves,
  filters by observation and count constraints, and CSP-reseeds on hard
  observation mismatch.
- `_csp_reseed` generates constraint-satisfying particles from visible pieces,
  opponent piece counts, bishop color counts, pawn rank constraints, and side
  to move.
- `belief.jsonl` records decision, after-own-move, and after-opp-move snapshots
  for review.

This is an early recovery system, not the final architecture.

## Long-Term Shape

The long-term Belief Particle Engine should behave like its own engine:

- run continuously over an observation stream;
- enumerate or sample legal hidden-board hypotheses;
- enforce legal reachability from the full observation history;
- prioritize search over high-impact uncertainty;
- preserve diverse plausible worlds;
- expose streaming marginals and diagnostics;
- support horizontal scaling for expensive enumeration/search.

It can have its own heuristics and search policy. These optimize different
metrics than move selection:

- hard-observation consistency;
- legal reachability;
- truth-survival proxy;
- hypothesis diversity;
- tactical decision impact;
- hidden-threat preservation;
- recency and last-seen plausibility;
- compute efficiency.

## Metrics

Track this sub-engine independently from win rate:

- hard-observation contradiction count;
- Stage A and Stage B hard collapses;
- CSP reseed frequency;
- post-reseed diversity;
- low-unique-particle rows;
- truth-particle survival on replayable corpora where truth is known;
- annotated threat coverage;
- latency per update.

Win rate is downstream. A stronger move engine cannot compensate for impossible
belief state.

## Near-Term Work

1. Add artifact validation that replays saved games and flags belief snapshots
   contradicting hard observations.
2. Promote hard-observation contradiction to a blocking regression gate.
3. Build a small corpus of real belief bugs from annotated bake-offs.
4. Split soft visibility mismatch from hard material-state mismatch throughout
   Stage B recovery.
5. Replace random CSP fill with reachability-aware generation when annotations
   show plausible-looking but legally unlikely worlds.
6. Add belief-only experiments that do not run full move selection.

## Current Bug Class

The first explicit subtrack bug is from `bakeoff-v0.7.0-mirror`, game `q8`,
ply 22:

- black played `Re8xe2`;
- white could see the black rook on `e2`;
- white belief still represented the captured white bishop on `e2`;
- the cause was a relaxed constraint-only Stage-B fallback preserving particles
  that contradicted `own_capture_square`.

The fix is to treat own-piece captures and game-over as hard observation facts:
if no particle matches them, CSP-reseed from the observation instead of relaxing
the observation.
