// Lobby chat persistence (gate-cleared 2026-07-02). Mechanics only — the
// posting policy (flag, sign-in, timeouts, flood, link rules) lives in
// routes/chat.ts. Lines are capped per room by opportunistic pruning after
// insert (playstrategy keeps 200; the cap is a parameter so tests stay fast).
// Hiding is soft (hidden_at) so a timeout can strike a user's lines while the
// rows stay auditable.

import { getPool } from './persistence-db.js';

export const CHAT_LINE_MAX = 140;
export const CHAT_ROOM_LOBBY = 'lobby';
export const CHAT_LINES_RETAINED = 200;
export const CHAT_REPORT_REASON_MAX = 240;

export type ChatLineRecord = {
  id: string;
  authorHandle: string | null;
  bodyText: string;
  createdAt: Date;
};

export type ChatModerationStatus = 'clean' | 'flagged';

export type ChatReportRecord = {
  id: string;
  lineId: string;
  reporterHandle: string | null;
  lineAuthorHandle: string | null;
  lineText: string;
  reason: string;
  status: 'open' | 'resolved' | 'dismissed';
  moderationStatus: ChatModerationStatus;
  moderationReason: string | null;
  createdAt: Date;
};

export async function listChatLines(room: string, limit: number): Promise<ChatLineRecord[]> {
  const { rows } = await getPool().query<{
    id: string;
    handle: string | null;
    body_text: string;
    created_at: Date;
  }>(
    `SELECT chat_lines.id, users.handle, chat_lines.body_text, chat_lines.created_at
     FROM chat_lines
     LEFT JOIN users ON users.id = chat_lines.author_account_id
     WHERE chat_lines.room = $1 AND chat_lines.hidden_at IS NULL
     ORDER BY chat_lines.created_at DESC, chat_lines.id DESC
     LIMIT $2`,
    [room, limit],
  );
  return rows
    .map((row) => ({
      id: row.id,
      authorHandle: row.handle,
      bodyText: row.body_text,
      createdAt: row.created_at,
    }))
    .reverse();
}

export async function addChatLine(input: {
  id: string;
  room: string;
  authorId: string;
  bodyText: string;
  moderationStatus?: ChatModerationStatus;
  moderationReason?: string;
  now?: Date;
}): Promise<void> {
  await getPool().query(
    `INSERT INTO chat_lines
       (id, room, author_account_id, body_text, moderation_status, moderation_reason, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.id,
      input.room,
      input.authorId,
      input.bodyText.trim(),
      input.moderationStatus ?? 'clean',
      input.moderationReason ?? null,
      input.now ?? new Date(),
    ],
  );
}

// Delete everything older than the newest `keep` rows for the room. Called
// after each insert; hidden rows count toward the cap so the table stays
// bounded even under a hide-heavy moderation day.
export async function pruneChatLines(room: string, keep: number): Promise<void> {
  await getPool().query(
    `DELETE FROM chat_lines
     WHERE room = $1 AND id NOT IN (
       SELECT id FROM chat_lines
       WHERE room = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2
     )`,
    [room, keep],
  );
}

// Flood limit (DB-counted, forum pattern). Counts hidden lines too — a
// timeout must not reset the author's budget.
export async function countRecentChatLinesByUser(userId: string, since: Date): Promise<number> {
  const { rows } = await getPool().query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM chat_lines
     WHERE author_account_id = $1 AND created_at > $2`,
    [userId, since],
  );
  return parseInt(rows[0]?.count ?? '0', 10);
}

export async function countRecentMatchingChatLinesByUser(input: {
  userId: string;
  bodyText: string;
  since: Date;
}): Promise<number> {
  const { rows } = await getPool().query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM chat_lines
     WHERE author_account_id = $1
       AND created_at > $2
       AND lower(btrim(body_text)) = lower(btrim($3))`,
    [input.userId, input.since, input.bodyText],
  );
  return parseInt(rows[0]?.count ?? '0', 10);
}

// The post-time timeout check: the latest timeout still in force, if any.
export async function activeChatTimeout(
  room: string,
  userId: string,
  now?: Date,
): Promise<Date | null> {
  const { rows } = await getPool().query<{ until: Date }>(
    `SELECT until FROM chat_timeouts
     WHERE room = $1 AND user_id = $2 AND until > $3
     ORDER BY until DESC
     LIMIT 1`,
    [room, userId, now ?? new Date()],
  );
  return rows[0]?.until ?? null;
}

// Admin timeout: one row for the window plus a strike-through of the user's
// existing visible lines in the room (playstrategy semantics).
export async function createChatTimeout(input: {
  id: string;
  room: string;
  targetHandle: string;
  durationMs: number;
  reason?: string;
  createdById: string;
  now?: Date;
}): Promise<{ ok: true; until: Date } | { ok: false; error: 'unknown_user' }> {
  const now = input.now ?? new Date();
  const { rows } = await getPool().query<{ id: string }>(
    `SELECT id FROM users WHERE lower(handle) = lower($1) LIMIT 1`,
    [input.targetHandle],
  );
  const target = rows[0];
  if (!target) return { ok: false, error: 'unknown_user' };

  const until = new Date(now.getTime() + input.durationMs);
  await getPool().query(
    `INSERT INTO chat_timeouts (id, room, user_id, reason, until, created_by_account_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [input.id, input.room, target.id, input.reason ?? null, until, input.createdById, now],
  );
  await getPool().query(
    `UPDATE chat_lines SET
       hidden_at = $3, hidden_by_account_id = $4,
       hidden_reason = COALESCE($5, 'chat timeout')
     WHERE room = $1 AND author_account_id = $2 AND hidden_at IS NULL`,
    [input.room, target.id, now, input.createdById, input.reason ?? null],
  );
  return { ok: true, until };
}

