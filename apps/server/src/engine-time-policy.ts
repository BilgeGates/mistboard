import { createClock, type Color, type GameEvent, type RoomTimeControl } from '@mistboard/game';

export type EngineTaskTimeControl =
  | { kind: 'none' }
  | { kind: 'standard'; initial_seconds: number; increment_seconds: number };

export function normalizeEngineTimeControl(value: Record<string, unknown> | undefined | null): EngineTaskTimeControl {
  if (!value || value.kind === undefined || value.kind === 'none') return { kind: 'none' };
  if (value.kind === 'standard') {
    const initialSeconds = numericValue(value.initial_seconds ?? value.initialSeconds);
    const incrementSeconds = numericValue(value.increment_seconds ?? value.incrementSeconds ?? 0);
    if (initialSeconds !== null && initialSeconds > 0 && incrementSeconds !== null && incrementSeconds >= 0) {
      return {
        kind: 'standard',
        initial_seconds: initialSeconds,
        increment_seconds: incrementSeconds,
      };
    }
  }
  return { kind: 'none' };
}

export function parseEngineTimeControl(value: string | undefined): EngineTaskTimeControl {
  if (!value || value === 'none') return { kind: 'none' };
  const match = value.match(/^(\d+(?:\.\d+)?)(?:\+(\d+(?:\.\d+)?))?$/);
  if (!match) throw new Error(`invalid time control ${value}; expected "none" or seconds+increment, e.g. 10+2`);
  const initial = Number(match[1]);
  const increment = match[2] === undefined ? 0 : Number(match[2]);
  if (!Number.isFinite(initial) || initial <= 0 || !Number.isFinite(increment) || increment < 0) {
    throw new Error(`invalid time control ${value}; initial must be >0 and increment must be >=0`);
  }
  return { kind: 'standard', initial_seconds: initial, increment_seconds: increment };
}

export function roomTimeControlFromEngine(timeControl: EngineTaskTimeControl): RoomTimeControl | undefined {
  if (timeControl.kind !== 'standard') return undefined;
  return {
    initialMs: Math.round(timeControl.initial_seconds * 1000),
    incrementMs: Math.round(timeControl.increment_seconds * 1000),
  };
}

export function clockStartedEvent(roomId: string, at: number, timeControl: EngineTaskTimeControl): GameEvent | null {
  const roomClock = roomTimeControlFromEngine(timeControl);
  if (!roomClock) return null;
  return {
    type: 'clock-started',
    at,
    roomId,
    clock: createClock(at, roomClock.initialMs, roomClock.incrementMs),
  };
}

export function timeoutResult(color: Color): 'white-wins' | 'black-wins' {
  return color === 'white' ? 'black-wins' : 'white-wins';
}

export function timeControlLabel(timeControl: EngineTaskTimeControl): string {
  if (timeControl.kind === 'none') return 'none';
  return `${timeControl.initial_seconds}+${timeControl.increment_seconds}`;
}

function numericValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
