"""Analyze a bake-off corpus: scoreline, Elo gap, SPRT verdict.

Reads all rows from lab_games WHERE corpus_id=<bakeoff-id>, sums
challenger_score, and computes:

  - W/D/L (challenger POV) and total points S out of N
  - Empirical score P = S / N (with 0.5 draw weight)
  - Elo gap (Wald 95% CI): elo = 400 * log10(P / (1-P))
  - SPRT LLR with H0=elo0 Elo, H1=elo1 Elo, α=β=0.05
    (default elo0=0, elo1=50 — "challenger is at least neutral, ideally +50")

  Verdict:
    LLR ≥ log((1-β)/α)   → ACCEPT H1 (challenger meaningfully better)
    LLR ≤ log(β/(1-α))   → ACCEPT H0 (challenger not meaningfully better)
    otherwise            → INCONCLUSIVE

Usage:
    .venv/bin/python3 scripts/analyze_bakeoff.py --bakeoff-id b-learned-vs-uniform
"""

from __future__ import annotations

import argparse
import math
import os
import sys
from pathlib import Path

_LAB_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_LAB_ROOT / "src"))

from fow_chess.lab.postgres_store import LabCorpusStore


def _elo_to_score(elo: float) -> float:
    """Logistic Elo: P(win) = 1 / (1 + 10^(-elo/400))."""
    return 1.0 / (1.0 + math.pow(10.0, -elo / 400.0))


def _score_to_elo(p: float) -> float:
    if p <= 0.0:
        return -float("inf")
    if p >= 1.0:
        return float("inf")
    return 400.0 * math.log10(p / (1.0 - p))


def _elo_ci_wald(s: float, n: int) -> tuple[float, float]:
    """95% CI on Elo via Wald on the per-game score, then mapped through logistic."""
    if n == 0:
        return (-float("inf"), float("inf"))
    p = s / n
    # treat each game as Bernoulli with mean p, variance p(1-p). Score-averaging
    # CI: p ± 1.96 * sqrt(p(1-p)/n). For draws this slightly under-states variance,
    # but it's the standard tournament-Elo CI.
    if 0.0 < p < 1.0:
        half = 1.96 * math.sqrt(p * (1.0 - p) / n)
    else:
        half = 1.96 / (2.0 * n)
    lo = max(1e-9, p - half)
    hi = min(1.0 - 1e-9, p + half)
    return (_score_to_elo(lo), _score_to_elo(hi))


def _llr_bernoulli(s: float, n: int, p0: float, p1: float) -> float:
    """LLR of Bernoulli(p1) vs Bernoulli(p0) given total score s out of n.

    Approximates a draw as a half-win, half-loss for log-likelihood purposes —
    valid because we model the per-game score as Bernoulli on the score itself.
    """
    if n == 0:
        return 0.0
    eps = 1e-12
    p0c = min(max(p0, eps), 1 - eps)
    p1c = min(max(p1, eps), 1 - eps)
    return s * math.log(p1c / p0c) + (n - s) * math.log((1 - p1c) / (1 - p0c))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--bakeoff-id", required=True)
    ap.add_argument("--elo0", type=float, default=0.0, help="H0 Elo (default 0)")
    ap.add_argument("--elo1", type=float, default=50.0, help="H1 Elo (default +50)")
    ap.add_argument("--alpha", type=float, default=0.05)
    ap.add_argument("--beta", type=float, default=0.05)
    ap.add_argument("--dsn", default=None)
    args = ap.parse_args()

    dsn = args.dsn or os.environ.get("DATABASE_URL")
    if not dsn:
        print("DATABASE_URL not set (or pass --dsn)", file=sys.stderr)
        return 1

    n = 0
    s = 0.0
    w = d = l = 0
    truncated = 0
    plies_total = 0
    with LabCorpusStore(corpus_id=args.bakeoff_id, dsn=dsn) as store:
        for data in store.iter_games():
            if data.get("kind") != "bakeoff":
                continue
            n += 1
            cs = data.get("challenger_score", 0.5)
            s += cs
            if cs == 1.0:
                w += 1
            elif cs == 0.5:
                d += 1
            else:
                l += 1
            if data.get("winner") is None:
                truncated += 1
            plies_total += data.get("plies", 0)

    if n == 0:
        print(f"no bakeoff games found for {args.bakeoff_id}")
        return 1

    p = s / n
    elo = _score_to_elo(p)
    elo_lo, elo_hi = _elo_ci_wald(s, n)

    p0 = _elo_to_score(args.elo0)
    p1 = _elo_to_score(args.elo1)
    llr = _llr_bernoulli(s, n, p0, p1)
    up = math.log((1 - args.beta) / args.alpha)
    dn = math.log(args.beta / (1 - args.alpha))
    if llr >= up:
        verdict = "ACCEPT H1 (challenger ≥ +{:.0f} Elo)".format(args.elo1)
    elif llr <= dn:
        verdict = "ACCEPT H0 (challenger not meaningfully better)"
    else:
        verdict = "INCONCLUSIVE (need more games)"

    print(f"bakeoff={args.bakeoff_id}")
    print(f"  games:           {n}  ({w}W {d}D {l}L)")
    print(f"  truncated:       {truncated}")
    print(f"  avg plies/game:  {plies_total / n:.1f}")
    print(f"  challenger pts:  {s:.1f} / {n}")
    print(f"  empirical score: {p:.4f}")
    print(f"  Elo:             {elo:+.1f}  (95% CI: {elo_lo:+.1f}, {elo_hi:+.1f})")
    print(f"  SPRT H0=elo0={args.elo0:.0f} H1=elo1={args.elo1:.0f}")
    print(f"    LLR:           {llr:+.3f}  thresholds [{dn:+.3f}, {up:+.3f}]")
    print(f"    verdict:       {verdict}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
