# Fog Of War Engine Architecture Roadmap

This page captures the long-term architecture direction for the Fog of War
engine. It is intentionally contributor-safe: no private compute budgets,
funding plans, or internal launch strategy.

## North Star

The engine should not be "normal chess minimax with fog bolted on." Fog of War
is an imperfect-information game. The durable architecture is a hybrid system:

1. A Belief Particle Engine turns legal perspective observations into weighted
   hidden-board hypotheses.
2. Parallel move-analysis workers evaluate candidate moves under that belief
   set from different angles.
3. A synthesis layer chooses the move, explains why, and enforces terminal
   Fog-of-War safety rules.
4. An anytime engine protocol lets the server play the best legal candidate
   available at the move deadline instead of treating a slow engine as no
   engine.
5. The lab loop converts human annotations and saved games into replayable
   regression gates.

The engine consumes only legal `PlayerView`-equivalent information. It may use
saved truth boards for offline analysis, labels, and debugging, but not for
live decision input.

## Research Map

Useful research families to track:

- **Determinization / PIMC.** Sample plausible hidden worlds, run perfect-
  information search in each, then aggregate. This is a practical baseline, but
  it can suffer from strategy fusion: the search may act as if it can know
  which hidden world is real after choosing a move.
- **Information Set MCTS.** Search over what the player knows instead of one
  concrete board. This is a natural classical upgrade once belief generation is
  stable enough to provide good samples and rollout priors.
- **Kriegspiel and dark-chess work.** The closest chess-family cousins. Their
  "metaposition" and MCTS ideas are directly relevant to tracking possible
  worlds and choosing information-safe moves.
- **CFR, continual resolving, and public-belief search.** Poker engines are
  the mature example of high-strength imperfect-information play. They are not
  drop-in solutions for chess, but they are useful design pressure for belief
  states, counterfactual values, and online resolving.
- **Neural policy/value models.** Later-stage option. A neural model can learn
  policy, value, risk, and information-gain signals from self-play, full-info
  analysis, and human annotations. It should follow a reliable data/replay
  pipeline, not precede one.

## Layers

### Layer 1: Belief Particle Engine

Owned by `docs/fog-of-war/belief-particle-engine.md`.

Responsibilities:

- process our moves, opponent observations, visibility masks, legal-move
  affordances, own-capture facts, and game-over facts;
- produce particles, marginals, top worlds, and diagnostics;
- preserve hard-observation consistency;
- repair or reseed when existing particles contradict the observation stream;
- eventually run as a horizontally scalable sub-engine over observation logs.

This layer answers "what worlds are still possible or plausible?"

### Layer 2: Analysis Workers

Move selection should support multiple workers running against the same belief
set. Early versions can run sequentially in-process; the contract should still
look like independent jobs.

Candidate workers:

- **Tactical worker:** visible captures, king captures, immediate king safety,
  queen saves, and terminal Fog-of-War vetoes.
- **Expected-value worker:** shallow search across sampled particles and top
  candidate moves.
- **Risk worker:** downside-aware scoring, including CVaR-style penalties for
  lines that lose king, queen, or forced material in plausible worlds.
- **Information-gain worker:** rewards moves that reveal important uncertainty,
  force responses, or reduce belief entropy without tactical downside.
- **Opponent-model worker:** scores likely opponent replies under different
  style assumptions or engine versions.
- **Annotation-regression worker:** checks whether known annotated positions
  still choose the human-suggested or human-approved move class.
- **Neural worker:** later policy/value/risk prior trained from saved games,
  Stockfish-on-truth labels, belief features, and annotations.

This layer answers "what does each lens think the move is worth?"

### Layer 3: Synthesis Layer

The synthesis layer combines worker outputs into one decision. It should be
explicit and inspectable, not a hidden pile of weighted constants.

Responsibilities:

- apply terminal vetoes before evaluator scores;
- combine expected value, downside risk, king safety, material safety,
  information gain, and annotation priors;
