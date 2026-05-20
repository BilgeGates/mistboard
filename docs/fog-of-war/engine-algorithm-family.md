# Fog Of War Engine Algorithm Family

This page documents the theoretical framing for the long-term engine track. It is intentionally contributor-safe: no private compute budgets, funding plans, or internal launch strategy.

The thesis: **Fog of War is structurally an imperfect-information game, not a chess variant with hidden squares.** The algorithm families that work for imperfect-information game-solving (CFR and its descendants) are different from the algorithm families that work for perfect-information chess (search + leaf evaluation + self-play). This distinction shapes which research directions are worth pursuing in the long-term engine track.

The architecture roadmap in `engine-architecture-roadmap.md` describes the engine's *layered substrate*: belief representation, analysis workers, synthesis, anytime protocol, learning loop. Most of that substrate is family-agnostic. This page is about what runs *on top of* that substrate — the search and aggregation layer that determines move selection — and why the choice of family matters.

## The two algorithm families

### Chess family (perfect-information game-solving)

Reference engines: Stockfish, Leela Chess Zero, AlphaZero.

Shape:

- Search a tree of futures from the current position.
- Evaluate leaf positions with a learned or hand-tuned function.
- Pick the move whose subtree evaluates best.
- Train via self-play; the policy gradient converges to Nash equilibrium under MCTS-based policy improvement (Silver et al. 2018).

The convergence guarantee is load-bearing. Self-play *only* converges to Nash in two-player zero-sum perfect-information games. AlphaZero works because chess satisfies all three conditions.

### Poker family (imperfect-information game-solving)

Reference engines: DeepStack, Libratus, Pluribus, ReBeL.

Shape:

- Track belief state — a probability distribution over hidden game states.
- Compute strategies, not single moves. The optimal answer is often a calibrated mix.
- Solve subgames at decision time via Counterfactual Regret Minimization (CFR) or its neural variants.
- Train via CFR-based self-play, which has Nash convergence guarantees in two-player zero-sum imperfect-information games (Zinkevich et al. 2007).

CFR plays the role in poker-family engines that MCTS plays in AlphaZero: it is the convergence-guaranteed self-improvement loop that makes the whole system work.

## Why Fog of War belongs in the poker family

The game has:

- **Hidden state.** Each player observes only their own pieces and the squares those pieces can move to or attack. Most of the opponent's pieces are invisible most of the time.
- **Information asymmetry.** Each player has a different observation history and hence a different belief state.
- **Recursive belief structure.** Opponent's optimal play depends on what opponent believes about your moves, which depends on what opponent believes about your belief, and so on. Standard chess has no such recursion.
- **Optimal mixed strategies.** In many positions, the right play is a calibrated mix — push the queen with frequency `p`, retreat with frequency `1 - p`, chosen so opponent cannot read the pattern. Chess engines cannot represent mixed strategies; they pick one move per position.

These are exactly the properties that the imperfect-info game-solving literature was developed to handle. They are exactly the properties that the chess-engine literature *abstracted away*.

## Limits of PIMC as a search architecture

Mistboard's current engine uses Perfect-Information Monte Carlo (PIMC) for search: sample plausible hidden worlds, run perfect-info search in each, aggregate. This is a reasonable first approximation and has been used in several published imperfect-info game systems including Obscuro (the published FoW chess engine). It has two known theoretical limitations:

- **Strategy fusion** (Frank & Basin 1998). PIMC commits to one move per sampled world and averages, which cannot represent mixed strategies. In positions where the optimal answer is genuinely mixed, PIMC picks a suboptimal pure strategy that is exploitable.
- **No convergence guarantee under self-play improvement.** Naive self-play in imperfect-info games converges to mutually-exploitative steady states, not to Nash. Empirically, this shows up as symmetric Elo gains in self-play bake-offs that do not translate to real strength gains against unfamiliar opponents.

These are not flaws to be tuned away. They are structural properties of the algorithm family.

## Research directions

### Direction 1: Belief representation that scales

Particle filters approximate the belief state with `N` samples. In FoW, the information set after 20-30 plies can contain billions of positions consistent with the observation history. Sampling at `N = 256` represents the belief at ratio of approximately `10⁻⁸`. The true position almost never survives in the particle set after a few plies of hidden movement.

Candidate approaches:

- **Factored marginals.** Track `P(piece X on square Y)` for each piece-square pair plus a low-rank correlation structure. Linear in board size rather than exponential in position count.
- **Neural belief encoder.** A transformer over observation history producing a learned belief embedding. The evaluator consumes the embedding directly. No explicit particle representation.
- **Set transformers over particles.** Keep particles but let the evaluator attend over the particle set rather than evaluating each particle independently.

