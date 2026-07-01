// Reconstruct the per-ply remaining-clock series for a finished tenant game from
// its postgame `timeline` (each move carries a wall-clock `at` ms) plus the game's
// Fischer time control. The generic tenant postgames carry no dense `clocks`
// array (unlike Dark Mini Xiangqi), but they DO carry move timestamps, so the
// showcase can show the real clocks the players actually had — not just a static
// time-control label.
//
// Reconstruction (Fischer): a mover's think time is the gap from the previous
// move (when it became their turn) to their own move; their remaining time after
// the move is prev - spent + increment. The first mover's think time is measured
// from the game start.

export type ShowcaseTimelineMove = {
  at: number;
  color: string;
  ply: number;
};

export type ShowcaseClockPair = { first: number; second: number };

// series[0] = both sides at the initial time; series[p] = remaining after ply p.
// `firstColor` is the side that moves first (its remaining maps to `.first`).
export function reconstructShowcaseClocks(args: {
  moves: readonly ShowcaseTimelineMove[];
  startedAt: number | null;
  initialMs: number;
  incrementMs: number;
  firstColor: string;
}): Array<ShowcaseClockPair> {
  const { moves, startedAt, initialMs, incrementMs, firstColor } = args;
  const ordered = [...moves].sort((a, b) => a.ply - b.ply);
  const clock = { first: initialMs, second: initialMs };
  const series: Array<ShowcaseClockPair> = [{ ...clock }];
  let prevAt = startedAt;
  for (const move of ordered) {
    const side = move.color === firstColor ? 'first' : 'second';
    // Guard against missing/backwards timestamps: never charge negative time.
    const spent = prevAt === null ? 0 : Math.max(0, move.at - prevAt);
    clock[side] = Math.max(0, clock[side] - spent) + incrementMs;
    series.push({ ...clock });
    prevAt = move.at;
  }
  return series;
}
