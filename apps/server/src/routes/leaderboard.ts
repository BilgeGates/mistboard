import type { IncomingMessage, ServerResponse } from 'node:http';
import * as persistence from './../persistence.js';
import {
  DEFAULT_RATING_BUCKET,
  parseRatingTimeClass,
  parseRatingVariant,
} from './../rating-buckets.js';
import { requireMethod, requirePersistence, writeJson } from './lib.js';

export async function tryHandle(
  _ctx: unknown,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  parsedUrl: URL,
): Promise<boolean> {
  if (pathname !== '/api/leaderboard') return false;
  if (!requireMethod(request, response, 'GET')) return true;
  if (!requirePersistence(response)) return true;
  const variant =
    parseRatingVariant(parsedUrl.searchParams.get('variant')) ?? DEFAULT_RATING_BUCKET.variant;
  const timeClass =
    parseRatingTimeClass(parsedUrl.searchParams.get('time')) ?? DEFAULT_RATING_BUCKET.timeClass;
  const limitParam = parseInt(parsedUrl.searchParams.get('limit') ?? '100', 10);
  const limit = Number.isNaN(limitParam) ? 100 : Math.max(1, Math.min(limitParam, 500));
  const entries = await persistence.getLeaderboard({ variant, timeClass, limit });
  writeJson(response, 200, { leaderboard: entries, bucket: { variant, timeClass } });
  return true;
}
