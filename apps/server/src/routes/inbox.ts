// Direct-message routes (#88). All signed-in-only. Realtime is polling: the
// conversation view re-fetches while open and the nav bell polls
// /api/inbox/unread-count; there is no WebSocket surface here.
//
//   GET    /api/inbox                    inbox thread list (?before=<ms>)
//   GET    /api/inbox/unread-count      badge count
//   GET    /api/inbox/reports           admin: open DM reports
//   POST   /api/inbox/reports/:id       admin: resolve/dismiss a report
//   GET    /api/inbox/threads/:threadId admin: read a reported thread
//   GET    /api/inbox/:handle           conversation (marks read; ?before=<ms>)
//   POST   /api/inbox/:handle           send { text }
//   DELETE /api/inbox/:handle           hide the thread for me
//   POST   /api/inbox/:handle/report    report the conversation { reason }
//
// Literal segments (unread-count, reports, threads) are matched BEFORE the
// :handle pattern, so accounts whose handle collides with those words cannot
// reach their conversation URL — the same reserved-word tradeoff lichess makes.
//
// Send guards, in order: signed in → valid handle → not blocked by the target
// (rejected with the generic message_not_allowed, which does not name the
// block) → DB-counted rate limits (new threads/day by account age, replies/min)
// → link denial for young accounts → length. Replies to an existing thread
// skip the new-thread budget but still pay the per-minute one.

import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { currentAccountUser } from './../account-session.js';
import * as persistence from './../persistence.js';
import {
  readJsonBody,
  requireAdminSession,
  requireMethod,
  requirePersistence,
  writeJson,
} from './lib.js';

const HANDLE_PATTERN = /^[a-zA-Z0-9_-]{1,40}$/;
const THREAD_PAGE = 50;
const MESSAGE_PAGE = 100;
const REPORT_REASON_MAX = 240;

const dayMs = 24 * 60 * 60 * 1000;
const minuteMs = 60 * 1000;
const youngAccountMs = 7 * dayMs;
const newThreadsPerDay = 20;
const newThreadsPerDayYoung = 5;
const messagesPerMinute = 20;
// Cheap spam heuristic: young accounts cannot send links at all. Established
// accounts are unrestricted (plaintext rendering keeps links non-clickable).
const LINK_PATTERN = /https?:\/\/|www\./i;

