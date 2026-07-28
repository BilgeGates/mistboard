// Single source of truth for Mistboard time controls.
// Every time control the platform officially supports is defined here once;
// rating buckets, UI pickers, server allowlists, and analytics all derive
// from this list.

import type { RoomTimeControl } from './events.js';

export type TimeClass = 'bullet' | 'blitz' | 'rapid';
export type TimeControlId = '1m1' | '3m2' | '5m5';

export type TimeControlSpec = {
  id: TimeControlId;
  label: string;
  initialMs: number;
  incrementMs: number;
  timeClass: TimeClass;
  // Whether a game at this pace can be rated. Mirrors the `rated` flag on
  // GameSpec: one source of truth, so the server allowlist and the web time
  // picker derive rather than each hand-maintaining a list (they drifted
  // apart while rated was 3+2-only). A new pace ships casual-only until this
  // is deliberately set.
  rated: boolean;
};

export const TIME_CONTROLS: readonly TimeControlSpec[] = [
  {
    id: '1m1',
    label: '1 + 1',
    initialMs: 60_000,
    incrementMs: 1_000,
    timeClass: 'bullet',
    rated: true,
  },
  {
    id: '3m2',
    label: '3 + 2',
    initialMs: 180_000,
    incrementMs: 2_000,
    timeClass: 'blitz',
    rated: true,
  },
  {
    id: '5m5',
    label: '5 + 5',
    initialMs: 300_000,
    incrementMs: 5_000,
    timeClass: 'rapid',
    rated: true,
  },
];

// Rated eligibility for a live pace. Correspondence never qualifies: at
// days-per-move cadence engine assistance is unenforceable, and the
// perfect-information correspondence allowance (routes/correspondence-rooms.ts)
// rests on correspondence being casual by construction.
export function isRatedTimeControl(tc: RoomTimeControl): boolean {
  if (tc.daysPerMove !== undefined) return false;
  return findTimeControl(tc.initialMs, tc.incrementMs)?.rated === true;
}

export const RATED_TIME_CONTROLS: readonly TimeControlSpec[] = TIME_CONTROLS.filter(
  (tc) => tc.rated,
);

export function findTimeControl(
  initialMs: number | null | undefined,
  incrementMs: number | null | undefined,
): TimeControlSpec | null {
  if (initialMs == null || incrementMs == null) return null;
  return (
    TIME_CONTROLS.find((tc) => tc.initialMs === initialMs && tc.incrementMs === incrementMs) ?? null
  );
}

export function timeClassFromTimeControl(
  initialMs: number | null | undefined,
  incrementMs: number | null | undefined,
): TimeClass | null {
  return findTimeControl(initialMs, incrementMs)?.timeClass ?? null;
}

export function isOfficialTimeControl(tc: RoomTimeControl): boolean {
  // The live allowlist never admits a correspondence time control, even one
  // whose ms values happen to collide with a live spec.
  if (tc.daysPerMove !== undefined) return false;
  return findTimeControl(tc.initialMs, tc.incrementMs) !== null;
}

// Correspondence (days-per-move) time controls. Kept apart from
// TIME_CONTROLS: live specs feed rating buckets and the PvE allowlist, and
// correspondence is casual-only with no live-engine surface.
export const DAY_MS = 24 * 60 * 60 * 1000;
export const DAYS_PER_MOVE_OPTIONS = [1, 3, 7] as const;
export type DaysPerMove = (typeof DAYS_PER_MOVE_OPTIONS)[number];

export function correspondenceTimeControl(daysPerMove: DaysPerMove): RoomTimeControl {
  return { initialMs: daysPerMove * DAY_MS, incrementMs: 0, daysPerMove };
}

export function isOfficialCorrespondenceTimeControl(tc: RoomTimeControl): boolean {
  return (
    tc.daysPerMove !== undefined &&
    (DAYS_PER_MOVE_OPTIONS as readonly number[]).includes(tc.daysPerMove) &&
    tc.initialMs === tc.daysPerMove * DAY_MS &&
    tc.incrementMs === 0
  );
}
