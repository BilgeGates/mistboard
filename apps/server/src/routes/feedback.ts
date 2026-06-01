import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { normalizeEmail } from './../account-identity.js';
import { currentAccountUser } from './../account-session.js';
import { sendFeedbackNotification } from './../feedback-notify.js';
import * as persistence from './../persistence.js';
import { clientIpForRateLimit } from './../server-policy.js';
import { hashIp, readJsonBody, requireMethod, writeJson } from './lib.js';

const feedbackMaxMessageLength = 5000;
const feedbackMaxPathLength = 256;
const feedbackMaxUserAgentLength = 512;
const feedbackAnonWindowMs = 24 * 60 * 60 * 1000;
const feedbackAnonPerWindow = 1;

export async function tryHandle(
  _ctx: unknown,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname !== '/api/feedback') return false;
  if (!requireMethod(request, response, 'POST')) return true;

  const user = await currentAccountUser(request);
  // Spam throttle keys on the proxy-appended client IP, not the spoofable
  // leftmost X-Forwarded-For hop. See clientIpForRateLimit.
  const ip = clientIpForRateLimit(request);
  const ipHash = user ? null : hashIp(ip);

  if (!user && persistence.isInitialized() && ipHash) {
    const since = new Date(Date.now() - feedbackAnonWindowMs);
    try {
      const recent = await persistence.countAnonFeedbackSubmissionsSince(ipHash, since);
      if (recent >= feedbackAnonPerWindow) {
        writeJson(response, 429, { error: 'rate_limited' });
        return true;
      }
    } catch (err) {
      console.error(
        JSON.stringify({
          level: 'error',
          kind: 'feedback_throttle_lookup_failure',
          error: (err as Error).message,
          at: Date.now(),
        }),
      );
    }
  }

  const body = await readJsonBody(request);

  // Honeypot: bots often fill every text field. Real form leaves this blank.
  const honeypot = typeof body.website === 'string' ? body.website.trim() : '';
  if (honeypot.length > 0) {
    writeJson(response, 202, { ok: true });
    return true;
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (message.length === 0 || message.length > feedbackMaxMessageLength) {
    writeJson(response, 400, { error: 'invalid_message' });
    return true;
  }
  // Anonymous lane: optional user-supplied reply email. Logged-in lane:
  // reply_to is the verified account email (set in feedback-notify), so
  // ignore any client-supplied email to avoid spoofing the audit trail.
  const email = user ? null : normalizeEmail(typeof body.email === 'string' ? body.email : null);
  const rawPath = typeof body.path === 'string' ? body.path.trim() : '';
  const path = rawPath.length > 0 ? rawPath.slice(0, feedbackMaxPathLength) : null;
  const rawUa = request.headers['user-agent'];
  const userAgent =
    typeof rawUa === 'string' && rawUa.length > 0
      ? rawUa.slice(0, feedbackMaxUserAgentLength)
      : null;
  const userId = user?.id ?? null;
  const id = randomUUID();

  if (persistence.isInitialized()) {
    try {
      await persistence.insertFeedbackSubmission({
        id,
        message,
        email,
        path,
        userId,
        userAgent,
        ipHash,
      });
    } catch (err) {
      console.error(
        JSON.stringify({
          level: 'error',
          kind: 'feedback_persist_failure',
          error: (err as Error).message,
          at: Date.now(),
        }),
      );
    }
  }

  void sendFeedbackNotification({
    id,
    message,
    email,
    path,
    userId,
    userAgent,
    accountHandle: user?.handle ?? null,
    accountEmail: user?.email ?? null,
  });

  writeJson(response, 202, { ok: true });
  return true;
}
