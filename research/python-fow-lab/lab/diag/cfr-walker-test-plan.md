# CFR Walker — Mechanics-Correctness Test Plan

Pre-implementation contract for `src/fow_chess/cfr/walker.py`. These are the
properties the walker must satisfy; violating any of them silently corrupts
CFR in ways that may pass convergence checks but produce wrong equilibrium
strategies.

## Required properties

### P1 — No truth leakage in info-set ID

At any node N, `node.info_set_id()` depends only on `(to_move,
observation_history_of_to_move)`. It must not depend on the truth board.

Test: construct two nodes with different `truth` but identical
`(to_move, obs_history_*)`; assert `info_set_id()` matches.

### P2 — Observation history parity

At any node N reached by trajectory `[a_1, ..., a_k]` from root, each player's
observation history equals the stepwise composition of
`observation_from_transition(prev_truth, next_truth, perspective)` applied at
each step.

Test: walk a depth-3 path; manually compute observations via the existing
`observation_from_transition` API; assert the walker's stored histories match.

### P3 — Legal-move parity

`node.legal_moves()` equals `list(node.truth.pseudo_legal_moves)` at every
non-terminal node. FoW has no check restriction, so pseudo-legal == legal.

Test: walk a depth-3 subgame; at every visited node compare against the truth
board's `pseudo_legal_moves`.

### P4 — Terminal detection parity

`node.is_terminal` is true iff one or both kings are absent from the truth
board (matches `selfplay.py:175`).

Test: construct nodes from boards with and without kings; assert terminal
status agrees.

### P5 — Cross-branch independence

Applying action A from parent P produces child C_A with state independent of
any apply on a different child C_B. Modifying or walking from C_A must not
mutate P or C_B.

Test: apply two different actions from the same parent; walk further from
one; assert the parent's state and the sibling's state are unchanged.

### P6 — Subgame from real game ply (smoke)

End-to-end: load one real game, replay to a mid-game ply, construct the
subgame root, walk depth 3. Verify legal-move counts at every visited node
match `board.pseudo_legal_moves` on the truth board at each step.

## Out of scope for this plan

- CFR algorithmic correctness (covered by the Kuhn poker test in `tabular.py`).
- Performance benchmarks (covered when we hit the validation experiment).
- Belief representation correctness (the walker does not carry `BeliefState`;
  Phase 1 uses a position-only leaf evaluator).
