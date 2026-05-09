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
- own legal-move affordances and movement restrictions;
- visible piece maps;
- own captured-square signal;
- game-over signal;
- capture/accounting facts discovered from legal perspective data.

Outputs:

- weighted board hypotheses;
- marginal piece fields;
- top-K worlds;
- explicit hard-fact summaries for UI/debug surfaces;
- hard-fact violation diagnostics;
- collapse/reseed/pruning/diversity diagnostics;
- optional tactical uncertainty summaries for move selection.

The first contract is strict:

> Belief may be uncertain, broad, or low-confidence, but it must not contradict
> hard facts in the observation stream.

## Hard Facts

Hard facts include:

- our own pieces and their current visible squares;
- movement restrictions implied by own legal moves, such as a pawn being
  blockaded when its forward push is unavailable;
- visible opponent pieces, including pieces visible for only one ply before
  they leave the visibility mask;
- own pieces that disappeared because the opponent captured them;
- opponent occupancy on an ordinary capture landing square, even when the
  capturer's exact type is hidden;
- king-capture/game-over signals;
- piece-count facts from captures we performed;
- ruleset facts such as pawn ranks and bishop square color where currently
  modeled.
- individual piece facts, such as "this bishop token is still dark-square
  bound" or "the piece that landed here must be the same token that vacated
  that source";
- state/right facts, such as castling rights, en-passant availability,
  promotion/accounting state, clocks/counters where relevant, and variant
  rights such as Draft960 castling semantics.

The model must not be square-only. Square occupancy is one useful fact family,
but the durable belief system needs separate categories for:

- **square facts**: occupancy, visible emptiness, blockers, capture landings;
- **piece facts**: identity tokens, color-complex constraints, last-known piece
  continuity, possible source/landing relationships;
- **state facts**: castling rights, en-passant state, promotion accounting,
  side-to-move, game-over, and variant rule state.

Exact piece facts expire by transition, not by clock tick. When the opponent
moves, a prior fact like `h1:white-rook` remains strict for every branch whose
expanded move starts somewhere else. It may expire only on branches where the
opponent move starts on `h1` with that rook, or where a later visible
observation/capture explicitly invalidates it. Repair paths are stricter:
because repair may synthesize the observed transition after an expansion miss,
they must preserve unrelated exact piece facts rather than treating the
pre-repair candidate move as proof that the piece moved.

## Particle Budget And Diversity

The particle lane has two separate budgets:

- `target_n`: how many belief hypotheses the tracker tries to carry between
  observations.
- `max_particles`: how many carried hypotheses the move selector evaluates per
  candidate move.

Raising `target_n` increases observation-stream coverage but also increases
Stage B expansion cost roughly as `particles * opponent_legal_moves`. Raising
`max_particles` increases decision quality only after the belief set already
contains useful diversity; it does not fix a collapsed belief.

As of v0.7.18, resampling is diversity-preserving. If the update has fewer
surviving candidates than `target_n`, keep them all with normalized weights
instead of padding duplicates. If it has more than `target_n`, sample without
replacement and preserve selected posterior weights. This matches the FOW use
case better than classic replacement resampling: duplicate particles do not add
new hypotheses, and the evaluator already consumes weights.

As of v0.7.19, Stage A treats a tiny nonzero post-own-move survivor set as a
near-collapse, not success. If our own move is legal in the belief but the
newly revealed fog/visible-piece observation leaves only a handful of matching
worlds, Stage A supplements those survivors with hard-observation repair. This
is the path where increasing `target_n` should matter: higher budgets give
repair more room to preserve plausible worlds instead of letting one exact
survivor dominate the whole belief.

As of v0.7.20, the same near-collapse supplement applies to Stage B. If an
opponent move's observation leaves only a tiny exact survivor set, supplement
with repaired count-valid expansions before resampling. This fixes the
game-17/ply-39 pattern where Stage B dropped from dozens of hypotheses to two
and the next move was played from an artificially narrow belief. The tradeoff is
explicit: Stage B repair can generate thousands of candidates, so the next
engineering work is profiling and caching rather than assuming larger
`target_n` is free.

The trace now profiles that tradeoff directly. Each Stage A/B update records
elapsed milliseconds, filter/expand time, repair time, CSP time, resample time,
expanded candidate count, and rejection counts by observation, hard-fact, and
piece-count filters. The lab viewer shows these counters beside the belief
board, and `review_queue.py` ranks slow particle rows (`stage-b-slow`,
`stage-b-repair`, `stage-b-expanded`) so process review can target both
quality misses and cost misses.