- prefer robust moves when belief is broad or generic CSP fallback just fired;
- emit a move-decision trace that explains which workers supported or rejected
  the selected move.

Examples of terminal or near-terminal rules:

- never move into known opponent-king adjacency;
- never ignore a visible king capture;
- never preserve an impossible belief because it avoids collapse;
- prefer the least valuable attacker when several pieces can capture the same
  visible target and the target square may be defended by hidden pieces.

This layer answers "given conflicting signals, what move do we actually play?"

### Layer 4: Anytime Engine Protocol

The live protocol should evolve from one-shot request/one-shot response into an
anytime decision stream.

Current problem:

- Tier-1 can compute a chess-clock budget from `clock_remaining_ms` and
  `increment_ms`.
- The server also has a subprocess watchdog.
- If those policies disagree, the engine can be within its chess-clock budget
  while the server kills the process and falls back to a weaker move.
- The one-shot protocol has no useful intermediate answer when the deadline
  arrives. A timeout discards all partial work.

Target behavior:

- The server sends the legal observation log, legal moves, seed, clock state,
  and a hard deadline.
- The engine begins streaming candidate decisions as soon as it has any legal
  move.
- Each candidate is self-contained enough for the server to validate and play:
  selected move, score/confidence, reason, trace summary, and optional principal
  variation or belief diagnostics.
- The engine may continue improving the candidate until the deadline.
- At the deadline, the server plays the latest valid candidate. It falls back
  only if no valid candidate was ever received.
- The move event records actual timing: decision start, first candidate time,
  selected candidate time, deadline, and whether the played move was final,
  deadline-forced, or fallback.

Server responsibilities:

- own the authoritative clock and deadline;
- validate every streamed candidate against current legal moves;
- ignore candidates after the room state changes or the deadline passes;
- keep the latest valid candidate in memory;
- kill or recycle engine workers after a grace period, but not before playing
  the latest legal candidate;
- persist timing and decision metadata without exposing hidden truth to live
  clients.

Engine responsibilities:

- emit a legal candidate quickly, even if it is a simple baseline move;
- treat the deadline as hard and improve monotonically when possible;
- stream trace updates without relying on hidden truth;
- make partial work inspectable: belief count, search depth, worker outputs,
  vetoes, and synthesis state;
- stop cleanly when cancelled so room state changes do not leave orphaned
  workers.

Protocol shape:

```text
engine.start(request)
  request: room_id, engine_id, color, legal_observation_events,
           legal_moves, seed, clock_remaining_ms, increment_ms,
           deadline_unix_ms, trace_level

engine.candidate(update)
  update: sequence, elapsed_ms, selected_move, score, confidence,
          reason, decision_path, diagnostics

engine.final(update)
  update: same shape as candidate, plus final=true

engine.cancel(reason)
  reason: room_state_changed | deadline_passed | server_shutdown
```

Migration path:

1. Keep the existing one-shot subprocess path, but make watchdogs derived from
   the same clock budget the engine sees.
2. Add `thinkTimeMs` and event timestamp recording so replays can represent
   real move cadence.
3. Introduce a local streaming adapter around the Python engine that emits an
   immediate baseline candidate before deeper Tier-1 work begins.
4. Replace per-move process startup with a persistent per-game engine session
   that can keep belief state warm across moves.
5. Move worker outputs and synthesis traces onto the candidate stream.
6. Make live server play "latest valid candidate at deadline" and reserve
   random fallback for "no legal candidate was ever produced."

Open design questions:

- Whether the transport should be stdio JSONL, WebSocket, gRPC, or a small
  local worker protocol.
- Whether persistent engine sessions are per game, per room, or pooled by
  engine version.
- How much candidate trace data belongs in public replay artifacts versus
  admin-only debug artifacts.
- How to version the candidate schema so old saved games and old engine
  binaries remain replayable.
