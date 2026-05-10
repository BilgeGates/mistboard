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
- `tests/` — visibility regression tests.
- `experiments-README.md` — promotion rule for one-off experiments (move stable primitives into `src/fow_chess/`).

## Relationship To The TS Product

Anything that this lab proves useful (e.g., a bot strategy, an inference algorithm, a visibility-history scoring metric) should be:

1. described in the relevant doc under `docs/fog-of-war/` at the mistboard root, and
2. ported into `packages/game` (or a future `packages/fow-engine`) before it ships in the product.

Do not import this lab from `apps/` or `packages/`.
