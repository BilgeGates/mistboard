// Dev-only entrypoint: run JUST the internal engine HTTP service locally, with
// no Postgres and no worker task loop. The real engine-worker (worker.ts) bundles
// a DB-backed bakeoff task loop, so it can't boot without a database; live PvE
// only needs the HTTP reservation + turn service, which has no DB dependency.
//
// Pair it with the web/server process by sharing two env vars:
//   web/server:  MISTBOARD_INTERNAL_ENGINE_URL=http://127.0.0.1:<port>
//   both:        MISTBOARD_INTERNAL_ENGINE_TOKEN=<same secret>
//
// The Python pool, engine repo (../mistboard-engine), venv python, and the
// Fairy-Stockfish leaf-eval binary are resolved lazily on the first engine turn.
//
// Run:  npx tsx apps/server/src/dev-engine-service.ts
import { startEngineHttpService } from './engine-service.js';
import { logger } from './obs.js';

const port = Number(process.env.MISTBOARD_ENGINE_SERVICE_PORT ?? 3010);
const host = process.env.MISTBOARD_ENGINE_SERVICE_HOST ?? '127.0.0.1';

const service = await startEngineHttpService({ host, port });
logger.info(
  { kind: 'dev_engine_service_ready', host, port: service.port },
  'dev engine service ready (live PvE only, no DB)',
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void service.close().then(() => process.exit(0));
  });
}