- How to represent cancellation and deadline-forced moves in game-debug
  artifacts without changing core chess event semantics too much.

This layer answers "what should the server do when the engine is still
thinking?"

### Layer 5: Learning Loop

The lab loop turns artifacts into stronger gates:

- annotations become replay targets;
- review queues identify which plies deserve human time;
- failure classes become named tests;
- short laddered bake-offs validate one idea before scaling.

This layer answers "what should the next patch prevent from happening again?"

## Learning Targets And Weight Surfaces

The long-term engine should learn from saved engine games, human annotations,
truth-board analysis, and replayed counterfactuals. The first goal is not an
opaque end-to-end neural player. The first goal is to make the engine's
decision surfaces explicit enough that local bake-offs and EvE jobs can tune
them over time.

Keep hard legality and observation facts outside the learned layer. A model may
rank particles, allocate compute, or score risk; it may not decide that a
visible-empty square contains a piece, that a bishop changed color complex, or
that a known capture did not happen.

### Particle Generation And Ranking

The Belief Particle Engine has two jobs: enumerate worlds consistent with the
observation stream, then rank which worlds deserve probability and compute.
Learnable weights here include:

- identity continuity for pieces and pawn tracks;
- minimal hidden movement versus surprising hidden movement;
- opponent move plausibility under style or engine-version priors;
- danger upweighting for unlikely but catastrophic worlds;
- repair preference versus generic CSP reseed;
- strict constraints versus soft plausibility constraints;
- compute allocation toward low-probability high-risk particles.

Training signals:

- hardfact violations;
- truth-particle survival;
- generic CSP frequency;
- human annotations that call out belief contradictions;
- Stockfish-on-truth deltas where the engine ignored a dangerous hidden world;
- replayed counterfactuals showing which particle families would have avoided
  the mistake.

### Decision Evaluation Under Uncertainty

Once particles are reliable, move evaluation should learn how much to value or
penalize board features under uncertainty.

Learnable weights here include:

- material value by game phase;
- king-safety penalties under visible and hidden threats;
- defended-square risk for captures into fog;
- opportunity value for tactics that work across many worlds;
- downside-risk penalties such as worst-case or CVaR-style loss;
- information-gain value from revealing critical uncertainty;
- annotation priors for known move classes such as least-valuable attacker.

Training signals:

- game outcomes;
- missed tactical opportunities found on revealed truth boards;
- human labels for better move classes;
- losses caused by underestimated fog risk;
- replay comparisons between chosen moves and annotated alternatives.

### Synthesis Weights

Parallel workers will eventually produce conflicting recommendations. The
synthesis layer needs explicit weights for combining them:

- expected value across particles;
- tail-risk avoidance;
- terminal safety vetoes;
- tactical urgency;
- information gain;
- annotation-regression pressure;
- confidence penalties when belief diversity is low or repair just fired.

Early tuning can use hand-edited constants, grid search, Bayesian optimization,
or evolutionary search over replay suites. Gradient descent becomes natural
once a neural policy/value/risk prior exists, but it should optimize these
named surfaces rather than replace the observation contract.

## Milestones

### M0: Current Local Baseline

- Particle filter with Stage A and Stage B updates.
- CSP reseed and repair paths for hard-observation contradictions.
- Tactical short-circuits and one-ply evaluator scoring.
- Saved bake-off artifacts, verbose belief snapshots, review queue, and human
  annotations.

Exit condition: current docs and artifacts can reproduce the known q8/q10/q13
belief and move-selection lessons.

### M1: Annotation Replay Gate

Annotations with `suggested_move_uci` become executable regression data.

For each annotated ply:

- replay the saved game to the exact decision;
- run the current engine under the saved config;
- report whether the engine selects the suggested move, selects an equivalent
  move class, or still repeats the rejected behavior;
- group failures by belief, tactics, evaluator, synthesis, or UI/process.

Exit condition: local iteration can answer "did this patch fix the moments the
human already reviewed?" without manual replay.

