# Phase 2b both-miss argmax inspection

Positions where **both** Phase 1b (tabular) and Phase 2b (Deep CFR) 
picked an argmax move that does NOT match the human-suggested move.

Per position:
- Annotation context (tags, severity, note if present).
- `board_before` ASCII.
- Played move + suggested move + Phase 2b's CFR argmax + top fow_evaluator moves.
- Eval scores for the relevant moves so you can see whether `suggested` 
  is actually best in the evaluator's view.

Showing first 10 of 25.

---

## #1: `05d3524b` — major blunder, ply 6, black to move

**Tags:** (no tags)

**Note:** black still underappreciates the open diagonal to his king which is a danger.

**Board (perspective: white = upper-case, black = lower-case):**

```
r n b q k b . r
p p p . p p p p
. . . . . n . .
. . . P . . . .
. . . P . . . .
. . . . . . . .
P P P . . P P P
R N B Q K B N R
```

**Move comparison:**

| Source | Move | fow_evaluator (cp) | Phase 2b prob | Note |
|---|---|---|---|---|
| played | `g7g6` | -166 | 0.025 | annotated blunder |
| **suggested** | `c7c6` | -252 | 0.009 | human says best |
| Phase 1b argmax | `c8g4` | -400 | (tabular n/a) | tabular CFR pick |
| **Phase 2b argmax** | `f6d5` | -23 | 0.192 | Deep CFR pick |

**Top 5 fow_evaluator picks:**

| Rank | Move | Score (cp) |
|---|---|---|
| 1 | `d8d5` | -22 |
| 2 | `f6d5` | -23 ← Phase 2b argmax |
| 3 | `h8g8` | -141 |
| 4 | `d8d6` | -147 |
| 5 | `d8d7` | -160 |

**Your judgment** (fill in when reviewing):

- [ ] suggested move IS actually best in this position
- [ ] suggested move is NOT clearly best (annotation noise)
- [ ] Phase 2b's pick is reasonable (alternative-but-valid)
- [ ] Phase 2b's pick is unreasonable (CFR systematically wrong)

---

## #2: `0aac8a1d` — major blunder, ply 32, black to move

**Tags:** (no tags)

**Note:** black moves his queen to capture a pawn, which is defended, so he loses his queen

**Board (perspective: white = upper-case, black = lower-case):**

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

**Move comparison:**

| Source | Move | fow_evaluator (cp) | Phase 2b prob | Note |
|---|---|---|---|---|
| played | `d8h4` | +1030 | 0.001 | annotated blunder |
| **suggested** | `c8d7` | +1840 | 0.021 | human says best |
| Phase 1b argmax | `a1e5` | +2144 | (tabular n/a) | tabular CFR pick |
| **Phase 2b argmax** | `a1d4` | +1881 | 0.149 | Deep CFR pick |

**Top 5 fow_evaluator picks:**

| Rank | Move | Score (cp) |
|---|---|---|
| 1 | `d8f6` | +2151 |
| 2 | `a1e5` | +2144 |
| 3 | `a1f6` | +2136 |
| 4 | `a1g7` | +2120 |
| 5 | `a1b2` | +1934 |

**Your judgment** (fill in when reviewing):

- [ ] suggested move IS actually best in this position
- [ ] suggested move is NOT clearly best (annotation noise)
- [ ] Phase 2b's pick is reasonable (alternative-but-valid)
- [ ] Phase 2b's pick is unreasonable (CFR systematically wrong)

---

## #3: `0d877e48` — minor blunder, ply 31, white to move

**Tags:** (no tags)

**Note:** this feels like a random weakening move played for no good reason. it is weakening because he advances his pawn which was a defender of his other pawn on g4. also more importantly there was unresolved tension between the pawns on c4 and d3.

**Board (perspective: white = upper-case, black = lower-case):**

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

**Move comparison:**

