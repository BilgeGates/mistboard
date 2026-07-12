import { randomBytes, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { normalizeEmail } from './../account-identity.js';
import {
  accountSessionCookie,
  accountSessionsFromRequest,
  accountSessionTtlMs,
  authEmailDeliveryEnabled,
  currentAccountUser,
  devAuthCodesEnabled,
  emailLoginCodeTtlMs,
  ensureUserForEmail,
  expiredAccountSessionCookie,
  hashSecret,
  legacyHostOnlyAccountSessionEviction,
  publicUser,
  randomEmailLoginCode,
  sendEmailLoginCode,
} from './../account-session.js';
import { clientIpForRateLimit, createAuthRateLimiter } from './../auth-rate-limit.js';
import * as persistence from './../persistence.js';
import { readJsonBody, requireMethod, requirePersistence, writeJson } from './lib.js';

// Per-IP rate limits, defense-in-depth alongside the per-challenge attempt cap.
// confirm is the brute-force surface (code guessing); start mints challenges,
// so a tighter bound there blunts the mint-many-challenges amplification.
// Module-scoped so the windows persist across requests for the process.
const authConfirmRateWindowMs = 10 * 60 * 1000;
const authConfirmRatePerWindow = 10;
const authStartRateWindowMs = 10 * 60 * 1000;
const authStartRatePerWindow = 5;
const confirmRateLimiter = createAuthRateLimiter(authConfirmRatePerWindow, authConfirmRateWindowMs);
const startRateLimiter = createAuthRateLimiter(authStartRatePerWindow, authStartRateWindowMs);

export async function tryHandle(
  _ctx: unknown,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname === '/api/auth/me') {
    if (!requireMethod(request, response, 'GET')) return true;
    const user = await currentAccountUser(request);
    writeJson(response, 200, { user: user ? publicUser(user) : null });
    return true;
  }

  if (pathname === '/api/auth/email/start') {
    if (!requireMethod(request, response, 'POST')) return true;
    if (!requirePersistence(response)) return true;
    if (!startRateLimiter.check(clientIpForRateLimit(request))) {
      writeJson(response, 429, { error: 'rate_limited' });
      return true;
    }
    if (!authEmailDeliveryEnabled && !devAuthCodesEnabled) {
      writeJson(response, 503, { error: 'email_delivery_not_configured' });
      return true;
    }
    const body = await readJsonBody(request);
    const email = normalizeEmail(typeof body.email === 'string' ? body.email : null);
    if (!email) {
      writeJson(response, 400, { error: 'invalid_email' });
      return true;
    }
    const loginId = randomUUID();
    const code = randomEmailLoginCode();
    const expiresAt = new Date(Date.now() + emailLoginCodeTtlMs);
    await persistence.createEmailLoginChallenge({
      id: loginId,
      email,
      codeHash: hashSecret(code),
      expiresAt,
    });
    if (authEmailDeliveryEnabled) {
      const delivery = await sendEmailLoginCode(email, code);
      if (!delivery.ok) {
        await persistence.deleteEmailLoginChallenge(loginId);
        writeJson(response, 502, { error: 'email_delivery_failed' });
        return true;
      }
    }
    writeJson(response, 202, {
      loginId,
      email,
      expiresAt: expiresAt.toISOString(),
      delivery: authEmailDeliveryEnabled ? 'email' : 'dev-response',
      ...(devAuthCodesEnabled ? { devCode: code } : {}),
    });
    return true;
  }

  if (pathname === '/api/auth/email/confirm') {
    if (!requireMethod(request, response, 'POST')) return true;
    if (!requirePersistence(response)) return true;
    if (!confirmRateLimiter.check(clientIpForRateLimit(request))) {
      writeJson(response, 429, { error: 'rate_limited' });
      return true;
    }
    const body = await readJsonBody(request);
    const loginId = typeof body.loginId === 'string' ? body.loginId.trim() : '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!loginId || !code) {
      writeJson(response, 400, { error: 'invalid_login_code' });
      return true;
    }
    const now = new Date();
    const challenge = await persistence.consumeEmailLoginChallenge(loginId, hashSecret(code), now);
    if (!challenge) {
      writeJson(response, 400, { error: 'invalid_login_code' });
      return true;
    }

    const account = await ensureUserForEmail(challenge.email, now);
    if ('closed' in account) {
      writeJson(response, 403, { error: 'account_closed' });
      return true;
    }
    const { user, isNew } = account;
    const sessionId = randomUUID();
    const sessionToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + accountSessionTtlMs);
    await persistence.createAccountSession({
      id: sessionId,
      userId: user.id,
      tokenHash: hashSecret(sessionToken),
      expiresAt,
      userAgent: sessionUserAgent(request),
    });
    writeJson(
      response,
      200,
      { user: publicUser(user), isNewUser: isNew },
      {
        // Issue the canonical cookie and, when a Domain is configured, evict any
        // legacy host-only `mistboard_session` duplicate so the browser stops
        // sending two cookies of the same name (one of which would be stale).
        'set-cookie': withLegacyEviction(accountSessionCookie(sessionId, sessionToken, expiresAt)),
      },
    );
    return true;
  }

  if (pathname === '/api/auth/logout') {
    if (!requireMethod(request, response, 'POST')) return true;
    if (persistence.isInitialized()) {
      const now = new Date();
      // Revoke every candidate, not just the first cookie: a host-only and a
      // Domain-scoped `mistboard_session` can coexist, and leaving the live one
      // behind would keep the account signed in after an explicit logout.
      for (const session of accountSessionsFromRequest(request)) {
        await persistence.revokeAccountSession(session.sessionId, hashSecret(session.token), now);
      }
    }
    writeJson(
      response,
      200,
      { ok: true },
      {
        // Clear the canonical (Domain-scoped) cookie and any legacy host-only
        // duplicate so neither lingers in the browser after sign-out.
        'set-cookie': withLegacyEviction(expiredAccountSessionCookie()),
      },
    );
    return true;
  }

  return false;
}

function sessionUserAgent(request: IncomingMessage): string | null {
  const userAgent = request.headers['user-agent'];
  return typeof userAgent === 'string' ? userAgent.trim().slice(0, 500) || null : null;
}

// Pairs a canonical session cookie with the legacy host-only eviction when one
// applies, yielding a single string (no duplicate) or a two-element Set-Cookie
// array the HTTP layer emits as separate headers.
function withLegacyEviction(canonical: string): string | string[] {
  const eviction = legacyHostOnlyAccountSessionEviction();
  return eviction ? [canonical, eviction] : canonical;
}
