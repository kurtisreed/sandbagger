-- 014: Rename payout_per_match -> payout_per_player_per_match
--
-- The column was added in 013 as "payout per match won". The figure it holds
-- is now what EACH PLAYER on the winning side collects, not a purse split
-- between them - a per-player amount, not a per-match one.
--
-- Nothing reads it yet, so the rename is free today. Once the settlement
-- calculation exists it would not be: the obvious misreading is
--
--     matches_won * payout_per_match
--
-- for a whole team, which under the real meaning understates every payout by a
-- factor of the side size. Renaming now removes the trap rather than
-- documenting around it.
--
-- Portable across MySQL 8.x (production) and MariaDB 10.x (local dev). MariaDB
-- supports RENAME COLUMN from 10.5.2 and MySQL from 8.0, but the guard below
-- keys off the column actually present so a re-run is a clean no-op either way.
--
-- In phpMyAdmin, select the database first - the guard calls DATABASE().
-- Safe to run more than once.


-- ---------------------------------------------------------------------------
-- STEP 1 - Rename, only if the old name is still there.
--
-- CHANGE rather than RENAME COLUMN, because CHANGE is accepted by every MySQL
-- and MariaDB version in play here and restates the type in one statement.
-- ---------------------------------------------------------------------------
SET @old_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = 'tournaments'
     AND COLUMN_NAME  = 'payout_per_match'
);
SET @ddl := IF(@old_exists = 1,
  'ALTER TABLE tournaments
     CHANGE COLUMN payout_per_match payout_per_player_per_match DECIMAL(8,2) NULL DEFAULT NULL',
  'DO 0'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;


INSERT IGNORE INTO schema_migrations (version, description) VALUES
  ('014', 'Rename payout_per_match to payout_per_player_per_match');


-- ---------------------------------------------------------------------------
-- STEP 2 - Confirm. Expect payout_per_player_per_match and no
-- payout_per_match.
-- ---------------------------------------------------------------------------
-- SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS
--  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tournaments'
--    AND COLUMN_NAME LIKE 'payout%';
