# v2.0 (2026-05-24)

Snapshot taken 2026-05-24T21:44:48 from git main@3ed32e8870 (DIRTY).

## Baseline record
  28W 0L 3D + 1 crash vs v0.9.5 (32-game ladder, 2026-05-24, iter=500 |I|=32 5s budget cap=1M); 95.2% score, p<0.00003

## Predecessor
  v0.9.5-equivalent (Tier-1 Stockfish-MCTS baseline; configs/tier1-v1.json)
  vs predecessor: v2.0 score 95.2% (28W 3D 0L) over 31 valid games

## Known blind spots
  - pawn-tension captor gains vision (Stockfish-leaf depth-1 blind)
  - king-hunt / endgame conversion (3/16 rung-4 draws from material+king vs lone-king cycles)
  - 1M cap soundness violations (3.1% crash rate at p_max=1M; mitigated in v2.0 by raising default cap to 5M)

## Notes
Full Rust port (RP3-RP9): visible_squares + consistent_with + update_opp_move + update_own_move all native, rayon par_iter. 178K-position apply_move diff + golden P-trace + determinism canary regression suite. KLUSS k=2 plumbed (--v2-kluss-k flag, EngineV2Strategy.kluss_k) but DISABLED at default; A5.2 Phase 3 A/B probe pending. Default cap raised to 5M after cap-probe (2026-05-24). Production-iter memory profile shows ~276MB RSS at cap=5M (P=5%, rest is Python/Stockfish/CFR). For history: RP5 baseline 9.03s on profile game → RP9 0.30s (30x); cumulative ~500x over pure Python. Commit lineage 551cbaf (Rust port), 6ee59da (RP7), 556100c (RP9), 49b9649 (A5.2 Phase 2), 84b44a9 (cap=5M default). Dirty file at snapshot time: apps/web/src/articles-data.ts (web-side, unrelated to engine).

## Layout
  - `src/`          — Python source for fow_chess + cfr + p_enum
  - `fow_rust/`     — pre-built Rust extension binary (platform-specific)
  - `configs/`      — opponent configs the engine references
  - `version.json`  — machine-readable manifest

## How to use

(Versioned bakeoff runner planned but not yet built.)
When built, each side of a bakeoff will run in its own subprocess
with PYTHONPATH set to this snapshot's `src/` and the `fow_rust/`
binary inserted at the head of `sys.path`. Snapshots are platform-
specific because of the .so; cross-platform shipping requires
re-snapshotting on the target platform.
