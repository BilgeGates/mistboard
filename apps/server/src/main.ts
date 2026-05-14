// Production entry point. Imports index.ts (which is now side-effect-free)
// and calls startServer(). The split is so the integration test harness can
// import internals without booting a listener.

// startServer() reads PORT from env itself; do not pass it explicitly, or the
// "listening" log is suppressed by the `!options.port` gate (which exists so
// the harness on port:0 stays quiet).

import { installShutdownHandlers, startServer } from './index.js';

installShutdownHandlers();
await startServer();
