import type { GameProjection } from '@mistboard/game';
import { isKnownEngineClientId, loadEngine } from './engine-registry.js';
import {
  InternalEngineClientError,
  releaseInternalEngineReservation,
  requestInternalEngineReservation,
} from './internal-engine-client.js';
import { engineCounters, logger } from './obs.js';

export function canonicalLiveEngineVersionId(clientId: string): string {
  if (clientId === 'random-engine') return 'builtin-random-legal';
  return clientId;
}

export function pveEngineSeatForProjection(
  projection: GameProjection,
): { clientId: string; color: 'white' | 'black' } | null {
  const whiteClient = projection.seats.white;
  const blackClient = projection.seats.black;
  // Identify the engine seat by "is this an engine at all", not "is it currently
  // offered in the picker" — a hydrated/recovered game may use legacy or random,
  // which are no longer playable but are still valid engine seats to serve.
  const whiteIsEngine = isKnownEngineClientId(whiteClient);
  const blackIsEngine = isKnownEngineClientId(blackClient);
  if (whiteIsEngine && !blackIsEngine && whiteClient) {
    return { clientId: whiteClient, color: 'white' };
  }
  if (blackIsEngine && !whiteIsEngine && blackClient) {
    return { clientId: blackClient, color: 'black' };
  }
  return null;
}

export async function reserveLiveEngineSeat(
  engineId: string,
  color: 'white' | 'black',
): Promise<string | null> {
  if (loadEngine(engineId).config.kind !== 'python-subprocess') return null;
  const reservation = await requestInternalEngineReservation({ engineId, color });
  logger.info(
    {
      kind: 'live_engine_reservation_created',
      engine_id: engineId,
      color,
      reservation_id: reservation.reservationId,
      active_seats: reservation.capacity.activeSeats,
      max_seats: reservation.capacity.maxSeats,
      expires_at: reservation.expiresAt,
    },
    'live engine reservation created',
  );
  return reservation.reservationId;
}

export async function reserveHydratedLiveEngineSeat({
  color,
  engineId,
  roomId,
}: {
  color: 'white' | 'black';
  engineId: string;
  roomId: string;
}): Promise<string | null> {
  try {
    return await reserveLiveEngineSeat(engineId, color);
  } catch (err) {
    logger.warn(
      {
        kind: 'live_engine_reservation_hydrate_failed',
        room_id: roomId,
        engine_id: engineId,
        color,
        error: err instanceof Error ? err.message : String(err),
        ...(err instanceof InternalEngineClientError ? { engine_error_reason: err.reason } : {}),
      },
      'live engine reservation hydrate failed',
    );
    return null;
  }
}

export function releaseLiveEngineReservation(reservationId: string, reason: string): void {
  void releaseInternalEngineReservation(reservationId, reason).catch((err) => {
    engineCounters.recordReservationReleaseFailure();
    logger.warn(
      {
        kind: 'live_engine_reservation_release_failed',
        reservation_id: reservationId,
        reason,
        error: err instanceof Error ? err.message : String(err),
        ...(err instanceof InternalEngineClientError ? { engine_error_reason: err.reason } : {}),
      },
      'live engine reservation release failed',
    );
  });
}
