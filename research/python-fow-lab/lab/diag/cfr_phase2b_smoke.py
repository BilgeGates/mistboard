"""Phase 2b smoke: Deep CFR on the same 38 annotated blunder positions.

Mirrors ``cfr_phase1_smoke.py`` but swaps tabular ``solve_subgame`` for
``solve_subgame_deep_cfr`` with the FoW encoder + regret/strategy nets.
Phase 2 simplification: root marginals are truth-singleton (built via
``factored_marginals_from_truth``) — Phase 3 will replace this with
multi-particle BeliefState derivation from real prior observation history.

Gate 2b: match or exceed Phase 1b's argmax-match-suggested (28.9%) and
direction-correct (82%) rates.

Run:
    PYTHONPATH=src .venv/bin/python lab/diag/cfr_phase2b_smoke.py

Env-tunable knobs (override at the shell):
    CFR_DEPTH=3 CFR_ITERATIONS=50 CFR_TRAJECTORIES=100
    CFR_REGRET_EPOCHS=10 CFR_STRATEGY_EPOCHS=20
    CFR_LEAF_EVAL=hybrid_fog   # default: material
"""

from __future__ import annotations

import json
import multiprocessing as mp
import os
import sys
import time
from pathlib import Path

import chess
import torch

from fow_chess.cfr.deep_cfr import solve_subgame_deep_cfr
from fow_chess.cfr.encoders import FowFactoredMarginalsEncoder
from fow_chess.cfr.leaf_eval import hybrid_fog_leaf_eval, material_leaf_eval
from fow_chess.cfr.regret_net import FowRegretNet
from fow_chess.cfr.strategy_net import FowStrategyNet
from fow_chess.cfr.walker import SubgameNode, factored_marginals_from_truth
from fow_chess.evaluator import fow_evaluator, material_score


# Settings — Phase 2 defaults match cfr-phase2-spec.md §"Local Mac feasibility".
CFR_DEPTH = int(os.environ.get("CFR_DEPTH", "3"))
CFR_ITERATIONS = int(os.environ.get("CFR_ITERATIONS", "50"))
CFR_TRAJECTORIES = int(os.environ.get("CFR_TRAJECTORIES", "100"))
CFR_REGRET_EPOCHS = int(os.environ.get("CFR_REGRET_EPOCHS", "10"))
CFR_STRATEGY_EPOCHS = int(os.environ.get("CFR_STRATEGY_EPOCHS", "20"))
CFR_VALUE_SAMPLES = int(os.environ.get("CFR_VALUE_SAMPLES", "500"))
SAMPLE_MAJOR = int(os.environ.get("SAMPLE_MAJOR", "30"))
SAMPLE_MINOR = int(os.environ.get("SAMPLE_MINOR", "20"))
WORKERS_OVERRIDE = os.environ.get("WORKERS")

LEAF_EVAL_KIND = os.environ.get("CFR_LEAF_EVAL", "material")
_LEAF_EVAL_MAP = {
    "material": material_leaf_eval,
    "hybrid_fog": hybrid_fog_leaf_eval,
}
if LEAF_EVAL_KIND not in _LEAF_EVAL_MAP:
    raise ValueError(
        f"CFR_LEAF_EVAL={LEAF_EVAL_KIND!r}; expected one of {list(_LEAF_EVAL_MAP)}"
    )
LEAF_EVAL = _LEAF_EVAL_MAP[LEAF_EVAL_KIND]

ANNOTATIONS_PATH = Path(__file__).parents[2] / "feedback" / "annotations.jsonl"
_PHASE_TAG = "phase2b-material" if LEAF_EVAL_KIND == "material" else "phase2b-hybrid_fog"
# Default filename omits iter count for backward compat with the original Gate 2b
# artifact. Set CFR_RESULTS_SUFFIX to include iter+traj info (e.g., "-100iter") to
# avoid overwriting prior results when re-running with different settings.
_RESULTS_SUFFIX = os.environ.get("CFR_RESULTS_SUFFIX", "")
RESULTS_PATH = (
    Path(__file__).parent / f"cfr-{_PHASE_TAG}{_RESULTS_SUFFIX}-smoke-results.json"
)


EXCLUDE_TAGS = {"opponent-blunder"}