Stage B also short-circuits expensive full-observation checks behind cheaper
hard-fact and count filters. The trace records `stage_b_obs_checked_count`
alongside `stage_b_expanded_count` so we can see how much work the gate saved.
As of v0.7.21, full observation checks also reuse the already-computed
visibility mask when building visible-piece maps, removing another duplicate
pseudo-legal-move pass in the hot path.

As of v0.7.22, the decision layer treats immediate king-capture risk as a
terminal risk signal, not ordinary material uncertainty. If more than 5% of
supporting particles say a candidate leaves the king capturable on the next
opponent move, the move is filtered when safer alternatives exist.

Next particle-budget milestones:

- Track the support ratio for each chosen/force-fed own move. If a move is
  legal in only a tiny fraction of particles, the next Stage A collapse is
  expected. Trace rows, the lab viewer, and the review queue now surface chosen
  move support.
- Add targeted augmentation for low-support own moves: before dropping to a
  handful of supporting particles, generate or repair additional worlds where
  the chosen move is legal and current hard facts still hold.
- Profile Stage B expansion and cache repeated visible maps / count checks so
  higher `target_n` buys more diversity without linear wall-clock pain.
- Separate particle-health failures from move-selection failures. v0.7.20 can
  carry high diversity into late-game positions and still lose to a remote
  king-capture tactic; those cases belong in the decision/risk model, not the
  particle generator.

Hidden occupancy facts are strict across our own moves, because our move cannot
move the opponent's hidden piece. They are not automatically strict across the
opponent's next move. If an opponent move could have vacated that square while
remaining consistent with the new observation, the fact expires into a soft
memory/continuity prior unless all surviving particles still support it.

Visible opponent piece facts follow the same lifecycle, but are stronger while
active: seeing a black rook on `e4` records exact square+piece identity, not
just occupancy. That fact is strict through our own moves, even if `e4` falls
back into fog. After the opponent gets a turn, it can expire if a legal
opponent move can relocate the rook while matching the new observation; if all
surviving particles still keep the rook on `e4`, the fact remains active.
If we capture the piece, the fact expires immediately. En passant must clear
the fact on the captured pawn's actual square, not the destination square.

When hard facts conflict with all existing particles, the engine should recover
by generating new hypotheses from the observation. It should not preserve stale
particles that keep impossible own pieces on the board.

Soft evidence includes broad visibility mismatch, low-confidence hidden-piece
placement, and prior weights. Soft evidence can be relaxed to keep belief alive.
Hard facts cannot.

## Current Implementation

The current local implementation is still a particle filter:

- `BeliefHardFacts` is the first explicit strict-fact boundary. It packages the
  current observation, visible-square exactness, hidden capture occupancies,
  visible opponent piece identities, movement-affordance blockers,
  piece-count caps, and bishop-color caps for repair/reseed/validation paths.
  Its emitted debug schema separates `square_facts`, `piece_facts`, and
  `state_facts`; hidden occupancy populates square facts, and direct
  opponent-piece sightings populate piece facts.
- `BeliefState.update_after_own_move` applies our own move, filters by the
  immediate post-own-move observation, repairs pushed particles when all of
  them contradict that observation, and CSP-reseeds only if repair fails or no
  particle supports the move.
- `BeliefState.update_after_opp_move` expands opponent pseudo-legal moves,
  filters by observation and count constraints, and CSP-reseeds on hard
  observation mismatch.
- `_csp_reseed` generates constraint-satisfying particles from visible pieces,
  opponent piece counts, bishop color counts, pawn rank constraints, and side
  to move.
- `belief.jsonl` records decision, after-own-move, and after-opp-move snapshots
  for review, including `hard_facts` so the Engine Lab UI can distinguish
  strict facts from probability mass.

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
- generic CSP fallback frequency, separated by Stage A and Stage B;
- post-reseed diversity;
- Stage A/B elapsed time, filter/expand time, repair time, CSP time, and
  resample time;
- Stage A/B rejection counts by illegal own move, observation mismatch,
  hard-fact mismatch, and count-constraint mismatch;
- Stage B expanded candidate count;
- Stage B full-observation checks after cheap hard/count gates;
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
4. Validate changes through the Engine Lab ladder: exact regression, one
   targeted replay/game, then 3-5 annotation games before any large mirror.
5. Add individual piece/pawn probability tracking as a primitive that survives
   particle collapse and informs repair/reseed.