The Reconnaissance Blind Chess research at CMU uses set-based representations; Obscuro uses something closer to factored marginals with explicit opponent modeling.

### Direction 2: CFR on subgames at decision time

DeepStack and ReBeL solve subgames at decision time. At each move, identify the current public belief state, construct a depth-bounded subgame from there, run neural CFR iterations using a learned value net at leaves, sample a move from the resulting strategy.

This approach:

- Natively represents mixed strategies. CFR converges to a strategy *distribution*, not a single best move.
- Has Nash convergence guarantees in two-player zero-sum imperfect-info games.
- Allows decision-time compute to compensate for imperfect leaf evaluation.

Open research question: does neural CFR scale to FoW chess state-space size? Poker information sets are roughly `10⁸` in scale; FoW information sets are several orders of magnitude larger. Whether decision-time subgame CFR remains tractable at FoW scale is an open empirical question. Obscuro chose PIMC over CFR, presumably for tractability reasons; whether that choice was forced by scale or was a convenience worth revisiting at modern compute is itself worth investigating.

### Direction 3: Strong opponent policy from large-corpus training

The belief filter expands particles by sampling opponent moves from a prior. The prior IS the engine's model of opponent's policy. Currently this is either uniform-over-legal (lazy) or learned-from-small-corpus (overconfident wrong, with documented failure modes around assigning near-zero probability to rare-but-valid moves).

A strong opponent policy net needs:

- Large training corpus (10k–100k games minimum; 200 games is too small to avoid overfit).
- Calibrated mixing with uniform priors at `α = 0.2-0.3` to maintain a noise floor so rare-but-valid moves cannot be zeroed.
- Temperature tuning at inference to avoid overconfident-wrong collapse.
- Architecture that conditions on opponent's belief state, not on perfect-info ground truth.

This is the closest direction to current infrastructure — primarily a corpus-scaling problem rather than a research-architecture problem.

### Direction 4: Equilibrium-value training corpus

Per-position evaluation labels (Stockfish on truth boards, game outcomes, fow-evaluator distillation) all fail structurally because in imperfect-info games "the value of a position" is not a well-defined quantity. Only "the value of an information set under equilibrium play" is.

The ReBeL approach: run CFR offline at scale to generate `(info-set, equilibrium-value)` training pairs. Train a value net on these pairs. The net then approximates the equilibrium value function and serves as the leaf evaluator inside online subgame CFR. Bootstrap loop.

## What carries over from the chess-family direction

The chess-family work done to date is not waste. The following translate to a poker-family architecture:

- The belief filter substrate (observation processing, CSP, particle store). The *interface* is correct even if the *representation* changes.
- Tactical heuristics and hand-tuned vetoes. Become policy priors or warm-starts for the learned policy.
- The annotation corpus. Positional probes valuable under any framework.
- Diagnostic tools (per-ply strategy tracing, OOD probe suites). Translate directly.
- Corpus generation pipeline (Postgres-backed self-play storage, parallel writers). Translates directly.
- The fog-of-war evaluator. Useful as a feature input or as one of several leaf evaluators inside CFR.

## What does not carry over

- PIMC search. Strategy fusion is structural, not a tuning gap.
- Self-play bake-off as the primary ship gate. The convergence guarantee is not there; symmetric improvements wash.
- Per-position evaluation labels from perfect-info engines. Wrong ground truth.

## Reading

Imperfect-info game-solving foundations:

- Zinkevich, Johanson, Bowling, Piccione (2007). *Regret Minimization in Games with Incomplete Information.* The CFR convergence proof.
- Frank & Basin (1998). *Search in games with incomplete information: A case study using Bridge card play.* The strategy fusion result.
- Moravčík et al. (2017). *DeepStack: Expert-level artificial intelligence in heads-up no-limit poker.* First demonstration of neural CFR with decision-time subgame solving.
- Brown & Sandholm (2017). *Superhuman AI for heads-up no-limit poker: Libratus beats top professionals.*
- Brown, Lerer, Gross, Sandholm (2019). *Deep Counterfactual Regret Minimization.* Scalable neural CFR.
- Brown, Bakhtin, Lerer, Gong (2020). *Combining deep reinforcement learning and search for imperfect-information games.* The ReBeL formulation; cleanest unified framing.

Fog of War chess specifically:

- Bertholet et al. *Obscuro.* The current published FoW chess engine, approximately 2318 chess.com strength. Uses belief filter + opponent modeling + PIMC. Notable for what it does *not* do: no CFR, no neural belief encoder.

Reconnaissance Blind Chess (closest cousin, slightly different ruleset):

- The CMU RBC research program. Set-based belief representations and policy-network approaches that translate conceptually to FoW.