# ---------------------------------------------------------------------------
# Helpers (mostly duplicated from cfr_phase1_smoke.py for worker pickling).
# ---------------------------------------------------------------------------


def _reconstruct_board_before(
    board_after: chess.Board,
    move: chess.Move,
    mover_color: chess.Color,
) -> chess.Board:
    moving_piece_after = board_after.piece_at(move.to_square)
    if moving_piece_after is None:
        raise RuntimeError("no piece at destination in board_after")
    if move.promotion is not None:
        original_piece = chess.Piece(chess.PAWN, moving_piece_after.color)
    else:
        original_piece = moving_piece_after
    opp_color = not original_piece.color
    capture_options: list[chess.Piece | None] = [None] + [
        chess.Piece(pt, opp_color)
        for pt in (chess.PAWN, chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN)
    ]
    candidates: list[tuple[chess.Board, chess.Piece | None]] = []
    for captured in capture_options:
        candidate = board_after.copy()
        candidate.remove_piece_at(move.to_square)
        candidate.set_piece_at(move.from_square, original_piece)
        if captured is not None:
            candidate.set_piece_at(move.to_square, captured)
        candidate.turn = mover_color
        if move not in candidate.pseudo_legal_moves:
            continue
        test = candidate.copy()
        test.push(move)
        if test.board_fen() == board_after.board_fen():
            candidates.append((candidate, captured))
    if not candidates:
        raise RuntimeError("could not reconstruct board_before")
    for cb, cap in candidates:
        if cap is None:
            return cb
    return candidates[0][0]


def _fow_score_all(board: chess.Board, perspective: chess.Color) -> dict[str, float]:
    evaluate = fow_evaluator()
    return {mv.uci(): evaluate(board, mv, perspective) for mv in board.pseudo_legal_moves}


# ---------------------------------------------------------------------------
# Worker
# ---------------------------------------------------------------------------