6. Extend identity-preserving repair beyond Stage A: start from high-confidence
   top worlds, preserve stable pawns/pieces, and move the smallest plausible
   set of pieces to satisfy the new observation.
7. Treat every generic CSP fallback as an annotation candidate and bug-backlog
   seed. The review queue should flag it explicitly as `generic-csp-reseed`;
   the particle-generation roadmap goal is to explain and eliminate each
   repeated fallback class with repair, reachability, or better priors.
8. Continue splitting strict constraints from soft priors in repair/reseed.
   `BeliefHardFacts` now carries the first strict-fact bundle; the next step is
   to move soft continuity priors into a parallel structure instead of mixing
   them into repair code. Strict examples:
   bishop color, pawn direction, pawn rank legality, own-capture facts, and
   movement restrictions such as pawn blockades. Soft examples: last-seen
   location, high-confidence pawn tracks, top-world continuity, and likely
   capturer identity.
9. Split soft visibility mismatch from hard material-state mismatch throughout
   Stage B recovery.
10. Replace random CSP fill with reachability-aware generation when annotations
   show plausible-looking but legally unlikely worlds.
11. Add belief-only experiments that do not run full move selection.
12. Expand the Engine Lab belief panel from heatmap-only to a belief-system
    debugger: hard facts, soft priors, repair actions, invalid particles, and
    surviving top-world families should be visible as separate concepts.
13. Add piece-token and state/right fact models. Start with bishop color,
    forced source-to-landing capture identity, castling rights, and en-passant
    state; then use those facts in validation and UI before attempting heavier
    legal-reachability search.

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

## Rung-2 Learning: Identity-Preserving Reseed

`bakeoff-v0.7.0-rung2-3game`, game `q10`, ply 50/51 exposed the next belief
bug class. Immediately before collapse, the top world was surprisingly right
about all three remaining black pawns. The failure was the remaining black
piece: belief did not keep a top-world hypothesis with the black king on `e6`.
When the black king captured the white knight on `f5`, white could not see the
capturer identity, and the generic CSP reseed recovered legality by scrambling
previously correct pawns.

The better recovery shape is not "throw away particles and random-fill." It is
"repair the best current worlds." For this position, preserve the high-
confidence pawn tracks, infer that the unseen capturer on `f5` is likely the
remaining black king, and adjust only the minimum pieces needed to satisfy the
new observation. This requires a probability track for individual pieces and
pawns, plus a repair layer that distinguishes strict rules from softer
continuity priors.

## Rung-2 Learning: Movement-Affordance Fog

Another belief bug class is underusing fog created by movement restrictions.
If an own pawn cannot push forward, and there is no own piece on the forward
square, that is not neutral uncertainty. It implies a hidden opponent blocker
on that square. The same idea generalizes: the legal move affordance set is an
observation channel, not only an action list for move selection.

The first local fix is in CSP reseed: derive required hidden blockers from pawn
push absence, place those blockers before random hidden-piece fill, and reject
reseed particles whose recomputed visibility does not match the observation.
The broader structural fix is to make legal-move affordances first-class in
the Belief Particle Engine alongside visible pieces and own-capture facts.

## Rung-2 Learning: Belief Was Right, Move Selection Was Wrong

Not every bad move is a particle bug. `bakeoff-v0.7.0-q10-affordance-check`,
game `q10`, exposed two move-selection blindspots:

- Ply 11: white could capture the visible queen on `d4` with either queen or
  knight, and chose the queen. In fog, when multiple pieces can capture the
  same visible target, prefer the least valuable attacker first unless there is
  a concrete reason not to; the target square may be defended by hidden pieces.
- Ply 53: white believed the black king was on `h3` with 100% certainty but
  moved its own king to `g3`, allowing immediate king capture. This is not a
  belief failure. Move selection must treat known king adjacency as terminal
  even when Stockfish or another evaluator reports a mate-sized positive score
  for the candidate position.

Prevention rule: after belief produces a strong hard-fact signal, downstream
move selection must honor it with vetoes and capture-order rules. Evaluator
scores are advisory below terminal FOW rules.

## Rung-2 Learning: Hard Visible Pieces Cannot Be Relaxed

`bakeoff-v0.7.0-q10-moveselect-check`, game `q10`, exposed a Stage-B fallback
bug after the first move-selection fixes. White saw a black pawn on `b6` after
black played `b7b6`. A few plies later, white moved its king to `c5` and black
captured it with that same pawn. The belief snapshot at the decision did not
carry the pawn on `b6`.

