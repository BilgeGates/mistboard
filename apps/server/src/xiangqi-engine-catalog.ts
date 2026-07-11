import {
  XIANGQI_FSF_ENGINE_VERSION,
  XIANGQI_FSF_PLAYABLE_ENGINES,
  type XiangqiFsfEngineTier,
  xiangqiFsfEngineTierFor,
  xiangqiFsfLiveEngineMove,
} from './xiangqi-fsf-engine.js';
import {
  isXiangqiEngineClientId as isPikafishXiangqiEngineClientId,
  xiangqiEngineTierFor as pikafishXiangqiEngineTierFor,
  xiangqiLiveEngineMove as pikafishXiangqiLiveEngineMove,
  XIANGQI_ENGINE_VERSION,
  XIANGQI_PLAYABLE_ENGINES as XIANGQI_PIKAFISH_PLAYABLE_ENGINES,
  type XiangqiEngineTier as XiangqiPikafishEngineTier,
} from './xiangqi-pikafish-engine.js';

export {
  XIANGQI_DEFAULT_ENGINE_ID,
  XIANGQI_ENGINE_VERSION,
  XIANGQI_LEGACY_ENGINE_TIERS,
  xiangqiMoveToPikafishUci,
  xiangqiSquareToPikafish,
} from './xiangqi-pikafish-engine.js';

export type XiangqiEngineTier = XiangqiPikafishEngineTier | XiangqiFsfEngineTier;

// The list is weakest-first within each family. The experimental FSF profile is
// deliberately separate and honestly named; Pikafish identities remain stable.
export const XIANGQI_PLAYABLE_ENGINES: readonly XiangqiEngineTier[] = [
  ...XIANGQI_FSF_PLAYABLE_ENGINES,
  ...XIANGQI_PIKAFISH_PLAYABLE_ENGINES,
];

export function xiangqiEngineTierFor(engineId: string | undefined): XiangqiEngineTier | null {
  return xiangqiFsfEngineTierFor(engineId) ?? pikafishXiangqiEngineTierFor(engineId);
}

export function isXiangqiEngineClientId(clientId: string | undefined): boolean {
  return xiangqiEngineTierFor(clientId) !== null;
}

export function xiangqiEngineDisplayName(engineId: string): string {
  return xiangqiEngineTierFor(engineId)?.name ?? engineId;
}

export function xiangqiEngineVersion(clientId: string | undefined): string | null {
  if (xiangqiFsfEngineTierFor(clientId)) return XIANGQI_FSF_ENGINE_VERSION;
  return isPikafishXiangqiEngineClientId(clientId) ? XIANGQI_ENGINE_VERSION : null;
}

export function xiangqiLiveEngineMove(
  engineId: string,
  moves: string[],
  opts: { movetimeMs?: number } = {},
): Promise<string | null> {
  return xiangqiFsfEngineTierFor(engineId)
    ? xiangqiFsfLiveEngineMove(engineId, moves, opts)
    : pikafishXiangqiLiveEngineMove(engineId, moves, opts);
}
