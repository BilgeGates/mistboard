#!/usr/bin/env node

// Gap-filler QA seed: the local surfaces the other seeders don't cover.
//
//   a. ADMIN ACCOUNT  — promote MISTBOARD_QA_ADMIN_EMAIL (default
//      brianhliou@gmail.com) to account_role='admin'. Matches the app's
//      email->user lookup (account-session.ts ensureUserForEmail ->
//      findUserByEmail on lower(email)), so a later dev login-code sign-in with
//      that email lands on this same account and inherits admin. Dev sign-in
//      returns the code as `devCode` in the API response, so no email is sent.
//   b. INBOX / DM     — a few dm_threads + dm_messages between the admin and
//      existing seed users, including one 30+ message thread (internal scroll)
//      and unread threads (inbox badge).
//   d. XIANGQI LADDER — user_ratings rows for the xiangqi/blitz bucket (the
//      leaderboard reads user_ratings where games_played > 0); the bucket is
//      empty locally otherwise.
//
//   (c) CORRESPONDENCE is intentionally NOT seeded here — see the report /
//   README notes. A your-turn dashboard entry needs BOTH a room_deadlines row
//   AND a hydratable dark-chess event log + running games row; there is no
//   committed non-terminal fixture to replay (seed-variant-fixtures only ships
//   FINISHED games and dark-chess isn't in the generator), so a static seed
//   would either be a hollow /room link (faking it) or a hand-rolled event log
//   that is fragile to keep legal. Create one against the running dev server
//   instead.
//
// Idempotent: re-runs upsert to the same state and never truncate/delete
// existing rows. Prints a created-vs-already-present summary per category.
//
//   env DATABASE_URL=... npm run seed:qa-fixtures --workspace @mistboard/server

import pg from 'pg';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required. Run via `npm run db:seed:qa-fixtures`.');
  process.exit(1);
}
assertLocalDatabase(databaseUrl);

const ADMIN_EMAIL = (process.env.MISTBOARD_QA_ADMIN_EMAIL ?? 'brianhliou@gmail.com')
  .trim()
  .toLowerCase();
const ADMIN_ID = 'qa-admin';
const ADMIN_HANDLE_CANDIDATES = ['brian-dev', 'brian-dev-qa', 'qa-admin'];

// DM partners are resolved by handle from whatever the profile seeders created;
// any that are absent are skipped with a warning rather than failing the run.
const DM_CONVERSATIONS = [
  {
    partnerHandle: 'misty-fox',
    baseAt: '2026-07-08T09:00:00.000Z',
    // A long thread (32 messages) so the conversation pane's internal scroll is
    // testable; ends on the partner's turn so it also reads as unread.
    messageCount: 32,
    endsWithPartner: true,
    opener: 'Hey, want to review that fog game from last night?',
  },
  {
    partnerHandle: 'quiet-rook',
    baseAt: '2026-07-08T14:00:00.000Z',
    messageCount: 4,
    endsWithPartner: false,
    opener: 'gg earlier. That rook lift caught me completely off guard.',
  },
  {
    partnerHandle: 'fog-walker',
    baseAt: '2026-07-09T18:30:00.000Z',
    messageCount: 3,
    endsWithPartner: true,
    opener: 'Are you around for a correspondence game this week?',
  },
];

// Spread across the xiangqi/blitz bucket so /api/leaderboard?variant=xiangqi is
// non-empty. games_played > 0 is required for a row to surface on the ladder.
const XIANGQI_RATINGS = [
  { handle: 'misty-fox', elo: 1742, games: 41, rd: 74 },
  { handle: 'river-cannon', elo: 1688, games: 33, rd: 82 },
  { handle: 'quiet-rook', elo: 1631, games: 27, rd: 90 },
  { handle: 'plum-blossom', elo: 1575, games: 19, rd: 104 },
  { handle: 'oldwall', elo: 1519, games: 14, rd: 118 },
  { handle: 'fog-walker', elo: 1463, games: 9, rd: 141 },
  { handle: 'greyknight', elo: 1408, games: 6, rd: 160 },
];
const ADMIN_XIANGQI_RATING = { elo: 1604, games: 22, rd: 96 };

const DM_PREVIEW_MAX = 100;
const pool = new Pool({ connectionString: databaseUrl });

const summary = {
  admin: '',
  dmThreadsCreated: 0,
  dmThreadsExisting: 0,
  dmMessagesCreated: 0,
  dmMessagesExisting: 0,
  dmSkipped: [],
  xiangqiCreated: 0,
  xiangqiExisting: 0,
  xiangqiSkipped: [],
};

try {
  await seed();
} finally {
  await pool.end();
}

