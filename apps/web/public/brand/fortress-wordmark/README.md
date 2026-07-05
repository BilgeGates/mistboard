# Fortress Xiangqi — Wordmark (working, 2026-07-05)

Dobutsu animal-mascot wordmark for **Fortress Xiangqi** (堡垒象棋 · "Storm the Fortress").
Design accepted "for now" — not yet wired into the app.

**Direction:** generated multicolor chunky-bubble **FORTRESS / XIANGQI** type
(cinnabar `#e12f1c` / mustard `#d99a2b` / slate `#41576b`, one thick black
outline, cream `#f5ecce` ground) + a **row of the four board-piece discs**
(dragon + tiger generals, cat + dog soldiers = red + slate, "two players face
off") + tagline **"Let's storm the fortress!"** set in the rounded wordmark
font, sentence case.

## Assets (transparent PNGs)
- `fortress-word.png`, `xiangqi-word.png` — the two words
- `disc-{dragon-red,tiger-slate,cat-red,dog-slate}.png` — board-style discs:
  cream fill `#fff2cf` + animal + ring (`#c2261e` red / `#283a47` slate), per
  `apps/web/src/xiangqi-piece-sets.ts` (animalDiscMark / animalRingMark)
- `favicon-dragon-disc.png` — app-icon candidate (red dragon disc)
- `hanzi-baolei-xiangqi-UNVERIFIED.png` — 堡垒象棋 bubble render. **AI-drawn;
  verify 堡/垒 strokes with a native reader or re-set in Yuanti SC before any
  China use.**

## Pipeline (the reusable finding)
Do **not** generate the animals *into* the letters — they drift off-model and
sprout invented paws/extensions the source art doesn't have. Instead:
1. generate the **letters only** — `scripts/pixel-gen.mjs --provider gpt`
   (gpt-image, text-to-image), `node --env-file=.env …` (keys in repo `.env`);
2. **composite the real piece PNGs** on top, from
   `public/piece-sets/xiangqi/animal-dobutsu/`;
3. transparency via **border flood-fill** (removes edge-connected bg, keeps
   enclosed interior cream — muzzles, antlers, letter counters).

A disc is a circle, so it can stand in for a round letter (the O) faithfully —
"animal in the font" without morphing (only round letters qualify).

Full history + roster in agent memory `project_fortress_wordmark`.

## Open
Hanzi verification · FORTRESS/XIANGQI spacing + disc gaps · export sizes ·
SVG app-header lockup · site integration.
