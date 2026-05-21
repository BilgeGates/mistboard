"""Phase 1 smoke: tabular CFR on 10 annotated blunder positions.

Pre-validation for the full Phase 1 experiment. Runs CFR at depth=3 /
iter=500 across a stratified sample of major/minor blunder annotations,
in parallel via multiprocessing. Compares CFR's strategy on the played
vs. human-suggested moves to what fow_evaluator scores them at.

Metrics per position:
- ``direction_correct_cfr``: CFR puts more average-strategy mass on
  ``suggested`` than on ``played``.
- ``direction_correct_fow``: fow_evaluator scores ``suggested`` higher
  than ``played``.
- ``argmax_match_suggested_cfr``: CFR's top move equals the human's
  suggested move.
- ``argmax_match_suggested_fow``: fow_evaluator's argmax move equals
  the human's suggested move.

The interesting Phase 1 question is whether CFR's argmax matches the
human suggestion more often than fow_evaluator's does.

Run:
    cd research/python-fow-lab
    PYTHONPATH=src .venv/bin/python lab/diag/cfr_phase1_smoke.py
"""

from __future__ import annotations

import json
import multiprocessing as mp
import os
import time
from pathlib import Path

import chess

from fow_chess.cfr.leaf_eval import material_leaf_eval
from fow_chess.cfr.tabular import solve_subgame
from fow_chess.cfr.walker import SubgameNode
from fow_chess.evaluator import fow_evaluator, material_score


# Settings — change here if you want a different smoke shape.
CFR_DEPTH = 3
CFR_ITERATIONS = 500
CFR_VALUE_SAMPLES = 500
SAMPLE_MAJOR = 30
SAMPLE_MINOR = 20

ANNOTATIONS_PATH = Path(__file__).parents[2] / "feedback" / "annotations.jsonl"
RESULTS_PATH = Path(__file__).parent / "cfr-phase1-smoke-results.json"


# Tags that indicate the suggested move is for the OPPONENT of move_played_color,
# not for the same player. These annotations are well-formed but require a
# different comparison setup; skip for this phase 1 experiment.
EXCLUDE_TAGS = {"opponent-blunder"}


# ---------------------------------------------------------------------------
# Helpers (duplicated from cfr_deep_dive.py for self-contained worker pickling)
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
    """Score all legal moves under fow_evaluator. Returns {uci: score}."""
    evaluate = fow_evaluator()
    return {mv.uci(): evaluate(board, mv, perspective) for mv in board.pseudo_legal_moves}


# ---------------------------------------------------------------------------
# Worker
# ---------------------------------------------------------------------------


