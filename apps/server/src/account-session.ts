import { createHash, randomInt, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import * as persistence from './persistence.js';
import { displayNameForEmail, handleBaseForEmail } from './account-identity.js';
import { isProductionLikeRuntime } from './server-policy.js';

const accountSessionCookieName = 'mistboard_session';
export const accountSessionTtlMs = 30 * 24 * 60 * 60 * 1000;
export const emailLoginCodeTtlMs = 10 * 60 * 1000;
export const devAuthCodesEnabled = !isProductionLikeRuntime() || process.env.MISTBOARD_DEV_AUTH_CODES === 'true';
const resendApiKey = process.env.RESEND_API_KEY;
const authEmailFrom = process.env.MISTBOARD_AUTH_EMAIL_FROM ?? process.env.RESEND_FROM_EMAIL;
export const authEmailDeliveryEnabled = !!resendApiKey && !!authEmailFrom;

export async function currentAccountUser(request: IncomingMessage): Promise<persistence.UserAccount | null> {
  if (!persistence.isInitialized()) return null;
  const session = accountSessionFromRequest(request);
  if (!session) return null;
  return persistence.getUserByAccountSession(session.sessionId, hashSecret(session.token), new Date());
}

export async function ensureUserForEmail(email: string, now: Date): Promise<{ user: persistence.UserAccount; isNew: boolean }> {
  const existing = await persistence.findUserByEmail(email);
  if (existing) return { user: await persistence.markUserEmailVerified(existing.id, now), isNew: false };

  const baseHandle = handleBaseForEmail(email);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const handle = attempt === 0 ? baseHandle : `${baseHandle}${randomInt(10_000, 99_999)}`;
    try {
      const user = await persistence.createUser({
        id: `user_${randomUUID()}`,
        email,
        emailVerifiedAt: now,
        handle,
        displayName: displayNameForEmail(email),
        now,
      });
      return { user, isNew: true };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const raced = await persistence.findUserByEmail(email);
      if (raced) return { user: await persistence.markUserEmailVerified(raced.id, now), isNew: false };
    }
  }
  throw new Error('failed to allocate user handle');
}

export function publicUser(user: persistence.UserAccount): Record<string, unknown> {
  return {
    id: user.id,
    email: user.email,
    emailVerified: !!user.emailVerifiedAt,
    handle: user.handle,
    handleChangedAt: user.handleChangedAt?.toISOString() ?? null,
    displayName: user.displayName,
    displayNameChangedAt: user.displayNameChangedAt?.toISOString() ?? null,
    profileVisibility: user.profileVisibility,
    accountRole: user.accountRole,
  };
}

export function randomEmailLoginCode(): string {
  return String(randomInt(0, 100_000_000)).padStart(8, '0');
}

export async function sendEmailLoginCode(email: string, code: string): Promise<{ ok: true } | { ok: false }> {
  if (!resendApiKey || !authEmailFrom) return { ok: false };
  const subject = 'Your Mistboard login code';
  const text = [
    `Your Mistboard login code is ${code}.`,
    '',
    'This code expires in 10 minutes.',
    'If you did not request this code, you can ignore this email.',
  ].join('\n');
  const html = [
    '<p>Your Mistboard login code is:</p>',
    `<p style="font-size:24px;font-weight:700;letter-spacing:0.12em">${escapeHtml(code)}</p>`,
    '<p>This code expires in 10 minutes.</p>',
    '<p>If you did not request this code, you can ignore this email.</p>',
  ].join('');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${resendApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: authEmailFrom,
        to: [email],
        subject,
        text,
        html,
      }),
    });
    if (response.ok) return { ok: true };
    console.error(JSON.stringify({
      level: 'error',
      kind: 'email_delivery_failure',
      provider: 'resend',
      status: response.status,
      at: Date.now(),
    }));
    return { ok: false };
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      kind: 'email_delivery_failure',
      provider: 'resend',
      error: (err as Error).message,
      at: Date.now(),
    }));
    return { ok: false };
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function accountSessionFromRequest(request: IncomingMessage): { sessionId: string; token: string } | null {
  const value = cookieValue(request, accountSessionCookieName);
  if (!value) return null;
  const [sessionId, token] = value.split('.', 2);
  if (!sessionId || !token) return null;
  return { sessionId, token };
}

function cookieValue(request: IncomingMessage, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (rawKey !== name) continue;
    try {
      return decodeURIComponent(rawValue.join('='));
    } catch {
      return null;
    }
  }
  return null;
}

export function accountSessionCookie(sessionId: string, token: string, expiresAt: Date): string {
  const maxAgeSeconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  const value = encodeURIComponent(`${sessionId}.${token}`);
  return cookieWithAttributes(`${accountSessionCookieName}=${value}`, [
    `Max-Age=${maxAgeSeconds}`,
    `Expires=${expiresAt.toUTCString()}`,
  ]);
}

export function expiredAccountSessionCookie(): string {
  return cookieWithAttributes(`${accountSessionCookieName}=`, [
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ]);
}

function cookieWithAttributes(prefix: string, extra: string[]): string {
  const attrs = [prefix, 'Path=/', 'HttpOnly', 'SameSite=Lax', ...extra];
  if (isProductionLikeRuntime()) attrs.push('Secure');
  return attrs.join('; ');
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === '23505';
}