### M2: Belief Hard-Fact Validator

Add artifact validation that replays saved games and checks belief snapshots
against hard observations.

Exit condition: hard visible pieces, own-capture facts, own pieces, movement
restrictions, and game-over facts cannot silently contradict belief snapshots.

### M3: Repair Before Generic CSP

Push generic CSP fallback out of common paths.

Priorities:

- Stage A delta repair after our own move;
- Stage B identity-preserving repair after opponent observations;
- individual piece and pawn probability tracks;
- strict-vs-soft constraint separation;
- explicit `generic-csp-reseed` labeling whenever repair fails.

Exit condition: short rung bake-offs show generic CSP as rare and explainable,
not a normal way to stay alive.

### M4: Move-Decision Explanation Trace

Every serious move-selection candidate should explain why it won or lost.

Exit condition: for annotated plies, traces show tactical vetoes, known-king
rules, least-valuable-attacker logic, belief confidence, and evaluator/risk
components clearly enough to debug without reading engine internals.

### M5: Anytime Live Engine Protocol

Replace one-shot live move selection with a streaming candidate protocol.

Priorities:

- add deadline-aware request fields to the engine protocol;
- stream an immediate legal baseline candidate before expensive belief/search
  work starts;
- keep the latest valid candidate server-side;
- persist first-candidate time, selected-candidate time, final time, deadline,
  and fallback status;
- make replay playback prefer recorded engine timing;
- preserve the legal-observation boundary for every streamed update.

Exit condition: a live Tier-1 move that exceeds its ideal search budget still
plays the latest legal Tier-1 candidate at deadline instead of falling back to
random solely because the process timed out.

### M6: Shallow Particle Search

Run shallow multi-ply search over top candidate moves and top particles.

Start with:

- a small candidate move set from tactics and heuristic move ordering;
- a capped particle set from top worlds plus diversity samples;
- expected-value aggregation plus downside-risk aggregation;
- conservative time controls.

Exit condition: search improves annotated tactical/evaluator misses without
reintroducing belief contradictions or large latency spikes.

### M7: Information-Gain And Opponent Models

Add workers that value reducing critical uncertainty and model likely opponent
responses.

Exit condition: the engine can prefer a slightly lower material move when it
materially improves king safety, reveals a hidden threat, or avoids a high-risk
fog trap.

### M8: Information-Set Search Experiment

Prototype an ISMCTS-style or public-belief search experiment over the belief
state.

Exit condition: the experiment has a clean comparison against shallow particle
search on the same annotation replay suite and short bake-off ladder.

### M9: Neural Prior Experiment

Train a small policy/value/risk prior only after replay data is reliable.

Candidate inputs:

- own visible board;
- visible opponent pieces;
- legal-move affordance masks;
- per-piece marginals;
- last-seen maps;
- top-world summaries;
- recent observation deltas.

Candidate outputs:

- policy prior;
- value estimate;
- king-risk estimate;
- material-risk estimate;
- information-gain estimate.

Exit condition: neural priors improve move ordering or risk detection in the
classical engine before they are trusted as direct move selectors.

### M10: Distributed Worker Architecture

Move expensive belief generation and analysis workers behind job contracts.

Exit condition: local EvE-style jobs can run belief generation, search workers,
and artifact persistence as separate resumable tasks with saved diagnostics.

## Near-Term Build Order

1. Make annotation replay executable.
2. Add hard-fact belief artifact validation.
3. Reduce generic CSP with repair-first particle generation.
4. Add move-decision explanation traces.
5. Add anytime live engine protocol.
6. Add shallow particle search workers.
7. Add information-gain and opponent-model workers.
8. Experiment with information-set search.
9. Experiment with neural priors.

Do not start with a large neural or distributed architecture. The immediate
compounding asset is a local loop that converts four reviewed games into
failing tests, fixes, and cleaner next bake-offs.
