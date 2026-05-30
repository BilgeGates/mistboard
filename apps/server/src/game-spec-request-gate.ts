import { DARK_XIANGQI_SPEC_ID } from '@mistboard/game';
import { darkXiangqiEnabled } from './feature-flags.js';

export type GameSpecGateDecision =
  | { type: 'pass' }
  | {
      type: 'reject';
      error: 'dark_xiangqi_disabled' | 'dark_xiangqi_not_integrated';
      httpStatus: 404 | 501;
      wsCloseReason: string;
    };

export function gateGameSpecRequest(input: {
  gameSpecId?: unknown;
  variant?: unknown;
}): GameSpecGateDecision {
  if (!requestsDarkXiangqi(input)) return { type: 'pass' };
  if (!darkXiangqiEnabled()) {
    return {
      type: 'reject',
      error: 'dark_xiangqi_disabled',
      httpStatus: 404,
      wsCloseReason: 'game spec disabled',
    };
  }
  return {
    type: 'reject',
    error: 'dark_xiangqi_not_integrated',
    httpStatus: 501,
    wsCloseReason: 'game spec not integrated',
  };
}

function requestsDarkXiangqi(input: { gameSpecId?: unknown; variant?: unknown }): boolean {
  // `gameSpecId` is the canonical selector. Keep the legacy `variant` guard only
  // to fail closed if an older or hand-written client sends Dark Xiangqi through
  // the chess room path.
  return input.gameSpecId === DARK_XIANGQI_SPEC_ID || input.variant === DARK_XIANGQI_SPEC_ID;
}
