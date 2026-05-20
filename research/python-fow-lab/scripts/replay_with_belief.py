"""Replay specific bake-off games locally with belief capture.

Deterministic: same seed → same game as the original bake-off, plus the
challenger's verbose_belief_capture rows. Writes one belief/trace JSONL
per game index, suitable for the apps/web bakeoff browser's belief panel.

The output JSONLs are aggregated into <out>/belief.jsonl and
<out>/trace.jsonl with each row tagged with game_index + tier1_side +
tier1_seat.

Usage:
    .venv/bin/python3 scripts/replay_with_belief.py \\
        --indices 21,28,38,39,47 \\
        --out /Users/brianliou/projects/mistboard/apps/web/public/bakeoff-railway-stage3 \\
        --challenger-prior learned \\
        --challenger-prior-weights lab/nets/policy/railway-v0/weights.npz \\
        --baseline-prior uniform \\
        --seed 12345
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

_LAB_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_LAB_ROOT / "src"))

from fow_chess.engine import static_builder
from fow_chess.evaluator import fow_evaluator
from fow_chess.move_priors import learned_policy_prior, uniform_prior
from fow_chess.selfplay import play_game
from fow_chess.strategies import Tier1Strategy


def _make_prior(name: str, weights: str | None):
    if name == "uniform":
        return uniform_prior
    if name == "learned":
        if not weights:
            raise ValueError("learned prior requires --*-prior-weights")
        return learned_policy_prior(weights, temperature=1.0)
    raise ValueError(f"unsupported prior: {name}")


def _make_strategy(builder, prior, seed: int, capture: bool):
    return Tier1Strategy(
        evaluator_builder=builder,
        move_prior=prior,
        target_n=256,
        max_eval_particles=16,
        seed=seed,
        mcts_rollouts=0,
        verbose_belief_capture=capture,
    )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--indices", type=str, required=True, help="comma-separated game indices")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--max-plies", type=int, default=200)
    ap.add_argument("--seed", type=int, default=12345)
    ap.add_argument("--challenger-prior", choices=["uniform", "learned"], required=True)
    ap.add_argument("--challenger-prior-weights", type=str, default=None)
    ap.add_argument("--baseline-prior", choices=["uniform", "learned"], required=True)
    ap.add_argument("--baseline-prior-weights", type=str, default=None)
    args = ap.parse_args()

    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)

    builder = static_builder(fow_evaluator())
    challenger_prior = _make_prior(args.challenger_prior, args.challenger_prior_weights)
    baseline_prior = _make_prior(args.baseline_prior, args.baseline_prior_weights)

    indices = sorted({int(s) for s in args.indices.split(",") if s.strip()})
    print(f"replaying games: {indices}  out: {out}")

    belief_path = out / "belief.jsonl"
    trace_path = out / "trace.jsonl"
    # Aggregate across games. Always rewrite.
    bf = belief_path.open("w")
    tf = trace_path.open("w")
    manifest_updates: list[dict] = []

    t_total = time.time()
    for idx in indices:
        color_swap = (idx % 2) == 1
        seed_c = args.seed + idx * 7919
        seed_b = args.seed + idx * 7919 + 1

        chall = _make_strategy(builder, challenger_prior, seed_c, capture=True)
        base = _make_strategy(builder, baseline_prior, seed_b, capture=True)

        if not color_swap:
            white, black = chall, base
        else:
            white, black = base, chall

        chall_side = "black" if color_swap else "white"

        t0 = time.time()
        result = play_game(
            white, black,
            max_plies=args.max_plies,
            room_id=f"b-learned-v0-vs-uniform-g{idx:04d}-{'b' if color_swap else 'a'}white",
            seed=seed_c,
        )
        wall = time.time() - t0

        # Sanity: report any mismatch from the original bake-off
        print(
            f"  g{idx:04d} chall={'B' if color_swap else 'W'} "
            f"winner={result.winner or 'none':<5} plies={result.plies:>3} "
            f"belief_rows={len(chall.belief_log)} trace_rows={len(chall.trace_log)} "
            f"wall={wall:>5.1f}s"
        )

        tag = {"game_index": idx, "tier1_side": chall_side, "tier1_seat": chall_side}
        for row in chall.belief_log:
            bf.write(json.dumps({**tag, **row}) + "\n")
        for row in chall.trace_log:
            tf.write(json.dumps({**tag, **row}) + "\n")

        # Save event log for this replay's actual game (so belief + board stay in sync).
        games_dir = out / "games"
        games_dir.mkdir(exist_ok=True)
        outcome = "draw" if result.winner is None else result.winner
        event_path = games_dir / f"replay-g{idx:04d}-{outcome}-{result.plies}p.jsonl"
        with event_path.open("w") as ef:
            for evt in result.events:
                ef.write(json.dumps(evt) + "\n")
        # And remember the path/metadata for manifest patching
        manifest_updates.append({
            "index": idx,
            "tier1_color": chall_side,
            "outcome": "W" if (result.winner == ("black" if color_swap else "white")) else ("L" if result.winner else "D"),
            "plies": result.plies,
            "end_reason": result.end_reason or "truncated",
            "truncated": result.winner is None,
            "tier1_seed": seed_c,
            "random_seed": seed_b,
            "path": f"games/{event_path.name}",
        })

    bf.close(); tf.close()

    # Rewrite manifest.json to point at the replay's games + flip verbose_belief=true
    manifest_path = out / "manifest.json"
    if manifest_path.exists():
        existing = json.loads(manifest_path.read_text())
        existing["verbose_belief"] = True
        # Re-index 0..N-1 in the order the replay produced
        for i, upd in enumerate(manifest_updates):
            upd["index"] = i
        existing["games"] = manifest_updates
        existing["games_saved"] = len(manifest_updates)
        existing["tier1_record"] = {
            "wins": sum(1 for g in manifest_updates if g["outcome"] == "W"),
            "losses": sum(1 for g in manifest_updates if g["outcome"] == "L"),
            "draws": sum(1 for g in manifest_updates if g["outcome"] == "D"),
        }
        manifest_path.write_text(json.dumps(existing, indent=2))
        print(f"updated {manifest_path} (games={len(manifest_updates)})")

    print(f"wrote {belief_path} + {trace_path} in {time.time() - t_total:.0f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
