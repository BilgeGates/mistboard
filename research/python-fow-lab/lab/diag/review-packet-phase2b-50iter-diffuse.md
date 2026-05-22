# Review packet: phase2b-50iter-diffuse

- Source result file: `cfr-phase2b-hybrid_fog-smoke-results.json`
- Filter: `diffuse`
- Positions: 18

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

## #1: `9a806582` — major, ply 4, black to move

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

**phase2b-50iter-diffuse run** (n_legal = 28):

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

## #2: `0aac8a1d` — major, ply 32, black to move

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

**phase2b-50iter-diffuse run** (n_legal = 34):

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

## #3: `05d3524b` — major, ply 6, black to move

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

**phase2b-50iter-diffuse run** (n_legal = 31):

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

## #4: `4b6cfbdf` — major, ply 6, black to move

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

**phase2b-50iter-diffuse run** (n_legal = 47):

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

## #5: `f7199c23` — major, ply 23, white to move

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

**phase2b-50iter-diffuse run** (n_legal = 35):

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

## #6: `a9d572c8` — major, ply 26, black to move

**Annotator's note:** very bad move. black charges his queen in to the side of the board which is very possibly controlled by the opponent, for no reason. and he loses the queen. very bad.

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

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

**phase2b-50iter-diffuse run** (n_legal = 38):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `d8h4` |  -934 | 37 | 0.002 | annotated blunder |
| **suggested** | `e5e4` |  -223 | 3 | 0.279 | annotator's recommendation |
| **this run's argmax** | `e5e4` |  -223 | 3 | 0.279 | Deep CFR's top pick (✓ matches suggested) |
| Phase 1b argmax | `d7g4` |  -314 | 24 | (tabular n/a) | tabular CFR (different pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `e5d4` | -131 |  |
| 2 | `d5c4` | -158 |  |
| 3 | `e5e4` | -223 | ← suggested ← this run's argmax |
| 4 | `d8f6` | -232 |  |
| 5 | `a7a6` | -232 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #7: `59a54515` — major, ply 26, black to move

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

**phase2b-50iter-diffuse run** (n_legal = 34):

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

## #8: `bbebf2db` — major, ply 22, black to move

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

**phase2b-50iter-diffuse run** (n_legal = 41):

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

## #9: `8b933b52` — major, ply 24, black to move

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

**phase2b-50iter-diffuse run** (n_legal = 38):

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

## #10: `faf20cdd` — minor, ply 32, black to move

**Annotator's note:** black can take more material and get more vision into white's position. it's not clear why black avoided this move and instead moved his rook. maybe he wanted to protect b7, but it's not a high priority target

*Tags: aggregation-dilution, missed-info-gain*

**Board (capitals = white, lowercase = black):**

```
r . . q k . . r
. p . n . p p p
. . . . p n . .
. . b P . b . .
p . . . . P . .
. . . . . p . .
. . P . . . P P
R . . . Q K . R
```

**phase2b-50iter-diffuse run** (n_legal = 52):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `a8b8` | +1255 | 32 | 0.011 | annotated blunder |
| **suggested** | `f3g2` | +1392 | 2 | 0.157 | annotator's recommendation |
| **this run's argmax** | `f3g2` | +1392 | 2 | 0.157 | Deep CFR's top pick (✓ matches suggested) |
| Phase 1b argmax | `f3g2` | +1392 | 2 | (tabular n/a) | tabular CFR (same pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `f6d5` | +1424 |  |
| 2 | `f3g2` | +1392 | ← suggested ← this run's argmax ← Phase 1b argmax |
| 3 | `f3f2` | +1315 |  |
| 4 | `f5g4` | +1309 |  |
| 5 | `h8g8` | +1306 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #11: `35c7bd6e` — minor, ply 20, black to move

**Annotator's note:** Again, black had an opportunity to secure his bishop by retreating it

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

```
r . b . . r k .
p p p q n p p p
n . . p p . . .
B . . . . . . .
. . . . . . . .
. P . P P P . .
P . P . B N P P
b N . Q . R K .
```

**phase2b-50iter-diffuse run** (n_legal = 33):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `f7f6` |  +154 | 22 | 0.015 | annotated blunder |
| **suggested** | `a1f6` |  +440 | 2 | 0.118 | annotator's recommendation |
| **this run's argmax** | `a1f6` |  +440 | 2 | 0.118 | Deep CFR's top pick (✓ matches suggested) |
| Phase 1b argmax | `a1f6` |  +440 | 2 | (tabular n/a) | tabular CFR (same pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `a1e5` | +455 |  |
| 2 | `a1f6` | +440 | ← suggested ← this run's argmax ← Phase 1b argmax |
| 3 | `c7c5` | +234 |  |
| 4 | `a1b2` | +232 |  |
| 5 | `c7c6` | +222 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #12: `9ad0b093` — minor, ply 34, black to move

**Annotator's note:** f3g2 was still better. unclear why black moves the same rook again.

*Tags: aggregation-dilution, missed-info-gain, repetition*

**Board (capitals = white, lowercase = black):**

```
. r . q k . . r
. p . n . p p p
. . . . p n . .
. . b P . b . .
p . . . . P . .
. . . . . p . P
. . P . . . P .
R . . . Q K . R
```

**phase2b-50iter-diffuse run** (n_legal = 47):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `b8c8` | +1276 | 9 | 0.024 | annotated blunder |
| **suggested** | `f3g2` | +1366 | 2 | 0.043 | annotator's recommendation |
| **this run's argmax** | `f3g2` | +1366 | 2 | 0.043 | Deep CFR's top pick (✓ matches suggested) |
| Phase 1b argmax | `f3g2` | +1366 | 2 | (tabular n/a) | tabular CFR (same pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `f6d5` | +1398 |  |
| 2 | `f3g2` | +1366 | ← suggested ← this run's argmax ← Phase 1b argmax |
| 3 | `f3f2` | +1289 |  |
| 4 | `d8b6` | +1285 |  |
| 5 | `b8a8` | +1281 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #13: `ecd660ee` — minor, ply 42, black to move

**Annotator's note:** black takes a knight instead of moving his bishop which is under attack. probably better to move his bishop than take a knight he's not sure if it is protected

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

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

**phase2b-50iter-diffuse run** (n_legal = 37):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `a4a3` |  +606 | 35 | 0.002 | annotated blunder |
| **suggested** | `f5e6` | +1058 | 3 | 0.201 | annotator's recommendation |
| **this run's argmax** | `f5e6` | +1058 | 3 | 0.201 | Deep CFR's top pick (✓ matches suggested) |
| Phase 1b argmax | `b4c2` | +1086 | 2 | (tabular n/a) | tabular CFR (different pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `a4c2` | +1141 |  |
| 2 | `b4c2` | +1086 | ← Phase 1b argmax |
| 3 | `f5e6` | +1058 | ← suggested ← this run's argmax |
| 4 | `f5d7` | +1052 |  |
| 5 | `f5g6` | +1050 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #14: `14b6080e` — minor, ply 4, black to move

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

**phase2b-50iter-diffuse run** (n_legal = 23):

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

## #15: `a5e1a39a` — minor, ply 10, black to move

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

**phase2b-50iter-diffuse run** (n_legal = 28):

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

## #16: `6efdd48a` — minor, ply 10, black to move

**Annotator's note:** extending the pawn with d5 like this is a bit risky and actually loses a pawn in this position. Black should instead develop his knights to prepare extending his pawns

*Tags: (no tags)*

**Board (capitals = white, lowercase = black):**

```
r n . q k . n r
p p p b b p p p
. . . p p . . .
. . . . . . . .
. . . . P B . .
. . N P . N . .
P P P . . P P P
R . . Q K B . R
```

**phase2b-50iter-diffuse run** (n_legal = 28):

| Source | Move | fow_eval (cp) | fow rank | this run's prob | Note |
|---|---|---|---|---|---|
| played | `d6d5` |  -195 | 19 | 0.063 | annotated blunder |
| **suggested** | `g8f6` |  -133 | 6 | 0.206 | annotator's recommendation |
| **this run's argmax** | `e7f6` |  -127 | 4 | 0.259 | Deep CFR's top pick (≠ suggested) |
| Phase 1b argmax | `g8f6` |  -133 | 6 | (tabular n/a) | tabular CFR (different pick) |

**fow_evaluator's top 5 (chess-anchor reference):**

| Rank | Move | Score (cp) | Match? |
|---|---|---|---|
| 1 | `b8c6` | -108 |  |
| 2 | `b8a6` | -108 |  |
| 3 | `e6e5` | -109 |  |
| 4 | `e7f6` | -127 | ← this run's argmax |
| 5 | `c7c5` | -127 |  |

**Your chess judgment** (check the ones that apply):

- [ ] this run's argmax is the *best* move available (better than suggested + played)
- [ ] this run's argmax is *reasonable* but suggested is better
- [ ] this run's argmax is reasonable; suggested is no better (annotation is noisy)
- [ ] this run's argmax is *unreasonable* — the engine is wrong here
- [ ] the annotator's suggested move is itself questionable

Comment: _____________________________________________________

---

## #17: `84498757` — minor, ply 14, black to move

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

**phase2b-50iter-diffuse run** (n_legal = 35):

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

## #18: `105265dd` — minor, ply 31, white to move

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

**phase2b-50iter-diffuse run** (n_legal = 35):

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