def _solve_one(ann: dict) -> dict:
    """Run Deep CFR + fow on one annotation."""
    # Keep each worker single-threaded — multiprocess parallelism is across
    # positions, not within a single regret-net forward pass.
    torch.set_num_threads(1)
    try:
        placement = ann["board_fen_after"]
        move_played_color_str = ann["move_played_color"]
        mover_color = chess.WHITE if move_played_color_str == "white" else chess.BLACK
        to_move_after = "b" if move_played_color_str == "white" else "w"
        board_after = chess.Board(f"{placement} {to_move_after} - - 0 1")
        played = chess.Move.from_uci(ann["move_played_uci"])
        suggested = chess.Move.from_uci(ann["suggested_move_uci"])
        board_before = _reconstruct_board_before(board_after, played, mover_color)

        marginals_white = factored_marginals_from_truth(board_before, chess.WHITE)
        marginals_black = factored_marginals_from_truth(board_before, chess.BLACK)
        root = SubgameNode.root(
            board_before,
            to_move=mover_color,
            marginals_white=marginals_white,
            marginals_black=marginals_black,
        )
        encoder = FowFactoredMarginalsEncoder()

        def regret_factory():
            return FowRegretNet(
                feature_dim=encoder.feature_dim, num_actions=encoder.num_actions
            )

        def strategy_factory():
            return FowStrategyNet(
                feature_dim=encoder.feature_dim, num_actions=encoder.num_actions
            )

        t0 = time.monotonic()
        sol = solve_subgame_deep_cfr(
            root,
            encoder,
            regret_factory,
            avg_strategy_net_factory=strategy_factory,
            depth=CFR_DEPTH,
            leaf_eval=LEAF_EVAL,
            iterations=CFR_ITERATIONS,
            trajectories_per_iter=CFR_TRAJECTORIES,
            regret_train_epochs=CFR_REGRET_EPOCHS,
            avg_strategy_train_epochs=CFR_STRATEGY_EPOCHS,
            value_estimate_samples=CFR_VALUE_SAMPLES,
        )
        cfr_wall = time.monotonic() - t0

        cfr_strat = {mv.uci(): p for mv, p in sol.strategy_at_root.items()}
        cfr_argmax = max(cfr_strat.items(), key=lambda kv: kv[1])
        cfr_played_prob = cfr_strat.get(played.uci(), 0.0)
        cfr_suggested_prob = cfr_strat.get(suggested.uci(), 0.0)

        fow_scores = _fow_score_all(board_before, mover_color)
        fow_argmax = max(fow_scores.items(), key=lambda kv: kv[1])
        fow_played = fow_scores.get(played.uci(), float("-inf"))
        fow_suggested = fow_scores.get(suggested.uci(), float("-inf"))

        return {
            "annotation_id": ann["id"],
            "severity": ann["severity"],
            "tags": ann.get("tags", []),
            "game_path": ann.get("game_path"),
            "ply": ann.get("ply"),
            "mover_color": move_played_color_str,
            "played": played.uci(),
            "suggested": suggested.uci(),
            "material_cp_before": material_score(board_before, mover_color),
            "n_legal_moves": len(list(board_before.pseudo_legal_moves)),
            "cfr_wall_seconds": cfr_wall,
            "cfr_value_at_root": sol.value_at_root,
            "cfr_info_set_count": sol.info_set_count,
            "cfr_played_prob": cfr_played_prob,
            "cfr_suggested_prob": cfr_suggested_prob,
            "cfr_argmax_move": cfr_argmax[0],
            "cfr_argmax_prob": cfr_argmax[1],
            "fow_played_cp": fow_played,
            "fow_suggested_cp": fow_suggested,
            "fow_argmax_move": fow_argmax[0],
            "fow_argmax_cp": fow_argmax[1],
            "direction_correct_cfr": cfr_suggested_prob > cfr_played_prob,
            "direction_correct_fow": fow_suggested > fow_played,
            "argmax_match_suggested_cfr": cfr_argmax[0] == suggested.uci(),
            "argmax_match_suggested_fow": fow_argmax[0] == suggested.uci(),
        }
    except Exception as e:
        return {
            "annotation_id": ann.get("id"),
            "severity": ann.get("severity"),
            "error": f"{type(e).__name__}: {e}",
        }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def _is_well_formed(ann: dict) -> bool:
    if any(t in EXCLUDE_TAGS for t in ann.get("tags", [])):
        return False
    try:
        placement = ann["board_fen_after"]
        mover_color_str = ann["move_played_color"]
        mover_color = chess.WHITE if mover_color_str == "white" else chess.BLACK
        to_move_after = "b" if mover_color_str == "white" else "w"
        board_after = chess.Board(f"{placement} {to_move_after} - - 0 1")
        played = chess.Move.from_uci(ann["move_played_uci"])
        suggested = chess.Move.from_uci(ann["suggested_move_uci"])
        board_before = _reconstruct_board_before(board_after, played, mover_color)
        return suggested in board_before.pseudo_legal_moves
    except Exception:
        return False


def _stratified_sample(annotations: list[dict]) -> list[dict]:
    by_sev: dict[str, list[dict]] = {"major": [], "minor": []}
    for ann in annotations:
        if ann.get("suggested_move_uci") is None:
            continue
        if ann.get("move_played_uci") is None:
            continue
        sev = ann.get("severity")
        if sev not in by_sev:
            continue
        if not _is_well_formed(ann):
            continue
        by_sev[sev].append(ann)
    sample: list[dict] = []
    sample.extend(by_sev["major"][:SAMPLE_MAJOR])
    sample.extend(by_sev["minor"][:SAMPLE_MINOR])
    return sample


def _write_results(
    results: list[dict],
    sample_total: int,
    n_workers: int,
    elapsed_seconds: float,
    partial: bool,
) -> None:
    """Atomic write of (possibly partial) results to RESULTS_PATH.

    Writes to a tmp file + renames so a kill mid-write never produces a
    corrupted JSON. ``partial=True`` is set while the run is in progress;
    flipped to False on the final write.
    """
    payload = {
        "partial": partial,
        "completed": len(results),
        "total": sample_total,
        "elapsed_seconds": elapsed_seconds,
        "settings": {
            "depth": CFR_DEPTH,
            "iterations": CFR_ITERATIONS,
            "trajectories_per_iter": CFR_TRAJECTORIES,
            "regret_train_epochs": CFR_REGRET_EPOCHS,
            "avg_strategy_train_epochs": CFR_STRATEGY_EPOCHS,
            "value_samples": CFR_VALUE_SAMPLES,
            "leaf_eval": LEAF_EVAL_KIND,
        },
        "n_workers": n_workers,
        "summary": _summarize(results),
        "results": results,
    }
    tmp = RESULTS_PATH.with_suffix(RESULTS_PATH.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, default=str))
    tmp.replace(RESULTS_PATH)


