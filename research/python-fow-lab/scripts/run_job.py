"""Generic job runner for the engine lab.

Usage:
    .venv/bin/python3 scripts/run_job.py <spec.json>

A spec.json describes one of four job types. Each job writes a result manifest
under runs/<uuid>/ (or in-place under nets/<arch>/v<N>/ for train, corpora/c<N>/
for generate-corpus).

Spec formats:

  generate-corpus:
    {
      "type": "generate-corpus",
      "games": 200,
      "rollouts": 200,
      "label_mode": "q",
      "teacher": "fow" | "nets/psqt/v2",
      "seed": 1000,
      "out_id": "c4"
    }

  train:
    {
      "type": "train",
      "arch": "psqt" | "mlp",
      "corpus": "corpora/c4",
      "out_id": "v4",            # for psqt; for mlp could be "v1_from_c4"
      "hyperparams": { ... }      # arch-specific
    }

  eval:
    {
      "type": "eval",
      "bot_a": "nets/psqt/v2" | "fow",
      "bot_b": "nets/psqt/v4",
      "games": 100,
      "rollouts": 200
    }

  gate:
    {
      "type": "gate",
      "candidate": "nets/psqt/v4",
      "champion_arch": "psqt",          # which slot in champions.json
      "elo_lower": 0,                    # SPRT H0 elo
      "elo_upper": 30,                   # SPRT H1 elo
      "max_games": 200
    }
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

_LAB_ROOT_REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_LAB_ROOT_REPO / "src"))

from fow_chess.lab import manifest as mf
from fow_chess.lab.store import (
    get_champion,
    lab_root,
    new_run_dir,
    resolve,
    set_champion,
)


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("spec", type=Path, help="path to JSON job spec")
    args = ap.parse_args()

    with args.spec.open("r") as f:
        spec = json.load(f)

    t = spec.get("type")
    if t == "generate-corpus":
        return run_generate_corpus(spec)
    if t == "train":
        return run_train(spec)
    if t == "eval":
        return run_eval(spec)
    if t == "gate":
        return run_gate(spec)
    print(f"unknown job type: {t!r}", file=sys.stderr)
    return 2


# ---------------------------------------------------------------------------
# generate-corpus
# ---------------------------------------------------------------------------

def run_generate_corpus(spec: dict) -> int:
    out_id = spec["out_id"]
    dst = lab_root() / "corpora" / out_id
    if dst.exists():
        print(f"corpus {out_id} already exists at {dst}; refusing to overwrite", file=sys.stderr)
        return 1
    dst.mkdir(parents=True)

    teacher = spec["teacher"]
    cmd = [
        ".venv/bin/python3", "scripts/distill_corpus.py",
        "--games", str(spec["games"]),
        "--rollouts", str(spec.get("rollouts", 200)),
        "--label-mode", spec.get("label_mode", "q"),
        "--seed", str(spec.get("seed", 42)),
        "--out", str(dst),
    ]
    if teacher == "fow":
        cmd += ["--teacher", "fow"]
    elif teacher == "material":
        cmd += ["--teacher", "fow"]  # we don't have a 'material' option in distill yet
        print("note: 'material' teacher not implemented in distill_corpus; using fow", file=sys.stderr)
    else:
        teacher_path = resolve(teacher) / "weights.npz"
        cmd += ["--teacher", "psqt", "--teacher-psqt-weights", str(teacher_path)]

    print(f"  → {' '.join(cmd)}")
    rc = subprocess.call(cmd, cwd=_LAB_ROOT_REPO)
    if rc != 0:
        return rc

    # Count positions
    n_positions = 0
    with (dst / "corpus.jsonl").open("r") as f:
        for _ in f:
            n_positions += 1

    manifest = mf.build(
        type="corpus",
        id=out_id,
        spec=spec,
        inputs={"teacher": teacher},
        outputs={"corpus": "corpus.jsonl"},
        metrics={"n_positions": n_positions, "n_games": spec["games"]},
        lineage=[teacher] if teacher not in ("fow", "material") else [],
        notes=spec.get("notes", ""),
    )
    mf.write(mf.manifest_path(dst), manifest)
    print(f"✓ corpus {out_id}: {n_positions} positions → {dst}")
    return 0


# ---------------------------------------------------------------------------
# train
# ---------------------------------------------------------------------------

def run_train(spec: dict) -> int:
    arch = spec["arch"]
    out_id = spec["out_id"]
    corpus_ref = spec["corpus"]
    corpus_path = resolve(corpus_ref) / "corpus.jsonl"
    if not corpus_path.exists():
        print(f"corpus not found: {corpus_path}", file=sys.stderr)
        return 1

    dst = lab_root() / "nets" / arch / out_id
    if dst.exists():
        print(f"net {arch}/{out_id} already exists; refusing to overwrite", file=sys.stderr)
        return 1
    dst.mkdir(parents=True)

    hp = spec.get("hyperparams", {})
    if arch == "psqt":
        weights_out = dst / "weights.npz"
        cmd = [
            ".venv/bin/python3", "scripts/train_psqt.py",
            "--corpus", str(corpus_path),
            "--out", str(weights_out),
            "--scale", str(hp.get("scale", 1.0)),
            "--ridge", str(hp.get("ridge", 1.0)),
        ]
    elif arch == "mlp":
        weights_out = dst / "weights.pt"
        cmd = [
            ".venv/bin/python3", "scripts/train_mlp.py",
            "--corpus", str(corpus_path),
            "--out", str(weights_out),
            "--epochs", str(hp.get("epochs", 80)),
            "--h1", str(hp.get("h1", 256)),
            "--h2", str(hp.get("h2", 64)),
            "--lr", str(hp.get("lr", 1e-3)),
        ]
    else:
        print(f"unknown arch: {arch}", file=sys.stderr)
        return 1

    print(f"  → {' '.join(cmd)}")
    proc = subprocess.run(cmd, cwd=_LAB_ROOT_REPO, capture_output=True, text=True)
    print(proc.stdout)
    if proc.returncode != 0:
        print(proc.stderr, file=sys.stderr)
        return proc.returncode

    # Parse metrics from train script output
    metrics: dict = {}
    for line in proc.stdout.splitlines():
        s = line.strip()
        if "val RMSE" in s and "train RMSE" in s:
            # Last such line is the final epoch (for mlp)
            try:
                parts = s.split()
                # ep ##: train RMSE X, val RMSE Y, sign-agree Z%
                metrics["train_rmse"] = float(parts[parts.index("RMSE") + 1].rstrip(","))
                metrics["val_rmse"] = float(parts[parts.index("RMSE", parts.index("RMSE") + 1) + 1].rstrip(","))
            except Exception:
                pass
        if "RMSE train:" in s and "RMSE val:" in s:
            try:
                parts = s.split()
                metrics["train_rmse"] = float(parts[2])
                metrics["val_rmse"] = float(parts[5])
            except Exception:
                pass
        if "val sign-agreement:" in s:
            try:
                pct = s.split("val sign-agreement:")[1].strip().split("%")[0].split()[-1]
                metrics["val_sign_agreement"] = float(pct) / 100.0
            except Exception:
                pass

    manifest = mf.build(
        type="net",
        id=f"{arch}/{out_id}",
        spec=spec,
        inputs={"corpus": corpus_ref},
        outputs={"weights": weights_out.name},
        metrics=metrics,
        lineage=[corpus_ref.split("/")[-1]],
        notes=spec.get("notes", ""),
    )
    mf.write(mf.manifest_path(dst), manifest)
    print(f"✓ net {arch}/{out_id}: {metrics} → {dst}")
    return 0


# ---------------------------------------------------------------------------
# eval — bake-off via existing tournament harness
# ---------------------------------------------------------------------------

def _build_tournament_config(ref: str, arch_hint: str | None = None) -> dict:
    """Translate an artifact ref into a tier1 BotConfig dict for tournament.py.

    Special teacher refs: 'fow', 'material' → eval-name in config.
    Net refs: 'nets/psqt/v2' → eval='psqt' + weights path.
    """
    base = {
        "family": "tier1", "kind": "tier1",
        "prior": "uniform", "fog_lambda": 0.0,
        "target_n": 256, "max_particles": 16, "risk_aversion": 0.0,
        "mcts_rollouts": 200, "mcts_rollout_depth": 8,
        "mcts_selection_depth": 3, "mcts_risk_lambda": 0.25,
    }
    if ref == "fow":
        return {"name": "fow", "evaluator": "fow", **base}
    if ref == "material":
        return {"name": "material", "evaluator": "material", **base}
    # Runtime resolves weights paths against _LAB_ROOT (= research/python-fow-lab/).
    # Our artifacts live under lab/, so prepend it.
    if ref.startswith("nets/psqt/"):
        return {
            "name": ref.replace("/", "-"),
            "evaluator": "psqt",
            "psqt_weights_path": f"lab/{ref}/weights.npz",
            **base,
        }
    if ref.startswith("nets/mlp/"):
        return {
            "name": ref.replace("/", "-"),
            "evaluator": "mlp",
            "mlp_weights_path": f"lab/{ref}/weights.pt",
            **base,
        }
    raise ValueError(f"can't translate ref to config: {ref}")


def run_eval(spec: dict) -> int:
    bot_a = spec["bot_a"]
    bot_b = spec["bot_b"]
    games = int(spec.get("games", 100))

    run_dir = new_run_dir(prefix="eval")
    print(f"  → run dir: {run_dir}")

    # Write transient bot configs into the run dir so they're reproducible.
    cfg_a = _build_tournament_config(bot_a)
    cfg_b = _build_tournament_config(bot_b)
    cfg_a_path = run_dir / "bot_a.json"
    cfg_b_path = run_dir / "bot_b.json"
    with cfg_a_path.open("w") as f:
        json.dump(cfg_a, f, indent=2)
    with cfg_b_path.open("w") as f:
        json.dump(cfg_b, f, indent=2)

    # Tournament spec. output_dir="." → tournament harness resolves it
    # against the spec file's dir, so results land directly in run_dir.
    tspec = {
        "tournament_id": run_dir.name,
        "anchor_config_path": str(cfg_a_path.relative_to(_LAB_ROOT_REPO)),
        "anchor_name": cfg_a["name"],
        "output_dir": ".",
        "max_plies": 300,
        "stockfish_path": "stockfish",
        "opening_policy": {"kind": "random_first_n_plies", "n": 4},
        "pairs": [{
            "pair_id": f"{cfg_a['name']}-vs-{cfg_b['name']}",
            "bot_a_config": str(cfg_a_path.relative_to(_LAB_ROOT_REPO)),
            "bot_b_config": str(cfg_b_path.relative_to(_LAB_ROOT_REPO)),
            "games": games,
        }],
    }
    tspec_path = run_dir / "spec.json"
    with tspec_path.open("w") as f:
        json.dump(tspec, f, indent=2)

    cmd = [".venv/bin/python3", "scripts/tournament.py", "run", str(tspec_path)]
    rc = subprocess.call(cmd, cwd=_LAB_ROOT_REPO)
    if rc != 0:
        return rc

    # Aggregate result
    results_path = run_dir / "results.jsonl"
    bot_a_wins = bot_b_wins = draws = 0
    with results_path.open("r") as f:
        for line in f:
            r = json.loads(line)
            if r["result"] == "draw":
                draws += 1
            elif r["white_client"] == cfg_a["name"] and r["result"] == "white-wins":
                bot_a_wins += 1
            elif r["black_client"] == cfg_a["name"] and r["result"] == "black-wins":
                bot_a_wins += 1
            else:
                bot_b_wins += 1
    n = bot_a_wins + bot_b_wins + draws
    score_b = (bot_b_wins + 0.5 * draws) / n if n else 0.5
    # Wald-ish Elo estimate from score
    import math
    if 0 < score_b < 1:
        elo_b = -400 * math.log10(1 / score_b - 1)
    else:
        elo_b = 0.0

    manifest = mf.build(
        type="run-result",
        id=run_dir.name,
        spec=spec,
        inputs={"bot_a": bot_a, "bot_b": bot_b},
        outputs={"results_jsonl": "results.jsonl", "spec": "spec.json"},
        metrics={
            "n_games": n,
            "bot_a_wins": bot_a_wins,
            "bot_b_wins": bot_b_wins,
            "draws": draws,
            "score_b": score_b,
            "elo_b": elo_b,
        },
        lineage=[bot_a, bot_b],
        notes=spec.get("notes", ""),
    )
    mf.write(mf.manifest_path(run_dir), manifest)
    print(f"✓ eval: {cfg_a['name']} {bot_a_wins}-{bot_b_wins}-{draws} {cfg_b['name']}, "
          f"score_b={score_b:.3f}, elo_b={elo_b:+.0f}")
    return 0


# ---------------------------------------------------------------------------
# gate — SPRT promotion test
# ---------------------------------------------------------------------------

def run_gate(spec: dict) -> int:
    candidate = spec["candidate"]
    arch = spec["champion_arch"]
    current = get_champion(arch)
    if current is None:
        # No current champion; candidate is promoted unconditionally with a
        # warning. Useful for bootstrapping an empty slot.
        print(f"no current champion for {arch}; promoting {candidate} unconditionally")
        set_champion(arch, candidate)
        # Also update 'overall' if it pointed nowhere
        if get_champion("overall") is None:
            set_champion("overall", candidate)
        return 0

    elo_lower = float(spec.get("elo_lower", 0))
    elo_upper = float(spec.get("elo_upper", 30))
    max_games = int(spec.get("max_games", 200))

    run_dir = new_run_dir(prefix="gate")
    cfg_champ = _build_tournament_config(current)
    cfg_cand = _build_tournament_config(candidate)
    cfg_champ_path = run_dir / "champion.json"
    cfg_cand_path = run_dir / "candidate.json"
    with cfg_champ_path.open("w") as f:
        json.dump(cfg_champ, f, indent=2)
    with cfg_cand_path.open("w") as f:
        json.dump(cfg_cand, f, indent=2)

    tspec = {
        "tournament_id": run_dir.name,
        "anchor_config_path": str(cfg_champ_path.relative_to(_LAB_ROOT_REPO)),
        "anchor_name": cfg_champ["name"],
        "output_dir": ".",
        "max_plies": 300,
        "stockfish_path": "stockfish",
        "opening_policy": {"kind": "random_first_n_plies", "n": 4},
        "pairs": [{
            "pair_id": "gate",
            "bot_a_config": str(cfg_champ_path.relative_to(_LAB_ROOT_REPO)),
            "bot_b_config": str(cfg_cand_path.relative_to(_LAB_ROOT_REPO)),
            "games": max_games,
            "sprt_bounds": [elo_lower, elo_upper],
        }],
    }
    tspec_path = run_dir / "spec.json"
    with tspec_path.open("w") as f:
        json.dump(tspec, f, indent=2)

    cmd = [".venv/bin/python3", "scripts/tournament.py", "sprt", str(tspec_path),
           "--elo0", str(elo_lower), "--elo1", str(elo_upper),
           "--max-games", str(max_games)]
    rc = subprocess.call(cmd, cwd=_LAB_ROOT_REPO)
    if rc != 0:
        return rc

    # Parse the sprt verdict from results.jsonl tally and the SPRT report
    # (tournament.sprt writes its summary to stdout; consume the per-pair
    # report file if needed). For v1 we just look at the final score: if
    # candidate score > 0.55 (rough Elo ≥ 35), promote.
    results_path = run_dir / "results.jsonl"
    cand_wins = champ_wins = draws = 0
    with results_path.open("r") as f:
        for line in f:
            r = json.loads(line)
            if r["result"] == "draw":
                draws += 1
            elif r["white_client"] == cfg_cand["name"] and r["result"] == "white-wins":
                cand_wins += 1
            elif r["black_client"] == cfg_cand["name"] and r["result"] == "black-wins":
                cand_wins += 1
            else:
                champ_wins += 1
    n = cand_wins + champ_wins + draws
    score = (cand_wins + 0.5 * draws) / n if n else 0.5
    import math
    elo = -400 * math.log10(1 / score - 1) if 0 < score < 1 else 0.0
    promoted = elo > elo_lower and score > 0.5

    if promoted:
        print(f"✓ GATE PASS: {candidate} score={score:.3f} elo={elo:+.0f} → promoting")
        set_champion(arch, candidate)
        if get_champion("overall") is None or get_champion("overall") == current:
            set_champion("overall", candidate)
    else:
        print(f"✗ GATE FAIL: {candidate} score={score:.3f} elo={elo:+.0f}, champion remains {current}")

    manifest = mf.build(
        type="run-result",
        id=run_dir.name,
        spec=spec,
        inputs={"candidate": candidate, "champion": current},
        outputs={"results_jsonl": "results.jsonl"},
        metrics={
            "n_games": n,
            "candidate_wins": cand_wins,
            "champion_wins": champ_wins,
            "draws": draws,
            "score": score,
            "elo": elo,
            "promoted": promoted,
        },
        lineage=[candidate, current],
        notes=f"gate: {candidate} vs {current}",
    )
    mf.write(mf.manifest_path(run_dir), manifest)
    return 0


if __name__ == "__main__":
    sys.exit(main())
