import { randomInt } from 'node:crypto';

const maxEmailLength = 254;
const fallbackHandlePrefix = 'player';
const reservedHandles = new Set([
  'about',
  'account',
  'admin',
  'api',
  'arena',
  'auth',
  'engine',
  'engines',
  'game',
  'games',
  'learn',
  'login',
  'logout',
  'profile',
  'room',
  'settings',
  'watch',
]);

export function normalizeEmail(value: string | null): string | null {
  if (!value) return null;
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > maxEmailLength) return null;
  if (!/^[\x00-\x7F]+$/.test(email)) return null;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(email)) return null;
  const [, domain = ''] = email.split('@');
  if (
    domain
      .split('.')
      .some((label) => label.length === 0 || label.startsWith('-') || label.endsWith('-'))
  ) {
    return null;
  }
  return email;
}

export function handleBaseForEmail(email: string): string {
  const local = email.split('@', 1)[0] ?? '';
  const publicStem = local.split('+', 1)[0] ?? '';
  const normalized = publicStem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/g, '');
  return normalized.length >= 3 ? normalized : `${fallbackHandlePrefix}-${randomHandleSuffix()}`;
}

export function displayNameForEmail(email: string): string {
  const local = email.split('@', 1)[0] ?? '';
  const publicStem = local.split('+', 1)[0] ?? '';
  const words = publicStem.replace(/[^a-zA-Z0-9]+/g, ' ').trim();
  return (words || 'Player').slice(0, 48);
}

export function normalizeProfileHandle(value: string | null): string | null {
  if (!value) return null;
  const handle = value.trim().toLowerCase();
  if (handle.length < 3 || handle.length > 24) return null;
  if (!/^[a-z0-9][a-z0-9_-]*[a-z0-9]$/.test(handle)) return null;
  if (reservedHandles.has(handle)) return null;
  return handle;
}

export function normalizeDisplayName(value: string | null): string | null {
  if (!value) return null;
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length < 1 || name.length > 40) return null;
  if (/[\u0000-\u001F\u007F]/.test(name)) return null;
  return name;
}

function randomHandleSuffix(): string {
  return randomInt(0, 36 ** 5)
    .toString(36)
    .padStart(5, '0');
}
