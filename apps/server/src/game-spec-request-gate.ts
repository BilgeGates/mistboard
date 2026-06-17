import {
  BANQI_SPEC_ID,
  DARK_MINI_XIANGQI_SPEC_ID,
  DARK_XIANGQI_SPEC_ID,
  JIEQI_SPEC_ID,
  REVEAL_CHESS_SPEC_ID,
} from '@mistboard/game';
import {
  banqiEnabled,
  darkMiniXiangqiEnabled,
  darkXiangqiEnabled,
  jieqiEnabled,
  revealChessEnabled,
} from './feature-flags.js';

export type GameSpecGateDecision =
  | { type: 'pass' }
  | {
      type: 'reject';
      error:
        | 'dark_xiangqi_disabled'
        | 'dark_xiangqi_not_integrated'
        | 'dark_mini_xiangqi_disabled'
        | 'dark_mini_xiangqi_not_integrated'
        | 'jieqi_disabled'
        | 'jieqi_not_integrated'
        | 'banqi_disabled'
        | 'banqi_not_integrated'
        | 'reveal_chess_disabled'
        | 'reveal_chess_not_integrated';
      httpStatus: 404 | 501;
      wsCloseReason: string;
    };

type GameSpecGateError = Extract<GameSpecGateDecision, { type: 'reject' }>['error'];

type HiddenRuntimeSpec =
  | typeof DARK_XIANGQI_SPEC_ID
  | typeof DARK_MINI_XIANGQI_SPEC_ID
  | typeof JIEQI_SPEC_ID
  | typeof BANQI_SPEC_ID
  | typeof REVEAL_CHESS_SPEC_ID;

const HIDDEN_RUNTIME_SPECS: Record<
  HiddenRuntimeSpec,
  { enabled(): boolean; disabledError: GameSpecGateError; notIntegratedError: GameSpecGateError }
> = {
  [DARK_XIANGQI_SPEC_ID]: {
    enabled: darkXiangqiEnabled,
    disabledError: 'dark_xiangqi_disabled',
    notIntegratedError: 'dark_xiangqi_not_integrated',
  },
  [DARK_MINI_XIANGQI_SPEC_ID]: {
    enabled: darkMiniXiangqiEnabled,
    disabledError: 'dark_mini_xiangqi_disabled',
    notIntegratedError: 'dark_mini_xiangqi_not_integrated',
  },
  [JIEQI_SPEC_ID]: {
    enabled: jieqiEnabled,
    disabledError: 'jieqi_disabled',
    notIntegratedError: 'jieqi_not_integrated',
  },
  [BANQI_SPEC_ID]: {
    enabled: banqiEnabled,
    disabledError: 'banqi_disabled',
    notIntegratedError: 'banqi_not_integrated',
  },
  [REVEAL_CHESS_SPEC_ID]: {
    enabled: revealChessEnabled,
    disabledError: 'reveal_chess_disabled',
    notIntegratedError: 'reveal_chess_not_integrated',
  },
};

export function gateGameSpecRequest(input: {
  gameSpecId?: unknown;
  variant?: unknown;
}): GameSpecGateDecision {
  const requested = requestedHiddenRuntimeSpec(input);
  if (!requested) return { type: 'pass' };
  const spec = HIDDEN_RUNTIME_SPECS[requested];
  if (!spec.enabled()) {
    return {
      type: 'reject',
      error: spec.disabledError,
      httpStatus: 404,
      wsCloseReason: 'game spec disabled',
    };
  }
  return {
    type: 'reject',
    error: spec.notIntegratedError,
    httpStatus: 501,
    wsCloseReason: 'game spec not integrated',
  };
}

function requestedHiddenRuntimeSpec(input: {
  gameSpecId?: unknown;
  variant?: unknown;
}): HiddenRuntimeSpec | null {
  // `gameSpecId` is the canonical selector. Keep the legacy `variant` guard only
  // to fail closed if an older or hand-written client sends non-chess specs
  // through the chess room path.
  for (const spec of [
    DARK_XIANGQI_SPEC_ID,
    DARK_MINI_XIANGQI_SPEC_ID,
    JIEQI_SPEC_ID,
    BANQI_SPEC_ID,
    REVEAL_CHESS_SPEC_ID,
  ] as const) {
    if (input.gameSpecId === spec || input.variant === spec) return spec;
  }
  return null;
}
