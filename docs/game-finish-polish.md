# Game Finish Polish Track

> Status: reference polish track. Use [ROADMAP.md](ROADMAP.md) for active gates
> and [STATUS.md](STATUS.md) for shipped state.
> Last reviewed: 2026-06-12.

Mistboard's finish moment should confirm the result clearly while preserving the
board as a study surface. The product tone is serious and restrained: no
confetti, shaking, or long celebratory loops.

## Surfaces

- Live room single-board view: the board remains readable after finish. Result
  text and actions carry the main outcome. Winner-only visual feedback should be
  brief and perspective-aware.
- Game review triptych: winner outline and loser dimming are appropriate because
  the viewer is comparing White, Truth, and Black at once.
- Homepage replay: use a lighter single-board treatment than review. Avoid
  heavy loser dimming unless the design intentionally shows multiple boards.
- Watch/replay surfaces: prefer objective result labels and readable positions.

## Perspective Rules

- Seated winner: short positive sound and a finite winner accent.
- Seated loser: calm result copy, readable board, no punitive animation.
- Draw: neutral sound and neutral result state.
- Review pages use objective result language such as "White wins" or "Draw."
- Do not add spectator-specific finish polish. Live spectator behavior remains a
  narrow access-control surface, not a primary product experience.

## Initial Polish Slice

- Keep the existing review triptych winner/loser treatment.
- Change the live-room winner king glow from an infinite loop to a finite pulse.
- Add a one-shot final-square pulse for king-capture finishes.
- Refine the existing seated-player finish sounds so wins resolve upward and
  losses descend softly without adding spectator-specific sound behavior.
- Respect reduced motion by disabling the glow animation.
- Do not introduce rating deltas until the server returns confirmed rating
  changes for completed rated games.

## Deferred

- Homepage-specific finish treatment for single-board replay.
- Rating delta display beside player names after rated games.
