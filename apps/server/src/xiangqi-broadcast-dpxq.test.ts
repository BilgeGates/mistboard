import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { looksLikeDpxqPage, normalizeDpxqPageToFrameHtml } from './xiangqi-broadcast-dpxq.js';
import { interpretXiangqiBroadcastSourceBody } from './xiangqi-broadcast-poller.js';
import { convertWxfDhtmlXqPageToSnapshot } from './xiangqi-broadcast-wxf-dhtmlxq.js';

// Real dpxq.com archive page (view_m_11637, 2004 将军杯 甲级联赛, 王斌 和 陶汉明),
// transcoded gb2312 -> utf-8. The movelist lives inside a JS var, players/result
// only in the <title>.
const ARCHIVE_HTML = readFileSync(
  fileURLToPath(new URL('./fixtures/dpxq/view_m_11637-archive.html', import.meta.url)),
  'utf-8',
);

// The full legal 89-ply movelist of that game; live fixtures slice prefixes of it
// so each in-progress board still replays legally.
const FULL_MOVELIST =
  '77477062796780708979727666651242192710222625001009191016273576663554707967792241191863645442204265644264186816176866171479670304665641335655644255356254474330413555546243631464677564666947664655516270517146767583768683628666636533253948254462746676656776776766403071704456485777577073563749483745663657777333304074534553335377765333232429077646333460823433';

// A dpxq live-room per-board feed (view.asp): full [DhtmlXQ_*] tag block inline,
// no [DhtmlXQiFrame] wrapper, empty binit = standard start. `plies` slices the
// shared movelist; empty result = game in progress.
function liveBoardPage(input: {
  red: string;
  black: string;
  plies: number;
  result?: string;
}): string {
  const movelist = FULL_MOVELIST.slice(0, input.plies * 4);
  return [
    '<html><head><title>象棋直播室</title></head><body>',
    '[DhtmlXQ_ver]www_dpxq_com[/DhtmlXQ_ver]<br>',
    '[DhtmlXQ_binit][/DhtmlXQ_binit]<br>',
    `[DhtmlXQ_event]测试联赛[/DhtmlXQ_event]<br>`,
    '[DhtmlXQ_round]第01轮[/DhtmlXQ_round]<br>',
    `[DhtmlXQ_result]${input.result ?? ''}[/DhtmlXQ_result]<br>`,
    `[DhtmlXQ_red]${input.red}[/DhtmlXQ_red]<br>`,
    `[DhtmlXQ_black]${input.black}[/DhtmlXQ_black]<br>`,
    `[DhtmlXQ_movelist]${movelist}[/DhtmlXQ_movelist]<br>`,
    '</body></html>',
  ].join('');
}

test('looksLikeDpxqPage flags raw dpxq pages, not framed WXF or JSON', () => {
  assert.equal(looksLikeDpxqPage(ARCHIVE_HTML), true);
  assert.equal(looksLikeDpxqPage(liveBoardPage({ red: 'A', black: 'B', plies: 4 })), true);
  // An already-normalized WXF page carries the frame wrapper; do not re-normalize.
  assert.equal(
    looksLikeDpxqPage('[DhtmlXQiFrame][DhtmlXQ_movelist]7747[/DhtmlXQ_movelist][/DhtmlXQiFrame]'),
    false,
  );
  assert.equal(looksLikeDpxqPage('{"rounds":[],"boards":[]}'), false);
});

test('dpxq archive page normalizes and replays as the full real game', () => {
  const normalized = normalizeDpxqPageToFrameHtml(ARCHIVE_HTML);
  assert.equal(normalized.ok, true);
  assert.ok(normalized.ok && normalized.html.includes('[DhtmlXQiFrame]'));

  const converted = convertWxfDhtmlXqPageToSnapshot(normalized.ok ? normalized.html : '');
  assert.equal(converted.ok, true);
  if (!converted.ok) return;
  const board = converted.snapshot.boards[0]!;
  assert.equal(board.moves.length, 89);
  assert.equal(board.red.name, '王斌');
  assert.equal(board.black.name, '陶汉明');
  assert.equal(board.result, '1/2-1/2');
  assert.equal(board.status, 'complete');
});

test('interpret routes a raw dpxq page through the dpxq adapter', () => {
  const body = interpretXiangqiBroadcastSourceBody(ARCHIVE_HTML);
  assert.equal(body.kind, 'wxf-dhtmlxq');
});

test('dpxq live board reads names from tags and marks an in-progress game live', () => {
  const page = liveBoardPage({ red: '王天一', black: '郑惟桐', plies: 12 });
  const normalized = normalizeDpxqPageToFrameHtml(page);
  assert.equal(normalized.ok, true);
  const converted = convertWxfDhtmlXqPageToSnapshot(normalized.ok ? normalized.html : '');
  assert.equal(converted.ok, true);
  if (!converted.ok) return;
  const board = converted.snapshot.boards[0]!;
  assert.equal(board.red.name, '王天一');
  assert.equal(board.black.name, '郑惟桐');
  assert.equal(board.moves.length, 12);
  assert.equal(board.status, 'live');
  assert.equal(board.result, '*');
});

test('dpxq live board across a growing poll sequence: plies grow, result flips to complete', () => {
  const snapshots = [
    liveBoardPage({ red: '王天一', black: '郑惟桐', plies: 0 }),
    liveBoardPage({ red: '王天一', black: '郑惟桐', plies: 12 }),
    liveBoardPage({ red: '王天一', black: '郑惟桐', plies: 40 }),
    liveBoardPage({ red: '王天一', black: '郑惟桐', plies: 89, result: '和' }),
  ];

  let previousPlies = -1;
  const boards = snapshots.map((page, index) => {
    const normalized = normalizeDpxqPageToFrameHtml(page);
    assert.equal(normalized.ok, true, `snapshot ${index} normalizes`);
    const converted = convertWxfDhtmlXqPageToSnapshot(normalized.ok ? normalized.html : '');
    // A 0-ply board has no moves to replay; the converter yields no board for it,
    // which the live update path treats as still-scheduled.
    if (index === 0) return null;
    assert.equal(converted.ok, true, `snapshot ${index} converts`);
    return converted.ok ? converted.snapshot.boards[0]! : null;
  });

  for (const board of boards.slice(1)) {
    assert.ok(board);
    if (!board) continue;
    assert.ok(board.moves.length > previousPlies, 'ply count grows monotonically');
    previousPlies = board.moves.length;
  }
  const finalBoard = boards.at(-1)!;
  assert.equal(finalBoard.status, 'complete');
  assert.equal(finalBoard.result, '1/2-1/2');
});
