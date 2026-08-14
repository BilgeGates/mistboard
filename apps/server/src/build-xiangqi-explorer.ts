// Rebuild the standard-xiangqi opening explorer's derived statistics.
//
//   DATABASE_URL=... npm run build:xiangqi-explorer --workspace @mistboard/server
//   ... -- --max-ply 24 --dry-run
//
// Full rebuild every time: the corpus is small enough that incremental updates
// would cost more in correctness risk (double-counted games after a partial
// run) than they save in seconds. The swap is transactional, so the live
// explorer never reads a half-built table.
//
// The license gate lives in listAggregatableXiangqiGames, not here — see its
// contract before adding a source.

import { close as closePool, init as initPool } from './persistence-db.js';
import { listAggregatableXiangqiGames } from './persistence-historical-xiangqi.js';
import { listAggregatableXiangqiBroadcastGames } from './persistence-xiangqi-broadcasts.js';
import { replaceXiangqiOpeningMoves } from './persistence-xiangqi-explorer.js';
import {
  accumulateGame,
  createAccumulator,
  DEFAULT_AGGREGATE_OPTIONS,
} from './xiangqi-opening-aggregate.js';

const PAGE_SIZE = 500;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const maxPly = numberArg(args, '--max-ply') ?? DEFAULT_AGGREGATE_OPTIONS.maxPly;
  const options = { ...DEFAULT_AGGREGATE_OPTIONS, maxPly };

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  initPool(databaseUrl);

  const accumulator = createAccumulator();
  const sourceSlugs = new Set<string>();
  let afterId: string | null = null;
  let folded = 0;
  let rejected = 0;

  for (;;) {
    const page = await listAggregatableXiangqiGames({ limit: PAGE_SIZE, afterId });
    if (page.length === 0) break;
    for (const game of page) {
      sourceSlugs.add(game.sourceSlug);
      if (accumulateGame(accumulator, game, options)) folded += 1;
      else rejected += 1;
    }
    afterId = page[page.length - 1]?.id ?? null;
    process.stdout.write(`  folded ${folded} games (${rejected} rejected)\r`);
  }

  // Broadcast boards are the second source (#125). They join by calling the same
  // accumulator with their own move lists, which is the shape this module was
  // built for. They are counted and gated separately from the corpus: see
  // listAggregatableXiangqiBroadcastGames for why their admission is not the
  // license question the corpus gate answers.
  let broadcastAfterId: string | null = null;
  let broadcastFolded = 0;
  for (;;) {
    const page = await listAggregatableXiangqiBroadcastGames({
      limit: PAGE_SIZE,
      afterId: broadcastAfterId,
    });
    if (page.length === 0) break;
    for (const game of page) {
      const accepted = accumulateGame(
        accumulator,
        {
          id: game.id,
          kind: 'broadcast',
          result: game.result,
          moves: game.moves,
          redName: game.redName,
          blackName: game.blackName,
          event: game.event,
          playedOn: game.playedOn,
        },
        options,
      );
      if (accepted) {
        folded += 1;
        broadcastFolded += 1;
      } else rejected += 1;
    }
    if (broadcastFolded > 0) sourceSlugs.add('broadcast');
    broadcastAfterId = page[page.length - 1]?.id ?? null;
    process.stdout.write(`  folded ${folded} games (${rejected} rejected)\r`);
  }

  let rows = 0;
  for (const moves of accumulator.values()) rows += moves.size;
  const summary = {
    gamesFolded: folded,
    broadcastGamesFolded: broadcastFolded,
    gamesRejected: rejected,
    positions: accumulator.size,
    moveRows: rows,
    maxPly,
    sources: [...sourceSlugs].sort(),
  };

  if (dryRun) {
    console.log(`\n${JSON.stringify({ dryRun: true, ...summary }, null, 2)}`);
    await closePool();
    return;
  }

  if (folded === 0) {
    // A zero-game build would truncate a working explorer into an empty one,
    // which reads as "no games have ever played this" rather than as a failure.
    console.error('\nrefusing to publish an empty build: no games were folded');
    await closePool();
    process.exitCode = 1;
    return;
  }

  await replaceXiangqiOpeningMoves(accumulator, {
    gameCount: folded,
    positionCount: accumulator.size,
    maxPly,
    sourceSlugs: [...sourceSlugs].sort(),
  });
  console.log(`\n${JSON.stringify(summary, null, 2)}`);
  await closePool();
}

function numberArg(args: string[], flag: string): number | null {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  const value = Number(args[index + 1]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
