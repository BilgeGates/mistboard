import { spawnSync } from 'node:child_process';

const serviceName = process.env.RAILWAY_SERVICE_NAME ?? '';
const processKind = process.env.BICHESS_PROCESS ?? '';
const workerOnly = serviceName === 'engine-worker' || processKind === 'worker';

const workspaces = workerOnly
  ? ['@bichess/game', '@bichess/server']
  : ['@bichess/game', '@bichess/server', '@bichess/web'];

for (const workspace of workspaces) {
  const result = spawnSync('npm', ['run', 'build', `--workspace=${workspace}`], {
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`failed to run build for ${workspace}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.signal) {
    console.error(`build for ${workspace} exited with signal ${result.signal}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
