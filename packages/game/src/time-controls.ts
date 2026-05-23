// Single source of truth for Mistboard time controls.
// Every time control the platform officially supports is defined here once;
// rating buckets, UI pickers, server allowlists, and analytics all derive
// from this list.

import type { RoomTimeControl } from './events.js';

export type TimeClass = 'bullet' | 'blitz';
export type TimeControlId = '1m1' | '3m2' | '5m3';

export type TimeControlSpec = {
  id: TimeControlId;
  label: string;
  initialMs: number;
  incrementMs: number;
  timeClass: TimeClass;
};

export const TIME_CONTROLS: readonly TimeControlSpec[] = [
  { id: '1m1', label: '1 + 1', initialMs: 60_000, incrementMs: 1_000, timeClass: 'bullet' },
  { id: '3m2', label: '3 + 2', initialMs: 180_000, incrementMs: 2_000, timeClass: 'blitz' },
  { id: '5m3', label: '5 + 3', initialMs: 300_000, incrementMs: 3_000, timeClass: 'blitz' },
];

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
  return findTimeControl(tc.initialMs, tc.incrementMs) !== null;
}
