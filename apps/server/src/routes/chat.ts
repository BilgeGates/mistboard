// Lobby chat routes (gate-cleared 2026-07-02, behind MISTBOARD_LOBBY_CHAT_ENABLED).
//
//   GET  /api/chat/lobby          last lines + viewer posting state (anon read)
//   POST /api/chat/lobby          post a line { text } (signed-in)
//   GET  /api/chat/lobby/reports  admin: open chat report queue
//   POST /api/chat/lobby/reports/:id admin: resolve/dismiss a report
//   POST /api/chat/lobby/report   signed-in: report a line { lineId, reason? }
//   POST /api/chat/lobby/timeout  admin: { handle, reason? } 15-min timeout,
//                                 hides the user's visible lines
//   POST /api/chat/lobby/hide     admin: { lineId, reason? } hide one line
//
// When the flag is off every route answers 404 chat_disabled — the homepage
// widget treats that as "render nothing", which makes the env flag a kill
// switch that needs no client rebuild.
//
// Post guards, in order: flag → signed in → active timeout → flood budget
// (10 lines/min, DB-counted) → link denial for accounts under 7 days →
// length (≤140, trimmed). Plaintext rendering keeps links non-clickable for
// everyone; young accounts cannot post them at all.

import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { currentAccountUser } from './../account-session.js';
import { CHAT_POLICY, evaluateChatText } from './../chat-policy.js';
import { lobbyChatEnabled } from './../feature-flags.js';
import * as persistence from './../persistence.js';
import {
  readJsonBody,
  requireAdminSession,
  requireMethod,
  requirePersistence,
  writeJson,
} from './lib.js';

const LINK_PATTERN = /https?:\/\/|www\./i;

