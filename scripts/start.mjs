import { spawn } from 'node:child_process';

const serviceName = process.env.RAILWAY_SERVICE_NAME ?? '';
const processKind = process.env.MISTBOARD_PROCESS ?? 'web';
const workerProcess = serviceName === 'engine-worker' || processKind === 'worker';
const args = workerProcess
  ? ['apps/server/dist/worker.js', '--execute', '--loop']
  : ['apps/server/dist/index.js'];

const child = spawn(process.execPath, args, { stdio: 'inherit' });

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
