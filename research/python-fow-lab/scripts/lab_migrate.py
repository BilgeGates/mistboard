"""Migrate existing distill/v0..v3 + nets into the lab/ store with manifests.

One-off script. Idempotent — running twice is safe; existing artifacts are
left in place.

After running, the layout under research/python-fow-lab/lab/ becomes:

    lab/corpora/c0/    ← distill/v0  (outcome labels, 50 games, 1602 pos)
    lab/corpora/c1/    ← distill/v1  (q labels, 50 games, 1602 pos)
    lab/corpora/c2/    ← distill/v2  (q labels, 200 games, 4522 pos)
    lab/corpora/c3/    ← distill/v3  (q labels from v2 teacher, 4502 pos)
    lab/nets/psqt/v0/  ← psqt trained on c0
    lab/nets/psqt/v1/  ← psqt trained on c1
    lab/nets/psqt/v2/  ← psqt trained on c2  (CHAMPION)
    lab/nets/psqt/v3/  ← psqt trained on c3
    lab/nets/mlp/v0_from_c2/  ← mlp trained on c2
    lab/nets/mlp/v0_from_c3/  ← mlp trained on c3
    lab/champions.json       ← {"psqt": "nets/psqt/v2", "mlp": null, "overall": "nets/psqt/v2"}

The migration source-of-truth for metrics is what we observed in bake-offs
during the 2026-05-17 session — see [[engine-distributed-foundations]].
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

_LAB_ROOT_REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_LAB_ROOT_REPO / "src"))

from fow_chess.lab import manifest as mf
from fow_chess.lab.store import lab_root, set_champion


# Each corpus migration spec: source dir, dest c-id, label mode, games, teacher ref
_CORPORA = [
    {
        "src": "distill/v0", "dst": "c0",
        "label_mode": "outcome", "games": 50, "rollouts": 200,
        "teacher": "fow", "seed": 42,
        "notes": "v0 — outcome labels (+/-1000), 50 games of MCTS-fow self-play. "
                 "Trained PSQT-v0 lost -35 Elo to fow_evaluator inside MCTS.",
    },
    {
        "src": "distill/v1", "dst": "c1",
        "label_mode": "q", "games": 50, "rollouts": 200,
        "teacher": "fow", "seed": 42,
        "notes": "v1 — q-value labels (MCTS root q, cp), same 50-game scale. "
                 "Trained PSQT-v1 beat fow +56 Elo (+91 vs PSQT-v0).",
    },
    {
        "src": "distill/v2", "dst": "c2",
        "label_mode": "q", "games": 200, "rollouts": 200,
        "teacher": "fow", "seed": 1000,
        "notes": "v2 — q labels, 4x scale (200 games). Trained PSQT-v2 beat "
                 "fow +63 Elo, beat PSQT-v1 +56 Elo. The local champion.",
    },
    {
        "src": "distill/v3", "dst": "c3",
        "label_mode": "q", "games": 200, "rollouts": 200,
        "teacher": "nets/psqt/v2", "seed": 2000,
        "notes": "v3 — q labels from MCTS-PSQT-v2 self-play (expert iteration). "
                 "PSQT-v3 regressed -21 vs v2 (linear PSQT hit capacity ceiling). "
                 "MLP-v3 also lost -42 to v2.",
    },
]


# Each net migration spec
_NETS = [
    {
        "arch": "psqt", "version": "v0",
        "src_weights": "distill/v0/psqt.npz", "corpus": "c0",
        "metrics": {"val_rmse": 614.3, "val_sign_agreement": 0.869, "elo_vs_fow": -35, "elo_vs_fow_ci": 69},
        "notes": "PSQT trained on outcome labels. Lost -35 Elo to fow inside MCTS at 200 rollouts.",
    },
    {
        "arch": "psqt", "version": "v1",
        "src_weights": "distill/v1/psqt.npz", "corpus": "c1",
        "metrics": {"val_rmse": 998.4, "val_sign_agreement": 0.706, "elo_vs_fow": 56, "elo_vs_fow_ci": 70},
        "notes": "PSQT on q-labels. First evidence distillation works (+91 vs v0).",
    },
    {
        "arch": "psqt", "version": "v2",
        "src_weights": "distill/v2/psqt.npz", "corpus": "c2",
        "metrics": {"val_rmse": 906.3, "val_sign_agreement": 0.728, "elo_vs_fow": 63, "elo_vs_fow_ci": 70, "elo_vs_psqt_v1": 56},
        "notes": "Local champion. +63 Elo over fow_evaluator. Compound distillation from v1.",
    },
    {
        "arch": "psqt", "version": "v3",
        "src_weights": "distill/v3/psqt.npz", "corpus": "c3",
        "metrics": {"val_rmse": 601.2, "val_sign_agreement": 0.958, "elo_vs_fow": 21, "elo_vs_fow_ci": 69, "elo_vs_psqt_v2": -21},
        "notes": "Expert iteration regressed. Linear PSQT can't absorb sharper labels.",
    },
    {
        "arch": "mlp", "version": "v0_from_c2",
        "src_weights": "distill/v2/mlp.pt", "corpus": "c2",
        "metrics": {"val_rmse": 893.3, "val_sign_agreement": 0.741, "elo_vs_psqt_v2": -35, "elo_vs_psqt_v2_ci": 69},
        "notes": "MLP (768→256→64→1, ~205k params) on c2. Lost -35 Elo to PSQT-v2 (overfit).",
    },
    {
        "arch": "mlp", "version": "v0_from_c3",
        "src_weights": "distill/v3/mlp.pt", "corpus": "c3",
        "metrics": {"val_rmse": 592.4, "val_sign_agreement": 0.958, "elo_vs_psqt_v2": -42, "elo_vs_psqt_v2_ci": 70},
        "notes": "MLP on sharper c3 labels. Lost -42 Elo to PSQT-v2. Capacity didn't rescue overfit.",
    },
]


def main() -> int:
    lab = lab_root()
    repo = _LAB_ROOT_REPO

    # --- Corpora ---
    for spec in _CORPORA:
        src = repo / spec["src"]
        dst = lab / "corpora" / spec["dst"]
        if not src.exists():
            print(f"  skip corpus {spec['src']} → {dst.name}: src missing")
            continue
        dst.mkdir(parents=True, exist_ok=True)
        # Copy the corpus jsonl
        for fname in ("corpus.jsonl",):
            if (src / fname).exists() and not (dst / fname).exists():
                shutil.copy2(src / fname, dst / fname)
        # Read source meta for stats — but count actual disk lines for
        # n_positions because the v2 generator pre-fsync lost some buffered
        # writes despite a clean exit. meta is for hints; disk is truth.
        src_meta_path = src / "meta.json"
        src_meta = json.loads(src_meta_path.read_text()) if src_meta_path.exists() else {}
        n_positions = 0
        with (dst / "corpus.jsonl").open("r") as f:
            for _ in f:
                n_positions += 1
        wall = src_meta.get("wall_seconds", 0)
        winners = {"white": 0, "black": 0, "none": 0}
        for g in src_meta.get("summary", []):
            w = g.get("winner") or "none"
            winners[w] = winners.get(w, 0) + 1

        manifest = mf.build(
            type="corpus",
            id=spec["dst"],
            spec={
                "type": "generate-corpus",
                "games": spec["games"],
                "rollouts": spec["rollouts"],
                "label_mode": spec["label_mode"],
                "teacher": spec["teacher"],
                "seed": spec["seed"],
            },
            inputs={"teacher": spec["teacher"]},
            outputs={"corpus": "corpus.jsonl"},
            metrics={
                "n_positions": n_positions,
                "n_games": spec["games"],
                "wall_seconds": wall,
                "winners": winners,
            },
            lineage=[spec["teacher"]] if spec["teacher"] != "fow" else [],
            notes=spec["notes"],
        )
        mf.write(mf.manifest_path(dst), manifest)
        print(f"  corpus {spec['dst']:>3}: {n_positions:>5} positions, teacher={spec['teacher']}")

    # --- Nets ---
    for spec in _NETS:
        src_w = repo / spec["src_weights"]
        if not src_w.exists():
            print(f"  skip net {spec['arch']}/{spec['version']}: weights missing")
            continue
        dst = lab / "nets" / spec["arch"] / spec["version"]
        dst.mkdir(parents=True, exist_ok=True)
        # Copy weights with arch-specific filename
        weights_filename = "weights.npz" if spec["arch"] == "psqt" else "weights.pt"
        dst_w = dst / weights_filename
        if not dst_w.exists():
            shutil.copy2(src_w, dst_w)

        manifest = mf.build(
            type="net",
            id=f"{spec['arch']}/{spec['version']}",
            spec={
                "type": "train",
                "arch": spec["arch"],
                "corpus": spec["corpus"],
            },
            inputs={"corpus": f"corpora/{spec['corpus']}"},
            outputs={"weights": weights_filename},
            metrics=spec["metrics"],
            lineage=[spec["corpus"]],
            notes=spec["notes"],
        )
        mf.write(mf.manifest_path(dst), manifest)
        print(f"  net {spec['arch']}/{spec['version']:<14}: corpus={spec['corpus']}")

    # --- Champions ---
    # PSQT-v2 is the strongest validated network in this lab so far.
    champions = {
        "psqt": "nets/psqt/v2",
        "mlp": None,           # no MLP beats PSQT-v2 yet
        "overall": "nets/psqt/v2",
    }
    set_champion("psqt", champions["psqt"])
    set_champion("mlp", champions["mlp"])
    set_champion("overall", champions["overall"])
    print(f"  champion: psqt → {champions['psqt']}, overall → {champions['overall']}")

    print(f"\nlab/ migrated at {lab}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