printSummary();

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertRequiredSchema(client);
    const adminUserId = await seedAdmin(client);
    await seedDirectMessages(client, adminUserId);
    await seedXiangqiRatings(client, adminUserId);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function assertRequiredSchema(client) {
  const required = ['users', 'dm_threads', 'dm_messages', 'user_ratings'];
  const { rows } = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1)`,
    [required],
  );
  const found = new Set(rows.map((row) => row.table_name));
  const missing = required.filter((table) => !found.has(table));
  if (missing.length > 0) {
    throw new Error(`Missing tables: ${missing.join(', ')}. Run npm run db:migrate first.`);
  }
}

// (a) Promote MISTBOARD_QA_ADMIN_EMAIL to admin. Matches findUserByEmail's
// lower(email) match so a dev sign-in later resolves to this same row.
async function seedAdmin(client) {
  const existing = await client.query(
    `SELECT id, handle, account_role FROM users WHERE lower(email) = lower($1) LIMIT 1`,
    [ADMIN_EMAIL],
  );
  if (existing.rows[0]) {
    const row = existing.rows[0];
    await client.query(
      `UPDATE users
         SET account_role = 'admin',
             email_verified_at = COALESCE(email_verified_at, now()),
             updated_at = now()
       WHERE id = $1`,
      [row.id],
    );
    summary.admin =
      row.account_role === 'admin'
        ? `already admin (${ADMIN_EMAIL}, handle @${row.handle}, id ${row.id})`
        : `promoted existing user to admin (${ADMIN_EMAIL}, handle @${row.handle}, id ${row.id})`;
    return row.id;
  }

  const handle = await firstAvailableHandle(client, ADMIN_HANDLE_CANDIDATES);
  await client.query(
    `INSERT INTO users
       (id, email, email_verified_at, handle, display_name, profile_visibility,
        account_role, created_at, updated_at)
     VALUES ($1, $2, now(), $3, $3, 'public', 'admin', now(), now())`,
    [ADMIN_ID, ADMIN_EMAIL, handle],
  );
  summary.admin = `created admin (${ADMIN_EMAIL}, handle @${handle}, id ${ADMIN_ID})`;
  return ADMIN_ID;
}

async function firstAvailableHandle(client, candidates) {
  for (const candidate of candidates) {
    const { rows } = await client.query(
      `SELECT 1 FROM users WHERE lower(handle) = lower($1) LIMIT 1`,
      [candidate],
    );
    if (rows.length === 0) return candidate;
  }
  throw new Error(
    `No admin handle available among ${candidates.join(', ')}; pass a free one or clean up.`,
  );
}

// (b) Inbox / DM fixtures. Thread id = the two user ids sorted and '/'-joined
// (persistence-dms.ts contract). Messages upsert by stable id; the thread's
// denormalized last-message + read state is set to match the final message.
async function seedDirectMessages(client, adminUserId) {
  for (const convo of DM_CONVERSATIONS) {
    const partner = await findUserByHandle(client, convo.partnerHandle);
    if (!partner) {
      summary.dmSkipped.push(convo.partnerHandle);
      continue;
    }
    if (partner.id === adminUserId) {
      summary.dmSkipped.push(`${convo.partnerHandle} (same as admin)`);
      continue;
    }

    const threadId = dmThreadId(adminUserId, partner.id);
    const [userLo, userHi] =
      adminUserId < partner.id ? [adminUserId, partner.id] : [partner.id, adminUserId];
    const baseMs = new Date(convo.baseAt).getTime();
    const messages = buildConversationMessages(convo, adminUserId, partner.id, baseMs);
    const last = messages[messages.length - 1];
    const preview =
      last.body.length > DM_PREVIEW_MAX ? `${last.body.slice(0, DM_PREVIEW_MAX - 1)}…` : last.body;
    // Unread for the admin when the partner sent last (matches the inbox rule:
    // unread = !last_read AND last_sender <> me).
    const lastRead = last.senderId === adminUserId;

    const threadResult = await client.query(
      `INSERT INTO dm_threads
         (id, user_lo, user_hi, created_by, last_text, last_sender_id, last_at, last_read, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         last_text = EXCLUDED.last_text,
         last_sender_id = EXCLUDED.last_sender_id,
         last_at = EXCLUDED.last_at,
         last_read = EXCLUDED.last_read
       RETURNING (xmax = 0) AS inserted`,
      [
        threadId,
        userLo,
        userHi,
        adminUserId,
        preview,
        last.senderId,
        new Date(last.at),
        lastRead,
        new Date(messages[0].at),
      ],
    );
    if (threadResult.rows[0]?.inserted) summary.dmThreadsCreated += 1;
    else summary.dmThreadsExisting += 1;

    for (const message of messages) {
      const inserted = await client.query(
        `INSERT INTO dm_messages (id, thread_id, sender_id, body_text, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        [message.id, threadId, message.senderId, message.body, new Date(message.at)],
      );
      if (inserted.rowCount > 0) summary.dmMessagesCreated += 1;
      else summary.dmMessagesExisting += 1;
    }
  }
}

