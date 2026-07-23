-- 115_study_i18n.sql
-- Localized study text (slice 1 of study i18n).
--
-- The site ships in en / zh-Hans / zh-Hant, but a study's authored text lived in
-- single columns, so a Chinese-language reader of a curated classical study saw
-- English chapter titles. This adds a per-locale OVERLAY rather than duplicating
-- studies per language: the existing `name` / `description` columns stay the
-- fallback, and `i18n` carries whatever locales have been authored.
--
-- Shape (both tables):
--   {"zh-Hant": {"name": "...", "description": "..."}, "zh-Hans": {...}}
-- Chapters use the same shape with only "name" meaningful. Any missing locale or
-- field falls back to the base column, so a partial translation degrades one
-- string at a time instead of stranding a reader on a half-translated page.
--
-- Deliberately NOT separate translated study rows: that duplicates the whole move
-- tree, splits likes/comments across copies, and guarantees drift when the
-- original is edited. Same reasoning as the article dictionaries in
-- apps/web/src/article-i18n.ts — one structural source of truth, text overlaid.
--
-- Per-node comment translations ride inside the chapter's existing `root` JSONB
-- (SerializedTree node annotations), so they need no column of their own.

ALTER TABLE studies
  ADD COLUMN IF NOT EXISTS i18n JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE study_chapters
  ADD COLUMN IF NOT EXISTS i18n JSONB NOT NULL DEFAULT '{}'::jsonb;
