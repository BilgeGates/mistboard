// Coach directory persistence (089): verified titled players advertise
// coaching services; the public directory lists them.
//
// Fail-closed listing rule: every public read joins users and requires the
// user to CURRENTLY hold a title (users.title IS NOT NULL) in addition to
// published = true. Title-holding is enforced at the route layer on publish
// (routes/coaches.ts requires isPlayerTitle(user.title)), not by a DB
// constraint, so a later title revocation silently delists the coach without
// touching this table.

import { getPool } from './persistence-db.js';
import type { PlayerTitle } from './persistence-titles.js';

export type CoachProfile = {
  userId: string;
  headline: string;
  about: string;
  languages: string;
  rate: string;
  contact: string;
  acceptingStudents: boolean;
  published: boolean;
  createdAt: Date;
  updatedAt: Date;
};

// Directory card row: profile fields joined with enough user identity to
// render the card and link to /coach/:handle. `title` is non-null by
// construction (the listing query requires it).
export type CoachListing = {
  handle: string;
  displayName: string;
  title: PlayerTitle;
  headline: string;
  languages: string;
  rate: string;
  acceptingStudents: boolean;
};

// Public detail view: the card fields plus the long-form about text and the
// contact line (only exposed on the detail page, not the directory list).
export type CoachDetail = CoachListing & {
  about: string;
  contact: string;
};

const PROFILE_COLUMNS =
  'user_id, headline, about, languages, rate, contact, accepting_students, published, created_at, updated_at';

export async function getCoachProfileForUser(userId: string): Promise<CoachProfile | null> {
  const { rows } = await getPool().query<CoachProfileRow>(
    `SELECT ${PROFILE_COLUMNS} FROM coach_profiles WHERE user_id = $1`,
    [userId],
  );
  return rows[0] ? profileFromRow(rows[0]) : null;
}

// Upsert the caller's own profile. created_at survives updates; updated_at
// always moves. The route layer has already validated field lengths and the
// publish eligibility rule by the time this runs.
export async function upsertCoachProfile(input: {
  userId: string;
  headline: string;
  about: string;
  languages: string;
  rate: string;
  contact: string;
  acceptingStudents: boolean;
  published: boolean;
  now: Date;
}): Promise<CoachProfile> {
  const { rows } = await getPool().query<CoachProfileRow>(
    `INSERT INTO coach_profiles
       (user_id, headline, about, languages, rate, contact, accepting_students, published, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
     ON CONFLICT (user_id) DO UPDATE SET
       headline = EXCLUDED.headline,
       about = EXCLUDED.about,
       languages = EXCLUDED.languages,
       rate = EXCLUDED.rate,
       contact = EXCLUDED.contact,
       accepting_students = EXCLUDED.accepting_students,
       published = EXCLUDED.published,
       updated_at = EXCLUDED.updated_at
     RETURNING ${PROFILE_COLUMNS}`,
    [
      input.userId,
      input.headline,
      input.about,
      input.languages,
      input.rate,
      input.contact,
      input.acceptingStudents,
      input.published,
      input.now,
    ],
  );
  return profileFromRow(rows[0]!);
}

// The public directory: published coaches whose user currently holds a title.
// Stable order: accepting-students first, then newest profile, user_id as the
// deterministic tiebreak.
export async function listPublishedCoaches(limit = 200): Promise<CoachListing[]> {
  const { rows } = await getPool().query<CoachListingRow>(
    `SELECT u.handle, u.display_name, u.title, cp.headline, cp.languages, cp.rate,
            cp.accepting_students
     FROM coach_profiles cp
     JOIN users u ON u.id = cp.user_id
     WHERE cp.published = true AND u.title IS NOT NULL
     ORDER BY cp.accepting_students DESC, cp.created_at DESC, cp.user_id DESC
     LIMIT $1`,
    [Math.max(1, Math.min(limit, 500))],
  );
  return rows.map(listingFromRow);
}

// Public detail page. Same fail-closed filter as the directory: an
// unpublished profile or a revoked title reads as "no such coach".
export async function getPublishedCoachByHandle(handle: string): Promise<CoachDetail | null> {
  const { rows } = await getPool().query<CoachDetailRow>(
    `SELECT u.handle, u.display_name, u.title, cp.headline, cp.about, cp.languages, cp.rate,
            cp.contact, cp.accepting_students
     FROM coach_profiles cp
     JOIN users u ON u.id = cp.user_id
     WHERE lower(u.handle) = lower($1) AND cp.published = true AND u.title IS NOT NULL`,
    [handle],
  );
  const row = rows[0];
  if (!row) return null;
  return { ...listingFromRow(row), about: row.about, contact: row.contact };
}

type CoachProfileRow = {
  user_id: string;
  headline: string;
  about: string;
  languages: string;
  rate: string;
  contact: string;
  accepting_students: boolean;
  published: boolean;
  created_at: Date;
  updated_at: Date;
};

type CoachListingRow = {
  handle: string;
  display_name: string;
  title: PlayerTitle;
  headline: string;
  languages: string;
  rate: string;
  accepting_students: boolean;
};

type CoachDetailRow = CoachListingRow & {
  about: string;
  contact: string;
};

function profileFromRow(row: CoachProfileRow): CoachProfile {
  return {
    userId: row.user_id,
    headline: row.headline,
    about: row.about,
    languages: row.languages,
    rate: row.rate,
    contact: row.contact,
    acceptingStudents: row.accepting_students,
    published: row.published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listingFromRow(row: CoachListingRow): CoachListing {
  return {
    handle: row.handle,
    displayName: row.display_name,
    title: row.title,
    headline: row.headline,
    languages: row.languages,
    rate: row.rate,
    acceptingStudents: row.accepting_students,
  };
}
