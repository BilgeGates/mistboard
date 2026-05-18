# Mistboard Engine Lab

Distributed-training foundations for the Mistboard Fog of War chess engine.
This directory holds the **versioned artifact store** and **gated training
pipeline** — the infrastructure that lets every Elo improvement compound over
time, lichess/Stockfish-style.

## Layout

```
lab/
├── corpora/                  # versioned training corpora
│   ├── c0/  corpus.jsonl  manifest.json
│   ├── c1/  ...
│   └── ...
├── nets/                     # versioned trained networks (per arch)
│   ├── psqt/
│   │   ├── v0/  weights.npz  manifest.json
│   │   ├── v1/  ...
│   │   └── v2/  ← current champion
│   └── mlp/
│       ├── v0_from_c2/  weights.pt  manifest.json
│       └── ...
├── runs/                     # every job's outputs (eval / gate / etc.)
│   └── eval-<uuid>/
│       ├── results.jsonl
│       ├── spec.json
│       └── manifest.json
├── specs/                    # job spec examples (committed)
│   └── examples/
└── champions.json            # current strongest network per arch
```

Every artifact carries a `manifest.json` recording: which spec produced it,
which inputs it consumed, which metrics it scored, the git SHA at production
time. **The chain is reproducible.**

## Current champion

See `champions.json`. As of foundations v1: `nets/psqt/v2` (linear PSQT, +63 Elo
over hand-tuned `fow_evaluator` at 200 MCTS rollouts).

## Running a job

The runner is one CLI:

```sh
.venv/bin/python3 scripts/run_job.py <spec.json>
```

Four job types: `generate-corpus`, `train`, `eval`, `gate`. See
`lab/specs/examples/` for spec formats.

Typical loop (the Stockfish/Leela pattern):

```sh
# 1. Generate more training data using the current champion as teacher
python3 scripts/run_job.py specs/generate-corpus-c4.json

# 2. Train a candidate network on the new corpus
python3 scripts/run_job.py specs/train-psqt-v4-from-c4.json

# 3. Champion gate: SPRT match candidate vs current champion.
#    Only promotes if candidate is statistically stronger.
python3 scripts/run_job.py specs/gate-psqt-v4.json
```

If the gate passes, `champions.json` updates atomically. If not, the candidate
is kept under `nets/` but doesn't become champion.

## What this is NOT (yet)

- Not Fishtest (no central web service yet — workers read local spec files)
- Not S3-backed (artifacts are local; swap by replacing `lab/store.py`)
- Not multi-architecture in parallel (one champion per `arch` slot)
- Not auto-scaling cloud orchestration

Each of those is a real project. Foundations v1 is the *minimum* — enough to
make every experiment a versioned, gated job, with clean interfaces to grow
into the rest.

## Contributing

Foundations are deliberately filesystem-only so the lab is portable. To
contribute a corpus or a candidate network:

1. Clone the repo and set up the venv.
2. Run a job (see `specs/examples/`).
3. The result lands under `lab/runs/<uuid>/` with a full manifest.
4. To submit, attach the run directory or the resulting `nets/<arch>/v<N>/`
   to a PR.

The maintainer runs `gate` jobs to verify candidates SPRT-pass the current
champion before promotion.

## See also

- `engine-distributed-foundations` memory: target (2200 chess.com FoW), recipe
  (AlphaZero-on-PIMC + cloud compute), strategic context.
- `engine-platform-thesis` memory: why the engine track is the distribution
  flywheel; FUCI + engine arena roadmap.
- `scripts/run_job.py`: the runner.
- `src/fow_chess/lab/`: store + manifest helpers.
