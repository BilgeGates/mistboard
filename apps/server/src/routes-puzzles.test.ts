import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import test from 'node:test';
import { FORTRESS_XIANGQI_PUZZLES, JUNGLE_PUZZLES, MINI_XIANGQI_PUZZLES } from '@mistboard/game';
import type { HttpApiContext } from './routes/lib.js';
import { tryHandle } from './routes/puzzles.js';

type ResponseCapture = { body: string; headers: Record<string, string>; status: number | null };

function captureResponse(): ServerResponse & ResponseCapture {
  const capture = {
    body: '',
    headers: {} as Record<string, string>,
    status: null as number | null,
    writeHead(status: number, headers?: Record<string, string>) {
      capture.status = status;
      capture.headers = headers ?? {};
      return capture;
    },
    end(chunk?: string) {
      capture.body += chunk ?? '';
      return capture;
    },
  };
  return capture as unknown as ServerResponse & ResponseCapture;
}

function request(method = 'GET', body?: unknown): IncomingMessage {
  if (body === undefined) return { method, headers: {} } as unknown as IncomingMessage;
  const raw = Buffer.from(JSON.stringify(body));
  return {
    method,
    headers: { 'content-type': 'application/json' },
    async *[Symbol.asyncIterator]() {
      yield raw;
    },
  } as unknown as IncomingMessage;
}

async function route(path: string, method = 'GET', body?: unknown): Promise<ResponseCapture> {
  const response = captureResponse();
  const handled = await tryHandle(
    {} as HttpApiContext,
    request(method, body),
    response,
    new URL(path, 'http://localhost').pathname,
    new URL(path, 'http://localhost'),
  );
  assert.equal(handled, true);
  return response;
}

test('puzzle list returns public Mini and Drop Mini summaries without solutions', async () => {
  const response = await route('/api/puzzles');
  const body = JSON.parse(response.body) as {
    puzzles: Array<{
      id: string;
      variant: string;
      solution?: unknown;
      solutionPlyCount: number;
      goal: { type: string };
    }>;
  };

  assert.equal(response.status, 200);
  assert.equal(
    body.puzzles.length,
    MINI_XIANGQI_PUZZLES.length + FORTRESS_XIANGQI_PUZZLES.length + JUNGLE_PUZZLES.length,
  );
  assert.deepEqual(
    body.puzzles.slice(0, 6).map((puzzle) => puzzle.variant),
    [
      'mini-xiangqi',
      'mini-xiangqi',
      'mini-xiangqi',
      'mini-xiangqi',
      'mini-xiangqi',
      'mini-xiangqi',
    ],
  );
  assert.equal(body.puzzles.filter((puzzle) => puzzle.variant === 'drop-mini-xiangqi').length, 30);
  assert.equal(
    body.puzzles.filter((puzzle) => puzzle.variant === 'fortress-xiangqi').length,
    FORTRESS_XIANGQI_PUZZLES.length,
  );
  assert.equal(
    body.puzzles.every((puzzle) => puzzle.solution === undefined),
    true,
  );
  const mateInTwoIds = [
    'mini-xiangqi-black-two-step-file-net-1',
    'drop-mini-xiangqi-black-soldier-drop-net-1',
  ];
  const mateInThreeIds = [
    'mini-xiangqi-red-cannon-switch-mate-1',
    'mini-xiangqi-red-double-chariot-file-mate-1',
    'mini-xiangqi-red-horse-return-mate-1',
    'drop-mini-xiangqi-red-cannon-clearance-mate-1',
    'drop-mini-xiangqi-red-twin-cannon-mate-1',
    'drop-mini-xiangqi-black-cannon-ladder-mate-1',
  ];
  for (const id of mateInTwoIds) {
    assert.equal(body.puzzles.find((puzzle) => puzzle.id === id)?.solutionPlyCount, 3, id);
  }
  for (const id of mateInThreeIds) {
    assert.equal(body.puzzles.find((puzzle) => puzzle.id === id)?.solutionPlyCount, 5, id);
  }
  assert.equal(
    body.puzzles
      .filter(
        (puzzle) =>
          puzzle.goal.type === 'checkmate' &&
          !mateInTwoIds.includes(puzzle.id) &&
          !mateInThreeIds.includes(puzzle.id),
      )
      .every((puzzle) => puzzle.solutionPlyCount === 1),
    true,
  );
});

test('puzzle list filters by supported puzzle variant', async () => {
  const response = await route('/api/puzzles?variant=drop-mini-xiangqi');
  const body = JSON.parse(response.body) as { puzzles: Array<{ variant: string }> };

  assert.equal(response.status, 200);
  assert.equal(body.puzzles.length, 30);
  assert.equal(
    body.puzzles.every((puzzle) => puzzle.variant === 'drop-mini-xiangqi'),
    true,
  );
});

test('puzzle list filters to Fortress Xiangqi puzzles', async () => {
  const response = await route('/api/puzzles?variant=fortress-xiangqi');
  const body = JSON.parse(response.body) as {
    puzzles: Array<{ variant: string; solutionPlyCount: number }>;
  };

  assert.equal(response.status, 200);
  assert.equal(body.puzzles.length, FORTRESS_XIANGQI_PUZZLES.length);
  assert.equal(
    body.puzzles.every((puzzle) => puzzle.variant === 'fortress-xiangqi'),
    true,
  );
});