The underlying mistake was the Stage-B "constraint-only" fallback. It was
intended to relax soft visibility-mask mismatch, but it also relaxed the
visible-piece map. That is too broad. A visibility mask can be a recovery
pressure valve; an observed piece is a hard fact.

Prevention rule: Stage B may fall back from full observation match to
hard-observation match, but hard-observation match includes exact visible
pieces, own-capture facts, and game-over. If no expanded particle satisfies
those hard facts, reseed/repair instead of preserving impossible particles.

## Rung-2 Learning: Post-Own-Move Visibility Is Immediate

`bakeoff-v0.7.0-hardobs-rung2-3game`, game `q13`, exposed the same class on
Stage A. After black played `Bc8-g4`, black's visibility changed immediately:
the diagonal revealed `d1` as a white rook and `f3` as empty. The UI annotation
showed black belief still assigning high probability to a queen on `d1` and a
small probability to a queen on `f3` after the move.

The game contract was already correct. TypeScript player views recompute fog
from the current board after every move, and Python selfplay passes
`observation_from_transition(prev, board, color)` into `observe_own_move`
immediately after `board.push(move)`. The bug was Stage A's old rollback: when
post-own-move observation filtering wiped all pushed particles, it kept the
pushed particles anyway to avoid collapse.

That rollback preserved liveness but violated the observation stream. The first
fix was to CSP-reseed from the post-own-move observation whenever Stage A's
pushed particles all contradicted current visibility. The stronger local fix is
repair-first: force newly visible pieces and newly visible empty squares into
the pushed particles, preserve hidden history that remains legal, and validate
by recomputing fog. Generic CSP is now only the fallback when repair cannot
produce valid particles.

Prevention rule: there are two observation updates per ply cycle. Our own move
creates an immediate observation update for us, not just for the opponent. A
particle engine that waits until the opponent move to reconcile that evidence
will make decisions from stale worlds.

Validation: the targeted g13 repair run
`bakeoff-v0.7.0-g13-repair-check` still won the game and reduced CSP reseeds
from 12 total / 10 Stage A in `bakeoff-v0.7.0-g13-stagea-check` to zero. The
review queue is now dominated by ordinary Stage-A drops and tactical decisions,
not reseed collapses.

## Backlog: Make Generic CSP Rare

Generic CSP fallback is now a named failure/recovery mode, not an acceptable
steady-state update. When it appears in `trace.jsonl` as `csp_reseed_fired =
true`, the review queue labels it as Stage A or Stage B generic CSP where the
trace has enough detail, so it competes with loss-window and tactical blunder
moments for annotation attention.

The product direction for the particle sub-engine is to make that reason
disappear over time:

- Stage A generic CSP should be replaced by delta repair from post-own-move
  observations.
- Stage B generic CSP should be replaced by identity-preserving repair from
  opponent-move observations, especially own-piece captures and newly visible
  pieces.
- Endgame generic CSP should preserve high-confidence individual pawn and king
  tracks rather than random-filling remaining pieces.
- Any repeated generic-CSP pattern should get a regression test and a named
  repair path before larger bake-offs.

`v0.7.2` adds the first Stage B repair rung: when all expanded opponent moves
miss hard observation, try to repair count-valid expanded worlds before
generic CSP. This deliberately preserves good hidden-piece continuity over
exact one-ply reachability. Exact legal reachability is the long-term particle
engine goal, but local repair is a better emergency recovery than random fill
when the alternative is scrambling pawn/king tracks that were already likely
right.

Large bake-offs should not proceed just because generic CSP kept belief alive.
If a short rung shows repeated `generic-csp-reseed`, stop, annotate one or two
instances, and improve particle generation before scaling the run.

## Rung-2 Learning: Hidden Capture Landings Are Hard Facts

`bakeoff-v0.7.4-rung2-3game`, game `13`, exposed a capture-observation gap.
White played `Rc1xc7` and later `Rc7xe7`. From black's point of view, the
captured pawn disappeared from `c7`/`e7`. The exact capturer type could still
be uncertain in fog, but the occupancy fact is not uncertain: an ordinary
capture means an opponent piece landed on the captured square.

The old observation model only carried `own_capture_square`, so Stage B could
remove the black pawn without assigning any white piece to the square. `v0.7.5`
adds `opp_capture_landing_square` and treats it like a hard hidden occupancy
fact in Stage B matching, repair, CSP reseed, and `belief_hardfact_check.py`.

Prevention rule: "my piece disappeared" and "an opponent piece landed there"
are two separate facts. The first is material accounting; the second is a
board-state constraint. The particle engine must preserve both.
