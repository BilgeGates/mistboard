# Phase 1c — Hand-validation Report (assistant analysis)

Assistant's read of all 16 positions. User to spot-check and override any
judgments that look wrong. Per-position one or two sentences + verdict.
Aggregate tally at the bottom.

**Caveat:** assistant is not a 2000+ FoW player. Standard-chess judgment +
basic FoW visibility reasoning. Two positions have reconstruction bugs that
prevent a fair read.

## Per-position verdicts

### 1. `g4h6` vs `g4f6` — major, black to move

Both retreat the attacked knight. f6 is centralized, fights for e4 and
attacks an undefended white pawn. h6 is on the rim and passive. Standard
"knight on the rim is dim" principle says f6 is meaningfully better.
**Verdict: `[W]`**

### 2. `a4a3` vs `f5e7` — major, black to move

CFR's `Qxa3` captures the white knight on a3 cleanly (no recapture
reaches a3). After Qxa3 white plays gxf5 winning black's f5 knight; net
result is an even piece trade. Black is already +920 cp, so simplifying
into a won position via the trade is the correct principle. Suggested
Ne7 saves the knight but maintains tension instead of simplifying.
CFR's move actively converts the material lead. **Verdict: `[B]`**

### 3. `d1d5` vs `f1e2` — minor, white to move

CFR's Qxd5 wins an undefended pawn (Black's c6 knight does not attack
d5). Suggested Be2 shields the e1 king, addressing the FoW king-safety
concern explicitly raised in the annotation. Both are defensible: Qxd5
trades safety for material; Be2 trades material for safety. Given white
is already +900, the safety move is arguably wiser, but Qxd5 isn't a
loss. **Verdict: `[C]`**

### 4. `b7b5` vs `e6d5` — minor, black to move

White just pushed a pawn to d5 attacking Black. Suggested exd5 recaptures
the pawn cleanly. CFR's b5 attacks the white bishop on c4 — secondary
concern; doesn't restore material. The clean recapture is correct chess.
**Verdict: `[W]`**

### 5. `f1b5` vs `f3d4` — minor, white to move

**Reconstruction bug.** Annotation says white "captured on d4" but the
reconstructed board shows d4 empty. The captured piece is lost from the
board state, so I can't judge what the position should actually look
like with the captured piece restored. **Verdict: `[?]`**

### 6. `e5d6` vs `d3c4` — minor, white to move

Both moves engage central tension positively. Suggested d3xc4 resolves
the c4/d3 tension the annotation specifically calls out. CFR's e5xd6
trades a strong advanced pawn for a normal one. Both are reasonable
pawn trades. **Verdict: `[C]`**

### 7. `c3c2` vs `e5f4` — major, black to move

Suggested exf4 wins a free bishop (+300 cp). CFR's c3-c2 pushes one step
from promotion — white cannot stop it. After c3-c2, white tries Bc1 to
block but black plays cxb1=Q winning a knight AND promoting (~+1100 cp
net). Both moves are correct (black is up huge already), but CFR finds
the much larger gain. **Verdict: `[B]`**

### 8. `b4c2` vs `f5e6` — minor, black to move

CFR's Nxc2 wins a pawn and attacks the white queen on e1, forcing it
to move. But it ignores the threatened f5 bishop. White's response will
be gxf5 winning the bishop. Net: black gains a pawn but loses a bishop,
~-200 cp net. Suggested Be6 saves the bishop with no material change.
**Verdict: `[W]`**

### 9. `d7g4` vs `e5e4` — major, black to move

Both moves attack the white knight on f3 (Bg4 via pin to e2 bishop; e4
via direct pawn attack). Material even; black has solid position. Both
are reasonable improving moves with different strategic emphasis. No
clear winner. **Verdict: `[C]`**

### 10. `h5f7` vs `h4f3` — major, white to move

White's h4 knight is attacked by black queen on g3. Suggested Nhf3
saves the knight cleanly. CFR's Bxf7 sacrifices the bishop (+100 from
pawn captured, threatens e8 rook) but black responds Kxf7 (king takes
bishop, no longer can win e8 rook via Bxe8). Net: white loses bishop
(-300) gains pawn (+100), then still loses h4 knight (-300) = -500 cp.
CFR's "tactical bluff" loses to accurate defense. **Verdict: `[W]`**

### 11. `d4c3` vs `e5g6` — minor, black to move

The annotation criticizes the played move for trapping black's own
bishop. Suggested Ng6 directly addresses this by moving the knight
elsewhere. CFR's dxc3 leads to an equal pawn trade (white's knight
recaptures via Nxc3). Different focus but defensible. **Verdict: `[C]`**

