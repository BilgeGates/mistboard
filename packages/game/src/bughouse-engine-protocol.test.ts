import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BUGHOUSE_PARTNER_REQUEST_FIXTURES,
  BUGHOUSE_PARTNER_RESPONSE_FIXTURES,
} from './bughouse-engine-protocol.fixtures.js';
import {
  BUGHOUSE_PARTNER_PROTOCOL_VERSION,
  BUGHOUSE_SEAT_ASSIGNMENTS,
  BUGHOUSE_SEATS,
  type BughousePartnerRequest,
  type BughousePartnerResponse,
  validateBughousePartnerRequest,
  validateBughousePartnerResponse,
} from './bughouse-engine-protocol.js';

test('bughouse seat assignments encode opposite-color partners', () => {
  assert.deepEqual(BUGHOUSE_SEATS, ['A:white', 'B:black', 'A:black', 'B:white']);
  assert.deepEqual(BUGHOUSE_SEAT_ASSIGNMENTS['A:white'], {
    board: 'A',
    color: 'white',
    team: 'team-0',
    teammate: 'B:black',
  });
  assert.deepEqual(BUGHOUSE_SEAT_ASSIGNMENTS['B:black'], {
    board: 'B',
    color: 'black',
    team: 'team-0',
    teammate: 'A:white',
  });
  assert.deepEqual(BUGHOUSE_SEAT_ASSIGNMENTS['A:black'], {
    board: 'A',
    color: 'black',
    team: 'team-1',
    teammate: 'B:white',
  });
  assert.deepEqual(BUGHOUSE_SEAT_ASSIGNMENTS['B:white'], {
    board: 'B',
    color: 'white',
    team: 'team-1',
    teammate: 'A:black',
  });
});

test('bughouse partner request fixtures are JSON-stable and internally consistent', () => {
  for (const fixture of BUGHOUSE_PARTNER_REQUEST_FIXTURES) {
    const roundTripped = JSON.parse(JSON.stringify(fixture)) as BughousePartnerRequest;
    assert.deepEqual(roundTripped, fixture);
    assert.deepEqual(validateBughousePartnerRequest(roundTripped), {
      ok: true,
      value: roundTripped,
    });
    assert.equal(fixture.protocolVersion, BUGHOUSE_PARTNER_PROTOCOL_VERSION);
    assert.equal(fixture.gameSpecId, 'chess-bughouse');
    assert.equal(fixture.team, BUGHOUSE_SEAT_ASSIGNMENTS[fixture.seat].team);
    assert.equal(fixture.boards.A.board, 'A');
    assert.equal(fixture.boards.B.board, 'B');

    const actionIds = fixture.legalActions.map((action) => action.id);
    assert.equal(new Set(actionIds).size, actionIds.length);
    for (const action of fixture.legalActions) {
      assert.equal(action.seat, fixture.seat);
      assert.equal(action.board, BUGHOUSE_SEAT_ASSIGNMENTS[fixture.seat].board);
    }

    for (const signal of fixture.teamSignals) {
      assert.equal(signal.to, fixture.seat);
      assert.equal(
        BUGHOUSE_SEAT_ASSIGNMENTS[signal.from].team,
        BUGHOUSE_SEAT_ASSIGNMENTS[signal.to].team,
      );
    }
  }
});

test('bughouse partner response fixtures are JSON-stable and reference request sessions', () => {
  const requestsBySession = new Map(
    BUGHOUSE_PARTNER_REQUEST_FIXTURES.map((fixture) => [fixture.sessionId, fixture]),
  );

  for (const response of BUGHOUSE_PARTNER_RESPONSE_FIXTURES) {
    const roundTripped = JSON.parse(JSON.stringify(response)) as BughousePartnerResponse;
    assert.deepEqual(roundTripped, response);
    assert.equal(response.protocolVersion, BUGHOUSE_PARTNER_PROTOCOL_VERSION);

    const request = requestsBySession.get(response.sessionId);
    assert.ok(request, `missing request fixture for ${response.sessionId}`);
    assert.deepEqual(validateBughousePartnerResponse(roundTripped, request), {
      ok: true,
      value: roundTripped,
    });
    assert.equal(response.matchId, request.matchId);

    const decision = response.decision;
    if (decision.kind === 'play') {
      assert.ok(
        request.legalActions.some((action) => action.id === decision.actionId),
        `missing legal action ${decision.actionId}`,
      );
    } else if (decision.kind === 'wait') {
      assert.ok(decision.maxWaitMs > 0);
    }

    for (const signal of response.signals ?? []) {
      assert.equal(
        BUGHOUSE_SEAT_ASSIGNMENTS[signal.to].team,
        BUGHOUSE_SEAT_ASSIGNMENTS[request.seat].team,
      );
    }
  }
});

test('bughouse partner response validation rejects illegal play actions', () => {
  const request = BUGHOUSE_PARTNER_REQUEST_FIXTURES[0];
  const response = clone<BughousePartnerResponse>(BUGHOUSE_PARTNER_RESPONSE_FIXTURES[0]);
  response.decision = { kind: 'play', actionId: 'missing-action' };

  assert.deepEqual(validateBughousePartnerResponse(response, request), {
    ok: false,
    reason: 'play action is not legal',
  });
});

test('bughouse partner response validation rejects invalid wait decisions', () => {
  const request = BUGHOUSE_PARTNER_REQUEST_FIXTURES[1];
  const response = clone<BughousePartnerResponse>(BUGHOUSE_PARTNER_RESPONSE_FIXTURES[1]);
  response.decision = {
    kind: 'wait',
    maxWaitMs: 0,
    reason: 'need-incoming-piece',
  };

  assert.deepEqual(validateBughousePartnerResponse(response, request), {
    ok: false,
    reason: 'wait maxWaitMs invalid',
  });
});

test('bughouse partner response validation keeps outbound signals inside the partner pair', () => {
  const request = BUGHOUSE_PARTNER_REQUEST_FIXTURES[0];
  const response = clone<BughousePartnerResponse>(BUGHOUSE_PARTNER_RESPONSE_FIXTURES[0]);
  response.signals = [
    {
      kind: 'need-piece',
      to: 'A:black',
      urgency: 'high',
      role: 'queen',
    },
  ];

  assert.deepEqual(validateBughousePartnerResponse(response, request), {
    ok: false,
    reason: 'outbound signal recipient mismatch',
  });
});

test('bughouse partner request validation rejects off-seat legal actions', () => {
  const request = clone<BughousePartnerRequest>(BUGHOUSE_PARTNER_REQUEST_FIXTURES[0]);
  request.legalActions = [
    {
      id: 'B:black:move:d8-h4',
      kind: 'move',
      board: 'B',
      seat: 'B:black',
      move: { from: 'd8', to: 'h4' },
      uci: 'd8h4',
    },
  ];

  assert.deepEqual(validateBughousePartnerRequest(request), {
    ok: false,
    reason: 'legal action seat mismatch',
  });
});

test('bughouse partner request validation rejects clock seats on the wrong board', () => {
  const request = clone<BughousePartnerRequest>(BUGHOUSE_PARTNER_REQUEST_FIXTURES[0]);
  request.clocks.boards.A.activeSeat = 'B:black';

  assert.deepEqual(validateBughousePartnerRequest(request), {
    ok: false,
    reason: 'clock A activeSeat board mismatch',
  });
});

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
