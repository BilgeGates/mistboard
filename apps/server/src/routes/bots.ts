import type { IncomingMessage, ServerResponse } from 'node:http';
import { isBotPlayable, parsePublicBotId } from '../bot-profile-policy.js';
import * as persistence from '../persistence.js';
import { requireMethod, requirePersistence, writeJson } from './lib.js';

export async function tryHandle(
  _ctx: unknown,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname === '/api/bots') {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!requirePersistence(response)) return true;
    const bots = (await persistence.listPublicBots()).filter(isBotPlayable);
    writeJson(response, 200, { bots });
    return true;
  }

  const profileMatch = pathname.match(/^\/api\/bots\/([^/]+)$/);
  if (profileMatch) {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!requirePersistence(response)) return true;
    const botId = parsePublicBotId(decodeURIComponent(profileMatch[1] ?? ''));
    if (!botId) {
      writeJson(response, 400, { error: 'invalid_bot_id' });
      return true;
    }
    const bot = await persistence.getPublicBotProfile(botId);
    if (!bot || !isBotPlayable(bot)) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    writeJson(response, 200, { bot });
    return true;
  }

  return false;
}
