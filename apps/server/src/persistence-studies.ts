// Persistence for user-created studies (schema in migration 092). A study owns an
// ordered set of chapters; each chapter carries a serialized move tree (JSONB) plus
// a `version` optimistic-concurrency token. Single-author for now: every write is
// gated on ownership at the route; the version guard here is what lets a future
// multi-contributor step stay safe without live sync (study-track.md, Decision A).
// All reads/writes no-op (null / no-op) when persistence is disabled.

import { randomBytes } from 'node:crypto';
import { getPool, isInitialized } from './persistence-db.js';

export type StudyVisibility = 'private' | 'unlisted' | 'public';

export function isStudyVisibility(value: unknown): value is StudyVisibility {
  return value === 'private' || value === 'unlisted' || value === 'public';
}

export type StudyChapterRecord = {
  id: string;
  studyId: string;
  ordinal: number;
  name: string;
  variant: string;
  orientation: string;
  /** SerializedTree (tree-serialize.ts); node-pg parses JSONB, so already an object. */
  root: unknown;
  denorm: unknown;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export type StudyRecord = {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  visibility: StudyVisibility;
  createdAt: Date;
  updatedAt: Date;
};

export type StudyWithChapters = StudyRecord & { chapters: StudyChapterRecord[] };

export type StudySummary = StudyRecord & { chapterCount: number };

export type NewChapterInput = {
  name: string;
  variant: string;
  orientation: string;
  root: unknown;
  denorm?: unknown;
};

export type CreateStudyInput = {
  ownerId: string;
  name: string;
  description: string;
  visibility: StudyVisibility;
  chapter: NewChapterInput;
};

export type UpdateChapterResult =
  | { ok: true; chapter: StudyChapterRecord }
  | { ok: false; error: 'not_found' | 'forbidden' | 'conflict' };

const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Short lila-style base62 id (8 chars ≈ 62^8 space). Not cryptographic identity,
 *  just a compact unguessable-enough handle for unlisted sharing. */
function shortId(len = 8): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i += 1) out += ID_ALPHABET[bytes[i]! % ID_ALPHABET.length];
  return out;
}

type StudyRow = {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  visibility: StudyVisibility;
  created_at: Date;
  updated_at: Date;
};

type ChapterRow = {
  id: string;
  study_id: string;
  ordinal: number;
  name: string;
  variant: string;
  orientation: string;
  root: unknown;
  denorm: unknown;
  version: number;
  created_at: Date;
  updated_at: Date;
};

