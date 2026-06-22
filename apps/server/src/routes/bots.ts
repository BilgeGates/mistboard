import type { IncomingMessage, ServerResponse } from 'node:http';
import * as persistence from '../persistence.js';
import { variantTenantForSpecId } from '../variant-tenant/registry.js';
import { requireMethod, requirePersistence, writeJson } from './lib.js';

const BOT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;

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
    const botId = decodeURIComponent(profileMatch[1] ?? '').trim();
    if (!BOT_ID_PATTERN.test(botId)) {
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

function isBotPlayable(bot: Pick<persistence.BotProfile, 'defaultGameSpecId'>): boolean {
  if (bot.defaultGameSpecId === 'dark-chess' || bot.defaultGameSpecId === 'dark-draft960') {
    return true;
  }
  return variantTenantForSpecId(bot.defaultGameSpecId)?.enabled() === true;
}