def _load_resume_state() -> list[dict]:
    """If a partial result file exists, return its completed results so we
    can skip them on this run."""
    if not RESULTS_PATH.exists():
        return []
    try:
        existing = json.loads(RESULTS_PATH.read_text())
    except Exception as exc:
        print(f"Could not parse existing results file ({exc}); starting fresh.")
        return []
    if not existing.get("partial"):
        print(
            f"Existing results file is complete ({existing.get('total', '?')} "
            "positions). Overwrite by deleting it; otherwise this run exits."
        )
        sys.exit(0)
    return list(existing.get("results", []))


def _summarize(results: list[dict]) -> dict:
    valid = [r for r in results if "error" not in r]
    if not valid:
        return {"n_attempted": len(results), "n_valid": 0}
    n = len(valid)
    return {
        "n_attempted": len(results),
        "n_valid": n,
        "n_errors": len(results) - n,
        "cfr_direction_hit_rate": sum(1 for r in valid if r["direction_correct_cfr"]) / n,
        "fow_direction_hit_rate": sum(1 for r in valid if r["direction_correct_fow"]) / n,
        "cfr_argmax_match_rate": sum(
            1 for r in valid if r["argmax_match_suggested_cfr"]
        ) / n,
        "fow_argmax_match_rate": sum(
            1 for r in valid if r["argmax_match_suggested_fow"]
        ) / n,
        "cfr_avg_wall_seconds": sum(r["cfr_wall_seconds"] for r in valid) / n,
        "cfr_avg_value_at_root": sum(r["cfr_value_at_root"] for r in valid) / n,
    }


def main() -> None:
    with ANNOTATIONS_PATH.open() as f:
        annotations = [json.loads(line) for line in f if line.strip()]

    sample = _stratified_sample(annotations)
    print(f"Loaded {len(annotations)} annotations; sampled {len(sample)}.")
    print(
        f"Settings: depth={CFR_DEPTH}, iterations={CFR_ITERATIONS}, "
        f"trajectories={CFR_TRAJECTORIES}, regret_epochs={CFR_REGRET_EPOCHS}, "
        f"strategy_epochs={CFR_STRATEGY_EPOCHS}, leaf_eval={LEAF_EVAL_KIND}"
    )

    n_workers = (
        int(WORKERS_OVERRIDE)
        if WORKERS_OVERRIDE
        else max(1, min(os.cpu_count() or 4, len(sample)))
    )

    # Resume-from-partial-if-present.
    prior_results = _load_resume_state()
    done_ids = {r.get("annotation_id") for r in prior_results if "error" not in r}
    remaining = [a for a in sample if a["id"] not in done_ids]
    if prior_results:
        print(
            f"Resuming: {len(prior_results)} positions already complete; "
            f"{len(remaining)} positions remaining."
        )
    print(f"Running on {n_workers} parallel workers...")

    t0 = time.monotonic()
    results: list[dict] = list(prior_results)
    # Persist the resumed state immediately so a kill before any new work
    # leaves an explicit partial artifact (not "no file written").
    _write_results(
        results, len(sample), n_workers, time.monotonic() - t0, partial=True
    )

    if remaining:
        with mp.Pool(processes=n_workers) as pool:
            for i, result in enumerate(
                pool.imap_unordered(_solve_one, remaining),
                start=len(prior_results) + 1,
            ):
                results.append(result)
                elapsed = time.monotonic() - t0
                aid = (result.get("annotation_id") or "?")[:8]
                err = result.get("error")
                tag = f" ERROR={err}" if err else ""
                print(
                    f"[{i}/{len(sample)}] {aid} elapsed={elapsed:.0f}s{tag}",
                    flush=True,
                )
                _write_results(
                    results, len(sample), n_workers, elapsed, partial=True
                )

    wall = time.monotonic() - t0
    _write_results(results, len(sample), n_workers, wall, partial=False)
    print(f"Total wall: {wall:.1f}s")
    print(f"Wrote {RESULTS_PATH}")

    summary = _summarize(results)
    print()
    print("Summary:")
    for k, v in summary.items():
        if isinstance(v, float):
            print(f"  {k}: {v:.3f}")
        else:
            print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
