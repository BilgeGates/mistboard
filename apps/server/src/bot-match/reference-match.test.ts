import assert from 'node:assert/strict';
import test from 'node:test';
import { startReferenceBotServer } from './reference-bot-server.js';
import { runBotMatchSeries } from './run-match.js';

// Exercises the FULL transport path (arbiter -> buildEngineTurnRequest ->
// requestEngineTurnAt -> real HTTP -> reference bot -> response) without the
// Python engine-worker. Deterministic: reference bots pick by engineSeed.

test('end-to-end: a series completes over real HTTP against two reference bots', async () => {
  const a = await startReferenceBotServer({ port: 0, token: 'tok-a' });
  const b = await startReferenceBotServer({ port: 0, token: 'tok-b' });
  try {
    const report = await runBotMatchSeries({
      a: {
        label: 'ref-a',
        engineId: 'python-v2-v1.5',
        endpoint: { baseUrl: a.url, token: 'tok-a' },
      },
      b: {
        label: 'ref-b',
        engineId: 'python-v2-v1.1',
        endpoint: { baseUrl: b.url, token: 'tok-b' },
      },
      games: 4,
      engineSecret: 'itest-secret',
      timeControl: null,
      maxPlies: 60,
      startedAtMs: 1_000_000,
    });

    assert.equal(report.games, 4);
    const accounted = (report.wins['ref-a'] ?? 0) + (report.wins['ref-b'] ?? 0) + report.draws;
    assert.equal(accounted, 4, 'every game must be won or drawn');
    // A legal-move-returning bot never forfeits.
    assert.equal(report.forfeits, 0);
    for (const r of report.results) {
      assert.ok(
        ['king-captured', 'draw', 'truncated', 'no-legal-moves'].includes(r.outcome),
        `unexpected outcome ${r.outcome}`,
      );
      assert.ok(r.plyCount > 0, 'moves were actually exchanged over the wire');
    }
  } finally {
    await a.close();
    await b.close();
  }
});

test('reference bot rejects a wrong bearer token', async () => {
  const server = await startReferenceBotServer({ port: 0, token: 'right-token' });
  try {
    const res = await fetch(`${server.url}/internal/engine/turn`, {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-token', 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(res.status, 401);
    await res.text();
  } finally {
    await server.close();
  }
});
