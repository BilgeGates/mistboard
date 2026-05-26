import type { EngineTurnRequest, EngineTurnResponse, Move, Square } from '@mistboard/game';

const ENGINE_TURN_PATH = '/internal/engine/turn';
const ENGINE_RESERVATIONS_PATH = '/internal/engine/reservations';
const DEFAULT_TRANSPORT_GRACE_MS = 1_000;
const DEFAULT_CONTROL_TIMEOUT_MS = 5_000;
const ERROR_BODY_TAIL_CHARS = 1_000;

export type InternalEngineClientErrorReason =
  | 'missing_config'
  | 'timeout'
  | 'http_error'
  | 'invalid_response'
  | 'network_error';

export class InternalEngineClientError extends Error {
  readonly diagnostics?: Record<string, unknown>;
  readonly status?: number;
  readonly timeoutMs?: number;

  constructor(
    readonly reason: InternalEngineClientErrorReason,
    message: string,
    options: {
      diagnostics?: Record<string, unknown>;
      status?: number;
      timeoutMs?: number;
    } = {},
  ) {
    super(message);
    this.diagnostics = options.diagnostics;
    this.status = options.status;
    this.timeoutMs = options.timeoutMs;
  }
}

export async function requestInternalEngineTurn(
  request: EngineTurnRequest,
  watchdogTimeoutMs: number,
  reservationId?: string,
  options: { computeBudgetMs?: number } = {},
): Promise<EngineTurnResponse> {
  const baseUrl = process.env.MISTBOARD_INTERNAL_ENGINE_URL?.trim();
  const token = process.env.MISTBOARD_INTERNAL_ENGINE_TOKEN?.trim();
  if (!baseUrl || !token) {
    throw new InternalEngineClientError(
      'missing_config',
      'internal engine service URL/token is not configured',
    );
  }

  const timeoutMs = Math.max(1, watchdogTimeoutMs + DEFAULT_TRANSPORT_GRACE_MS);
  const computeBudgetMs = Math.max(
    1,
    Math.min(watchdogTimeoutMs, Math.floor(options.computeBudgetMs ?? watchdogTimeoutMs)),
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(engineTurnUrl(baseUrl), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...(reservationId ? { 'x-mistboard-engine-reservation-id': reservationId } : {}),
        'x-mistboard-engine-timeout-ms': String(watchdogTimeoutMs),
        'x-mistboard-engine-compute-budget-ms': String(computeBudgetMs),
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new InternalEngineClientError(
        'http_error',
        `internal engine service returned HTTP ${response.status}`,
        {
          status: response.status,
          diagnostics: {
            status: response.status,
            bodyTail: (await response.text()).slice(-ERROR_BODY_TAIL_CHARS),
          },
        },
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (err) {
      throw new InternalEngineClientError(
        'invalid_response',
        `internal engine service returned invalid JSON: ${(err as Error).message}`,
      );
    }
    return parseEngineTurnResponse(payload, request);
  } catch (err) {
    if (err instanceof InternalEngineClientError) throw err;
    if (isAbortError(err)) {
      throw new InternalEngineClientError(
        'timeout',
        `internal engine service timed out after ${timeoutMs}ms`,
        { timeoutMs },
      );
    }
    throw new InternalEngineClientError(
      'network_error',
      `internal engine service request failed: ${(err as Error).message}`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export type InternalEngineReservationResponse = {
  reservationId: string;
  engineId: string;
  expiresAt: number;
  capacity: {
    activeSeats: number;
    maxSeats: number;
  };
};

export async function requestInternalEngineReservation(input: {
  color: 'white' | 'black';
  engineId: string;
}): Promise<InternalEngineReservationResponse> {
  const response = await requestInternalEngineJson(ENGINE_RESERVATIONS_PATH, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return parseReservationResponse(response);
}

export async function releaseInternalEngineReservation(
  reservationId: string,
  reason: string,
): Promise<void> {
  await requestInternalEngineJson(
    `${ENGINE_RESERVATIONS_PATH}/${encodeURIComponent(reservationId)}/release`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    },
  );
}

async function requestInternalEngineJson(
  path: string,
  init: {
    body?: string;
    method: 'GET' | 'POST';
  },
): Promise<unknown> {
  const baseUrl = process.env.MISTBOARD_INTERNAL_ENGINE_URL?.trim();
  const token = process.env.MISTBOARD_INTERNAL_ENGINE_TOKEN?.trim();
  if (!baseUrl || !token) {
    throw new InternalEngineClientError(
      'missing_config',
      'internal engine service URL/token is not configured',
    );
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_CONTROL_TIMEOUT_MS);
  try {
    const response = await fetch(internalEngineUrl(baseUrl, path), {
      method: init.method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
      ...(init.body ? { body: init.body } : {}),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new InternalEngineClientError(
        'http_error',
        `internal engine service returned HTTP ${response.status}`,
        {
          status: response.status,
          diagnostics: {
            status: response.status,
            bodyTail: (await response.text()).slice(-ERROR_BODY_TAIL_CHARS),
          },
        },
      );
    }
    try {
      return await response.json();
    } catch (err) {
      throw new InternalEngineClientError(
        'invalid_response',
        `internal engine service returned invalid JSON: ${(err as Error).message}`,
      );
    }
  } catch (err) {
    if (err instanceof InternalEngineClientError) throw err;
    if (isAbortError(err)) {
      throw new InternalEngineClientError(
        'timeout',
        `internal engine service control request timed out after ${DEFAULT_CONTROL_TIMEOUT_MS}ms`,
        { timeoutMs: DEFAULT_CONTROL_TIMEOUT_MS },
      );
    }
    throw new InternalEngineClientError(
      'network_error',
      `internal engine service control request failed: ${(err as Error).message}`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function engineTurnUrl(baseUrl: string): string {
  return internalEngineUrl(baseUrl, ENGINE_TURN_PATH);
}

function internalEngineUrl(baseUrl: string, path: string): string {
  const base = new URL(baseUrl);
  if (!base.pathname.endsWith('/')) base.pathname = `${base.pathname}/`;
  return new URL(path.slice(1), base).toString();
}

function parseEngineTurnResponse(value: unknown, request: EngineTurnRequest): EngineTurnResponse {
  if (!isObject(value)) throw invalidResponse('top-level response is not an object');
  if (value.protocolVersion !== '1') throw invalidResponse('unsupported protocol version');
  if (value.gameId !== request.gameId) throw invalidResponse('response gameId mismatch');
  if (value.sessionId !== request.sessionId) throw invalidResponse('response sessionId mismatch');

  const move = parseMove(value.move);
  const diagnostics = isObject(value.diagnostics) ? value.diagnostics : undefined;
  return {
    protocolVersion: '1',
    gameId: request.gameId,
    sessionId: request.sessionId,
    move,
    ...(diagnostics ? { diagnostics } : {}),
  };
}

function parseReservationResponse(value: unknown): InternalEngineReservationResponse {
  if (!isObject(value)) throw invalidResponse('reservation response is not an object');
  if (typeof value.reservationId !== 'string') {
    throw invalidResponse('missing reservationId');
  }
  if (typeof value.engineId !== 'string') throw invalidResponse('missing engineId');
  if (typeof value.expiresAt !== 'number' || !Number.isFinite(value.expiresAt)) {
    throw invalidResponse('missing expiresAt');
  }
  if (!isObject(value.capacity)) throw invalidResponse('missing capacity');
  if (
    typeof value.capacity.activeSeats !== 'number' ||
    !Number.isFinite(value.capacity.activeSeats)
  ) {
    throw invalidResponse('missing activeSeats');
  }
  if (typeof value.capacity.maxSeats !== 'number' || !Number.isFinite(value.capacity.maxSeats)) {
    throw invalidResponse('missing maxSeats');
  }
  return {
    reservationId: value.reservationId,
    engineId: value.engineId,
    expiresAt: value.expiresAt,
    capacity: {
      activeSeats: value.capacity.activeSeats,
      maxSeats: value.capacity.maxSeats,
    },
  };
}

function parseMove(value: unknown): Move {
  if (!isObject(value)) throw invalidResponse('missing move');
  if (!isSquare(value.from) || !isSquare(value.to)) {
    throw invalidResponse('invalid move squares');
  }
  const promotion = parsePromotion(value.promotion);
  return {
    from: value.from,
    to: value.to,
    ...(promotion ? { promotion } : {}),
  };
}

function invalidResponse(message: string): InternalEngineClientError {
  return new InternalEngineClientError('invalid_response', message);
}

function parsePromotion(value: unknown): Move['promotion'] | null {
  if (value === undefined) return null;
  if (value === 'queen' || value === 'rook' || value === 'bishop' || value === 'knight') {
    return value;
  }
  throw invalidResponse('invalid promotion');
}

function isSquare(value: unknown): value is Square {
  return typeof value === 'string' && /^[a-h][1-8]$/.test(value);
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
