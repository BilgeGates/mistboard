-- 031_email_login_attempt_cap.sql
-- Cap verification attempts per email login challenge. An 8-digit code with no
-- attempt limit is brute-forceable within the 10-minute TTL; bound the number
-- of guesses a single challenge accepts so a wrong code burns the challenge
-- down rather than leaving it open until expiry.

ALTER TABLE email_login_challenges
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0
    CHECK (attempt_count >= 0),
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 5
    CHECK (max_attempts > 0);
