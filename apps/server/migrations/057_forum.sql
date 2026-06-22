-- 057_forum.sql
-- Minimal DB-backed forum: anonymous reads, account-bound writes, plaintext
-- posts. Moderation columns are present from day one, even though the first UI
-- only creates and replies.

CREATE TABLE IF NOT EXISTS forum_categories (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE
    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$'),
  name TEXT NOT NULL
    CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  topic_write_policy TEXT NOT NULL DEFAULT 'account'
    CHECK (topic_write_policy IN ('account', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS forum_topics (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES forum_categories(id) ON DELETE RESTRICT,
  author_account_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  slug TEXT NOT NULL
    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$'),
  title TEXT NOT NULL
    CHECK (char_length(btrim(title)) BETWEEN 3 AND 120),
  post_count INTEGER NOT NULL DEFAULT 0 CHECK (post_count >= 0),
  last_post_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  pinned_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  hidden_at TIMESTAMPTZ,
  hidden_by_account_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  hidden_reason TEXT CHECK (hidden_reason IS NULL OR char_length(hidden_reason) <= 240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS forum_topics_visible_recent_idx
  ON forum_topics (last_post_at DESC)
  WHERE hidden_at IS NULL;

CREATE INDEX IF NOT EXISTS forum_topics_category_recent_idx
  ON forum_topics (category_id, last_post_at DESC)
  WHERE hidden_at IS NULL;

CREATE INDEX IF NOT EXISTS forum_topics_pinned_recent_idx
  ON forum_topics (pinned_at DESC NULLS LAST, last_post_at DESC)
  WHERE hidden_at IS NULL;

CREATE TABLE IF NOT EXISTS forum_posts (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES forum_topics(id) ON DELETE CASCADE,
  author_account_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  body_text TEXT NOT NULL
    CHECK (char_length(btrim(body_text)) BETWEEN 1 AND 5000),
  hidden_at TIMESTAMPTZ,
  hidden_by_account_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  hidden_reason TEXT CHECK (hidden_reason IS NULL OR char_length(hidden_reason) <= 240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS forum_posts_topic_created_idx
  ON forum_posts (topic_id, created_at ASC)
  WHERE hidden_at IS NULL;

CREATE INDEX IF NOT EXISTS forum_posts_author_created_idx
  ON forum_posts (author_account_id, created_at DESC);

INSERT INTO forum_categories
  (id, slug, name, description, sort_order, topic_write_policy)
VALUES
  ('announcements', 'announcements', 'Announcements', 'Mistboard release notes and official updates.', 10, 'admin'),
  ('rules', 'rules', 'Rules', 'Ask and answer questions about Mistboard variants.', 20, 'account'),
  ('strategy', 'strategy', 'Strategy', 'Openings, traps, patterns, and study notes.', 30, 'account'),
  ('engines', 'engines', 'Engines', 'Misty, bot play, engine matches, and benchmarks.', 40, 'account'),
  ('support', 'support', 'Support', 'Bug reports, account help, and site feedback.', 50, 'account')
ON CONFLICT (id) DO UPDATE SET
  slug = EXCLUDED.slug,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  topic_write_policy = EXCLUDED.topic_write_policy,
  updated_at = now();
