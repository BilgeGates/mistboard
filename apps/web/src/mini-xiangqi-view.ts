import type { MiniXiangqiMove } from '@mistboard/game';

export type MiniXiangqiViewKey = 'truth';

export function miniXiangqiMoveLabel(move: MiniXiangqiMove): string {
  return `${move.from}-${move.to}`;
}
