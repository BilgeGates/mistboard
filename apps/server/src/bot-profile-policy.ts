import type { BotProfile } from './persistence-bots.js';
import { variantTenantForSpecId } from './variant-tenant/registry.js';

export const BOT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;

export function parsePublicBotId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const botId = value.trim();
  return BOT_ID_PATTERN.test(botId) ? botId : null;
}

export function isBotPlayable(bot: Pick<BotProfile, 'defaultGameSpecId'>): boolean {
  if (bot.defaultGameSpecId === 'dark-chess' || bot.defaultGameSpecId === 'dark-draft960') {
    return true;
  }
  return variantTenantForSpecId(bot.defaultGameSpecId)?.enabled() === true;
}
