# Research Questions

## Priority 1: Rules

- What exact rules does Chess.com use for check, checkmate, king capture, castling, and en passant?
- Which rules create the cleanest local engine contract?
- Which rules are most intuitive for human players?

## Priority 2: Information

- How much hidden state can be inferred from legal move availability?
- Which opening structures maximize information without losing material?
- What is the value of a move when scored by revealed squares rather than material?
- How often should a strong bot choose a reconnaissance capture over a material capture?

## Priority 3: Tooling

- Can we render a PGN-like replay with per-player visibility snapshots?
- Can we annotate a move with information gain, not just engine evaluation?
- What UI best shows true state, visible state, and inferred candidates without confusing them?

## Priority 4: Bots

- Baseline bot: legal random moves under a selected ruleset.
- Tactical bot: material and king-safety heuristics over visible state.
- Information bot: maximize visibility and reduce opponent uncertainty.
- Belief bot: maintain candidate hidden states and choose robust moves.

