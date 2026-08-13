// Single source of truth for Mistboard time controls.
// Every time control the platform officially supports is defined here once;
// rating buckets, UI pickers, server allowlists, and analytics all derive
// from this list.

import type { RoomTimeControl } from './events.js';
import {
  DARK_CHESS_SPEC_ID,
  DARK_DRAFT960_SPEC_ID,
  DARK_XIANGQI_SPEC_ID,
  type GameSpecId,
} from './game-specs.js';

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

// Paces an engine cannot honor, pinned to the slowest one it can.
//
// Misty's per-move cost in fog has a floor of roughly 5s: belief enumeration
// runs before the search's time budget applies, so the clock does not govern
// it. A 1s or 2s increment cannot cover that, the bank drains a few seconds
// per move, and the engine loses on time in any long enough game — measured in
// prod game 14f0ca10 at 3+2, where Misty flagged while the guest still held
// 117s of 180. The fog engines are pinned to 5+5 until the floor is bounded
// (#283).
//
// PvE only, and per game spec: the floor belongs to the engine, not to the
// variant, so human games keep every pace their landing config offers, and
// bots with bounded per-move cost (Fairy-Stockfish, Pikafish, the banqi and
// jungle engines) are absent from this map and accept all of them.
//
// One source for both sides: the web picker narrows to this (landing-play.ts
// allowedTimePresetIds) and each create route rejects against it (routes/
// rooms.ts for fog chess, routes/dark-xiangqi-rooms.ts for fog xiangqi), so a
// hand-crafted POST cannot start a pace the picker refuses.
//
// A pin MUST be a pace the variant itself offers, or the picker narrows to an
// empty set while the create route rejects everything, which strands the
// surface. `variant-registry-sync.test.ts` holds that invariant.
const ENGINE_TIME_CONTROL_PINS: Readonly<Partial<Record<GameSpecId, TimeControlId>>> = {
  // Draft960 is the same engine on a shuffled back rank, so it carries the
  // same pin; leaving it out would make the pregame option the way around this.
  [DARK_CHESS_SPEC_ID]: '5m5',
  [DARK_DRAFT960_SPEC_ID]: '5m5',
  // Fog xiangqi (python-fdx) runs its own belief stack rather than the fog
  // chess time manager, so its floor is not separately measured; pinned on the
  // shared-mechanism argument while #283 is open, not on its own flag evidence.
  [DARK_XIANGQI_SPEC_ID]: '5m5',
};

/** Every spec carrying an engine pin. Exported so conformance tests can assert
 *  each pin is a pace its own variant offers. */
export const ENGINE_PINNED_GAME_SPEC_IDS: readonly GameSpecId[] = Object.keys(
  ENGINE_TIME_CONTROL_PINS,
) as GameSpecId[];

/** The pace an engine game for this spec is pinned to, or null when unpinned. */
export function engineTimeControlPin(gameSpecId: GameSpecId): TimeControlSpec | null {
  const pinned = ENGINE_TIME_CONTROL_PINS[gameSpecId];
  if (pinned === undefined) return null;
  return TIME_CONTROLS.find((tc) => tc.id === pinned) ?? null;
}

/**
 * Whether an engine game for this spec may run at this pace. Unpinned specs
 * accept anything (their own variant allowlist still applies); a pinned spec
 * accepts only its pin. Correspondence is out of scope — no engine plays it.
 */
export function isAllowedEngineTimeControl(gameSpecId: GameSpecId, tc: RoomTimeControl): boolean {
  const pin = engineTimeControlPin(gameSpecId);
  if (pin === null) return true;
  return tc.initialMs === pin.initialMs && tc.incrementMs === pin.incrementMs;
}

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
