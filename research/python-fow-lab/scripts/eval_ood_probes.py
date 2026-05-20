"""Out-of-distribution sanity probes for a value-net evaluator.

A val-accuracy holdout from the same corpus can't catch superficial-pattern
overfit — the val set has the same correlations the train set memorized.
This script runs hand-crafted tactical probes that test whether the
evaluator has learned actual chess principles vs corpus-specific patterns.

Each probe has a position, a candidate move, and a sign assertion (move
should score positively / negatively, sometimes with a magnitude floor).
A "value-net is plausibly chess-aware" requires passing ALL probes.

Usage:
    .venv/bin/python3 scripts/eval_ood_probes.py \\
        --weights lab/nets/value/railway-v1/weights.npz
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import chess

_LAB_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_LAB_ROOT / "src"))

from fow_chess.evaluator import value_net_evaluator, fow_evaluator


@dataclass
class Probe:
    name: str
    fen: str
    move_uci: str
    mover: chess.Color
    # Score expectation: a function (score: float) -> bool returning True
    # iff the score is plausible. We assert this passes.
    expect: Callable[[float], bool]
    expect_description: str
    rationale: str  # one-line explanation of what the probe tests


PROBES: list[Probe] = [
    # =============================================
    # Material — basic capture / hang detection
    # =============================================
    # Position with MORE material so consequences propagate correctly under
    # standard chess (avoiding insufficient-material draws that SF labels
    # would mark ~0). Each FoW-edge probe is paired with a middlegame
    # equivalent that SF can score honestly.
    Probe(
        name="capture-undefended-queen-mid",
        fen="r3k2r/ppp2ppp/8/3q4/3Q4/8/PPP2PPP/R3K2R w KQkq - 0 1",
        move_uci="d4d5",
        mover=chess.WHITE,
        expect=lambda s: s > 500,
        expect_description="> +500 (free queen in middlegame)",
        rationale="Trivial Qxq with both sides having rooks+pawns. SF will rate K+Q+R+P advantage strongly positive (no insufficient-material distortion).",
    ),
    Probe(
        name="queen-takes-defended-pawn-mid",
        fen="r1bqk2r/pppp1ppp/2n2n2/4p3/1Q2P3/3P1N2/PPP2PPP/RNB1KB1R w KQkq - 0 1",
        move_uci="b4b7",
        mover=chess.WHITE,
        expect=lambda s: s < -300,
        expect_description="< -300 (loses queen for pawn)",
        rationale="Qxb7 grabs a pawn but a8 rook recaptures (Rxb7). White loses Q (9) for P+R (1+5) net -3. Middlegame position with full material — SF will see the loss.",
    ),
    Probe(
        name="hang-queen-mid",
        fen="r3k2r/ppp2ppp/8/8/3Q4/8/PPP1rPPP/R3K2R w KQkq - 0 1",
        move_uci="d4d2",
        mover=chess.WHITE,
        expect=lambda s: s < -400,
        expect_description="< -400 (Rxd2 next ply, both sides have material left)",
        rationale="Qd4-d2 hangs the queen to Rxd2 in a middlegame with rooks+pawns. SF sees this as a clear blunder (-8 material with enough material left to convert).",
    ),
    # =============================================
    # Equal-or-favorable trades
    # =============================================
    Probe(
        name="rook-trade-equal",
        fen="4k3/8/8/3r4/8/3R4/8/4K3 w - - 0 1",
        move_uci="d3d5",
        mover=chess.WHITE,
        expect=lambda s: abs(s) < 400,
        expect_description="|s| < 400 (rough rook trade)",
        rationale="Rxd5 captures black rook, no defender → clean rook trade ≈ +5 material.",
    ),
    Probe(
        name="capture-rook-with-knight",
        fen="4k3/8/8/3r4/8/4N3/8/4K3 w - - 0 1",
        move_uci="e3d5",
        mover=chess.WHITE,
        expect=lambda s: s > 100,
        expect_description="> +100 (gains R for N)",
        rationale="Knight takes undefended rook — clear material gain.",
    ),
    # =============================================
    # King safety / endgame conversion
    # =============================================
    Probe(
        name="promote-to-queen",
        fen="4k3/4P3/8/8/8/8/8/4K3 w - - 0 1",
        move_uci="e7e8q",
        mover=chess.WHITE,
        expect=lambda s: s > 300,
        expect_description="> +300 (pawn promotes, winning)",
        rationale="Push pawn to queen with no opposition — must score very positive.",
    ),
    Probe(
        name="walk-king-into-attack-mid",
        fen="r3k2r/ppp2ppp/8/8/4r3/8/PPP1KPPP/R6R w kq - 0 1",
        move_uci="e2e3",
        mover=chess.WHITE,
        expect=lambda s: s < -300,
        expect_description="< -300 (king walks onto attacked file mid-game)",
        rationale="Ke2-e3 puts king on the e-file with black rook on e4 — Rxe3 wins the king/material. With both sides having material, SF sees this as clearly bad.",
    ),
    # =============================================
    # Threat / tactic recognition
    # =============================================
    Probe(
        name="capture-loose-bishop",
        fen="4k3/8/8/4b3/8/8/8/3RK3 w - - 0 1",
        move_uci="d1d8",
        mover=chess.WHITE,
        expect=lambda s: abs(s) < 600,
        expect_description="|s| < 600 (rook activity, not a clear blunder)",
        rationale="Active rook on 8th rank — should be roughly even / mildly +.",
    ),
    Probe(
        name="back-rank-mate-defense",
        fen="6k1/5ppp/8/8/8/8/8/4R1K1 b - - 0 1",
        move_uci="h7h6",
        mover=chess.BLACK,
        expect=lambda s: s > -200,
        expect_description="> -200 (creates luft, not catastrophic)",
        rationale="...h6 creates king luft, preventing back-rank mate. Reasonable defensive move.",
    ),
    # =============================================
    # Engine roof: terminal captures (sanity)
    # =============================================
    Probe(
        name="capture-opp-king",
        fen="4k3/4Q3/8/8/8/8/8/4K3 w - - 0 1",
        move_uci="e7e8",
        mover=chess.WHITE,
        expect=lambda s: s > 50000,
        expect_description="> 50000 (terminal win, short-circuit)",
        rationale="King capture short-circuit — must register as terminal win.",
    ),
]


def run(weights_path: str, *, compare_fow: bool = True) -> int:
    val = value_net_evaluator(weights_path)
    fow = fow_evaluator() if compare_fow else None

    print(f"OOD probes for {weights_path}")
    print(f"  expectation column = what the evaluator should output")
    print(f"  fow column = hand-tuned baseline reference, not used in pass/fail")
    print()
    header = f"  {'#':>2} {'probe':<32} {'expect':<25} {'val':>9} {'fow':>9} {'pass'}"
    print(header)
    print("  " + "-" * (len(header) - 2))

    passed = 0
    failed: list[tuple[Probe, float]] = []
    for i, p in enumerate(PROBES, 1):
        board = chess.Board(p.fen)
        move = chess.Move.from_uci(p.move_uci)
        v = val(board, move, p.mover)
        f = fow(board, move, p.mover) if fow else float("nan")
        ok = p.expect(v)
        verdict = "✓" if ok else "✗"
        print(
            f"  {i:>2} {p.name:<32} {p.expect_description:<25} "
            f"{v:>+9.1f} {f:>+9.1f} {verdict}"
        )
        if ok:
            passed += 1
        else:
            failed.append((p, v))

    print()
    n = len(PROBES)
    print(f"  passed: {passed} / {n}")
    if failed:
        print(f"  FAILED PROBES (these are the blunders the eval would make):")
        for p, v in failed:
            print(f"    - {p.name}: scored {v:+.1f}, expected {p.expect_description}")
            print(f"      rationale: {p.rationale}")
        return 1
    print("  → all probes pass; the eval is plausibly chess-aware.")
    print("    (Not sufficient for shipping — still requires bake-off vs baseline.)")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--weights", required=True, help="path to value net .npz")
    ap.add_argument("--no-fow-compare", action="store_true", help="skip fow_evaluator reference column")
    args = ap.parse_args()
    return run(args.weights, compare_fow=not args.no_fow_compare)


if __name__ == "__main__":
    sys.exit(main())