export async function tryHandle(
  _ctx: unknown,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  parsedUrl: URL,
): Promise<boolean> {
  if (!pathname.startsWith('/api/inbox')) return false;

  if (pathname === '/api/inbox') {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!requirePersistence(response)) return true;
    const user = await currentAccountUser(request);
    if (!user) {
      writeJson(response, 401, { error: 'not_signed_in' });
      return true;
    }
    const before = parseBeforeMs(parsedUrl.searchParams.get('before'));
    const threads = await persistence.listDmThreads(user.id, {
      before: before ?? undefined,
      limit: THREAD_PAGE,
    });
    writeJson(response, 200, {
      threads: threads.map((thread) => ({
        other: thread.other,
        lastText: thread.lastText,
        lastFromMe: thread.lastFromMe,
        lastAt: thread.lastAt.toISOString(),
        unread: thread.unread,
      })),
    });
    return true;
  }

  if (pathname === '/api/inbox/unread-count') {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!requirePersistence(response)) return true;
    const user = await currentAccountUser(request);
    if (!user) {
      writeJson(response, 401, { error: 'not_signed_in' });
      return true;
    }
    writeJson(response, 200, { count: await persistence.countUnreadDmThreads(user.id) });
    return true;
  }

  if (pathname === '/api/inbox/reports') {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!requirePersistence(response)) return true;
    if (!(await requireAdminSession(request, response))) return true;
    const statusParam = parsedUrl.searchParams.get('status');
    const status = statusParam === 'resolved' || statusParam === 'dismissed' ? statusParam : 'open';
    const reports = await persistence.listDmReports({ status, limit: 100 });
    writeJson(response, 200, {
      reports: reports.map((report) => ({
        id: report.id,
        threadId: report.threadId,
        reporterHandle: report.reporterHandle,
        reason: report.reason,
        status: report.status,
        createdAt: report.createdAt.toISOString(),
      })),
    });
    return true;
  }

  const reportResolveMatch = pathname.match(/^\/api\/inbox\/reports\/([^/]+)$/);
  if (reportResolveMatch) {
    if (!requireMethod(request, response, 'POST')) return true;
    if (!requirePersistence(response)) return true;
    if (!(await requireAdminSession(request, response))) return true;
    const admin = await currentAccountUser(request);
    if (!admin) {
      writeJson(response, 401, { error: 'not_signed_in' });
      return true;
    }
    const body = await readJsonBody(request);
    const status = body.status === 'dismissed' ? 'dismissed' : 'resolved';
    const note = typeof body.note === 'string' ? body.note.slice(0, REPORT_REASON_MAX) : undefined;
    const updated = await persistence.resolveDmReport({
      reportId: decodeURIComponent(reportResolveMatch[1] ?? ''),
      status,
      resolvedById: admin.id,
      note,
    });
    if (!updated) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    writeJson(response, 200, { ok: true });
    return true;
  }

  const adminThreadMatch = pathname.match(/^\/api\/inbox\/threads\/([^/]+)$/);
  if (adminThreadMatch) {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!requirePersistence(response)) return true;
    if (!(await requireAdminSession(request, response))) return true;
    const thread = await persistence.getDmThreadForAdmin(
      decodeURIComponent(adminThreadMatch[1] ?? ''),
    );
    if (!thread) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    writeJson(response, 200, {
      thread: {
        threadId: thread.threadId,
        participants: thread.participants,
        messages: thread.messages.map((message) => ({
          senderHandle: message.senderHandle,
          bodyText: message.bodyText,
          createdAt: message.createdAt.toISOString(),
        })),
      },
    });
    return true;
  }

  const reportMatch = pathname.match(/^\/api\/inbox\/([^/]+)\/report$/);
  if (reportMatch) {
    if (!requireMethod(request, response, 'POST')) return true;
    if (!requirePersistence(response)) return true;
    const user = await currentAccountUser(request);
    if (!user) {
      writeJson(response, 401, { error: 'not_signed_in' });
      return true;
    }
    const handle = decodeHandle(reportMatch[1]);
    if (!handle) {
      writeJson(response, 400, { error: 'invalid_handle' });
      return true;
    }
    const body = await readJsonBody(request);
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length === 0 || reason.length > REPORT_REASON_MAX) {
      writeJson(response, 400, { error: 'invalid_reason' });
      return true;
    }
    const result = await persistence.createDmReport({
      id: `dmrpt_${randomUUID()}`,
      reporterId: user.id,
      otherHandle: handle,
      reason,
    });
    if (!result.ok) {
      writeJson(response, result.error === 'unknown_thread' ? 404 : 409, { error: result.error });
      return true;
    }
    writeJson(response, 201, { ok: true });
    return true;
  }

  const convoMatch = pathname.match(/^\/api\/inbox\/([^/]+)$/);
  if (convoMatch) {
    if (!requirePersistence(response)) return true;
    const handle = decodeHandle(convoMatch[1]);
    if (!handle) {
      writeJson(response, 400, { error: 'invalid_handle' });
      return true;
    }
    const user = await currentAccountUser(request);
    if (!user) {
      writeJson(response, 401, { error: 'not_signed_in' });
      return true;
    }
    const method = request.method ?? 'GET';

    if (method === 'GET') {
      const before = parseBeforeMs(parsedUrl.searchParams.get('before'));
      const conversation = await persistence.getDmConversation(user.id, handle, {
        before: before ?? undefined,
        limit: MESSAGE_PAGE,
      });
      if (!conversation) {
        writeJson(response, 404, { error: 'not_found' });
        return true;
      }
      writeJson(response, 200, serializeConversation(conversation));
      return true;
    }

    if (method === 'POST') return sendMessage(request, response, user, handle);

    if (method === 'DELETE') {
      const deleted = await persistence.deleteDmThreadForUser(user.id, handle);
      if (!deleted) {
        writeJson(response, 404, { error: 'not_found' });
        return true;
      }
      writeJson(response, 200, { ok: true });
      return true;
    }

    writeJson(response, 405, { error: 'method_not_allowed' });
    return true;
  }

  return false;
}

