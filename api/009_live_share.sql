-- 009: Live spectator sharing
-- Adds a per-tournament share code so friends/family can watch live
-- results at live.html?code=XXXXXX without an account.
-- Disable keeps the code (re-enable restores the same link);
-- regenerating writes a new code.

ALTER TABLE tournaments
  ADD COLUMN live_share_code VARCHAR(8) NULL DEFAULT NULL,
  ADD COLUMN live_share_enabled TINYINT(1) NOT NULL DEFAULT 0,
  ADD UNIQUE KEY uq_live_share_code (live_share_code);
