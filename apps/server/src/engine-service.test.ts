import assert from 'node:assert/strict';
import test from 'node:test';
import type { EngineTurnRequest, Move } from '@mistboard/game';
import { startEngineHttpService } from './engine-service.js';

const legalMove: Move = { from: 'e2', to: 'e4' };

test('engine HTTP service requires auth and returns protocol response', async () => {
  let observedComputeBudget = 0;
  let observedTimeout = 0;
  let observedRequest: EngineTurnRequest | null = null;
  const service = await startEngineHttpService({
    port: 0,
    token: 'test-token',
    handler: async (request, watchdogTimeoutMs, computeBudgetMs) => {
      observedRequest = request;
      observedComputeBudget = computeBudgetMs;
      observedTimeout = watchdogTimeoutMs;
      return {
        protocolVersion: '1',
        gameId: request.gameId,
        sessionId: request.sessionId,
        move: legalMove,
        diagnostics: { decisionSource: 'test-handler' },
      };
    },
  });

  try {
    const unauthorized = await fetch(engineUrl(service.port), {
      method: 'POST',
      body: JSON.stringify(sampleRequest),
    });
    assert.equal(unauthorized.status, 401);

    const reservationId = await reserveSeat(service.port);
    const response = await fetch(engineUrl(service.port), {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
        'x-mistboard-engine-reservation-id': reservationId,
        'x-mistboard-engine-compute-budget-ms': '900',
        'x-mistboard-engine-timeout-ms': '2500',
      },
      body: JSON.stringify(sampleRequest),
    });
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.deepEqual(observedRequest, sampleRequest);
    assert.equal(observedComputeBudget, 900);
    assert.equal(observedTimeout, 2500);
    assert.deepEqual(body, {
      protocolVersion: '1',
      gameId: sampleRequest.gameId,
      sessionId: sampleRequest.sessionId,
      move: legalMove,
      diagnostics: { decisionSource: 'test-handler' },
    });
  } finally {
    await service.close();
  }
});

test('engine HTTP service rejects turns without a matching reservation', async () => {
  const service = await startEngineHttpService({
    port: 0,
    token: 'test-token',
    handler: async (request) => ({
      protocolVersion: '1',
      gameId: request.gameId,
      sessionId: request.sessionId,
      move: legalMove,
    }),
  });

  try {
    const missing = await fetch(engineUrl(service.port), {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify(sampleRequest),
    });
    assert.equal(missing.status, 409);

    const wrongColorReservationId = await reserveSeat(service.port, {
      color: 'white',
      engineId: sampleRequest.engineId,
    });
    const wrongColor = await fetch(engineUrl(service.port), {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
        'x-mistboard-engine-reservation-id': wrongColorReservationId,
      },
      body: JSON.stringify(sampleRequest),
    });
    assert.equal(wrongColor.status, 409);
  } finally {
    await service.close();
  }
});

test('engine HTTP service bounds admitted live engine seats', async () => {
  const service = await startEngineHttpService({
    liveEngineSeats: 1,
    poolSize: 1,
    port: 0,
    reservationTtlMs: 60_000,
    token: 'test-token',
    handler: async (request) => ({
      protocolVersion: '1',
      gameId: request.gameId,
      sessionId: request.sessionId,
      move: legalMove,
    }),
  });

  try {
    const first = await fetch(reservationsUrl(service.port), {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ engineId: sampleRequest.engineId, color: sampleRequest.color }),
    });
    assert.equal(first.status, 201);
    const firstBody = await first.json();
    assert.equal(firstBody.capacity.activeSeats, 1);
    assert.equal(firstBody.capacity.maxSeats, 1);

    const second = await fetch(reservationsUrl(service.port), {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ engineId: sampleRequest.engineId, color: sampleRequest.color }),
    });
    assert.equal(second.status, 429);
    const secondBody = await second.json();
    assert.equal(secondBody.error, 'engine_capacity_full');
    assert.equal(secondBody.capacity.activeEngineSeats, 1);
    assert.equal(secondBody.capacity.availableEngineSeats, 0);

    await fetch(`${reservationsUrl(service.port)}/${firstBody.reservationId}/release`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ reason: 'test' }),
    });

    const afterRelease = await fetch(capacityUrl(service.port), {
      headers: { authorization: 'Bearer test-token' },
    });
    assert.equal(afterRelease.status, 200);
    const capacity = await afterRelease.json();
    assert.equal(capacity.activeEngineSeats, 0);
    assert.equal(capacity.availableEngineSeats, 1);
  } finally {
    await service.close();
  }
});

test('engine HTTP service exposes unauthenticated health check', async () => {
  const service = await startEngineHttpService({
    port: 0,
    token: 'test-token',
    handler: async (request) => ({
      protocolVersion: '1',
      gameId: request.gameId,
      sessionId: request.sessionId,
      move: legalMove,
    }),
  });

  try {
    const response = await fetch(`http://127.0.0.1:${service.port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, service: 'engine-worker' });
  } finally {
    await service.close();
  }
});

const sampleRequest: EngineTurnRequest = {
  protocolVersion: '1',
  gameId: 'game-1',
  engineId: 'python-tier1-v0.9.5',
  sessionId: 'game-1:python-tier1-v0.9.5:black',
  color: 'black',
  ply: 4,
  engineSeed: 123,
  clock: { remaining_ms: 180_000, increment_ms: 2_000 },
  legalMoves: [legalMove],
  observationTranscript: [],
};

function engineUrl(port: number): string {
  return `http://127.0.0.1:${port}/internal/engine/turn`;
}

function reservationsUrl(port: number): string {
  return `http://127.0.0.1:${port}/internal/engine/reservations`;
}

function capacityUrl(port: number): string {
  return `http://127.0.0.1:${port}/internal/engine/capacity`;
}

async function reserveSeat(
  port: number,
  input: { color: 'white' | 'black'; engineId: string } = {
    color: sampleRequest.color,
    engineId: sampleRequest.engineId,
  },
): Promise<string> {
  const response = await fetch(reservationsUrl(port), {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(typeof body.reservationId, 'string');
  return body.reservationId;
}