### 12. `d3e4` vs `g1e2` — minor, white to move

Suggested Nge2 shields the e1 king on the e-file per the annotation.
CFR's Bd3-e4 attacks the black knight on c6 along the e4-a8 diagonal,
threatening Bxc6 next move. Both reasonable; CFR's is more active but
ignores the FoW king-safety concern. **Verdict: `[C]`**

### 13. `d7d6` vs `e7e6` — major, black to move

Both are normal development pawn pushes addressing the "premature knight
leap" critique. e6 attacks white's f5 pawn directly (slightly more
aggressive); d6 opens the c8 bishop differently. Both are sound opening
moves. **Verdict: `[C]`**

### 14. `a1e5` vs `c8d7` — major, black to move

**Reconstruction bug.** Annotation says queen captured a defended pawn
on h4 and lost the queen. Reconstructed board shows h4 empty. Same bug
as position 5 — the captured piece is missing from the reconstructed
board. **Verdict: `[?]`**

### 15. `g8f6` vs `c7c6` — minor, black to move

The annotation literally says "better would have been to develop his
knight with Nf6 **or** his c6 pawn with c6." CFR picks Nf6, which is one
of the two moves the human explicitly approved. The smoke script's
"suggested" field has c6 but the annotation approved both. Comparable.
**Verdict: `[C]`**

### 16. `f6d8` vs `d7c6` — minor, black to move

The annotation explicitly names b7 as a target needing protection. Bc6
directly defends b7. CFR's Qd8 retreats the queen — doesn't address
b7 at all. CFR's pick misses the specific concern the human flagged.
**Verdict: `[W]`**

## Aggregate

| Verdict | Count | Positions |
|---|---|---|
| `[B]` Better | **2** | 2, 7 |
| `[C]` Comparable | **7** | 3, 6, 9, 11, 12, 13, 15 |
| `[W]` Worse | **5** | 1, 4, 8, 10, 16 |
| `[?]` Can't tell | **2** | 5, 14 |
| **Total** | **16** | |

**Defensible rate** (B+C) over judged (excluding ?) = **9/14 = 64%**.

Per the rubric thresholds in `cfr_phase1c_score.py`:

- **≥60% defensible** → metric was unfair to CFR; Phase 1b is a soft pass.

So by my read, Phase 1b passes a softer re-gate at 64% defensible.

## Confidence levels per verdict

- **High confidence:** 1 (W), 4 (W), 8 (W), 10 (W), 16 (W) — clear material/tactical errors by CFR
- **High confidence:** 7 (B) — promotion calculation is mechanical
- **Medium confidence:** 2 (B) — depends on accepting "simplify when ahead" principle
- **Medium confidence:** 3, 6, 12 (C) — FoW king-safety vs active play tradeoffs
- **Lower confidence:** 9, 11, 13, 15 (C) — quiet positional judgments where deeper analysis might shift the call

## What this tells us

A 64% defensible rate means CFR's "third option" picks (when CFR confidently
disagrees with the human's specific suggestion) are usually reasonable —
sometimes finding genuinely better moves, often picking comparable
alternatives. But ~36% of CFR's confident third-option picks are clearly
worse moves, including some that lose material on principal variation.

This is consistent with CFR doing real strategic work but having
calibration issues — it's confidently wrong about a third of the time on
positions where its argmax disagrees with both played and suggested.

Two reconstruction bugs (positions 5, 14) suggest a small fix to
`_reconstruct_board_before` to handle captured-piece-not-on-destination
cases (en passant, promotion-with-capture). Not load-bearing for the
phase decision but worth fixing before any larger run.

## Recommendation

Per the rubric: **Phase 1b is a soft pass** at 64% defensible.

But "soft pass" is a real word — the 36% confidently-wrong rate is a
concern. The next phase (Deep CFR with neural regret) should explicitly
track whether the calibration improves. If Deep CFR is still 36%
confidently-wrong, the bootstrap loop won't converge cleanly.

**Suggested next action:** proceed to Phase 2 (Deep CFR on Modal),
with explicit monitoring of the confidence-vs-correctness calibration
on a similar validation set, as an extra gate before Phase 3.

If you want to spot-check any specific verdicts before we commit to
Phase 2 spending, the positions with the highest reasoning-uncertainty
are 9, 11, 13 (all marked C). If your read on those shifts to W, the
overall rate could drop to ~50% which would be inconclusive rather
than a soft pass.