export async function tryHandle(
  _ctx: unknown,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  parsedUrl: URL,
): Promise<boolean> {
  if (!pathname.startsWith('/api/chat/lobby')) return false;
  if (!lobbyChatEnabled()) {
    writeJson(response, 404, { error: 'chat_disabled' });
    return true;
  }
  if (!requirePersistence(response)) return true;

  if (pathname === '/api/chat/lobby/reports') {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!(await requireAdminSession(request, response))) return true;
    const statusParam = parsedUrl.searchParams.get('status');
    const status = statusParam === 'resolved' || statusParam === 'dismissed' ? statusParam : 'open';
    const reports = await persistence.listChatReports({ status, limit: 100 });
    writeJson(response, 200, { reports: reports.map(serializeChatReport) });
    return true;
  }

  const reportResolveMatch = pathname.match(/^\/api\/chat\/lobby\/reports\/([^/]+)$/);
  if (reportResolveMatch) {
    if (!requireMethod(request, response, 'POST')) return true;
    if (!(await requireAdminSession(request, response))) return true;
    const admin = await currentAccountUser(request);
    if (!admin) {
      writeJson(response, 401, { error: 'not_signed_in' });
      return true;
    }
    const body = await readJsonBody(request);
    const status = body.status === 'dismissed' ? 'dismissed' : 'resolved';
    const note =
      typeof body.note === 'string' ? body.note.slice(0, CHAT_POLICY.reportReasonMax) : undefined;
    const updated = await persistence.resolveChatReport({
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

  if (pathname === '/api/chat/lobby/report') {
    if (!requireMethod(request, response, 'POST')) return true;
    const user = await currentAccountUser(request);
    if (!user) {
      writeJson(response, 401, { error: 'not_signed_in' });
      return true;
    }
    const body = await readJsonBody(request);
    const lineId = typeof body.lineId === 'string' ? body.lineId.trim() : '';
    const reason =
      typeof body.reason === 'string' && body.reason.trim()
        ? body.reason.trim().slice(0, CHAT_POLICY.reportReasonMax)
        : 'Chat message report';
    if (!lineId) {
      writeJson(response, 400, { error: 'invalid_line' });
      return true;
    }
    const result = await persistence.createChatReport({
      id: `chrpt_${randomUUID()}`,
      lineId,
      reporterId: user.id,
      reason,
    });
    if (!result.ok) {
      const status =
        result.error === 'line_not_found' ? 404 : result.error === 'already_reported' ? 409 : 403;
      writeJson(response, status, { error: result.error });
      return true;
    }
    writeJson(response, 201, {
      report: serializeChatReport(result.report),
      openReportsForLine: result.openReportsForLine,
    });
    return true;
  }

  if (pathname === '/api/chat/lobby/timeout') {
    if (!requireMethod(request, response, 'POST')) return true;
    if (!(await requireAdminSession(request, response))) return true;
    const admin = await currentAccountUser(request);
    if (!admin) {
      writeJson(response, 401, { error: 'not_signed_in' });
      return true;
    }
    const body = await readJsonBody(request);
    const handle = typeof body.handle === 'string' ? body.handle.trim() : '';
    if (!handle) {
      writeJson(response, 400, { error: 'invalid_handle' });
      return true;
    }
    const reason = typeof body.reason === 'string' ? body.reason.slice(0, 240) : undefined;
    const result = await persistence.createChatTimeout({
      id: `chto_${randomUUID()}`,
      room: persistence.CHAT_ROOM_LOBBY,
      targetHandle: handle,
      durationMs: CHAT_POLICY.timeoutMs,
      reason,
      createdById: admin.id,
    });
    if (!result.ok) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    writeJson(response, 200, { ok: true, until: result.until.toISOString() });
    return true;
  }

  if (pathname === '/api/chat/lobby/hide') {
    if (!requireMethod(request, response, 'POST')) return true;
    if (!(await requireAdminSession(request, response))) return true;
    const admin = await currentAccountUser(request);
    if (!admin) {
      writeJson(response, 401, { error: 'not_signed_in' });
      return true;
    }
    const body = await readJsonBody(request);
    const lineId = typeof body.lineId === 'string' ? body.lineId : '';
    if (!lineId) {
      writeJson(response, 400, { error: 'invalid_line' });
      return true;
    }
    const reason = typeof body.reason === 'string' ? body.reason.slice(0, 240) : undefined;
    const hidden = await persistence.hideChatLine({ lineId, hiddenById: admin.id, reason });
    if (!hidden) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    writeJson(response, 200, { ok: true });
    return true;
  }

  if (pathname !== '/api/chat/lobby') return false;

  if (request.method === 'GET') {
    const lines = await persistence.listChatLines(
      persistence.CHAT_ROOM_LOBBY,
      CHAT_POLICY.servedLines,
    );
    const viewer = await currentAccountUser(request);
    const timeoutUntil = viewer
      ? await persistence.activeChatTimeout(persistence.CHAT_ROOM_LOBBY, viewer.id)
      : null;
    writeJson(response, 200, {
      lines: lines.map((line) => ({
        id: line.id,
        handle: line.authorHandle,
        text: line.bodyText,
        createdAt: line.createdAt.toISOString(),
      })),
      canPost: !!viewer && !timeoutUntil,
      canReport: !!viewer,
      ...(timeoutUntil ? { timeoutUntil: timeoutUntil.toISOString() } : {}),
      isAdmin: viewer?.accountRole === 'admin',
    });
    return true;
  }

  if (request.method === 'POST') {
    const user = await currentAccountUser(request);
    if (!user) {
      writeJson(response, 401, { error: 'not_signed_in' });
      return true;
    }
    const now = new Date();
    const timeoutUntil = await persistence.activeChatTimeout(
      persistence.CHAT_ROOM_LOBBY,
      user.id,
      now,
    );
    if (timeoutUntil) {
      writeJson(response, 403, { error: 'timed_out', until: timeoutUntil.toISOString() });
      return true;
    }
    const body = await readJsonBody(request);
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (text.length === 0 || text.length > CHAT_POLICY.maxLineChars) {
      writeJson(response, 400, { error: 'invalid_message' });
      return true;
    }
    const policy = evaluateChatText(text);
    if (policy.action === 'reject') {
      writeJson(response, 403, { error: 'message_rejected', reason: policy.reason });
      return true;
    }
    if (
      now.getTime() - user.createdAt.getTime() < CHAT_POLICY.youngAccountMs &&
      LINK_PATTERN.test(text)
    ) {
      writeJson(response, 403, { error: 'links_not_allowed' });
      return true;
    }
    if (
      (await persistence.countRecentChatLinesByUser(
        user.id,
        new Date(now.getTime() - CHAT_POLICY.floodWindowMs),
      )) >= CHAT_POLICY.floodLimitPerWindow
    ) {
      writeJson(response, 429, { error: 'rate_limited' });
      return true;
    }
    if (
      (await persistence.countRecentMatchingChatLinesByUser({
        userId: user.id,
        bodyText: text,
        since: new Date(now.getTime() - CHAT_POLICY.repeatedWindowMs),
      })) >= CHAT_POLICY.repeatedLimitPerWindow
    ) {
      writeJson(response, 429, { error: 'repeated_message' });
      return true;
    }
    const id = `chln_${randomUUID()}`;
    await persistence.addChatLine({
      id,
      room: persistence.CHAT_ROOM_LOBBY,
      authorId: user.id,
      bodyText: text,
      moderationStatus: policy.status,
      moderationReason: policy.reason,
      now,
    });
    await persistence.pruneChatLines(persistence.CHAT_ROOM_LOBBY, CHAT_POLICY.retainedLines);
    writeJson(response, 201, {
      line: { id, handle: user.handle, text, createdAt: now.toISOString() },
    });
    return true;
  }

  writeJson(response, 405, { error: 'method_not_allowed' });
  return true;
}

function serializeChatReport(report: persistence.ChatReportRecord): Record<string, unknown> {
  return {
    id: report.id,
    lineId: report.lineId,
    reporterHandle: report.reporterHandle,
    lineAuthorHandle: report.lineAuthorHandle,
    lineText: report.lineText,
    reason: report.reason,
    status: report.status,
    moderationStatus: report.moderationStatus,
    moderationReason: report.moderationReason,
    createdAt: report.createdAt.toISOString(),
  };
}