function mapStudy(row: StudyRow): StudyRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    description: row.description,
    visibility: row.visibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapChapter(row: ChapterRow): StudyChapterRecord {
  return {
    id: row.id,
    studyId: row.study_id,
    ordinal: row.ordinal,
    name: row.name,
    variant: row.variant,
    orientation: row.orientation,
    root: row.root,
    denorm: row.denorm,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const STUDY_COLS = 'id, owner_id, name, description, visibility, created_at, updated_at';
const CHAPTER_COLS =
  'id, study_id, ordinal, name, variant, orientation, root, denorm, version, created_at, updated_at';

/** Create a study and its first chapter atomically. Returns the full record. */
export async function createStudy(input: CreateStudyInput): Promise<StudyWithChapters | null> {
  if (!isInitialized()) return null;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const studyId = shortId();
    await client.query(
      `INSERT INTO studies (id, owner_id, name, description, visibility)
         VALUES ($1, $2, $3, $4, $5)`,
      [studyId, input.ownerId, input.name, input.description, input.visibility],
    );
    await client.query(
      `INSERT INTO study_chapters (id, study_id, ordinal, name, variant, orientation, root, denorm)
         VALUES ($1, $2, 0, $3, $4, $5, $6::jsonb, $7::jsonb)`,
      [
        shortId(),
        studyId,
        input.chapter.name,
        input.chapter.variant,
        input.chapter.orientation,
        JSON.stringify(input.chapter.root),
        JSON.stringify(input.chapter.denorm ?? {}),
      ],
    );
    await client.query('COMMIT');
    return getStudyById(studyId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getStudyById(id: string): Promise<StudyWithChapters | null> {
  if (!isInitialized()) return null;
  const study = await getPool().query<StudyRow>(`SELECT ${STUDY_COLS} FROM studies WHERE id = $1`, [
    id,
  ]);
  const row = study.rows[0];
  if (!row) return null;
  const chapters = await getPool().query<ChapterRow>(
    `SELECT ${CHAPTER_COLS} FROM study_chapters WHERE study_id = $1 ORDER BY ordinal, created_at`,
    [id],
  );
  return { ...mapStudy(row), chapters: chapters.rows.map(mapChapter) };
}

export async function listStudiesForOwner(ownerId: string): Promise<StudySummary[]> {
  if (!isInitialized()) return [];
  const { rows } = await getPool().query<StudyRow & { chapter_count: string }>(
    `SELECT ${STUDY_COLS.split(', ')
      .map((c) => `s.${c}`)
      .join(', ')},
       (SELECT count(*) FROM study_chapters c WHERE c.study_id = s.id) AS chapter_count
       FROM studies s WHERE s.owner_id = $1 ORDER BY s.updated_at DESC`,
    [ownerId],
  );
  return rows.map((row) => ({ ...mapStudy(row), chapterCount: Number(row.chapter_count) }));
}

/** Owner-checked, version-guarded save of a chapter's tree. A stale `baseVersion`
 *  loses to whoever wrote last → 'conflict' (the caller tells the user to reload). */
export async function updateChapterTree(
  chapterId: string,
  ownerId: string,
  patch: { root: unknown; denorm?: unknown; baseVersion?: number },
): Promise<UpdateChapterResult> {
  if (!isInitialized()) return { ok: false, error: 'not_found' };
  const { rows } = await getPool().query<{ owner_id: string; version: number; study_id: string }>(
    `SELECT s.owner_id, c.version, c.study_id
       FROM study_chapters c JOIN studies s ON s.id = c.study_id
       WHERE c.id = $1`,
    [chapterId],
  );
  const found = rows[0];
  if (!found) return { ok: false, error: 'not_found' };
  if (found.owner_id !== ownerId) return { ok: false, error: 'forbidden' };
  if (patch.baseVersion !== undefined && patch.baseVersion !== found.version) {
    return { ok: false, error: 'conflict' };
  }
  const now = new Date();
  const updated = await getPool().query<ChapterRow>(
    `UPDATE study_chapters
       SET root = $1::jsonb,
           denorm = COALESCE($2::jsonb, denorm),
           version = version + 1,
           updated_at = $3
       WHERE id = $4
     RETURNING ${CHAPTER_COLS}`,
    [
      JSON.stringify(patch.root),
      patch.denorm === undefined ? null : JSON.stringify(patch.denorm),
      now,
      chapterId,
    ],
  );
  await getPool().query(`UPDATE studies SET updated_at = $1 WHERE id = $2`, [now, found.study_id]);
  return { ok: true, chapter: mapChapter(updated.rows[0]!) };
}

export type UpdateStudyMetaResult =
  | { ok: true; study: StudyRecord }
  | { ok: false; error: 'not_found' | 'forbidden' };

export async function updateStudyMeta(
  id: string,
  ownerId: string,
  patch: { name?: string; description?: string; visibility?: StudyVisibility },
): Promise<UpdateStudyMetaResult> {
  if (!isInitialized()) return { ok: false, error: 'not_found' };
  const existing = await getPool().query<StudyRow>(
    `SELECT ${STUDY_COLS} FROM studies WHERE id = $1`,
    [id],
  );
  const row = existing.rows[0];
  if (!row) return { ok: false, error: 'not_found' };
  if (row.owner_id !== ownerId) return { ok: false, error: 'forbidden' };
  const updated = await getPool().query<StudyRow>(
    `UPDATE studies
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           visibility = COALESCE($3, visibility),
           updated_at = now()
       WHERE id = $4
     RETURNING ${STUDY_COLS}`,
    [patch.name ?? null, patch.description ?? null, patch.visibility ?? null, id],
  );
  return { ok: true, study: mapStudy(updated.rows[0]!) };
}

/** Owner-checked hard delete (chapters cascade). Returns false if absent/not owner. */
export async function deleteStudy(id: string, ownerId: string): Promise<boolean> {
  if (!isInitialized()) return false;
  const { rowCount } = await getPool().query(
    `DELETE FROM studies WHERE id = $1 AND owner_id = $2`,
    [id, ownerId],
  );
  return (rowCount ?? 0) > 0;
}