test('puzzle list filters to Jungle puzzles', async () => {
  const response = await route('/api/puzzles?variant=jungle');
  const body = JSON.parse(response.body) as {
    puzzles: Array<{ variant: string; solution?: unknown }>;
  };

  assert.equal(response.status, 200);
  assert.equal(body.puzzles.length, JUNGLE_PUZZLES.length);
  assert.equal(
    body.puzzles.every((puzzle) => puzzle.variant === 'jungle'),
    true,
  );
  assert.equal(
    body.puzzles.every((puzzle) => puzzle.solution === undefined),
    true,
  );
});

test('puzzle list rejects unsupported variants', async () => {
  const response = await route('/api/puzzles?variant=banqi');

  assert.equal(response.status, 400);
  assert.deepEqual(JSON.parse(response.body), { error: 'invalid_variant' });
});

test('Fortress puzzle attempts solve the mined mate and stay solution-hidden', async () => {
  const response = await route('/api/puzzles/fortress-xiangqi-mined-v2-001/attempt', 'POST', {
    moves: [{ drop: 'cannon', to: 'c8' }],
  });
  const body = JSON.parse(response.body) as {
    attempt: {
      ok: boolean;
      complete: boolean;
      state: { status: { type: string; winner?: string; reason?: string } };
      solution?: unknown;
    };
  };

  assert.equal(response.status, 200);
  assert.equal(body.attempt.ok, true);
  assert.equal(body.attempt.complete, true);
  assert.deepEqual(body.attempt.state.status, {
    type: 'finished',
    winner: 'red',
    reason: 'checkmate',
  });
  assert.equal(body.attempt.solution, undefined);
});

test('Jungle puzzle attempts solve the mined forced win and stay solution-hidden', async () => {
  // Derive from the corpus so the test tracks regeneration. Submit only the solver
  // moves (even indices); the server auto-applies the scripted defender replies.
  const puzzle = JUNGLE_PUZZLES.find((p) => p.goal.type === 'win');
  assert.ok(puzzle, 'expected at least one forced-win Jungle puzzle');
  const solverMoves = puzzle.solution.filter((_, index) => index % 2 === 0);
  const response = await route(`/api/puzzles/${puzzle.id}/attempt`, 'POST', {
    moves: solverMoves,
  });
  const body = JSON.parse(response.body) as {
    attempt: {
      ok: boolean;
      complete: boolean;
      state: { status: { type: string; winner?: string; reason?: string } };
      solution?: unknown;
    };
  };

  assert.equal(response.status, 200);
  assert.equal(body.attempt.ok, true);
  assert.equal(body.attempt.complete, true);
  assert.equal(body.attempt.state.status.type, 'finished');
  assert.equal(body.attempt.state.status.winner, puzzle.goal.winner);
  assert.equal(body.attempt.solution, undefined);
});

