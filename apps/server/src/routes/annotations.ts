import { promises as fs } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname } from 'node:path';
import { type HttpApiContext, isHttpAdminAuthorized, readJsonBody, writeJson } from './lib.js';

export async function tryHandle(
  ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname !== '/api/annotations') return false;

  if (!isHttpAdminAuthorized(request)) {
    writeJson(response, 403, { error: 'forbidden' });
    return true;
  }

  const method = request.method ?? 'GET';
  if (method === 'GET') {
    const text = await fs.readFile(ctx.annotationsFile, 'utf-8').catch(() => '');
    const annotations = text
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    writeJson(response, 200, { annotations, file: ctx.annotationsFile });
    return true;
  }

  if (method === 'POST') {
    const body = await readJsonBody(request);
    await fs.mkdir(dirname(ctx.annotationsFile), { recursive: true });
    await fs.appendFile(ctx.annotationsFile, `${JSON.stringify(body)}\n`, 'utf-8');
    writeJson(response, 200, { ok: true });
    return true;
  }

  if (method === 'PUT') {
    const body = await readJsonBody(request);
    if (typeof body.id !== 'string' || body.id.length === 0) {
      writeJson(response, 400, { error: 'missing_id' });
      return true;
    }
    const existing = await fs.readFile(ctx.annotationsFile, 'utf-8').catch(() => '');
    const lines = existing.split('\n').filter((line) => line.trim().length > 0);
    let updated = false;
    const nextLines = lines.map((line) => {
      const row = JSON.parse(line) as Record<string, unknown>;
      if (row.id === body.id) {
        updated = true;
        return JSON.stringify(body);
      }
      return line;
    });
    if (!updated) nextLines.push(JSON.stringify(body));
    await fs.mkdir(dirname(ctx.annotationsFile), { recursive: true });
    await fs.writeFile(ctx.annotationsFile, `${nextLines.join('\n')}\n`, 'utf-8');
    writeJson(response, 200, { ok: true, updated, appended: !updated });
    return true;
  }

  writeJson(response, 405, { error: 'method_not_allowed' });
  return true;
}
