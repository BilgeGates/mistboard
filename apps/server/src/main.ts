// Production entry point. Imports index.ts (which is now side-effect-free)
// and calls startServer(). The split is so the integration test harness can
// import internals without booting a listener.

import { installShutdownHandlers, startServer } from './index.js';

const port = Number(process.env.PORT ?? 3001);

installShutdownHandlers();
await startServer({ port });
