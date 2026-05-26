import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import type { EngineTurnRequest, Move } from '@mistboard/game';
import {
  InternalEngineClientError,
  releaseInternalEngineReservation,
  requestInternalEngineReservation,
  requestInternalEngineTurn,
} from './internal-engine-client.js';

const legalMove: Move = { from: 'e2', to: 'e4' };

test('internal engine client posts protocol body with auth and timeout header', async () => {
  const previousUrl = process.env.MISTBOARD_INTERNAL_ENGINE_URL;
  const previousToken = process.env.MISTBOARD_INTERNAL_ENGINE_TOKEN;
  let observedBody: unknown = null;
  let observedAuth = '';
  let observedComputeBudget = '';
  let observedReservation = '';
  let observedTimeout = '';

  const server = createServer(async (req, res) => {
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/internal/engine/turn');
    observedAuth = req.headers.authorization ?? '';
    observedComputeBudget = String(req.headers['x-mistboard-engine-compute-budget-ms'] ?? '');
    observedReservation = String(req.headers['x-mistboard-engine-reservation-id'] ?? '');
    observedTimeout = String(req.headers['x-mistboard-engine-timeout-ms'] ?? '');
    observedBody = JSON.parse(await readBody(req));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        protocolVersion: '1',
        gameId: sampleRequest.gameId,
        sessionId: sampleRequest.sessionId,
        move: legalMove,
        diagnostics: { decisionSource: 'test-handler' },
      }),
    );
  });
  await listen(server);

  try {
    process.env.MISTBOARD_INTERNAL_ENGINE_URL = `http://127.0.0.1:${serverPort(server)}`;
    process.env.MISTBOARD_INTERNAL_ENGINE_TOKEN = 'test-token';

    const response = await requestInternalEngineTurn(sampleRequest, 1234, 'reservation-1', {
      computeBudgetMs: 456,
    });

    assert.equal(observedAuth, 'Bearer test-token');
    assert.equal(observedComputeBudget, '456');
    assert.equal(observedReservation, 'reservation-1');
    assert.equal(observedTimeout, '1234');
    assert.deepEqual(observedBody, sampleRequest);
    assert.deepEqual(response.move, legalMove);
    assert.equal(response.diagnostics?.decisionSource, 'test-handler');
  } finally {
    restoreEnv('MISTBOARD_INTERNAL_ENGINE_URL', previousUrl);
    restoreEnv('MISTBOARD_INTERNAL_ENGINE_TOKEN', previousToken);
    await close(server);
  }
});

test('internal engine client creates and releases reservations', async () => {
  const previousUrl = process.env.MISTBOARD_INTERNAL_ENGINE_URL;
  const previousToken = process.env.MISTBOARD_INTERNAL_ENGINE_TOKEN;
  let observedReservationBody: unknown = null;
  let observedReleaseBody: unknown = null;

  const server = createServer(async (req, res) => {
    assert.equal(req.headers.authorization, 'Bearer test-token');
    if (req.method === 'POST' && req.url === '/internal/engine/reservations') {
      observedReservationBody = JSON.parse(await readBody(req));
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          reservationId: 'reservation-1',
          engineId: sampleRequest.engineId,
          expiresAt: 123_456,
          capacity: { activeSeats: 1, maxSeats: 4 },
        }),
      );
      return;
    }
    if (
      req.method === 'POST' &&
      req.url === '/internal/engine/reservations/reservation-1/release'
    ) {
      observedReleaseBody = JSON.parse(await readBody(req));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });
  await listen(server);

  try {
    process.env.MISTBOARD_INTERNAL_ENGINE_URL = `http://127.0.0.1:${serverPort(server)}`;
    process.env.MISTBOARD_INTERNAL_ENGINE_TOKEN = 'test-token';

    const reservation = await requestInternalEngineReservation({
      color: sampleRequest.color,
      engineId: sampleRequest.engineId,
    });
    await releaseInternalEngineReservation(reservation.reservationId, 'test-release');

    assert.deepEqual(observedReservationBody, {
      color: sampleRequest.color,
      engineId: sampleRequest.engineId,
    });
    assert.deepEqual(observedReleaseBody, { reason: 'test-release' });
    assert.deepEqual(reservation, {
      reservationId: 'reservation-1',
      engineId: sampleRequest.engineId,
      expiresAt: 123_456,
      capacity: { activeSeats: 1, maxSeats: 4 },
    });
  } finally {
    restoreEnv('MISTBOARD_INTERNAL_ENGINE_URL', previousUrl);
    restoreEnv('MISTBOARD_INTERNAL_ENGINE_TOKEN', previousToken);
    await close(server);
  }
});

test('internal engine client fails closed when URL or token is missing', async () => {
  const previousUrl = process.env.MISTBOARD_INTERNAL_ENGINE_URL;
  const previousToken = process.env.MISTBOARD_INTERNAL_ENGINE_TOKEN;
  try {
    delete process.env.MISTBOARD_INTERNAL_ENGINE_URL;
    delete process.env.MISTBOARD_INTERNAL_ENGINE_TOKEN;

    await assert.rejects(
      requestInternalEngineTurn(sampleRequest, 100),
      (err) => err instanceof InternalEngineClientError && err.reason === 'missing_config',
    );
  } finally {
    restoreEnv('MISTBOARD_INTERNAL_ENGINE_URL', previousUrl);
    restoreEnv('MISTBOARD_INTERNAL_ENGINE_TOKEN', previousToken);
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

async function readBody(req: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function serverPort(server: Server): number {
  const address = server.address();
  assert.equal(typeof address, 'object');
  assert.notEqual(address, null);
  return (address as AddressInfo).port;
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
