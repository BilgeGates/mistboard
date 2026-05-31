import { DARK_MINI_XIANGQI_SPEC_ID, DARK_XIANGQI_SPEC_ID } from '@mistboard/game';
import { darkMiniXiangqiEnabled, darkXiangqiEnabled } from './feature-flags.js';

export type GameSpecGateDecision =
  | { type: 'pass' }
  | {
      type: 'reject';
      error:
        | 'dark_xiangqi_disabled'
        | 'dark_xiangqi_not_integrated'
        | 'dark_mini_xiangqi_disabled'
        | 'dark_mini_xiangqi_not_integrated';
      httpStatus: 404 | 501;
      wsCloseReason: string;
    };

export function gateGameSpecRequest(input: {
  gameSpecId?: unknown;
  variant?: unknown;
}): GameSpecGateDecision {
  const requested = requestedHiddenRuntimeSpec(input);
  if (!requested) return { type: 'pass' };
  if (requested === DARK_XIANGQI_SPEC_ID && !darkXiangqiEnabled()) {
    return {
      type: 'reject',
      error: 'dark_xiangqi_disabled',
      httpStatus: 404,
      wsCloseReason: 'game spec disabled',
    };
  }
  if (requested === DARK_MINI_XIANGQI_SPEC_ID && !darkMiniXiangqiEnabled()) {
    return {
      type: 'reject',
      error: 'dark_mini_xiangqi_disabled',
      httpStatus: 404,
      wsCloseReason: 'game spec disabled',
    };
  }
  return {
    type: 'reject',
    error:
      requested === DARK_XIANGQI_SPEC_ID
        ? 'dark_xiangqi_not_integrated'
        : 'dark_mini_xiangqi_not_integrated',
    httpStatus: 501,
    wsCloseReason: 'game spec not integrated',
  };
}

function requestedHiddenRuntimeSpec(input: {
  gameSpecId?: unknown;
  variant?: unknown;
}): typeof DARK_XIANGQI_SPEC_ID | typeof DARK_MINI_XIANGQI_SPEC_ID | null {
  // `gameSpecId` is the canonical selector. Keep the legacy `variant` guard only
  // to fail closed if an older or hand-written client sends non-chess specs
  // through the chess room path.
  if (input.gameSpecId === DARK_XIANGQI_SPEC_ID || input.variant === DARK_XIANGQI_SPEC_ID) {
    return DARK_XIANGQI_SPEC_ID;
  }
  if (
    input.gameSpecId === DARK_MINI_XIANGQI_SPEC_ID ||
    input.variant === DARK_MINI_XIANGQI_SPEC_ID
  ) {
    return DARK_MINI_XIANGQI_SPEC_ID;
  }
  return null;
}
