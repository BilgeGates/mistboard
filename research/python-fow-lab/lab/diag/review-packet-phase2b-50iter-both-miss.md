# Review packet: phase2b-50iter-both-miss

- Source result file: `cfr-phase2b-hybrid_fog-smoke-results.json`
- Filter: `both-miss`
- Positions: 25

## How to use this

Flip through each position. Check whichever judgment line(s) apply,
optionally leave a 1-line comment. After you finish, the aggregate
of your judgments is the *real* gate for whether this run is doing
the right thing — independent of the argmax-match-suggested metric.

Specifically, watch for:
- Cases where this run's argmax is **better** than the annotator's suggested 
  → the gate metric is undercounting Deep CFR's actual quality.
- Cases where this run's argmax is **unreasonable**
  → real engine weakness; tells us where Phase 3 needs to help.
- Cases where the annotator's suggested move is **itself questionable**
  → annotation noise; affects how seriously to take the gate metric.

---

## #1: `c4edafaa` — major, ply 6, black to move

**Annotator's note:** why does black leap into the enemy territory with his knight before developing? unclear why he does this

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

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

**phase2b-50iter-both-miss run** (n_legal = 23):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `f6g4` |  -207 | 21 | 0.000 | annotated blunder |
| **suggested** | `e7e6` |  -204 | 20 | 0.003 | annotator's recommendation |
| **this run's argmax** | `d7d5` |  -124 | 2 | 0.486 | Deep CFR's top pick (≠ suggested) |
| Phase 1b argmax | `d7d6` |  -130 | 4 | (tabular n/a) | tabular CFR (different pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `h8g8` | -111 |  |
| 2 | `d7d5` | -124 | ← this run's argmax |
| 3 | `b8c6` | -130 |  |
| 4 | `d7d6` | -130 | ← Phase 1b argmax |
| 5 | `h7h5` | -130 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #2: `a1bf921f` — major, ply 8, black to move

**Annotator's note:** black has no sense of danger for his knight on g4 and loses it shortly

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

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

**phase2b-50iter-both-miss run** (n_legal = 24):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `b7b6` |  -481 | 13 | 0.000 | annotated blunder |
| **suggested** | `g4f6` |  -160 | 1 | 0.026 | annotator's recommendation |
| **this run's argmax** | `g4h6` |  -178 | 3 | 0.658 | Deep CFR's top pick (≠ suggested) |
| Phase 1b argmax | `g4h6` |  -178 | 3 | (tabular n/a) | tabular CFR (same pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `g4f6` | -160 | ← suggested |
| 2 | `g4e5` | -170 |  |
| 3 | `g4h6` | -178 | ← this run's argmax ← Phase 1b argmax |
| 4 | `h7h5` | -395 |  |
| 5 | `b8c6` | -475 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #3: `378260a7` — major, ply 31, white to move

**Annotator's note:** this is a weird move considering white knows that the black queen on e4 can take the white rook on h1

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

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

**phase2b-50iter-both-miss run** (n_legal = 27):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `d2d3` | -1573 | 16 | 0.035 | annotated blunder |
| **suggested** | `f2f3` | -1191 | 4 | 0.033 | annotator's recommendation |
| **this run's argmax** | `d1b3` | -1478 | 11 | 0.349 | Deep CFR's top pick (≠ suggested) |
| Phase 1b argmax | `d1b3` | -1478 | 11 | (tabular n/a) | tabular CFR (same pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `h1g1` | -1117 |  |
| 2 | `h4g2` | -1127 |  |
| 3 | `h4f3` | -1129 |  |
| 4 | `f2f3` | -1191 | ← suggested |
| 5 | `e2f3` | -1304 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #4: `9a806582` — major, ply 4, black to move

**Annotator's note:** this exposes black to a potential king capture if white had played Bb5 on the previous move.

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

```
r n b q k b n r
p p p . p p p p
. . . . . . . .
. . . P . . . .
. . . . . . . .
. . . . . . . .
P P P P . P P P
R N B Q K B N R
```

**phase2b-50iter-both-miss run** (n_legal = 28):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `g8f6` |  -148 | 4 | 0.054 | annotated blunder |
| **suggested** | `c7c6` |  -240 | 23 | 0.007 | annotator's recommendation |
| **this run's argmax** | `d8d5` |   -33 | 1 | 0.182 | Deep CFR's top pick (≠ suggested) |
| Phase 1b argmax | `a7a6` |  -234 | 22 | (tabular n/a) | tabular CFR (different pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `d8d5` | -33 | ← this run's argmax |
| 2 | `d8d6` | -135 |  |
| 3 | `e7e5` | -142 |  |
| 4 | `g8f6` | -148 | ← played |
| 5 | `d8d7` | -148 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #5: `0aac8a1d` — major, ply 32, black to move

**Annotator's note:** black moves his queen to capture a pawn, which is defended, so he loses his queen

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

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

**phase2b-50iter-both-miss run** (n_legal = 34):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `d8h4` | +1030 | 33 | 0.001 | annotated blunder |
| **suggested** | `c8d7` | +1840 | 24 | 0.021 | annotator's recommendation |
| **this run's argmax** | `a1d4` | +1881 | 8 | 0.149 | Deep CFR's top pick (≠ suggested) |
| Phase 1b argmax | `a1e5` | +2144 | 2 | (tabular n/a) | tabular CFR (different pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `d8f6` | +2151 |  |
| 2 | `a1e5` | +2144 | ← Phase 1b argmax |
| 3 | `a1f6` | +2136 |  |
| 4 | `a1g7` | +2120 |  |
| 5 | `a1b2` | +1934 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #6: `05d3524b` — major, ply 6, black to move

**Annotator's note:** black still underappreciates the open diagonal to his king which is a danger.

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

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

**phase2b-50iter-both-miss run** (n_legal = 31):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `g7g6` |  -166 | 8 | 0.025 | annotated blunder |
| **suggested** | `c7c6` |  -252 | 24 | 0.009 | annotator's recommendation |
| **this run's argmax** | `f6d5` |   -23 | 2 | 0.192 | Deep CFR's top pick (≠ suggested) |
| Phase 1b argmax | `c8g4` |  -400 | 25 | (tabular n/a) | tabular CFR (different pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `d8d5` | -22 |  |
| 2 | `f6d5` | -23 | ← this run's argmax |
| 3 | `h8g8` | -141 |  |
| 4 | `d8d6` | -147 |  |
| 5 | `d8d7` | -160 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #7: `10b34773` — major, ply 36, black to move

**Annotator's note:** black just saw that white took his pawn on g4 with a white pawn. now black's knight on f5 is attacked. yet he plays a pawn move instead of moving his knight.

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

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

**phase2b-50iter-both-miss run** (n_legal = 38):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `c7c6` |  +263 | 20 | 0.001 | annotated blunder |
| **suggested** | `f5e7` |   +97 | 32 | 0.030 | annotator's recommendation |
| **this run's argmax** | `a4a3` |  +439 | 8 | 0.653 | Deep CFR's top pick (≠ suggested) |
| Phase 1b argmax | `a4a3` |  +439 | 8 | (tabular n/a) | tabular CFR (same pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `a4c6` | +546 |  |
| 2 | `c8d7` | +513 |  |
| 3 | `a4e8` | +482 |  |
| 4 | `a4d7` | +482 |  |
| 5 | `b4d5` | +463 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #8: `4b6cfbdf` — major, ply 6, black to move

**Annotator's note:** Black should have a sense of white possibly having developed the knight to c3 and hence controlling e4, which black moved his queen to. this is a terrible move cause he loses his queen. instead he should have tried Qe6, checking the white king without exposing his queen to a knight.

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

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

**phase2b-50iter-both-miss run** (n_legal = 47):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `d5e4` |  -918 | 37 | 0.007 | annotated blunder |
| **suggested** | `d5e6` |    +7 | 1 | 0.140 | annotator's recommendation |
| **this run's argmax** | `d5e5` |   -42 | 7 | 0.163 | Deep CFR's top pick (≠ suggested) |
| Phase 1b argmax | `d5e5` |   -42 | 7 | (tabular n/a) | tabular CFR (same pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `d5e6` | +7 | ← suggested |
| 2 | `d5d6` | -6 |  |
| 3 | `d5f5` | -8 |  |
| 4 | `d5d7` | -14 |  |
| 5 | `d5d8` | -20 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #9: `f7199c23` — major, ply 23, white to move

**Annotator's note:** white leaps in with his knight to a square he this is likely defended by a pawn. that is a problem

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

```
r . b q . r k .
. p . n . p p p
p . . p p . n .
. . . . . . . B
P p . . . N . b
. N . P P . . .
. . P . . P P P
R . B Q . R K .
```

**phase2b-50iter-both-miss run** (n_legal = 35):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `f4d5` |  -491 | 29 | 0.012 | annotated blunder |
| **suggested** | `a1b1` |  -451 | 24 | 0.002 | annotator's recommendation |
| **this run's argmax** | `f4e6` |  -449 | 23 | 0.191 | Deep CFR's top pick (≠ suggested) |
| Phase 1b argmax | `d1g4` |  -417 | 6 | (tabular n/a) | tabular CFR (different pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `f4g6` | -85 |  |
| 2 | `h5g6` | -99 |  |
| 3 | `f4h3` | -185 |  |
| 4 | `f4e2` | -274 |  |
| 5 | `f2f3` | -361 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #10: `da170346` — major, ply 41, white to move

**Annotator's note:** this is a bad move. white knows that black has a queen on g3 which attacks his knight on h4, but instead of getting it defended he undevelopes his knight which is weird.

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

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

**phase2b-50iter-both-miss run** (n_legal = 38):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `c3b1` |  -402 | 4 | 0.000 | annotated blunder |
| **suggested** | `h4f3` |  -276 | 1 | 0.073 | annotator's recommendation |
| **this run's argmax** | `h5f7` |  -564 | 16 | 0.568 | Deep CFR's top pick (≠ suggested) |
| Phase 1b argmax | `h5f7` |  -564 | 16 | (tabular n/a) | tabular CFR (same pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `h4f3` | -276 | ← suggested |
| 2 | `c4d5` | -352 |  |
| 3 | `c3e2` | -390 |  |
| 4 | `c3b1` | -402 | ← played |
| 5 | `c3a2` | -406 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #11: `59a54515` — major, ply 26, black to move

**Annotator's note:** again black leaps his piece, this time the knight, into the white position, defended by multiple pieces a bishop and pawn. so black loses his knight for free. he should instead play more safely with a move like c6

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

```
r n . . . r k .
p p p q n . p p
. . . p . b . .
. . . . p p . .
. . P . . . . .
. P B P P B . N
. P . . . P P P
R N R . . . . K
```

**phase2b-50iter-both-miss run** (n_legal = 34):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `e7d5` |  +128 | 25 | 0.003 | annotated blunder |
| **suggested** | `c7c6` |  +290 | 12 | 0.032 | annotator's recommendation |
| **this run's argmax** | `e5e4` |  +142 | 24 | 0.192 | Deep CFR's top pick (≠ suggested) |
| Phase 1b argmax | `e5e4` |  +142 | 24 | (tabular n/a) | tabular CFR (same pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `d6d5` | +314 |  |
| 2 | `a7a5` | +302 |  |
| 3 | `a7a6` | +296 |  |
| 4 | `c7c5` | +296 |  |
| 5 | `f8e8` | +290 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #12: `bbebf2db` — major, ply 22, black to move

**Annotator's note:** bad black doesn't take the free white bishop

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

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

**phase2b-50iter-both-miss run** (n_legal = 41):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `a5d5` |  +490 | 25 | 0.000 | annotated blunder |
| **suggested** | `e5f4` |  +999 | 1 | 0.120 | annotator's recommendation |
| **this run's argmax** | `b4f8` |  +757 | 3 | 0.196 | Deep CFR's top pick (≠ suggested) |
| Phase 1b argmax | `c3c2` |  +537 | 11 | (tabular n/a) | tabular CFR (different pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `e5f4` | +999 | ← suggested |
| 2 | `b4c5` | +784 |  |
| 3 | `b4f8` | +757 | ← this run's argmax |
| 4 | `b4e7` | +757 |  |
| 5 | `b4d6` | +747 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #13: `8b933b52` — major, ply 24, black to move

**Annotator's note:** this is an inexplicable blunder by black. he moves his bishop deep into the white position into a square that is defended by white's pawn. so he loses his bishop for free. instead he should have retreated it to safety where it could just sit and maintain vision through fog

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

```
r n . . . r k .
p p p q n . p p
. . . p . b . .
. . . . p p . .
b . P . . . . .
. . B P P B . N
P P . . . P P P
R N R . . . . K
```

**phase2b-50iter-both-miss run** (n_legal = 38):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `a4b3` |  +330 | 33 | 0.002 | annotated blunder |
| **suggested** | `a4c6` |  +534 | 27 | 0.179 | annotator's recommendation |
| **this run's argmax** | `e5e4` |  +588 | 25 | 0.276 | Deep CFR's top pick (≠ suggested) |
| Phase 1b argmax | `e5e4` |  +588 | 25 | (tabular n/a) | tabular CFR (same pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `b8a6` | +761 |  |
| 2 | `d6d5` | +760 |  |
| 3 | `c7c5` | +742 |  |
| 4 | `f8e8` | +736 |  |
| 5 | `f8d8` | +736 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #14: `19b41bb5` — major, ply 40, black to move

**Annotator's note:** this move probably creates back rank problems for him and left his rook vulnerable on f6. better was Rf8 defending his bishop

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

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

**phase2b-50iter-both-miss run** (n_legal = 37):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `g8h8` |  -532 | 12 | 0.002 | annotated blunder |
| **suggested** | `f6f8` |  -522 | 11 | 0.002 | annotator's recommendation |
| **this run's argmax** | `f6f5` |  -551 | 24 | 0.371 | Deep CFR's top pick (≠ suggested) |
| Phase 1b argmax | `f6f5` |  -551 | 24 | (tabular n/a) | tabular CFR (same pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `e8c6` | -240 |  |
| 2 | `e8f7` | -246 |  |
| 3 | `e8d7` | -250 |  |
| 4 | `e8a4` | -492 |  |
| 5 | `g6e5` | -504 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #15: `2e4d36f5` — minor, ply 23, white to move

**Annotator's note:** white should prefer putting the bishop on e2 shielding his king on the e-file. otherwise he leaves his king exposed on the e-file

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

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

**phase2b-50iter-both-miss run** (n_legal = 33):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `f1d3` |  +899 | 2 | 0.014 | annotated blunder |
| **suggested** | `f1e2` |  +890 | 5 | 0.014 | annotator's recommendation |
| **this run's argmax** | `d1d5` |  +815 | 23 | 0.563 | Deep CFR's top pick (≠ suggested) |
| Phase 1b argmax | `d1d5` |  +815 | 23 | (tabular n/a) | tabular CFR (same pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `c1b1` | +929 |  |
| 2 | `f1d3` | +899 | ← played |
| 3 | `d1c2` | +899 |  |
| 4 | `g1f3` | +896 |  |
| 5 | `f1e2` | +890 | ← suggested |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #16: `b0c9a8d3` — minor, ply 11, white to move

**Annotator's note:** White could capture on d4 with either the knight or queen and chose the more valuable piece. In fog, that is probably wrong: prefer taking with the least valuable piece first when the target square may be further defended or attacked by the opponent.

*Tags: move-selection, least-valuable-attacker, fog-risk*

**Board (capitals = white, lowercase = black):**

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

**phase2b-50iter-both-miss run** (n_legal = 40):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `d1d4` |  +201 | 36 | 0.012 | annotated blunder |
| **suggested** | `f3d4` |  +639 | 32 | 0.017 | annotator's recommendation |
| **this run's argmax** | `f1b5` |  +837 | 28 | 0.541 | Deep CFR's top pick (≠ suggested) |
| Phase 1b argmax | `f1b5` |  +837 | 28 | (tabular n/a) | tabular CFR (same pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `f3g5` | +934 |  |
| 2 | `h1g1` | +932 |  |
| 3 | `c1e3` | +925 |  |
| 4 | `c1g5` | +919 |  |
| 5 | `d1d3` | +915 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #17: `ebf7273f` — minor, ply 25, white to move

**Annotator's note:** white should prefer putting the knight on e2 shielding his king on the e-file. otherwise he leaves his king exposed on the e-file

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

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

**phase2b-50iter-both-miss run** (n_legal = 38):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `g1f3` |  +818 | 4 | 0.007 | annotated blunder |
| **suggested** | `g1e2` |  +806 | 12 | 0.010 | annotator's recommendation |
| **this run's argmax** | `d3e4` |  +789 | 22 | 0.328 | Deep CFR's top pick (≠ suggested) |
| Phase 1b argmax | `d3e4` |  +789 | 22 | (tabular n/a) | tabular CFR (same pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `c3d4` | +979 |  |
| 2 | `c3c4` | +886 |  |
| 3 | `c1b1` | +851 |  |
| 4 | `g1f3` | +818 | ← played |
| 5 | `d1e2` | +817 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #18: `0d877e48` — minor, ply 31, white to move

**Annotator's note:** this feels like a random weakening move played for no good reason. it is weakening because he advances his pawn which was a defender of his other pawn on g4. also more importantly there was unresolved tension between the pawns on c4 and d3.

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

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

**phase2b-50iter-both-miss run** (n_legal = 35):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `h3h4` |    -4 | 27 | 0.002 | annotated blunder |
| **suggested** | `d3c4` |  +194 | 2 | 0.269 | annotator's recommendation |
| **this run's argmax** | `e5d6` |  +177 | 4 | 0.377 | Deep CFR's top pick (≠ suggested) |
| Phase 1b argmax | `e5d6` |  +177 | 4 | (tabular n/a) | tabular CFR (same pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `g4h5` | +248 |  |
| 2 | `d3c4` | +194 | ← suggested |
| 3 | `d3d4` | +182 |  |
| 4 | `e5d6` | +177 | ← this run's argmax ← Phase 1b argmax |
| 5 | `f2f4` | +108 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #19: `14b6080e` — minor, ply 4, black to move

**Annotator's note:** it's probably better for black to take here resolving the pawn tension in his favor

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

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

**phase2b-50iter-both-miss run** (n_legal = 23):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `h7h6` |  -207 | 21 | 0.007 | annotated blunder |
| **suggested** | `c5d4` |   -41 | 1 | 0.036 | annotator's recommendation |
| **this run's argmax** | `b8c6` |  -121 | 6 | 0.277 | Deep CFR's top pick (≠ suggested) |
| Phase 1b argmax | `d8b6` |  -126 | 12 | (tabular n/a) | tabular CFR (different pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `c5d4` | -41 | ← suggested |
| 2 | `c5c4` | -61 |  |
| 3 | `d7d5` | -109 |  |
| 4 | `d7d6` | -115 |  |
| 5 | `g8f6` | -121 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #20: `a5e1a39a` — minor, ply 10, black to move

**Annotator's note:** black extends his pawn but ends up losing material here. better would have been to develop his knight with Nf6 or his c6 pawn with c6.

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

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

**phase2b-50iter-both-miss run** (n_legal = 28):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `d6d5` |  -109 | 1 | 0.179 | annotated blunder |
| **suggested** | `c7c6` |  -151 | 15 | 0.001 | annotator's recommendation |
| **this run's argmax** | `d6d5` |  -109 | 1 | 0.179 | Deep CFR's top pick (≠ suggested) |
| Phase 1b argmax | `g8f6` |  -145 | 4 | (tabular n/a) | tabular CFR (different pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `d6d5` | -109 | ← played ← this run's argmax |
| 2 | `b8c6` | -120 |  |
| 3 | `e7f6` | -133 |  |
| 4 | `g8f6` | -145 | ← Phase 1b argmax |
| 5 | `e8f8` | -145 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #21: `702f91e1` — minor, ply 34, black to move

**Annotator's note:** this is a subtle mistake, but it basically self traps black own bishop. black should have seen this move will restrict his own bishop too much in this position, but it is based on white particle position

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

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

**phase2b-50iter-both-miss run** (n_legal = 38):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `e5d7` |  -174 | 2 | 0.017 | annotated blunder |
| **suggested** | `e5g6` |  -174 | 3 | 0.018 | annotator's recommendation |
| **this run's argmax** | `f5e4` |  -305 | 4 | 0.457 | Deep CFR's top pick (≠ suggested) |
| Phase 1b argmax | `d4c3` |  -340 | 5 | (tabular n/a) | tabular CFR (different pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `e5f7` | -174 |  |
| 2 | `e5d7` | -174 | ← played |
| 3 | `e5g6` | -174 | ← suggested |
| 4 | `f5e4` | -305 | ← this run's argmax |
| 5 | `d4c3` | -340 | ← Phase 1b argmax |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #22: `84498757` — minor, ply 14, black to move

**Annotator's note:** this seems like an inaccuracy. 1 it disturbs the coordination of black's bishop and queen. and 2 it doesn't address black's open a4-e8 diagonal to his king

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

```
r n b q k . n r
p p . . . p p p
. . . p p . . .
. . . . . . . .
. . p . . . . b
. . P . P P . .
P P . P B . P P
R N B Q . R K .
```

**phase2b-50iter-both-miss run** (n_legal = 35):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `g8e7` |  +136 | 28 | 0.003 | annotated blunder |
| **suggested** | `b8c6` |  +230 | 4 | 0.016 | annotator's recommendation |
| **this run's argmax** | `b7b5` |  +244 | 2 | 0.259 | Deep CFR's top pick (≠ suggested) |
| Phase 1b argmax | `d6d5` |  +244 | 1 | (tabular n/a) | tabular CFR (different pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `d6d5` | +244 | ← Phase 1b argmax |
| 2 | `b7b5` | +244 | ← this run's argmax |
| 3 | `e6e5` | +236 |  |
| 4 | `b8c6` | +230 | ← suggested |
| 5 | `d8g5` | +229 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #23: `6c09bb02` — minor, ply 12, black to move

**Annotator's note:** why doesn't black take back, instead allows white to destroy his position even more

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

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

**phase2b-50iter-both-miss run** (n_legal = 32):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `e7d6` |  -219 | 2 | 0.002 | annotated blunder |
| **suggested** | `e6d5` |  -103 | 1 | 0.133 | annotator's recommendation |
| **this run's argmax** | `b7b5` |  -332 | 23 | 0.594 | Deep CFR's top pick (≠ suggested) |
| Phase 1b argmax | `b7b5` |  -332 | 23 | (tabular n/a) | tabular CFR (same pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `e6d5` | -103 | ← suggested |
| 2 | `e7d6` | -219 | ← played |
| 3 | `e6e5` | -228 |  |
| 4 | `f7f5` | -240 |  |
| 5 | `e7c5` | -242 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #24: `105265dd` — minor, ply 31, white to move

**Annotator's note:** this move creates a queen rook battery, but is risky because it takes away retreat squares for his rook and exposed his queen to a new diagonal. better might have been to retreat his rook or develop his knight

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

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

**phase2b-50iter-both-miss run** (n_legal = 35):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `d1e2` |  -459 | 2 | 0.019 | annotated blunder |
| **suggested** | `e4e1` |  -462 | 3 | 0.016 | annotator's recommendation |
| **this run's argmax** | `d2f4` |  -673 | 27 | 0.235 | Deep CFR's top pick (≠ suggested) |
| Phase 1b argmax | `d2f4` |  -673 | 27 | (tabular n/a) | tabular CFR (same pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `b1c3` | -458 |  |
| 2 | `d1e2` | -459 | ← played |
| 3 | `e4e1` | -462 | ← suggested |
| 4 | `d1f3` | -465 |  |
| 5 | `d1e1` | -483 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #25: `6e7e78bb` — minor, ply 82, black to move

**Annotator's note:** black undevelops his knight. but the b7 pawn is a target in his position and remain unprotected. he should protect it with a move like Nc6

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

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

**phase2b-50iter-both-miss run** (n_legal = 49):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `a6b8` |   +12 | 27 | 0.000 | annotated blunder |
| **suggested** | `d7c6` |   +49 | 4 | 0.002 | annotator's recommendation |
| **this run's argmax** | `f6d8` |   +43 | 20 | 0.343 | Deep CFR's top pick (≠ suggested) |
| Phase 1b argmax | `f6d8` |   +43 | 20 | (tabular n/a) | tabular CFR (same pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `e8d8` | +61 |  |
| 2 | `a8d8` | +61 |  |
| 3 | `g6f8` | +61 |  |
| 4 | `d7c6` | +49 | ← suggested |
| 5 | `f6e7` | +49 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---