export async function hideChatLine(input: {
  lineId: string;
  hiddenById: string;
  reason?: string;
  now?: Date;
}): Promise<boolean> {
  const { rowCount } = await getPool().query(
    `UPDATE chat_lines SET
       hidden_at = $2, hidden_by_account_id = $3, hidden_reason = $4
     WHERE id = $1 AND hidden_at IS NULL`,
    [input.lineId, input.now ?? new Date(), input.hiddenById, input.reason ?? null],
  );
  return (rowCount ?? 0) > 0;
}

export async function createChatReport(input: {
  id: string;
  lineId: string;
  reporterId: string;
  reason: string;
  now?: Date;
}): Promise<
  | { ok: true; report: ChatReportRecord; openReportsForLine: number }
  | { ok: false; error: 'line_not_found' | 'already_reported' | 'self_report' }
> {
  const now = input.now ?? new Date();
  const { rows: lineRows } = await getPool().query<{
    author_account_id: string | null;
  }>(
    `SELECT author_account_id
     FROM chat_lines
     WHERE id = $1 AND hidden_at IS NULL
     LIMIT 1`,
    [input.lineId],
  );
  const line = lineRows[0];
  if (!line) return { ok: false, error: 'line_not_found' };
  if (line.author_account_id === input.reporterId) return { ok: false, error: 'self_report' };

  try {
    await getPool().query(
      `INSERT INTO chat_reports
         (id, line_id, reporter_account_id, reason, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)`,
      [input.id, input.lineId, input.reporterId, input.reason.trim(), now],
    );
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: 'already_reported' };
    throw error;
  }

  const report = await getChatReportById(input.id);
  if (!report) throw new Error(`chat report ${input.id} missing after insert`);
  return {
    ok: true,
    report,
    openReportsForLine: await countOpenChatReportsForLine(input.lineId),
  };
}

export async function listChatReports(opts: {
  status: ChatReportRecord['status'];
  limit: number;
}): Promise<ChatReportRecord[]> {
  const { rows } = await getPool().query<ChatReportRow>(
    `${chatReportSelectSql()}
     WHERE chat_reports.status = $1
     ORDER BY chat_reports.created_at DESC
     LIMIT $2`,
    [opts.status, opts.limit],
  );
  return rows.map(chatReportFromRow);
}

export async function resolveChatReport(input: {
  reportId: string;
  status: 'resolved' | 'dismissed';
  resolvedById: string;
  note?: string;
  now?: Date;
}): Promise<boolean> {
  const { rowCount } = await getPool().query(
    `UPDATE chat_reports SET
       status = $2,
       resolution_note = $3,
       resolved_by_account_id = $4,
       resolved_at = $5,
       updated_at = $5
     WHERE id = $1`,
    [input.reportId, input.status, input.note ?? null, input.resolvedById, input.now ?? new Date()],
  );
  return (rowCount ?? 0) > 0;
}

async function countOpenChatReportsForLine(lineId: string): Promise<number> {
  const { rows } = await getPool().query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM chat_reports
     WHERE line_id = $1 AND status = 'open'`,
    [lineId],
  );
  return parseInt(rows[0]?.count ?? '0', 10);
}

async function getChatReportById(reportId: string): Promise<ChatReportRecord | null> {
  const { rows } = await getPool().query<ChatReportRow>(
    `${chatReportSelectSql()}
     WHERE chat_reports.id = $1
     LIMIT 1`,
    [reportId],
  );
  return rows[0] ? chatReportFromRow(rows[0]) : null;
}

type ChatReportRow = {
  id: string;
  line_id: string;
  reporter_handle: string | null;
  line_author_handle: string | null;
  body_text: string;
  reason: string;
  status: ChatReportRecord['status'];
  moderation_status: ChatModerationStatus;
  moderation_reason: string | null;
  created_at: Date;
};

function chatReportSelectSql(): string {
  return `SELECT chat_reports.id, chat_reports.line_id,
            reporter.handle AS reporter_handle,
            line_author.handle AS line_author_handle,
            chat_lines.body_text,
            chat_reports.reason,
            chat_reports.status,
            chat_lines.moderation_status,
            chat_lines.moderation_reason,
            chat_reports.created_at
          FROM chat_reports
          JOIN chat_lines ON chat_lines.id = chat_reports.line_id
          LEFT JOIN users reporter ON reporter.id = chat_reports.reporter_account_id
          LEFT JOIN users line_author ON line_author.id = chat_lines.author_account_id`;
}

function chatReportFromRow(row: ChatReportRow): ChatReportRecord {
  return {
    id: row.id,
    lineId: row.line_id,
    reporterHandle: row.reporter_handle,
    lineAuthorHandle: row.line_author_handle,
    lineText: row.body_text,
    reason: row.reason,
    status: row.status,
    moderationStatus: row.moderation_status,
    moderationReason: row.moderation_reason,
    createdAt: row.created_at,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}
