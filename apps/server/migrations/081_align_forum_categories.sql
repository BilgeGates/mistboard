-- 081_align_forum_categories.sql
-- Align the public forum taxonomy with Lichess's four-board shape while
-- preserving existing topics. The former engines board becomes off-topic.

BEGIN;

INSERT INTO forum_categories
  (id, slug, name, description, sort_order, topic_write_policy)
VALUES
  (
    'strategy',
    'general-discussion',
    'General Chess Discussion',
    'The place to discuss general chess topics.',
    10,
    'account'
  ),
  (
    'support',
    'feedback',
    'Mistboard Feedback',
    'Bug reports, feature requests, suggestions.',
    20,
    'account'
  ),
  (
    'game-analysis',
    'game-analysis',
    'Game analysis',
    'Show your game and analyse it with the community.',
    30,
    'account'
  ),
  (
    'off-topic-discussion',
    'off-topic-discussion',
    'Off-Topic Discussion',
    'Everything that is not related to chess.',
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
SET category_id = 'off-topic-discussion',
    updated_at = now()
WHERE category_id = 'engines';

DELETE FROM forum_categories
WHERE id = 'engines';

COMMIT;
