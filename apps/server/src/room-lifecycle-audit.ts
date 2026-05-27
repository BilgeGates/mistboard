import { logger } from './obs.js';
import * as persistence from './persistence.js';

export async function recordRoomLifecycleAuditSafe(
  input: persistence.RoomLifecycleAuditInput,
): Promise<void> {
  if (!persistence.isInitialized()) return;
  try {
    await persistence.recordRoomLifecycleAudit(input);
  } catch (err) {
    logger.warn(
      {
        kind: 'room_lifecycle_audit_failure',
        lifecycleKind: input.kind,
        roomId: input.roomId ?? null,
        error: (err as Error).message,
      },
      'room lifecycle audit write failed',
    );
  }
}