def _solve_one(ann: dict) -> dict:
    """Run CFR + fow on one annotation. Returns a result dict or {'error': ...}."""
    try:
        placement = ann["board_fen_after"]
        move_played_color_str = ann["move_played_color"]
        mover_color = chess.WHITE if move_played_color_str == "white" else chess.BLACK
        to_move_after = "b" if move_played_color_str == "white" else "w"
        board_after = chess.Board(f"{placement} {to_move_after} - - 0 1")
        played = chess.Move.from_uci(ann["move_played_uci"])
        suggested = chess.Move.from_uci(ann["suggested_move_uci"])
        board_before = _reconstruct_board_before(board_after, played, mover_color)

        root = SubgameNode.root(board_before, to_move=mover_color)
        t0 = time.monotonic()
        sol = solve_subgame(
            root,
            depth=CFR_DEPTH,
            leaf_eval=material_leaf_eval,
            iterations=CFR_ITERATIONS,
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
    """Check whether the suggested move is legal for the played-color at board_before.

    Filters out annotations where:
    - tags include EXCLUDE_TAGS (suggested is for opponent, not same player)
    - reconstruction fails (rare edge cases like en passant)
    - suggested move isn't pseudo-legal at the reconstructed board_before
    """
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
    """Pick a stratified sample of well-formed major + minor blunders."""
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


def _summarize(results: list[dict]) -> dict:
    valid = [r for r in results if "error" not in r]
    if not valid:
        return {"n": 0, "valid": 0}
    n = len(valid)
    return {
        "n_attempted": len(results),
        "n_valid": n,
        "n_errors": len(results) - n,
        "cfr_direction_hit_rate": sum(1 for r in valid if r["direction_correct_cfr"]) / n,
        "fow_direction_hit_rate": sum(1 for r in valid if r["direction_correct_fow"]) / n,
        "cfr_argmax_match_rate": sum(1 for r in valid if r["argmax_match_suggested_cfr"]) / n,
        "fow_argmax_match_rate": sum(1 for r in valid if r["argmax_match_suggested_fow"]) / n,
        "cfr_avg_wall_seconds": sum(r["cfr_wall_seconds"] for r in valid) / n,
        "cfr_avg_value_at_root": sum(r["cfr_value_at_root"] for r in valid) / n,
        "agree_direction_count": sum(
            1 for r in valid
            if r["direction_correct_cfr"] == r["direction_correct_fow"]
        ),
        "cfr_only_correct_direction": sum(
            1 for r in valid
            if r["direction_correct_cfr"] and not r["direction_correct_fow"]
        ),
        "fow_only_correct_direction": sum(
            1 for r in valid
            if r["direction_correct_fow"] and not r["direction_correct_cfr"]
        ),
    }


def main() -> None:
    with ANNOTATIONS_PATH.open() as f:
        annotations = [json.loads(line) for line in f if line.strip()]

    sample = _stratified_sample(annotations)
    print(f"Loaded {len(annotations)} annotations; sampled {len(sample)}.")
    print(
        f"Settings: depth={CFR_DEPTH}, iterations={CFR_ITERATIONS}, "
        f"value_samples={CFR_VALUE_SAMPLES}"
    )

    n_workers = max(1, min(os.cpu_count() or 4, len(sample)))
    print(f"Running on {n_workers} parallel workers...")

    t0 = time.monotonic()
    with mp.Pool(processes=n_workers) as pool:
        results = list(pool.imap_unordered(_solve_one, sample))
    wall = time.monotonic() - t0
    print(f"Total wall: {wall:.1f}s")

    summary = _summarize(results)
    payload = {
        "settings": {
            "depth": CFR_DEPTH,
            "iterations": CFR_ITERATIONS,
            "value_samples": CFR_VALUE_SAMPLES,
        },
        "n_workers": n_workers,
        "total_wall_seconds": wall,
        "summary": summary,
        "results": results,
    }
    RESULTS_PATH.write_text(json.dumps(payload, indent=2, default=str))
    print(f"Wrote {RESULTS_PATH}")

    print()
    print("Summary:")
    for k, v in summary.items():
        if isinstance(v, float):
            print(f"  {k}: {v:.3f}")
        else:
            print(f"  {k}: {v}")

    print()
    print("Per-position results:")
    for r in results:
        if "error" in r:
            print(f"  {r.get('annotation_id', '?')[:8]}  ERROR  {r['error']}")
            continue
        sev = r["severity"]
        played = r["played"]
        suggested = r["suggested"]
        cfr_p = r["cfr_played_prob"]
        cfr_s = r["cfr_suggested_prob"]
        fow_p = r["fow_played_cp"]
        fow_s = r["fow_suggested_cp"]
        cfr_dir = "✓" if r["direction_correct_cfr"] else "✗"
        fow_dir = "✓" if r["direction_correct_fow"] else "✗"
        cfr_argmax_ok = "✓" if r["argmax_match_suggested_cfr"] else " "
        fow_argmax_ok = "✓" if r["argmax_match_suggested_fow"] else " "
        print(
            f"  {sev:5}  played={played:5} suggested={suggested:5}  "
            f"CFR p={cfr_p:.2f} s={cfr_s:.2f} dir={cfr_dir} arg{cfr_argmax_ok}  "
            f"fow p={fow_p:+6.0f} s={fow_s:+6.0f} dir={fow_dir} arg{fow_argmax_ok}"
        )


if __name__ == "__main__":
    main()
