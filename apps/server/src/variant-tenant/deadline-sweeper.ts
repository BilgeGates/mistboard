/**
 * Interval sweeper for durable correspondence deadlines. Lists due
 * room_deadlines rows and routes each to its tenant registration's
 * sweepDueDeadline closure, which re-derives the deadline from the hydrated
 * room before acting — so a stale or orphaned row can never flag a game
 * early. Single-instance deployment today; take a per-room advisory lock
 * here before scaling the web service out.
 */

import { logger } from '../obs.js';
import * as persistence from '../persistence.js';
import { variantTenantForRoomId } from './registry.js';

export const DEADLINE_SWEEP_INTERVAL_MS = 60_000;

export type TenantDeadlineSweeperOptions = {
  intervalMs?: number;
  isPersistenceInitialized?: () => boolean;
  listDue?: (now: Date) => Promise<Array<{ roomId: string; gameSpecId: string }>>;
  now?: () => number;
  registrationFor?: typeof variantTenantForRoomId;
};

export type TenantDeadlineSweeper = {
  stop(): void;
  // Exposed for tests and for a future admin trigger; the interval calls it.
  tick(): Promise<void>;
};

export function startTenantDeadlineSweeper(
  options: TenantDeadlineSweeperOptions = {},
): TenantDeadlineSweeper {
  const intervalMs = options.intervalMs ?? DEADLINE_SWEEP_INTERVAL_MS;
  const isInitialized = options.isPersistenceInitialized ?? persistence.isInitialized;
  const listDue = options.listDue ?? ((now: Date) => persistence.listDueRoomDeadlines(now));
  const now = options.now ?? Date.now;
  const registrationFor = options.registrationFor ?? variantTenantForRoomId;

  async function tick(): Promise<void> {
    if (!isInitialized()) return;
    let due: Array<{ roomId: string; gameSpecId: string }>;
    try {
      due = await listDue(new Date(now()));
    } catch (err) {
      logger.error(
        { kind: 'deadline_sweep_list_failure', error: (err as Error).message, at: now() },
        'deadline sweep list failure',
      );
      return;
    }
    for (const row of due) {
      const registration = registrationFor(row.roomId);
      if (!registration?.sweepDueDeadline) {
        // An orphaned row (no registration claims the prefix, or the tenant
        // has no correspondence capability). Kept, not deleted: the row is
        // the only durable signal that enforcement is owed, and deleting it
        // would silently disarm the game if the registration is back after
        // a rollback. The log is the alarm.
        logger.error(
          {
            kind: 'deadline_sweep_orphan_row',
            room_id: row.roomId,
            game_spec_id: row.gameSpecId,
            at: now(),
          },
          'deadline sweep found a due row no registration claims',
        );
        continue;
      }
      try {
        await registration.sweepDueDeadline(row.roomId);
      } catch (err) {
        logger.error(
          {
            kind: 'deadline_sweep_room_failure',
            room_id: row.roomId,
            error: (err as Error).message,
            at: now(),
          },
          'deadline sweep room failure',
        );
      }
    }
  }

  const timer = setInterval(() => {
    void tick();
  }, intervalMs);
  timer.unref();

  return {
    stop: () => clearInterval(timer),
    tick,
  };
}
