-- 059_forum_game_analysis_category.sql
-- Mirror the reference forum split where game analysis has a dedicated lane,
-- while keeping it focused on Mistboard games and community study.

INSERT INTO forum_categories
  (id, slug, name, description, sort_order, topic_write_policy)
VALUES
  (
    'game-analysis',
    'game-analysis',
    'Game Analysis',
    'Post Mistboard games and analyze them with the community.',
    35,
    'account'
  )
ON CONFLICT (id) DO UPDATE SET
  slug = EXCLUDED.slug,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  topic_write_policy = EXCLUDED.topic_write_policy,
  updated_at = now();