async function sendMessage(
  request: IncomingMessage,
  response: ServerResponse,
  user: { id: string; createdAt: Date },
  handle: string,
): Promise<boolean> {
  const body = await readJsonBody(request);
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (text.length === 0 || text.length > persistence.DM_BODY_MAX) {
    writeJson(response, 400, { error: 'invalid_message' });
    return true;
  }

  const now = new Date();
  const isYoungAccount = now.getTime() - user.createdAt.getTime() < youngAccountMs;

  if (isYoungAccount && LINK_PATTERN.test(text)) {
    writeJson(response, 403, { error: 'links_not_allowed' });
    return true;
  }

  // Per-minute budget applies to every send; the per-day budget only to
  // thread-starting sends. Order matters: the cheap existence check decides
  // which budget to consult before any insert happens.
  if (
    (await persistence.countRecentDmMessagesByUser(user.id, new Date(now.getTime() - minuteMs))) >=
    messagesPerMinute
  ) {
    writeJson(response, 429, { error: 'rate_limited' });
    return true;
  }

  const target = await persistence.findUserIdByHandle(handle);
  if (!target) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  if (target === user.id) {
    writeJson(response, 400, { error: 'self_message' });
    return true;
  }
  // The block gate: a message to someone who blocked you is rejected with a
  // generic error that does not name the block (matching lichess, where block
  // bounces the send while only mute shadow-delivers).
  if (await persistence.hasBlock(target, user.id)) {
    writeJson(response, 403, { error: 'message_not_allowed' });
    return true;
  }

  if (!(await persistence.dmThreadExists(user.id, target))) {
    // DM policy gates thread-CREATING sends only (#93): replies to an existing
    // thread always deliver, lichess-style. 'friends' = the target follows the
    // sender. The rejection reuses the same generic error as the block gate so
    // a bounced send never reveals which rule fired.
    const policy = await persistence.getUserDmPolicy(target);
    const friendsAllowed = policy === 'friends' && (await persistence.hasFollow(target, user.id));
    if (policy === 'never' || (policy === 'friends' && !friendsAllowed)) {
      writeJson(response, 403, { error: 'message_not_allowed' });
      return true;
    }

    const budget = isYoungAccount ? newThreadsPerDayYoung : newThreadsPerDay;
    const started = await persistence.countRecentDmThreadsStartedByUser(
      user.id,
      new Date(now.getTime() - dayMs),
    );
    if (started >= budget) {
      writeJson(response, 429, { error: 'rate_limited' });
      return true;
    }
  }

  const result = await persistence.sendDmMessage({
    messageId: `dmsg_${randomUUID()}`,
    senderId: user.id,
    targetHandle: handle,
    bodyText: text,
    now,
  });
  if (!result.ok) {
    writeJson(response, result.error === 'unknown_user' ? 404 : 400, { error: result.error });
    return true;
  }
  writeJson(response, 201, {
    message: {
      id: result.message.id,
      fromMe: true,
      bodyText: result.message.bodyText,
      createdAt: result.message.createdAt.toISOString(),
    },
  });
  return true;
}

function serializeConversation(conversation: persistence.DmConversation): object {
  return {
    other: conversation.other,
    messages: conversation.messages.map((message) => ({
      id: message.id,
      fromMe: message.fromMe,
      bodyText: message.bodyText,
      createdAt: message.createdAt.toISOString(),
    })),
  };
}

function decodeHandle(raw: string | undefined): string | null {
  const handle = decodeURIComponent(raw ?? '').trim();
  return HANDLE_PATTERN.test(handle) ? handle : null;
}

function parseBeforeMs(raw: string | null): Date | null {
  if (!raw) return null;
  const ms = Number.parseInt(raw, 10);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms);
}
