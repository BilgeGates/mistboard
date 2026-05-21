# Phase 1c — Hand-validation of CFR's third-move picks

These are positions where CFR (Phase 1b, hybrid_fog leaf) confidently picked a move that is **neither** the played blunder **nor** the human-suggested alternative. Your job: judge whether CFR's pick is defensible vs the human's suggested move.

**Filter:** CFR top-action prob ≥ 0.45.

**Scoring rubric** (mark exactly one per position):
- `[B]` Better than suggested
- `[C]` Comparable to suggested
- `[W]` Worse than suggested
- `[?]` Can't tell / position too unclear

When done, the script `cfr_phase1c_score.py` (TBD) parses your marks and computes the final tally. Or just count them by hand and tell me the result.

---

## Position 1 — major, black to move

**Annotation note:** black has no sense of danger for his knight on g4 and loses it shortly

**Material at position:** -100 cp (from black's POV)

**FEN (before played move):** `rnbqkb1r/ppppp1pp/8/5P2/4P1n1/7N/PPPP1P1P/RNBQKB1R b - - 0 1`

```
r n b q k b . r
p p p p p . p p
. . . . . . . .
. . . . . P . .
. . . . P . n .
. . . . . . . N
P P P P . P . P
R N B Q K B . R
```

- **Played (blunder):** `b7b6`
- **Suggested (human):** `g4f6`
- **CFR argmax:** `g4h6` (top prob: 0.96)
- **fow argmax:** `g4f6`

**Your judgment of CFR's pick `g4h6` vs human's suggested `g4f6`:**

- [ ] `[B]` Better than suggested
- [ ] `[C]` Comparable to suggested
- [ ] `[W]` Worse than suggested
- [ ] `[?]` Can't tell

**Notes:** _(optional)_

---

## Position 2 — major, black to move

**Annotation note:** black just saw that white took his pawn on g4 with a white pawn. now black's knight on f5 is attacked. yet he plays a pawn move instead of moving his knight.

**Material at position:** +920 cp (from black's POV)

**FEN (before played move):** `r1b2rk1/p1p3pp/3pp3/p4n2/qn4P1/N2PP3/2P1B1PP/4QRK1 b - - 0 1`

```
r . b . . r k .
p . p . . . p p
. . . p p . . .
p . . . . n . .
q n . . . . P .
N . . P P . . .
. . P . B . P P
. . . . Q R K .
```

- **Played (blunder):** `c7c6`
- **Suggested (human):** `f5e7`
- **CFR argmax:** `a4a3` (top prob: 0.90)
- **fow argmax:** `a4c6`

**Your judgment of CFR's pick `a4a3` vs human's suggested `f5e7`:**

- [ ] `[B]` Better than suggested
- [ ] `[C]` Comparable to suggested
- [ ] `[W]` Worse than suggested
- [ ] `[?]` Can't tell

**Notes:** _(optional)_

---

## Position 3 — minor, white to move

**Annotation note:** white should prefer putting the bishop on e2 shielding his king on the e-file. otherwise he leaves his king exposed on the e-file

**Material at position:** +900 cp (from white's POV)

**FEN (before played move):** `r1b2rk1/pp3ppp/2n5/3p4/5P2/2P5/P4PPP/2RQKBNR w - - 0 1`

```
r . b . . r k .
p p . . . p p p
. . n . . . . .
. . . p . . . .
. . . . . P . .
. . P . . . . .
P . . . . P P P
. . R Q K B N R
```

- **Played (blunder):** `f1d3`
- **Suggested (human):** `f1e2`
- **CFR argmax:** `d1d5` (top prob: 0.86)
- **fow argmax:** `c1b1`

**Your judgment of CFR's pick `d1d5` vs human's suggested `f1e2`:**

- [ ] `[B]` Better than suggested
- [ ] `[C]` Comparable to suggested
- [ ] `[W]` Worse than suggested
- [ ] `[?]` Can't tell

**Notes:** _(optional)_

---

## Position 4 — minor, black to move

**Annotation note:** why doesn't black take back, instead allows white to destroy his position even more

**Material at position:** -100 cp (from black's POV)

**FEN (before played move):** `rn1qk1nr/pppbbppp/4p3/3P4/2B5/3P1N2/PPP2PPP/RNBQ1RK1 b - - 0 1`

```
r n . q k . n r
p p p b b p p p
. . . . p . . .
. . . P . . . .
. . B . . . . .
. . . P . N . .
P P P . . P P P
R N B Q . R K .
```

- **Played (blunder):** `e7d6`
- **Suggested (human):** `e6d5`
- **CFR argmax:** `b7b5` (top prob: 0.84)
- **fow argmax:** `e6d5`

**Your judgment of CFR's pick `b7b5` vs human's suggested `e6d5`:**

- [ ] `[B]` Better than suggested
- [ ] `[C]` Comparable to suggested
- [ ] `[W]` Worse than suggested
- [ ] `[?]` Can't tell

**Notes:** _(optional)_

---

## Position 5 — minor, white to move

**Annotation note:** White could capture on d4 with either the knight or queen and chose the more valuable piece. In fog, that is probably wrong: prefer taking with the least valuable piece first when the target square may be further defended or attacked by the opponent.

**Material at position:** +900 cp (from white's POV)

**FEN (before played move):** `r1b1kb1r/pp2pppp/2n2n2/8/8/5N2/PPP2PPP/RNBQKB1R w - - 0 1`

```
r . b . k b . r
p p . . p p p p
. . n . . n . .
. . . . . . . .
. . . . . . . .
. . . . . N . .
P P P . . P P P
R N B Q K B . R
```

- **Played (blunder):** `d1d4`
- **Suggested (human):** `f3d4`
- **CFR argmax:** `f1b5` (top prob: 0.83)
- **fow argmax:** `f3g5`

**Your judgment of CFR's pick `f1b5` vs human's suggested `f3d4`:**

- [ ] `[B]` Better than suggested
- [ ] `[C]` Comparable to suggested
- [ ] `[W]` Worse than suggested
- [ ] `[?]` Can't tell

**Notes:** _(optional)_

---

## Position 6 — minor, white to move

**Annotation note:** this feels like a random weakening move played for no good reason. it is weakening because he advances his pawn which was a defender of his other pawn on g4. also more importantly there was unresolved tension between the pawns on c4 and d3.

**Material at position:** +500 cp (from white's POV)

**FEN (before played move):** `1nb1rkn1/p3bpp1/3pp3/qp2P2p/2p3P1/2PP3P/PP1NNP2/R1BQ1RKB w - - 0 1`

```
. n b . r k n .
p . . . b p p .
. . . p p . . .
q p . . P . . p
. . p . . . P .
. . P P . . . P
P P . N N P . .
R . B Q . R K B
```

- **Played (blunder):** `h3h4`
- **Suggested (human):** `d3c4`
- **CFR argmax:** `e5d6` (top prob: 0.83)
- **fow argmax:** `g4h5`

**Your judgment of CFR's pick `e5d6` vs human's suggested `d3c4`:**

- [ ] `[B]` Better than suggested
- [ ] `[C]` Comparable to suggested
- [ ] `[W]` Worse than suggested
- [ ] `[?]` Can't tell

**Notes:** _(optional)_

---

## Position 7 — major, black to move

**Annotation note:** bad black doesn't take the free white bishop

**Material at position:** +1100 cp (from black's POV)

**FEN (before played move):** `rnb1k2r/p4pp1/1p2pn1p/q3pP2/1b3B2/P1p5/RP2P1PP/1N2KBNR b - - 0 1`

```
r n b . k . . r
p . . . . p p .
. p . . p n . p
q . . . p P . .
. b . . . B . .
P . p . . . . .
R P . . P . P P
. N . . K B N R
```

- **Played (blunder):** `a5d5`
- **Suggested (human):** `e5f4`
- **CFR argmax:** `c3c2` (top prob: 0.80)
- **fow argmax:** `e5f4`

**Your judgment of CFR's pick `c3c2` vs human's suggested `e5f4`:**

- [ ] `[B]` Better than suggested
- [ ] `[C]` Comparable to suggested
- [ ] `[W]` Worse than suggested
- [ ] `[?]` Can't tell

**Notes:** _(optional)_

---

## Position 8 — minor, black to move

**Annotation note:** black takes a knight instead of moving his bishop which is under attack. probably better to move his bishop than take a knight he's not sure if it is protected

**Material at position:** +1420 cp (from black's POV)

**FEN (before played move):** `r4rk1/p5pp/2pp4/p4b2/qn4P1/3PP3/2P1B2P/4Q1K1 b - - 0 1`

```
r . . . . r k .
p . . . . . p p
. . p p . . . .
p . . . . b . .
q n . . . . P .
. . . P P . . .
. . P . B . . P
. . . . Q . K .
```

- **Played (blunder):** `a4a3`
- **Suggested (human):** `f5e6`
- **CFR argmax:** `b4c2` (top prob: 0.76)
- **fow argmax:** `a4c2`

**Your judgment of CFR's pick `b4c2` vs human's suggested `f5e6`:**

- [ ] `[B]` Better than suggested
- [ ] `[C]` Comparable to suggested
- [ ] `[W]` Worse than suggested
- [ ] `[?]` Can't tell

**Notes:** _(optional)_

---

## Position 9 — major, black to move

**Annotation note:** very bad move. black charges his queen in to the side of the board which is very possibly controlled by the opponent, for no reason. and he loses the queen. very bad.

**Material at position:** +0 cp (from black's POV)

**FEN (before played move):** `rn1q1rk1/pppb1ppp/3b2n1/1P1pp3/Q1PP4/2N1PN2/P2BBPPP/2R2RK1 b - - 0 1`

```
r n . q . r k .
p p p b . p p p
. . . b . . n .
. P . p p . . .
Q . P P . . . .
. . N . P N . .
P . . B B P P P
. . R . . R K .
```

- **Played (blunder):** `d8h4`
- **Suggested (human):** `e5e4`
- **CFR argmax:** `d7g4` (top prob: 0.71)
- **fow argmax:** `e5d4`

**Your judgment of CFR's pick `d7g4` vs human's suggested `e5e4`:**

- [ ] `[B]` Better than suggested
- [ ] `[C]` Comparable to suggested
- [ ] `[W]` Worse than suggested
- [ ] `[?]` Can't tell

**Notes:** _(optional)_

---

## Position 10 — major, white to move

**Annotation note:** this is a bad move. white knows that black has a queen on g3 which attacks his knight on h4, but instead of getting it defended he undevelopes his knight which is weird.

**Material at position:** +450 cp (from white's POV)

**FEN (before played move):** `2r1r2k/p2b1pp1/1p2p2p/n1pp3B/2PPP2N/P1N3q1/1PQB2P1/2RR2K1 w - - 0 1`

```
. . r . r . . k
p . . b . p p .
. p . . p . . p
n . p p . . . B
. . P P P . . N
P . N . . . q .
. P Q B . . P .
. . R R . . K .
```

- **Played (blunder):** `c3b1`
- **Suggested (human):** `h4f3`
- **CFR argmax:** `h5f7` (top prob: 0.70)
- **fow argmax:** `h4f3`

**Your judgment of CFR's pick `h5f7` vs human's suggested `h4f3`:**

- [ ] `[B]` Better than suggested
- [ ] `[C]` Comparable to suggested
- [ ] `[W]` Worse than suggested
- [ ] `[?]` Can't tell

**Notes:** _(optional)_

---

## Position 11 — minor, black to move

**Annotation note:** this is a subtle mistake, but it basically self traps black own bishop. black should have seen this move will restrict his own bishop too much in this position, but it is based on white particle position

**Material at position:** -10 cp (from black's POV)

**FEN (before played move):** `rn3rk1/ppp3pp/2b1pq2/4np2/PP1pPP2/2PP2PP/N2BB2K/R2Q1R2 b - - 0 1`

```
r n . . . r k .
p p p . . . p p
. . b . p q . .
. . . . n p . .
P P . p P P . .
. . P P . . P P
N . . B B . . K
R . . Q . R . .
```

- **Played (blunder):** `e5d7`
- **Suggested (human):** `e5g6`
- **CFR argmax:** `d4c3` (top prob: 0.67)
- **fow argmax:** `e5f7`

**Your judgment of CFR's pick `d4c3` vs human's suggested `e5g6`:**

- [ ] `[B]` Better than suggested
- [ ] `[C]` Comparable to suggested
- [ ] `[W]` Worse than suggested
- [ ] `[?]` Can't tell

**Notes:** _(optional)_

---

## Position 12 — minor, white to move

**Annotation note:** white should prefer putting the knight on e2 shielding his king on the e-file. otherwise he leaves his king exposed on the e-file

**Material at position:** +900 cp (from white's POV)

**FEN (before played move):** `r1b2rk1/pp3ppp/2n5/8/3p1P2/2PB4/P4PPP/2RQK1NR w - - 0 1`

```
r . b . . r k .
p p . . . p p p
. . n . . . . .
. . . . . . . .
. . . p . P . .
. . P B . . . .
P . . . . P P P
. . R Q K . N R
```

- **Played (blunder):** `g1f3`
- **Suggested (human):** `g1e2`
- **CFR argmax:** `d3e4` (top prob: 0.65)
- **fow argmax:** `c3d4`

**Your judgment of CFR's pick `d3e4` vs human's suggested `g1e2`:**

- [ ] `[B]` Better than suggested
- [ ] `[C]` Comparable to suggested
- [ ] `[W]` Worse than suggested
- [ ] `[?]` Can't tell

**Notes:** _(optional)_

---

## Position 13 — major, black to move

**Annotation note:** why does black leap into the enemy territory with his knight before developing? unclear why he does this

**Material at position:** -100 cp (from black's POV)

**FEN (before played move):** `rnbqkb1r/ppppp1pp/5n2/5P2/8/7N/PPPPPP1P/RNBQKB1R b - - 0 1`

```
r n b q k b . r
p p p p p . p p
. . . . . n . .
. . . . . P . .
. . . . . . . .
. . . . . . . N
P P P P P P . P
R N B Q K B . R
```

- **Played (blunder):** `f6g4`
- **Suggested (human):** `e7e6`
- **CFR argmax:** `d7d6` (top prob: 0.59)
- **fow argmax:** `h8g8`

**Your judgment of CFR's pick `d7d6` vs human's suggested `e7e6`:**

- [ ] `[B]` Better than suggested
- [ ] `[C]` Comparable to suggested
- [ ] `[W]` Worse than suggested
- [ ] `[?]` Can't tell

**Notes:** _(optional)_

---

## Position 14 — major, black to move

**Annotation note:** black moves his queen to capture a pawn, which is defended, so he loses his queen

**Material at position:** +2160 cp (from black's POV)

**FEN (before played move):** `r1bqk2r/p6p/npp1p3/7p/4P3/3P4/P1P1NP2/b4K1R b - - 0 1`

```
r . b q k . . r
p . . . . . . p
n p p . p . . .
. . . . . . . p
. . . . P . . .
. . . P . . . .
P . P . N P . .
b . . . . K . R
```

- **Played (blunder):** `d8h4`
- **Suggested (human):** `c8d7`
- **CFR argmax:** `a1e5` (top prob: 0.58)
- **fow argmax:** `d8f6`

**Your judgment of CFR's pick `a1e5` vs human's suggested `c8d7`:**

- [ ] `[B]` Better than suggested
- [ ] `[C]` Comparable to suggested
- [ ] `[W]` Worse than suggested
- [ ] `[?]` Can't tell

**Notes:** _(optional)_

---

## Position 15 — minor, black to move

**Annotation note:** black extends his pawn but ends up losing material here. better would have been to develop his knight with Nf6 or his c6 pawn with c6.

**Material at position:** +0 cp (from black's POV)

**FEN (before played move):** `rn1qk1nr/pppbbppp/3pp3/8/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1 b - - 0 1`

```
r n . q k . n r
p p p b b p p p
. . . p p . . .
. . . . . . . .
. . B . P . . .
. . . P . N . .
P P P . . P P P
R N B Q . R K .
```

- **Played (blunder):** `d6d5`
- **Suggested (human):** `c7c6`
- **CFR argmax:** `g8f6` (top prob: 0.50)
- **fow argmax:** `d6d5`

**Your judgment of CFR's pick `g8f6` vs human's suggested `c7c6`:**

- [ ] `[B]` Better than suggested
- [ ] `[C]` Comparable to suggested
- [ ] `[W]` Worse than suggested
- [ ] `[?]` Can't tell

**Notes:** _(optional)_

---

## Position 16 — minor, black to move

**Annotation note:** black undevelops his knight. but the b7 pawn is a target in his position and remain unprotected. he should protect it with a move like Nc6

**Material at position:** +170 cp (from black's POV)

**FEN (before played move):** `r3r3/pp1b1ppk/n4qnp/P2p4/2pPp3/P1B1P1PP/N1P1QP2/1RN2B1K b - - 0 1`

```
r . . . r . . .
p p . b . p p k
n . . . . q n p
P . . p . . . .
. . p P p . . .
P . B . P . P P
N . P . Q P . .
. R N . . B . K
```

- **Played (blunder):** `a6b8`
- **Suggested (human):** `d7c6`
- **CFR argmax:** `f6d8` (top prob: 0.47)
- **fow argmax:** `e8d8`

**Your judgment of CFR's pick `f6d8` vs human's suggested `d7c6`:**

- [ ] `[B]` Better than suggested
- [ ] `[C]` Comparable to suggested
- [ ] `[W]` Worse than suggested
- [ ] `[?]` Can't tell

**Notes:** _(optional)_

---
