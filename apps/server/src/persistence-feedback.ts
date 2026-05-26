import { getPool } from './persistence-db.js';

export interface FeedbackSubmissionInput {
  id: string;
  message: string;
  email: string | null;
  path: string | null;
  userId: string | null;
  userAgent: string | null;
  ipHash: string | null;
}

export async function insertFeedbackSubmission(input: FeedbackSubmissionInput): Promise<void> {
  await getPool().query(
    `INSERT INTO feedback_submissions (id, message, email, path, user_id, user_agent, ip_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [input.id, input.message, input.email, input.path, input.userId, input.userAgent, input.ipHash],
  );
}

export async function countAnonFeedbackSubmissionsSince(
  ipHash: string,
  since: Date,
): Promise<number> {
  const result = await getPool().query<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM feedback_submissions
      WHERE user_id IS NULL
        AND ip_hash = $1
        AND created_at > $2`,
    [ipHash, since],
  );
  return Number(result.rows[0]?.count ?? '0');
}