| Source | Move | fow_evaluator (cp) | Phase 2b prob | Note |
|---|---|---|---|---|
| played | `h3h4` | -4 | 0.002 | annotated blunder |
| **suggested** | `d3c4` | +194 | 0.269 | human says best |
| Phase 1b argmax | `e5d6` | +177 | (tabular n/a) | tabular CFR pick |
| **Phase 2b argmax** | `e5d6` | +177 | 0.377 | Deep CFR pick |

**Top 5 fow_evaluator picks:**

| Rank | Move | Score (cp) |
|---|---|---|
| 1 | `g4h5` | +248 |
| 2 | `d3c4` | +194 ← suggested |
| 3 | `d3d4` | +182 |
| 4 | `e5d6` | +177 ← Phase 2b argmax |
| 5 | `f2f4` | +108 |

**Your judgment** (fill in when reviewing):

- [ ] suggested move IS actually best in this position
- [ ] suggested move is NOT clearly best (annotation noise)
- [ ] Phase 2b's pick is reasonable (alternative-but-valid)
- [ ] Phase 2b's pick is unreasonable (CFR systematically wrong)

---

## #4: `105265dd` — minor blunder, ply 31, white to move

**Tags:** (no tags)

**Note:** this move creates a queen rook battery, but is risky because it takes away retreat squares for his rook and exposed his queen to a new diagonal. better might have been to retreat his rook or develop his knight

**Board (perspective: white = upper-case, black = lower-case):**

```
r . b . k . . r
p p . . . p . .
. n p b p q . .
. . . . . . . .
. . . P R p . p
. . . . . . . .
P P P B . P P P
R N . Q . . K .
```

**Move comparison:**

| Source | Move | fow_evaluator (cp) | Phase 2b prob | Note |
|---|---|---|---|---|
| played | `d1e2` | -459 | 0.019 | annotated blunder |
| **suggested** | `e4e1` | -462 | 0.016 | human says best |
| Phase 1b argmax | `d2f4` | -673 | (tabular n/a) | tabular CFR pick |
| **Phase 2b argmax** | `d2f4` | -673 | 0.235 | Deep CFR pick |

**Top 5 fow_evaluator picks:**

| Rank | Move | Score (cp) |
|---|---|---|
| 1 | `b1c3` | -458 |
| 2 | `d1e2` | -459 ← played |
| 3 | `e4e1` | -462 ← suggested |
| 4 | `d1f3` | -465 |
| 5 | `d1e1` | -483 |

**Your judgment** (fill in when reviewing):

- [ ] suggested move IS actually best in this position
- [ ] suggested move is NOT clearly best (annotation noise)
- [ ] Phase 2b's pick is reasonable (alternative-but-valid)
- [ ] Phase 2b's pick is unreasonable (CFR systematically wrong)

---

## #5: `10b34773` — major blunder, ply 36, black to move

**Tags:** (no tags)

**Note:** black just saw that white took his pawn on g4 with a white pawn. now black's knight on f5 is attacked. yet he plays a pawn move instead of moving his knight.

**Board (perspective: white = upper-case, black = lower-case):**

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

**Move comparison:**

| Source | Move | fow_evaluator (cp) | Phase 2b prob | Note |
|---|---|---|---|---|
| played | `c7c6` | +263 | 0.001 | annotated blunder |
| **suggested** | `f5e7` | +97 | 0.030 | human says best |
| Phase 1b argmax | `a4a3` | +439 | (tabular n/a) | tabular CFR pick |
| **Phase 2b argmax** | `a4a3` | +439 | 0.653 | Deep CFR pick |

**Top 5 fow_evaluator picks:**

| Rank | Move | Score (cp) |
|---|---|---|
| 1 | `a4c6` | +546 |
| 2 | `c8d7` | +513 |
| 3 | `a4e8` | +482 |
| 4 | `a4d7` | +482 |
| 5 | `b4d5` | +463 |

**Your judgment** (fill in when reviewing):

- [ ] suggested move IS actually best in this position
- [ ] suggested move is NOT clearly best (annotation noise)
- [ ] Phase 2b's pick is reasonable (alternative-but-valid)
- [ ] Phase 2b's pick is unreasonable (CFR systematically wrong)