test('daily puzzle route returns a public persisted-assignment shape without solutions', async () => {
  const response = await route('/api/puzzles/daily');
  const body = JSON.parse(response.body) as {
    daily: {
      day: string;
      persisted: boolean;
      selectedAt: string | null;
      slot: string;
      source: string;
    };
    puzzle: {
      id: string;
      initial: unknown;
      solution?: unknown;
      variant: string;
    };
  };

  assert.equal(response.status, 200);
  assert.match(body.daily.day, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(body.daily.slot, 'homepage');
  assert.equal(body.daily.persisted, false);
  assert.equal(body.daily.source, 'ephemeral');
  assert.equal(body.daily.selectedAt, null);
  assert.equal(typeof body.puzzle.id, 'string');
  // Only Fortress Xiangqi is featured as the daily puzzle for now.
  assert.equal(body.puzzle.variant, 'fortress-xiangqi');
  assert.notEqual(body.puzzle.initial, undefined);
  assert.equal(body.puzzle.solution, undefined);
});

test('daily puzzle route rejects unsupported slots', async () => {
  const response = await route('/api/puzzles/daily?slot=fortress-training');

  assert.equal(response.status, 400);
  assert.deepEqual(JSON.parse(response.body), { error: 'invalid_slot' });
});

test('puzzle detail returns the starting position but not the solution', async () => {
  const response = await route('/api/puzzles/drop-mini-xiangqi-red-chariot-drop-mate-1');
  const body = JSON.parse(response.body) as {
    puzzle: {
      id: string;
      initial: { hands: { red: { chariot?: number } } };
      solution?: unknown;
      sideToMove: string;
    };
  };

  assert.equal(response.status, 200);
  assert.equal(body.puzzle.id, 'drop-mini-xiangqi-red-chariot-drop-mate-1');
  assert.equal(body.puzzle.sideToMove, 'red');
  assert.deepEqual(body.puzzle.initial.hands.red, { chariot: 1 });
  assert.equal(body.puzzle.solution, undefined);
});

test('puzzle detail 404s unknown puzzle ids', async () => {
  const response = await route('/api/puzzles/not-a-real-puzzle');

  assert.equal(response.status, 404);
  assert.deepEqual(JSON.parse(response.body), { error: 'not_found' });
});

test('puzzle attempts advance correct moves without exposing the solution list', async () => {
  const response = await route(
    '/api/puzzles/drop-mini-xiangqi-red-chariot-drop-mate-1/attempt',
    'POST',
    { moves: [{ drop: 'chariot', to: 'd4' }] },
  );
  const body = JSON.parse(response.body) as {
    attempt: {
      ok: boolean;
      complete: boolean;
      state: { status: { type: string; reason?: string } };
      solution?: unknown;
    };
  };

  assert.equal(response.status, 200);
  assert.equal(body.attempt.ok, true);
  assert.equal(body.attempt.complete, true);
  assert.deepEqual(body.attempt.state.status, {
    type: 'finished',
    winner: 'red',
    reason: 'checkmate',
  });
  assert.equal(body.attempt.solution, undefined);
});

test('puzzle attempts auto-apply opponent replies for multi-ply lines', async () => {
  const response = await route(
    '/api/puzzles/mini-xiangqi-black-two-step-file-net-1/attempt',
    'POST',
    {
      moves: [{ from: 'c5', to: 'd5' }],
    },
  );
  const body = JSON.parse(response.body) as {
    attempt: {
      ok: boolean;
      complete: boolean;
      playedMoves: unknown[];
      solverMoves: unknown[];
      state: { board: Record<string, unknown>; status: { type: string; turn?: string } };
      solution?: unknown;
    };
  };

  assert.equal(response.status, 200);
  assert.equal(body.attempt.ok, true);
  assert.equal(body.attempt.complete, false);
  assert.deepEqual(body.attempt.playedMoves, [
    { from: 'c5', to: 'd5' },
    { from: 'e2', to: 'e3' },
  ]);
  assert.deepEqual(body.attempt.solverMoves, [{ from: 'c5', to: 'd5' }]);
  assert.deepEqual(body.attempt.state.status, { type: 'playing', turn: 'black' });
  assert.deepEqual(body.attempt.state.board.d5, { color: 'black', role: 'general' });
  assert.deepEqual(body.attempt.state.board.e3, { color: 'red', role: 'general' });
  assert.equal(body.attempt.solution, undefined);
  assert.equal(response.body.includes('"from":"f1","to":"e1"'), false);
});

test('puzzle attempts reject wrong moves without returning the right move', async () => {
  const response = await route('/api/puzzles/mini-xiangqi-red-back-rank-net-1/attempt', 'POST', {
    moves: [{ from: 'c4', to: 'c5' }],
  });
  const body = JSON.parse(response.body) as {
    attempt: {
      ok: boolean;
      puzzleId: string;
      variant: string;
      code: string;
      ply: number;
      state: {
        board: Record<string, { color: string; role: string }>;
        status: { type: string; turn?: string };
      };
      move: unknown;
    };
  };

  assert.equal(response.status, 200);
  assert.equal(body.attempt.ok, false);
  assert.equal(body.attempt.puzzleId, 'mini-xiangqi-red-back-rank-net-1');
  assert.equal(body.attempt.variant, 'mini-xiangqi');
  assert.equal(body.attempt.code, 'incorrect-move');
  assert.equal(body.attempt.ply, 0);
  assert.deepEqual(body.attempt.move, { from: 'c4', to: 'c5' });
  assert.deepEqual(body.attempt.state.status, { type: 'playing', turn: 'red' });
  assert.deepEqual(body.attempt.state.board.c4, { color: 'red', role: 'chariot' });
  assert.equal(response.body.includes('"to":"d4"'), false);
});

test('puzzle attempts reject malformed move bodies', async () => {
  const response = await route('/api/puzzles/mini-xiangqi-red-back-rank-net-1/attempt', 'POST', {
    moves: [{ to: 'd4' }],
  });

  assert.equal(response.status, 400);
  assert.deepEqual(JSON.parse(response.body), { error: 'invalid_moves' });
});

test('puzzle rating route requires a variant', async () => {
  const response = await route('/api/puzzles/rating');

  assert.equal(response.status, 400);
  assert.deepEqual(JSON.parse(response.body), { error: 'invalid_variant' });
});

test('puzzle rating route returns null for an anonymous or unrated user', async () => {
  const response = await route('/api/puzzles/rating?variant=fortress-xiangqi');

  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { rating: null });
});

test('attempts omit rating info when there is no rated session', async () => {
  const response = await route('/api/puzzles/fortress-xiangqi-mined-v2-001/attempt', 'POST', {
    moves: [{ drop: 'cannon', to: 'c8' }],
  });
  const body = JSON.parse(response.body) as { attempt: { ok: boolean }; rating?: unknown };

  assert.equal(response.status, 200);
  assert.equal(body.attempt.ok, true);
  assert.equal(body.rating, undefined);
});

test('puzzle routes reject non-GET methods', async () => {
  const response = await route('/api/puzzles', 'POST');

  assert.equal(response.status, 405);
  assert.deepEqual(JSON.parse(response.body), { error: 'method_not_allowed' });
});
