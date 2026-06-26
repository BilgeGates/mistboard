-- 062_account_locale_preference.sql
-- Optional account-level language preference. NULL preserves first-visit
-- inference from URL/local browser settings until the user explicitly chooses.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS locale TEXT
    CHECK (locale IS NULL OR locale IN ('en', 'zh-Hans', 'zh-Hant', 'ja'));