function buildConversationMessages(convo, adminUserId, partnerId, baseMs) {
  const messages = [];
  // Anchor sender parity to the END so the final message lands on the intended
  // party (endsWithPartner drives the inbox unread state), then alternate turns
  // backwards from there.
  const lastIsAdmin = !convo.endsWithPartner;
  for (let i = 0; i < convo.messageCount; i++) {
    const fromEnd = convo.messageCount - 1 - i;
    const senderIsAdmin = fromEnd % 2 === 0 ? lastIsAdmin : !lastIsAdmin;
    const senderId = senderIsAdmin ? adminUserId : partnerId;
    const body = i === 0 ? convo.opener : conversationLine(senderIsAdmin, i, convo.messageCount);
    messages.push({
      id: `qa-dm-${convo.partnerHandle}-${String(i).padStart(3, '0')}`,
      senderId,
      body,
      at: baseMs + i * 60_000,
    });
  }
  return messages;
}

function conversationLine(senderIsAdmin, index, total) {
  const adminLines = [
    'Right, the cannon screen threw me. I never saw the check coming.',
    'Let me pull up the replay. Give me a sec.',
    'Yeah, move 18 is where it slipped. I should have covered the file.',
    'Honestly your endgame technique has gotten sharp.',
    'Want to run it back at 3+2?',
    'One more and then I have to log off.',
    'Good spot. I keep forgetting elephants can not cross the river.',
  ];
  const partnerLines = [
    'No worries, it was a close one until the middlegame.',
    'Sending it now. Watch the black horse on the left.',
    'Ha, I only found that line because I blundered the same way last week.',
    'Rematch whenever you are ready.',
    'That advisor tuck is underrated, you should try it.',
    'Same, early day tomorrow.',
    'gg, see you on the ladder.',
  ];
  const lines = senderIsAdmin ? adminLines : partnerLines;
  if (index === total - 1) return senderIsAdmin ? 'gg, talk soon.' : 'gg, talk soon!';
  return lines[index % lines.length];
}

// (d) Xiangqi ladder rows. Seeds user_ratings for xiangqi/blitz with
// games_played > 0 so the leaderboard column is non-empty.
async function seedXiangqiRatings(client, adminUserId) {
  const targets = [];
  for (const rating of XIANGQI_RATINGS) {
    const user = await findUserByHandle(client, rating.handle);
    if (!user) {
      summary.xiangqiSkipped.push(rating.handle);
      continue;
    }
    targets.push({ userId: user.id, ...rating });
  }
  targets.push({ userId: adminUserId, handle: 'admin', ...ADMIN_XIANGQI_RATING });

  for (const target of targets) {
    const result = await client.query(
      `INSERT INTO user_ratings
         (user_id, variant, time_class, elo_rating, games_played,
          rating_deviation, volatility, last_rated_at, updated_at)
       VALUES ($1, 'xiangqi', 'blitz', $2, $3, $4, 0.06, $5, now())
       ON CONFLICT (user_id, variant, time_class) DO UPDATE SET
         elo_rating = EXCLUDED.elo_rating,
         games_played = EXCLUDED.games_played,
         rating_deviation = EXCLUDED.rating_deviation,
         last_rated_at = EXCLUDED.last_rated_at,
         updated_at = now()
       RETURNING (xmax = 0) AS inserted`,
      [target.userId, target.elo, target.games, target.rd, '2026-07-09T20:00:00.000Z'],
    );
    if (result.rows[0]?.inserted) summary.xiangqiCreated += 1;
    else summary.xiangqiExisting += 1;
  }
}

async function findUserByHandle(client, handle) {
  const { rows } = await client.query(
    `SELECT id, handle FROM users WHERE lower(handle) = lower($1) LIMIT 1`,
    [handle],
  );
  return rows[0] ?? null;
}

function dmThreadId(userA, userB) {
  return userA < userB ? `${userA}/${userB}` : `${userB}/${userA}`;
}

function printSummary() {
  console.log('\nQA seed summary:');
  console.log(`  admin       : ${summary.admin}`);
  console.log(
    `  dm threads  : ${summary.dmThreadsCreated} created, ${summary.dmThreadsExisting} already present`,
  );
  console.log(
    `  dm messages : ${summary.dmMessagesCreated} created, ${summary.dmMessagesExisting} already present`,
  );
  if (summary.dmSkipped.length > 0) {
    console.log(`  dm skipped  : ${summary.dmSkipped.join(', ')} (missing seed user)`);
  }
  console.log(
    `  xiangqi elo : ${summary.xiangqiCreated} created, ${summary.xiangqiExisting} already present (variant=xiangqi, time_class=blitz)`,
  );
  if (summary.xiangqiSkipped.length > 0) {
    console.log(`  xiangqi skip: ${summary.xiangqiSkipped.join(', ')} (missing seed user)`);
  }
  console.log('  correspondence: skipped by design (needs a live-server game; see notes).');
}

function assertLocalDatabase(value) {
  if (process.env.MISTBOARD_ALLOW_NONLOCAL_SEED === 'true') return;
  const parsed = new URL(value);
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (!localHosts.has(parsed.hostname)) {
    throw new Error(
      'Refusing to seed a non-local database. Set MISTBOARD_ALLOW_NONLOCAL_SEED=true to override.',
    );
  }
}
