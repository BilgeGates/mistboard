-- 060_forum_simplify_categories.sql
-- Keep the initial forum taxonomy small: one general lane plus focused analysis,
-- engine, and feedback lanes. Existing topics are preserved by moving narrow
-- starter categories into the broader lanes before removing the extra rows.

BEGIN;

INSERT INTO forum_categories
  (id, slug, name, description, sort_order, topic_write_policy)
VALUES
  (
    'strategy',
    'general-discussion',
    'General Discussion',
    'Questions, rules, strategy, and general Mistboard discussion.',
    10,
    'account'
  ),
  (
    'game-analysis',
    'game-analysis',
    'Game Analysis',
    'Post Mistboard games and analyze them with the community.',
    20,
    'account'
  ),
  (
    'engines',
    'engines',
    'Engines',
    'Misty, bot play, engine matches, and benchmarks.',
    30,
    'account'
  ),
  (
    'support',
    'feedback',
    'Feedback',
    'Bug reports, feature requests, and site feedback.',
    40,
    'account'
  )
ON CONFLICT (id) DO UPDATE SET
  slug = EXCLUDED.slug,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  topic_write_policy = EXCLUDED.topic_write_policy,
  updated_at = now();

UPDATE forum_topics
SET category_id = 'strategy',
    updated_at = now()
WHERE category_id IN ('announcements', 'rules');

DELETE FROM forum_categories
WHERE id IN ('announcements', 'rules');

COMMIT;