---

## #6: `14b6080e` — minor blunder, ply 4, black to move

**Tags:** (no tags)

**Note:** it's probably better for black to take here resolving the pawn tension in his favor

**Board (perspective: white = upper-case, black = lower-case):**

```
r n b q k b n r
p p . p p p p p
. . . . . . . .
. . p . . . . .
. . . P . . . .
P . . . . . . .
. P P . P P P P
R N B Q K B N R
```

**Move comparison:**

| Source | Move | fow_evaluator (cp) | Phase 2b prob | Note |
|---|---|---|---|---|
| played | `h7h6` | -207 | 0.007 | annotated blunder |
| **suggested** | `c5d4` | -41 | 0.036 | human says best |
| Phase 1b argmax | `d8b6` | -126 | (tabular n/a) | tabular CFR pick |
| **Phase 2b argmax** | `b8c6` | -121 | 0.277 | Deep CFR pick |

**Top 5 fow_evaluator picks:**

| Rank | Move | Score (cp) |
|---|---|---|
| 1 | `c5d4` | -41 ← suggested |
| 2 | `c5c4` | -61 |
| 3 | `d7d5` | -109 |
| 4 | `d7d6` | -115 |
| 5 | `g8f6` | -121 |

**Your judgment** (fill in when reviewing):

- [ ] suggested move IS actually best in this position
- [ ] suggested move is NOT clearly best (annotation noise)
- [ ] Phase 2b's pick is reasonable (alternative-but-valid)
- [ ] Phase 2b's pick is unreasonable (CFR systematically wrong)

---

## #7: `19b41bb5` — major blunder, ply 40, black to move

**Tags:** (no tags)

**Note:** this move probably creates back rank problems for him and left his rook vulnerable on f6. better was Rf8 defending his bishop

**Board (perspective: white = upper-case, black = lower-case):**

```
. . . . b . k .
p p p . . . p p
. . . b . r n .
. . . . . . . .
P . . . . . . .
. P . . . N . .
. P . B . P P P
. . . R R . K .
```

**Move comparison:**

| Source | Move | fow_evaluator (cp) | Phase 2b prob | Note |
|---|---|---|---|---|
| played | `g8h8` | -532 | 0.002 | annotated blunder |
| **suggested** | `f6f8` | -522 | 0.002 | human says best |
| Phase 1b argmax | `f6f5` | -551 | (tabular n/a) | tabular CFR pick |
| **Phase 2b argmax** | `f6f5` | -551 | 0.371 | Deep CFR pick |

**Top 5 fow_evaluator picks:**

| Rank | Move | Score (cp) |
|---|---|---|
| 1 | `e8c6` | -240 |
| 2 | `e8f7` | -246 |
| 3 | `e8d7` | -250 |
| 4 | `e8a4` | -492 |
| 5 | `g6e5` | -504 |

**Your judgment** (fill in when reviewing):

- [ ] suggested move IS actually best in this position
- [ ] suggested move is NOT clearly best (annotation noise)
- [ ] Phase 2b's pick is reasonable (alternative-but-valid)
- [ ] Phase 2b's pick is unreasonable (CFR systematically wrong)

---

## #8: `2e4d36f5` — minor blunder, ply 23, white to move

**Tags:** (no tags)

**Note:** white should prefer putting the bishop on e2 shielding his king on the e-file. otherwise he leaves his king exposed on the e-file

**Board (perspective: white = upper-case, black = lower-case):**

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

**Move comparison:**

| Source | Move | fow_evaluator (cp) | Phase 2b prob | Note |
|---|---|---|---|---|
| played | `f1d3` | +899 | 0.014 | annotated blunder |
| **suggested** | `f1e2` | +890 | 0.014 | human says best |
| Phase 1b argmax | `d1d5` | +815 | (tabular n/a) | tabular CFR pick |
| **Phase 2b argmax** | `d1d5` | +815 | 0.563 | Deep CFR pick |

