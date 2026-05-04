import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const outputDir = '/private/tmp/bichess-visual-check';
const baseUrl = process.env.BICHESS_WEB_URL ?? 'http://127.0.0.1:3000';
const viewports = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const failures = [];
const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

for (const viewport of viewports) {
  const page = await browser.newPage({ viewport });
  const room = `visual-${viewport.name}-${Date.now()}`;
  await page.goto(`${baseUrl}/?room=${room}&reset=1`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.board.cg-wrap');
  await page.waitForSelector('square.fog-hidden');
  await page.waitForSelector('piece');
  await page.waitForTimeout(250);

  const metrics = await page.evaluate(() => {
    const board = document.querySelector('.board.cg-wrap');
    const panel = document.querySelector('.side-panel');
    if (!board || !panel) throw new Error('missing board or side panel');

    const boardRect = board.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    return {
      boardHeight: boardRect.height,
      boardWidth: boardRect.width,
      fogHiddenCount: document.querySelectorAll('square.fog-hidden').length,
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      mobilePanelBelowBoard: window.innerWidth > 780 ? true : panelRect.top >= boardRect.bottom - 1,
      pieceCount: document.querySelectorAll('piece:not(.fading)').length,
      roomLinks: [...document.querySelectorAll('.room-actions a')].map((link) => ({
        href: link.getAttribute('href') ?? '',
        label: link.textContent ?? '',
      })),
    };
  });

  if (Math.abs(metrics.boardWidth - metrics.boardHeight) > 1) {
    failures.push(`${viewport.name}: board is not square (${metrics.boardWidth}x${metrics.boardHeight})`);
  }
  if (metrics.pieceCount <= 0 || metrics.pieceCount >= 32) {
    failures.push(`${viewport.name}: expected partial Fog piece render, found ${metrics.pieceCount}`);
  }
  if (metrics.fogHiddenCount <= 0) {
    failures.push(`${viewport.name}: expected hidden fog squares`);
  }
  if (metrics.horizontalOverflow > 1) {
    failures.push(`${viewport.name}: horizontal overflow is ${metrics.horizontalOverflow}px`);
  }
  if (!metrics.mobilePanelBelowBoard) {
    failures.push(`${viewport.name}: side panel is not stacked below the board`);
  }
  if (metrics.roomLinks.length !== 1) {
    failures.push(`${viewport.name}: expected 1 create-room link, found ${metrics.roomLinks.length}`);
  }
  if (metrics.roomLinks.some((link) => link.label === 'Draft960' || link.href.includes('variant=draft960'))) {
    failures.push(`${viewport.name}: Draft960 should be hidden from primary create-room links`);
  }
  if (!metrics.roomLinks.some((link) => link.label === 'Fog of War' && link.href.includes('variant=fog-of-war'))) {
    failures.push(`${viewport.name}: missing Fog of War create-room link`);
  }
  if (metrics.roomLinks.some((link) => link.href.includes('dev=engine'))) {
    failures.push(`${viewport.name}: random-engine debug link should not be in the normal room picker`);
  }
  if (metrics.roomLinks.some((link) => link.label === 'Bid For White' || link.href.includes('variant=bid-for-white'))) {
    failures.push(`${viewport.name}: Bid For White should not be in primary create-room links`);
  }

  const screenshotPath = `${outputDir}/${viewport.name}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`${viewport.name}: ${JSON.stringify(metrics)} screenshot=${screenshotPath}`);
  await page.close();

  const fogPage = await browser.newPage({ viewport });
  const fogRoom = `visual-fog-${viewport.name}-${Date.now()}`;
  await fogPage.goto(`${baseUrl}/?room=${fogRoom}&reset=1&variant=fog-of-war`, { waitUntil: 'networkidle' });
  await fogPage.waitForSelector('.board.cg-wrap');
  await fogPage.waitForSelector('square.fog-hidden');
  await fogPage.waitForSelector('piece');
  await fogPage.waitForTimeout(250);

  const fogMetrics = await fogPage.evaluate(() => {
    const board = document.querySelector('.board.cg-wrap');
    const panel = document.querySelector('.side-panel');
    if (!board || !panel) throw new Error('missing board or side panel');

    const boardRect = board.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    return {
      boardHeight: boardRect.height,
      boardWidth: boardRect.width,
      fogHiddenCount: document.querySelectorAll('square.fog-hidden').length,
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      mobilePanelBelowBoard: window.innerWidth > 780 ? true : panelRect.top >= boardRect.bottom - 1,
      pieceCount: document.querySelectorAll('piece:not(.fading)').length,
    };
  });

  if (Math.abs(fogMetrics.boardWidth - fogMetrics.boardHeight) > 1) {
    failures.push(`fog ${viewport.name}: board is not square (${fogMetrics.boardWidth}x${fogMetrics.boardHeight})`);
  }
  if (fogMetrics.pieceCount <= 0 || fogMetrics.pieceCount >= 32) {
    failures.push(`fog ${viewport.name}: expected partial piece render, found ${fogMetrics.pieceCount}`);
  }
  if (fogMetrics.fogHiddenCount <= 0) {
    failures.push(`fog ${viewport.name}: expected hidden fog squares`);
  }
  if (fogMetrics.horizontalOverflow > 1) {
    failures.push(`fog ${viewport.name}: horizontal overflow is ${fogMetrics.horizontalOverflow}px`);
  }
  if (!fogMetrics.mobilePanelBelowBoard) {
    failures.push(`fog ${viewport.name}: side panel is not stacked below the board`);
  }

  const fogScreenshotPath = `${outputDir}/fog-${viewport.name}.png`;
  await fogPage.screenshot({ path: fogScreenshotPath, fullPage: true });
  console.log(`fog ${viewport.name}: ${JSON.stringify(fogMetrics)} screenshot=${fogScreenshotPath}`);
  await fogPage.close();
}

const engineRoom = `visual-engine-${Date.now()}`;
const enginePage = await browser.newPage({ viewport: viewports[0] });
await enginePage.goto(`${baseUrl}/?room=${engineRoom}&reset=1&variant=fog-of-war&dev=engine`, { waitUntil: 'networkidle' });
await enginePage.waitForFunction(() => window.__BICHESS_DEBUG__?.().seat === 'white');
await enginePage.waitForSelector('[data-dev-views-section]:not([hidden])');
await enginePage.waitForSelector('.dev-board');
await movePiece(enginePage, 'e2', 'e4');
await enginePage.waitForFunction(() => {
  const debug = window.__BICHESS_DEBUG__?.();
  return debug?.currentView?.status.type === 'playing'
    && debug.currentView.status.turn === 'white'
    && debug.devViews?.truth.board.e4?.color === 'white';
});
await enginePage.waitForTimeout(250);

const engineMetrics = await enginePage.evaluate(() => {
  const debug = window.__BICHESS_DEBUG__?.();
  if (!debug?.devViews) throw new Error('missing engine dev views');
  return {
    devBoards: document.querySelectorAll('.dev-board').length,
    e4Truth: debug.devViews.truth.board.e4,
    hiddenMoveEvents: debug.events.filter((event) => event.type === 'move-played').length,
    opponent: debug.devViews.opponent,
    status: debug.currentView?.status,
    title: document.querySelector('h1')?.textContent,
    trueHiddenSquares: document.querySelectorAll('.dev-board[aria-label="True view"] .dev-square.hidden').length,
  };
});
if (engineMetrics.devBoards !== 3) {
  failures.push(`engine harness: expected 3 dev boards, found ${engineMetrics.devBoards}`);
}
if (engineMetrics.opponent !== 'black') {
  failures.push(`engine harness: expected black random opponent, found ${engineMetrics.opponent}`);
}
if (engineMetrics.e4Truth?.color !== 'white' || engineMetrics.e4Truth?.role !== 'pawn') {
  failures.push(`engine harness: expected white pawn on e4 in true view, found ${JSON.stringify(engineMetrics.e4Truth)}`);
}
if (engineMetrics.hiddenMoveEvents !== 0) {
  failures.push(`engine harness: expected live Fog move events hidden, found ${engineMetrics.hiddenMoveEvents}`);
}
if (engineMetrics.title !== 'Fog Debug') {
  failures.push(`engine harness: expected Fog Debug page title, found ${engineMetrics.title}`);
}
if (engineMetrics.trueHiddenSquares !== 0) {
  failures.push(`engine harness: expected true view to be fully clear, found ${engineMetrics.trueHiddenSquares} hidden squares`);
}

const enginePath = `${outputDir}/engine-harness.png`;
await enginePage.screenshot({ path: enginePath, fullPage: true });
console.log(`engine harness: ${JSON.stringify(engineMetrics)} screenshot=${enginePath}`);
await enginePage.close();

const fogVisionRoom = `visual-fog-vision-${Date.now()}`;
const whiteVisionPage = await browser.newPage({ viewport: viewports[0] });
const blackVisionPage = await browser.newPage({ viewport: viewports[0] });
await whiteVisionPage.goto(`${baseUrl}/?room=${fogVisionRoom}&reset=1&variant=fog-of-war`, { waitUntil: 'networkidle' });
await blackVisionPage.goto(`${baseUrl}/?room=${fogVisionRoom}&variant=fog-of-war`, { waitUntil: 'networkidle' });
await whiteVisionPage.waitForFunction(() => window.__BICHESS_DEBUG__?.().seat === 'white');
await blackVisionPage.waitForFunction(() => window.__BICHESS_DEBUG__?.().seat === 'black');
await whiteVisionPage.waitForSelector('.board.cg-wrap');
await blackVisionPage.waitForSelector('.board.cg-wrap');

await movePiece(whiteVisionPage, 'e2', 'e4');
await whiteVisionPage.waitForFunction(() => window.__BICHESS_DEBUG__?.().currentView?.status.type === 'playing'
  && window.__BICHESS_DEBUG__?.().currentView?.status.turn === 'black');
await movePiece(blackVisionPage, 'a7', 'a6');
await blackVisionPage.waitForFunction(() => window.__BICHESS_DEBUG__?.().currentView?.status.type === 'playing'
  && window.__BICHESS_DEBUG__?.().currentView?.status.turn === 'white');
await movePiece(whiteVisionPage, 'e4', 'e5');
await whiteVisionPage.waitForFunction(() => window.__BICHESS_DEBUG__?.().currentView?.status.type === 'playing'
  && window.__BICHESS_DEBUG__?.().currentView?.status.turn === 'black');
await movePiece(blackVisionPage, 'd7', 'd5');
await whiteVisionPage.waitForFunction(() => {
  const view = window.__BICHESS_DEBUG__?.().currentView;
  return view?.status.type === 'playing' && view.status.turn === 'white' && view.board.d5?.role === 'pawn';
});

const fogVisionMetrics = await whiteVisionPage.evaluate(() => {
  const view = window.__BICHESS_DEBUG__?.().currentView;
  if (!view) throw new Error('missing Fog vision view');
  return {
    d5Piece: view.board.d5,
    d5Visible: view.visibleSquares.includes('d5'),
    d6Visible: view.visibleSquares.includes('d6'),
    fogHiddenCount: document.querySelectorAll('square.fog-hidden').length,
    liveMoveEvents: window.__BICHESS_DEBUG__?.().events.filter((event) => event.type === 'move-played').length ?? 0,
    pieceCount: document.querySelectorAll('piece:not(.fading)').length,
  };
});
if (fogVisionMetrics.d5Piece?.color !== 'black' || fogVisionMetrics.d5Piece?.role !== 'pawn') {
  failures.push(`fog vision: expected black pawn visible on d5, found ${JSON.stringify(fogVisionMetrics.d5Piece)}`);
}
if (!fogVisionMetrics.d5Visible || !fogVisionMetrics.d6Visible) {
  failures.push(`fog vision: expected d5 and d6 visible, found d5=${fogVisionMetrics.d5Visible} d6=${fogVisionMetrics.d6Visible}`);
}
if (fogVisionMetrics.liveMoveEvents !== 0) {
  failures.push(`fog vision: expected live move events hidden, found ${fogVisionMetrics.liveMoveEvents}`);
}

const fogVisionWhitePath = `${outputDir}/fog-vision-white.png`;
const fogVisionBlackPath = `${outputDir}/fog-vision-black.png`;
await whiteVisionPage.screenshot({ path: fogVisionWhitePath, fullPage: true });
await blackVisionPage.screenshot({ path: fogVisionBlackPath, fullPage: true });
console.log(`fog vision: ${JSON.stringify(fogVisionMetrics)} screenshots=${fogVisionWhitePath},${fogVisionBlackPath}`);
await whiteVisionPage.close();
await blackVisionPage.close();

const fogFlowRoom = `visual-fog-flow-${Date.now()}`;
const whitePage = await browser.newPage({ viewport: viewports[0] });
const blackPage = await browser.newPage({ viewport: viewports[0] });
await whitePage.goto(`${baseUrl}/?room=${fogFlowRoom}&reset=1&variant=fog-of-war`, { waitUntil: 'networkidle' });
await blackPage.goto(`${baseUrl}/?room=${fogFlowRoom}&variant=fog-of-war`, { waitUntil: 'networkidle' });
await whitePage.waitForFunction(() => window.__BICHESS_DEBUG__?.().seat === 'white');
await blackPage.waitForFunction(() => window.__BICHESS_DEBUG__?.().seat === 'black');
await whitePage.waitForSelector('.board.cg-wrap');
await blackPage.waitForSelector('.board.cg-wrap');

await movePiece(whitePage, 'e2', 'e4');
await whitePage.waitForFunction(() => window.__BICHESS_DEBUG__?.().currentView?.status.type === 'playing'
  && window.__BICHESS_DEBUG__?.().currentView?.status.turn === 'black');
await movePiece(blackPage, 'f7', 'f6');
await blackPage.waitForFunction(() => window.__BICHESS_DEBUG__?.().currentView?.status.type === 'playing'
  && window.__BICHESS_DEBUG__?.().currentView?.status.turn === 'white');
await movePiece(whitePage, 'd1', 'h5');
await whitePage.waitForFunction(() => window.__BICHESS_DEBUG__?.().currentView?.status.type === 'playing'
  && window.__BICHESS_DEBUG__?.().currentView?.status.turn === 'black');
await movePiece(blackPage, 'e8', 'f7');
await blackPage.waitForFunction(() => window.__BICHESS_DEBUG__?.().currentView?.status.type === 'playing'
  && window.__BICHESS_DEBUG__?.().currentView?.status.turn === 'white');
await movePiece(whitePage, 'h5', 'f7');
await whitePage.waitForFunction(() => {
  const debug = window.__BICHESS_DEBUG__?.();
  return debug?.currentView?.status.type === 'finished'
    && debug.events.filter((event) => event.type === 'move-played').length === 5;
});

await whitePage.locator('[data-replay="first"]').click();
await whitePage.waitForFunction(() => {
  const view = window.__BICHESS_DEBUG__?.().currentView;
  return view?.status.type === 'playing'
    && view.board.e8?.color === 'black'
    && view.board.f7?.color === 'black'
    && view.board.e2?.color === 'white'
    && view.board.e4 === undefined
    && view.board.f6 === undefined
    && view.board.h5 === undefined
    && view.visibleSquares.length === 64;
});
await whitePage.waitForTimeout(250);

const fogFlowMetrics = await whitePage.evaluate(() => {
  const view = window.__BICHESS_DEBUG__?.().currentView;
  if (!view) throw new Error('missing Fog flow view');
  return {
    e8Piece: view.board.e8,
    e2Piece: view.board.e2,
    e4Piece: view.board.e4,
    f6Piece: view.board.f6,
    f7Piece: view.board.f7,
    fogHiddenCount: document.querySelectorAll('square.fog-hidden').length,
    moveEvents: window.__BICHESS_DEBUG__?.().events.filter((event) => event.type === 'move-played').length ?? 0,
    pieceCount: document.querySelectorAll('piece:not(.fading)').length,
    replayVisibleSquares: view.visibleSquares.length,
  };
});
if (fogFlowMetrics.e8Piece?.color !== 'black' || fogFlowMetrics.e8Piece?.role !== 'king') {
  failures.push(`fog flow replay: expected black king visible on e8, found ${JSON.stringify(fogFlowMetrics.e8Piece)}`);
}
if (fogFlowMetrics.f7Piece?.color !== 'black' || fogFlowMetrics.f7Piece?.role !== 'pawn' || fogFlowMetrics.e2Piece?.color !== 'white') {
  failures.push(`fog flow replay: expected first-position pawns on e2/f7, found e2=${JSON.stringify(fogFlowMetrics.e2Piece)} f7=${JSON.stringify(fogFlowMetrics.f7Piece)}`);
}
if (fogFlowMetrics.e4Piece !== undefined || fogFlowMetrics.f6Piece !== undefined) {
  failures.push(`fog flow replay: expected moved pawns absent from e4/f6 at first event, found e4=${JSON.stringify(fogFlowMetrics.e4Piece)} f6=${JSON.stringify(fogFlowMetrics.f6Piece)}`);
}
if (fogFlowMetrics.replayVisibleSquares !== 64 || fogFlowMetrics.fogHiddenCount !== 0) {
  failures.push(`fog flow replay: expected full-truth board, found visible=${fogFlowMetrics.replayVisibleSquares} hidden=${fogFlowMetrics.fogHiddenCount}`);
}
if (fogFlowMetrics.moveEvents !== 5) {
  failures.push(`fog flow: expected 5 released move events, found ${fogFlowMetrics.moveEvents}`);
}

const fogFlowWhitePath = `${outputDir}/fog-flow-white.png`;
const fogFlowBlackPath = `${outputDir}/fog-flow-black.png`;
await whitePage.screenshot({ path: fogFlowWhitePath, fullPage: true });
await blackPage.screenshot({ path: fogFlowBlackPath, fullPage: true });
console.log(`fog flow: ${JSON.stringify(fogFlowMetrics)} screenshots=${fogFlowWhitePath},${fogFlowBlackPath}`);
await whitePage.close();
await blackPage.close();

const bidRoom = `visual-bid-${Date.now()}`;
const firstBidPage = await browser.newPage({ viewport: viewports[0] });
const secondBidPage = await browser.newPage({ viewport: viewports[0] });
await firstBidPage.goto(`${baseUrl}/?room=${bidRoom}&reset=1&variant=bid-for-white`, { waitUntil: 'networkidle' });
await secondBidPage.goto(`${baseUrl}/?room=${bidRoom}&variant=bid-for-white`, { waitUntil: 'networkidle' });
await firstBidPage.waitForFunction(() => window.__BICHESS_DEBUG__?.().seat === 'white');
await secondBidPage.waitForFunction(() => window.__BICHESS_DEBUG__?.().seat === 'black');
await firstBidPage.waitForFunction(() => document.querySelector('[data-bid-section]')?.textContent?.includes('Enter seconds to give up'));
await submitBid(firstBidPage, 10);
await firstBidPage.waitForFunction(() => window.__BICHESS_DEBUG__?.().bids.white === 10000);
await firstBidPage.waitForFunction(() => document.querySelector('[data-bid-section]')?.textContent?.includes('Your bid is hidden')
  && document.querySelector('[data-bid-section]')?.textContent?.includes('4:50 as White'));
await secondBidPage.waitForFunction(() => document.querySelector('[data-bid-section]')?.textContent?.includes('White bid')
  && document.querySelector('[data-bid-section]')?.textContent?.includes('hidden') === false);
await submitBid(secondBidPage, 30);
await secondBidPage.waitForFunction(() => {
  const debug = window.__BICHESS_DEBUG__?.();
  return debug?.seat === 'white'
    && debug.currentView?.status.type === 'playing'
    && debug.currentView.clock?.remainingMs.white === 270000
    && debug.bidResolution?.winner === 'black';
});
await secondBidPage.waitForFunction(() => document.querySelector('[data-bid-section]')?.textContent?.includes('Bids revealed')
  && document.querySelector('[data-bid-section]')?.textContent?.includes('black bid 30s'));
await movePiece(secondBidPage, 'e2', 'e4');
await secondBidPage.waitForFunction(() => window.__BICHESS_DEBUG__?.().currentView?.status.type === 'playing'
  && window.__BICHESS_DEBUG__?.().currentView?.status.turn === 'black');
await firstBidPage.waitForFunction(() => window.__BICHESS_DEBUG__?.().currentView?.board.e4?.color === 'white');
await secondBidPage.waitForTimeout(250);

const bidMetrics = await secondBidPage.evaluate(() => {
  const debug = window.__BICHESS_DEBUG__?.();
  const view = debug?.currentView;
  if (!debug || !view) throw new Error('missing Bid For White debug view');
  return {
    bidResolution: debug.bidResolution,
    bids: debug.bids,
    e4Piece: view.board.e4,
    seat: debug.seat,
    status: view.status,
    whiteRemainingMs: view.clock?.remainingMs.white,
  };
});
if (bidMetrics.seat !== 'white') {
  failures.push(`bid flow: expected higher bidder to be white, found ${bidMetrics.seat}`);
}
if (bidMetrics.whiteRemainingMs > 270000 || bidMetrics.whiteRemainingMs < 269000) {
  failures.push(`bid flow: expected white clock near 270000ms, found ${bidMetrics.whiteRemainingMs}`);
}
if (bidMetrics.e4Piece?.color !== 'white' || bidMetrics.e4Piece?.role !== 'pawn') {
  failures.push(`bid flow: expected white pawn on e4 after first move, found ${JSON.stringify(bidMetrics.e4Piece)}`);
}

const bidWhitePath = `${outputDir}/bid-white.png`;
const bidBlackPath = `${outputDir}/bid-black.png`;
await secondBidPage.screenshot({ path: bidWhitePath, fullPage: true });
await firstBidPage.screenshot({ path: bidBlackPath, fullPage: true });
console.log(`bid flow: ${JSON.stringify(bidMetrics)} screenshots=${bidWhitePath},${bidBlackPath}`);
await firstBidPage.close();
await secondBidPage.close();

await browser.close();

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

async function movePiece(page, from, to) {
  try {
    await page.waitForFunction((square) => {
      const view = window.__BICHESS_DEBUG__?.().currentView;
      return view?.legalMoves.some((move) => move.from === square);
    }, from);
  } catch (error) {
    const debug = await page.evaluate(() => {
      const snapshot = window.__BICHESS_DEBUG__?.();
      return {
        seat: snapshot?.seat,
        status: snapshot?.currentView?.status,
        legalMoves: snapshot?.currentView?.legalMoves,
        visibleBoard: snapshot?.currentView?.board,
      };
    });
    console.error(`move ${from}-${to} unavailable: ${JSON.stringify(debug)}`);
    throw error;
  }
  await clickSquare(page, from);
  await clickSquare(page, to);
}

async function submitBid(page, seconds) {
  await page.waitForSelector('[data-bid-section] input');
  await page.locator('[data-bid-section] input').fill(String(seconds));
  await page.locator('[data-bid-section] button').click();
}

async function clickSquare(page, square) {
  const box = await page.locator('.board.cg-wrap').boundingBox();
  if (!box) throw new Error('missing board box');

  const orientation = await page.evaluate(() => window.__BICHESS_DEBUG__?.().currentView?.perspective ?? 'white');
  const fileIndex = files.indexOf(square[0]);
  const rank = Number(square[1]);
  const column = orientation === 'white' ? fileIndex : 7 - fileIndex;
  const row = orientation === 'white' ? 8 - rank : rank - 1;
  await page.mouse.click(
    box.x + ((column + 0.5) * box.width) / 8,
    box.y + ((row + 0.5) * box.height) / 8,
  );
}
