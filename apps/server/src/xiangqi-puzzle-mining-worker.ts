import {
  checkpointXiangqiPuzzleMiningShard,
  claimNextXiangqiPuzzleMiningShard,
  completeXiangqiPuzzleMiningShard,
  failXiangqiPuzzleMiningShard,
  heartbeatXiangqiPuzzleMiningShard,
  listClaimedXiangqiPuzzleMiningShardGames,
  type XiangqiPuzzleMiningShard,
  type XiangqiPuzzleMiningShardGame,
} from './persistence-xiangqi-puzzle-mining.js';

export type XiangqiPuzzleMiningShardWorkResult = {
  shard: XiangqiPuzzleMiningShard;
  processedGames: number;
};

export async function processNextXiangqiPuzzleMiningShard(input: {
  runId: string;
  workerId: string;
  leaseMs?: number;
  processGame: (game: XiangqiPuzzleMiningShardGame) => Promise<void>;
}): Promise<XiangqiPuzzleMiningShardWorkResult | null> {
  const leaseMs = input.leaseMs ?? 30 * 60_000;
  const claimed = await claimNextXiangqiPuzzleMiningShard({
    runId: input.runId,
    workerId: input.workerId,
    leaseMs,
  });
  if (!claimed?.claimToken) return null;
  const identity = {
    runId: claimed.runId,
    shardIndex: claimed.shardIndex,
    claimToken: claimed.claimToken,
  };
  let heartbeatFailure: Error | null = null;
  let heartbeatInFlight = false;
  const heartbeatEveryMs = Math.max(1_000, Math.floor(leaseMs / 3));
  const heartbeat = setInterval(() => {
    if (heartbeatInFlight || heartbeatFailure) return;
    heartbeatInFlight = true;
    heartbeatXiangqiPuzzleMiningShard({ ...identity, leaseMs })
      .catch((error: unknown) => {
        heartbeatFailure = error as Error;
      })
      .finally(() => {
        heartbeatInFlight = false;
      });
  }, heartbeatEveryMs);
  heartbeat.unref();

  let processedGames = 0;
  try {
    const games = await listClaimedXiangqiPuzzleMiningShardGames(identity);
    for (const game of games) {
      if (heartbeatFailure) throw heartbeatFailure;
      await input.processGame(game);
      if (heartbeatFailure) throw heartbeatFailure;
      await checkpointXiangqiPuzzleMiningShard({
        ...identity,
        nextSelectionIndex: game.selectionIndex + 1,
      });
      processedGames += 1;
    }
    const shard = await completeXiangqiPuzzleMiningShard(identity);
    return { shard, processedGames };
  } catch (error) {
    await failXiangqiPuzzleMiningShard({
      ...identity,
      failure: {
        code: 'game-processing-failed',
        message: error instanceof Error ? error.message : String(error),
        processedGames,
      },
    }).catch(() => undefined);
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}