**Top 5 fow_evaluator picks:**

| Rank | Move | Score (cp) |
|---|---|---|
| 1 | `c1b1` | +929 |
| 2 | `f1d3` | +899 ← played |
| 3 | `d1c2` | +899 |
| 4 | `g1f3` | +896 |
| 5 | `f1e2` | +890 ← suggested |

**Your judgment** (fill in when reviewing):

- [ ] suggested move IS actually best in this position
- [ ] suggested move is NOT clearly best (annotation noise)
- [ ] Phase 2b's pick is reasonable (alternative-but-valid)
- [ ] Phase 2b's pick is unreasonable (CFR systematically wrong)

---

## #9: `378260a7` — major blunder, ply 31, white to move

**Tags:** (no tags)

**Note:** this is a weird move considering white knows that the black queen on e4 can take the white rook on h1

**Board (perspective: white = upper-case, black = lower-case):**

```
r . . . k . n r
. . . n b . p p
. p . p . p . .
p p . . . . . .
. . . . q . . N
. . . . . . P b
P P . P B P . P
R . B Q K . . R
```

**Move comparison:**

| Source | Move | fow_evaluator (cp) | Phase 2b prob | Note |
|---|---|---|---|---|
| played | `d2d3` | -1573 | 0.035 | annotated blunder |
| **suggested** | `f2f3` | -1191 | 0.033 | human says best |
| Phase 1b argmax | `d1b3` | -1478 | (tabular n/a) | tabular CFR pick |
| **Phase 2b argmax** | `d1b3` | -1478 | 0.349 | Deep CFR pick |

**Top 5 fow_evaluator picks:**

| Rank | Move | Score (cp) |
|---|---|---|
| 1 | `h1g1` | -1117 |
| 2 | `h4g2` | -1127 |
| 3 | `h4f3` | -1129 |
| 4 | `f2f3` | -1191 ← suggested |
| 5 | `e2f3` | -1304 |

**Your judgment** (fill in when reviewing):

- [ ] suggested move IS actually best in this position
- [ ] suggested move is NOT clearly best (annotation noise)
- [ ] Phase 2b's pick is reasonable (alternative-but-valid)
- [ ] Phase 2b's pick is unreasonable (CFR systematically wrong)

---

## #10: `4b6cfbdf` — major blunder, ply 6, black to move

**Tags:** (no tags)

**Note:** Black should have a sense of white possibly having developed the knight to c3 and hence controlling e4, which black moved his queen to. this is a terrible move cause he loses his queen. instead he should have tried Qe6, checking the white king without exposing his queen to a knight.

**Board (perspective: white = upper-case, black = lower-case):**

```
r n b . k b n r
p p p . p p p p
. . . . . . . .
. . . q . . . .
. . . . . . . .
. . N . . . . .
P P P P . P P P
R . B Q K B N R
```

**Move comparison:**

| Source | Move | fow_evaluator (cp) | Phase 2b prob | Note |
|---|---|---|---|---|
| played | `d5e4` | -918 | 0.007 | annotated blunder |
| **suggested** | `d5e6` | +7 | 0.140 | human says best |
| Phase 1b argmax | `d5e5` | -42 | (tabular n/a) | tabular CFR pick |
| **Phase 2b argmax** | `d5e5` | -42 | 0.163 | Deep CFR pick |

**Top 5 fow_evaluator picks:**

| Rank | Move | Score (cp) |
|---|---|---|
| 1 | `d5e6` | +7 ← suggested |
| 2 | `d5d6` | -6 |
| 3 | `d5f5` | -8 |
| 4 | `d5d7` | -14 |
| 5 | `d5d8` | -20 |

**Your judgment** (fill in when reviewing):

- [ ] suggested move IS actually best in this position
- [ ] suggested move is NOT clearly best (annotation noise)
- [ ] Phase 2b's pick is reasonable (alternative-but-valid)
- [ ] Phase 2b's pick is unreasonable (CFR systematically wrong)

---
