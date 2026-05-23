"""Stage A1/A2 smoke: tabular CFR on annotated blunders, Stockfish leaf eval.

Same stratified sample and CFR config as ``cfr_phase1_smoke.py`` (Phase 1
/ 1b), but the leaf evaluator is Stockfish at depth 1 instead of
``hybrid_fog``. Optionally enables PCFR+ (Stage A2) via env var. Produces
a results JSON in the same shape so we can diff against Phase 1b and
across stages.

Each multiprocessing worker spawns its own Stockfish subprocess at
init and reuses it for every position in its slice. Subprocess
cleanup happens at worker exit.

Settings (env-overridable):
    CFR_DEPTH=3
    CFR_ITERATIONS=500
    CFR_VALUE_SAMPLES=500
    SAMPLE_MAJOR=30
    SAMPLE_MINOR=20
    CFR_PREDICTIVE=0 (set to 1 for PCFR+ a.k.a. Stage A2)
    CFR_RESULTS_SUFFIX="" (e.g. "-sanity" for shorter sweeps)

Output file:
    cfr-a1-stockfish-smoke-results.json       (vanilla CFR + Stockfish)
    cfr-a2-pcfrplus-stockfish-smoke-results.json (PCFR+ + Stockfish)

Run A2:
    CFR_PREDICTIVE=1 PYTHONPATH=src .venv/bin/python lab/diag/cfr_a1_stockfish_smoke.py
"""

from __future__ import annotations

import json
import multiprocessing as mp
import os
import time
from pathlib import Path

import chess

from fow_chess.cfr.leaf_eval_stockfish import StockfishLeafEval
from fow_chess.cfr.tabular import solve_subgame
from fow_chess.cfr.walker import SubgameNode
from fow_chess.evaluator import fow_evaluator, material_score


CFR_DEPTH = int(os.environ.get("CFR_DEPTH", "3"))
CFR_ITERATIONS = int(os.environ.get("CFR_ITERATIONS", "500"))
CFR_VALUE_SAMPLES = int(os.environ.get("CFR_VALUE_SAMPLES", "500"))
SAMPLE_MAJOR = int(os.environ.get("SAMPLE_MAJOR", "30"))
SAMPLE_MINOR = int(os.environ.get("SAMPLE_MINOR", "20"))
CFR_RESULTS_SUFFIX = os.environ.get("CFR_RESULTS_SUFFIX", "")
CFR_PREDICTIVE = os.environ.get("CFR_PREDICTIVE", "0") == "1"

ANNOTATIONS_PATH = Path(__file__).parents[2] / "feedback" / "annotations.jsonl"
_STAGE_TAG = "a2-pcfrplus-stockfish" if CFR_PREDICTIVE else "a1-stockfish"
RESULTS_PATH = (
    Path(__file__).parent
    / f"cfr-{_STAGE_TAG}{CFR_RESULTS_SUFFIX}-smoke-results.json"
)

EXCLUDE_TAGS = {"opponent-blunder"}


# ---------------------------------------------------------------------------
# Per-worker Stockfish lifecycle
# ---------------------------------------------------------------------------


_worker_sf: StockfishLeafEval | None = None


def _worker_init() -> None:
    """Spawn a Stockfish subprocess for this worker."""
    global _worker_sf
    _worker_sf = StockfishLeafEval()


def _worker_eval(board: chess.Board, perspective: chess.Color) -> float:
    assert _worker_sf is not None, "worker not initialized"
    return _worker_sf.evaluate(board, perspective)


def _worker_fallback_count() -> int:
    return _worker_sf.fallback_count if _worker_sf else 0


# ---------------------------------------------------------------------------
# Board reconstruction (mirrors cfr_phase1_smoke for pickling self-containment)
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
# Per-position solve
# ---------------------------------------------------------------------------


def _solve_one(ann: dict) -> dict:
    try:
        # Track fallbacks for this position only.
        sf_fallback_before = _worker_fallback_count()
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
            leaf_eval=_worker_eval,
            iterations=CFR_ITERATIONS,
            value_estimate_samples=CFR_VALUE_SAMPLES,
            predictive=CFR_PREDICTIVE,
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
            "sf_fallback_calls": _worker_fallback_count() - sf_fallback_before,
        }
    except Exception as e:
        return {
            "annotation_id": ann.get("id"),
            "severity": ann.get("severity"),
            "error": f"{type(e).__name__}: {e}",
        }


# ---------------------------------------------------------------------------
# Sampling + main
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
        f"value_samples={CFR_VALUE_SAMPLES}, leaf_eval=stockfish, "
        f"predictive={CFR_PREDICTIVE}"
    )

    n_workers = max(1, min(os.cpu_count() or 4, len(sample)))
    print(f"Running on {n_workers} parallel workers...")

    t0 = time.monotonic()
    with mp.Pool(processes=n_workers, initializer=_worker_init) as pool:
        results = list(pool.imap_unordered(_solve_one, sample))
    wall = time.monotonic() - t0
    print(f"Total wall: {wall:.1f}s")

    summary = _summarize(results)
    payload = {
        "settings": {
            "depth": CFR_DEPTH,
            "iterations": CFR_ITERATIONS,
            "value_estimate_samples": CFR_VALUE_SAMPLES,
            "sample_major": SAMPLE_MAJOR,
            "sample_minor": SAMPLE_MINOR,
            "leaf_eval": "stockfish",
            "stockfish_depth": 1,
            "predictive": CFR_PREDICTIVE,
        },
        "wall_seconds": wall,
        "summary": summary,
        "results": results,
    }
    with RESULTS_PATH.open("w") as f:
        json.dump(payload, f, indent=2)
    print(f"Wrote {RESULTS_PATH}")
    print()
    print("=== Summary ===")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
