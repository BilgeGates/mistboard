import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FEEDBACK_FILE = resolve(
  __dirname,
  '..',
  '..',
  'research',
  'python-fow-lab',
  'feedback',
  'annotations.jsonl',
);

function annotationsApiPlugin(): Plugin {
  return {
    name: 'mistboard-annotations-api',
    configureServer(server) {
      server.middlewares.use('/api/annotations', async (req, res) => {
        try {
          if (req.method === 'GET') {
            const text = await fs.readFile(FEEDBACK_FILE, 'utf-8').catch(() => '');
            const items = text
              .split('\n')
              .filter((line) => line.trim().length > 0)
              .map((line) => JSON.parse(line));
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ annotations: items, file: FEEDBACK_FILE }));
            return;
          }
          if (req.method === 'POST') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) chunks.push(chunk as Buffer);
            const body = Buffer.concat(chunks).toString('utf-8');
            const data = JSON.parse(body);
            await fs.mkdir(dirname(FEEDBACK_FILE), { recursive: true });
            await fs.appendFile(FEEDBACK_FILE, `${JSON.stringify(data)}\n`, 'utf-8');
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
            return;
          }
          if (req.method === 'PUT') {
            // Update an existing annotation by `id`. Re-write the file with
            // the matching row replaced; if no match, append.
            const chunks: Buffer[] = [];
            for await (const chunk of req) chunks.push(chunk as Buffer);
            const body = Buffer.concat(chunks).toString('utf-8');
            const updated = JSON.parse(body);
            if (typeof updated.id !== 'string') {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'missing_id' }));
              return;
            }
            const existing = await fs.readFile(FEEDBACK_FILE, 'utf-8').catch(() => '');
            const lines = existing.split('\n').filter((l) => l.trim().length > 0);
            let replaced = false;
            const nextLines = lines.map((line) => {
              const row = JSON.parse(line);
              if (row.id === updated.id) {
                replaced = true;
                return JSON.stringify(updated);
              }
              return line;
            });
            if (!replaced) nextLines.push(JSON.stringify(updated));
            await fs.mkdir(dirname(FEEDBACK_FILE), { recursive: true });
            await fs.writeFile(FEEDBACK_FILE, `${nextLines.join('\n')}\n`, 'utf-8');
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, updated: replaced, appended: !replaced }));
            return;
          }
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'method_not_allowed' }));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [annotationsApiPlugin()],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
});
