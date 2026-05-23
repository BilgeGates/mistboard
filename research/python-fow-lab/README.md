# Python Fog-of-War Lab

Offline Python sidecar for Fog of War chess research, bot prototyping, and visibility/inference experiments.

This is **not** part of the Mistboard product. The Mistboard TypeScript product owns the canonical Fog of War game (server-authoritative, in `apps/server` + `packages/game`). This lab exists for offline work that is easier in Python:

- visibility primitives that double-check the TS implementation
- belief-state and inference experiments
- bot prototypes (legal-random, tactical, information-seeking, belief-tracking)
- self-play data generation for future model training

Origin: consolidated from `~/projects/fog-of-war-chess/` on 2026-05-05. The standalone Python lab repo was retired because Mistboard now hosts both the playable product and the research surface.

## Quick Start

```bash
cd research/python-fow-lab
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/pytest
```

## Structure

- `src/fow_chess/visibility.py` — visibility primitives (true → visible).
- `src/fow_chess/observation.py` — per-ply observation + `consistent_with` predicate (the kernel of the forthcoming `P` enumerator).
- `src/fow_chess/constraints.py` — piece-count and bishop-color constraints for pruning candidate opponent positions.
- `src/fow_chess/cfr/walker.py` — depth-bounded CFR subgame walker (pure tree-walking + observation-history tracking).
- `src/fow_chess/cfr/tabular.py` — tabular CFR loop. PCFR+ replacement scheduled for Phase A2.
- `src/fow_chess/cfr/leaf_eval.py` — leaf evaluator interface. Stockfish leaf eval lands in Phase A1.
- `src/fow_chess/cfr/observability/marginals.py` — debug-only marginal projections.
- `src/fow_chess/belief.py` + `engine.py` + `strategies.py` + `scripts/` — **Tier-1 v0.9.5 engine.** Frozen substrate; kept alive as the Phase A bakeoff baseline. Will be deleted after A7 (see `docs-private/engine-track/phase-a-scope-2026-05-22.md`).
- `tests/test_p_predicate.py` — locked-down invariants for `consistent_with`.
- `lab/diag/_archive/` — parked diagnostics for abandoned Phase 2/2b substrate.
- `experiments-README.md` — promotion rule for one-off experiments (move stable primitives into `src/fow_chess/`).

## Engine track

Phase A (current): replicate Obscuro's architecture in open source.
See `docs-private/engine-track/vision-2026-05-22.md` for the vision
and `docs-private/engine-track/phase-a-scope-2026-05-22.md` for the
scope and stage breakdown.

## Relationship To The TS Product

Anything that this lab proves useful (e.g., a bot strategy, an inference algorithm, a visibility-history scoring metric) should be:

1. described in the relevant doc under `docs/fog-of-war/` at the mistboard root, and
2. ported into `packages/game` (or a future `packages/fow-engine`) before it ships in the product.

Do not import this lab from `apps/` or `packages/`.
