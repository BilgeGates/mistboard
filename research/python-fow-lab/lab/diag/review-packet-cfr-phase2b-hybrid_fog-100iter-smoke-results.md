# Review packet: cfr-phase2b-hybrid_fog-100iter-smoke-results

- Source result file: `cfr-phase2b-hybrid_fog-100iter-smoke-results.json`
- Filter: `all`
- Positions: 11

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

**cfr-phase2b-hybrid_fog-100iter-smoke-results run** (n_legal = 23):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `f6g4` |  -207 | 21 | 0.000 | annotated blunder |
| **suggested** | `e7e6` |  -204 | 20 | 0.011 | annotator's recommendation |
| **this run's argmax** | `d7d5` |  -124 | 2 | 0.492 | Deep CFR's top pick (≠ suggested) |
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

**cfr-phase2b-hybrid_fog-100iter-smoke-results run** (n_legal = 24):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `b7b6` |  -481 | 13 | 0.002 | annotated blunder |
| **suggested** | `g4f6` |  -160 | 1 | 0.023 | annotator's recommendation |
| **this run's argmax** | `g4h6` |  -178 | 3 | 0.826 | Deep CFR's top pick (≠ suggested) |
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

**cfr-phase2b-hybrid_fog-100iter-smoke-results run** (n_legal = 27):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `d2d3` | -1573 | 16 | 0.027 | annotated blunder |
| **suggested** | `f2f3` | -1191 | 4 | 0.040 | annotator's recommendation |
| **this run's argmax** | `d1b3` | -1478 | 11 | 0.526 | Deep CFR's top pick (≠ suggested) |
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

## #4: `efa56f63` — major, ply 17, white to move

**Annotator's note:** again white doesn't recapture the knight, and instead side steps with his king

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

```
r . b . k b . r
p p . . . p p p
. . n . . . . .
. . . . P . . .
. . . . . . . .
. . . . n N . .
P P P . . P P P
R N . K . B . R
```

**cfr-phase2b-hybrid_fog-100iter-smoke-results run** (n_legal = 31):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `d1e1` |  -744 | 5 | 0.000 | annotated blunder |
| **suggested** | `f2e3` |   +75 | 1 | 0.982 | annotator's recommendation |
| **this run's argmax** | `f2e3` |   +75 | 1 | 0.982 | Deep CFR's top pick (✓ matches suggested) |
| Phase 1b argmax | `f2e3` |   +75 | 1 | (tabular n/a) | tabular CFR (same pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `f2e3` | +75 | ← suggested ← this run's argmax ← Phase 1b argmax |
| 2 | `f1d3` | -650 |  |
| 3 | `f1e2` | -674 |  |
| 4 | `d1c1` | -738 |  |
| 5 | `d1e1` | -744 | ← played |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #5: `9a806582` — major, ply 4, black to move

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

**cfr-phase2b-hybrid_fog-100iter-smoke-results run** (n_legal = 28):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `g8f6` |  -148 | 4 | 0.086 | annotated blunder |
| **suggested** | `c7c6` |  -240 | 23 | 0.006 | annotator's recommendation |
| **this run's argmax** | `d8d5` |   -33 | 1 | 0.143 | Deep CFR's top pick (≠ suggested) |
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

**cfr-phase2b-hybrid_fog-100iter-smoke-results run** (n_legal = 31):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `g7g6` |  -166 | 8 | 0.010 | annotated blunder |
| **suggested** | `c7c6` |  -252 | 24 | 0.002 | annotator's recommendation |
| **this run's argmax** | `c8g4` |  -400 | 25 | 0.302 | Deep CFR's top pick (≠ suggested) |
| Phase 1b argmax | `c8g4` |  -400 | 25 | (tabular n/a) | tabular CFR (same pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `d8d5` | -22 |  |
| 2 | `f6d5` | -23 |  |
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

## #7: `0aac8a1d` — major, ply 32, black to move

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

**cfr-phase2b-hybrid_fog-100iter-smoke-results run** (n_legal = 34):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `d8h4` | +1030 | 33 | 0.000 | annotated blunder |
| **suggested** | `c8d7` | +1840 | 24 | 0.000 | annotator's recommendation |
| **this run's argmax** | `a1d4` | +1881 | 8 | 0.522 | Deep CFR's top pick (≠ suggested) |
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

## #8: `10b34773` — major, ply 36, black to move

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

**cfr-phase2b-hybrid_fog-100iter-smoke-results run** (n_legal = 38):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `c7c6` |  +263 | 20 | 0.002 | annotated blunder |
| **suggested** | `f5e7` |   +97 | 32 | 0.035 | annotator's recommendation |
| **this run's argmax** | `a4a3` |  +439 | 8 | 0.778 | Deep CFR's top pick (≠ suggested) |
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

## #9: `d9ccbf88` — major, ply 18, black to move

**Annotator's note:** black captures a pawn on c2 instead of the more valuable bishop on f1

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

```
r . b . k b . r
p p . . . p p p
. . n . . . . .
. . . . P . . .
. . . . . . . .
. . . . n N . .
P P . K . P P P
R N . . . B . R
```

**cfr-phase2b-hybrid_fog-100iter-smoke-results run** (n_legal = 40):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `e3c2` |  -252 | 31 | 0.008 | annotated blunder |
| **suggested** | `e3f1` |   +38 | 4 | 0.438 | annotator's recommendation |
| **this run's argmax** | `e3f1` |   +38 | 4 | 0.438 | Deep CFR's top pick (✓ matches suggested) |
| Phase 1b argmax | `e3f1` |   +38 | 4 | (tabular n/a) | tabular CFR (same pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `e3g4` | +203 |  |
| 2 | `e3d5` | +202 |  |
| 3 | `e3f5` | +191 |  |
| 4 | `e3f1` | +38 | ← suggested ← this run's argmax ← Phase 1b argmax |
| 5 | `f8c5` | -43 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #10: `4cb2418d` — major, ply 63, white to move

**Annotator's note:** instead of taking black's undefended rook with his bishop, white took a pawn with his knight and exposed his own queen to attack by black's rook on h5. very dubious.

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

```
. . b . q r k .
b . . n n . . .
. . p . p . P p
. . . . . . . r
. p . p P . . .
p P . P . B . N
P . P N . . . .
R . B . . R K Q
```

**cfr-phase2b-hybrid_fog-100iter-smoke-results run** (n_legal = 25):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `h3f4` | -1086 | 23 | 0.003 | annotated blunder |
| **suggested** | `f3h5` |   -28 | 1 | 0.977 | annotator's recommendation |
| **this run's argmax** | `f3h5` |   -28 | 1 | 0.977 | Deep CFR's top pick (✓ matches suggested) |
| Phase 1b argmax | `f3h5` |   -28 | 1 | (tabular n/a) | tabular CFR (same pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `f3h5` | -28 | ← suggested ← this run's argmax ← Phase 1b argmax |
| 2 | `h1g2` | -614 |  |
| 3 | `d2c4` | -630 |  |
| 4 | `a1b1` | -635 |  |
| 5 | `h1h2` | -636 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #11: `4b6cfbdf` — major, ply 6, black to move

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

**cfr-phase2b-hybrid_fog-100iter-smoke-results run** (n_legal = 47):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `d5e4` |  -918 | 37 | 0.004 | annotated blunder |
| **suggested** | `d5e6` |    +7 | 1 | 0.164 | annotator's recommendation |
| **this run's argmax** | `d5e5` |   -42 | 7 | 0.201 | Deep CFR's top pick (≠ suggested) |
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
