import type { IncomingMessage, ServerResponse } from 'node:http';
import { playableLiveEngines } from './../engine-registry.js';
import { requireMethod, writeJson } from './lib.js';

export async function tryHandle(
  _ctx: unknown,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname !== '/api/engines/playable') return false;
  if (!requireMethod(request, response, 'GET')) return true;
  writeJson(response, 200, {
    engines: playableLiveEngines().map((engine) => ({
      id: engine.id,
      name: engine.name,
      familyName: engine.engineName,
      kind: engine.kind,
    })),
  });
  return true;
}
