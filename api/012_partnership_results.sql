-- 012: Let partnership formats freeze their results too
--
-- Ryder Cup matches are team vs team, so a finished match records two rows in
-- match_results keyed by team_id. Guys Trip matches are two pairs drawn by
-- player_order with no team assignment at all, so there was no team_id to key
-- on and those results were never stored - they were re-derived from raw
-- scores on every page load.
--
-- That is why Arizona 2026's displayed results silently changed when the
-- handicap rule moved in May 2026: there was no record to contradict. It is
-- also why verify_scoring.php skips those matches; with nothing stored there is
-- nothing to verify, so a future change to the scoring maths would go
-- unnoticed for every partnership format.
--
-- Adding a nullable `side` alongside team_id lets both shapes live in one
-- table, so every reader keeps working unchanged:
--
--   team match         team_id = 12,   side = NULL
--   partnership match  team_id = NULL, side = 'A' / 'B'
--
-- The existing foreign key on team_id is kept. Foreign keys do not constrain
-- NULLs, so partnership rows pass without it needing to be dropped.
--
-- Portable across MySQL 8.x (production) and MariaDB 10.x (local dev).
-- In phpMyAdmin, select the database first - the guards call DATABASE().
-- Safe to run more than once.


-- ---------------------------------------------------------------------------
-- STEP 1 - team_id becomes nullable, so a row can describe a side instead.
-- ---------------------------------------------------------------------------
SET @is_nullable := (
  SELECT IS_NULLABLE FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = 'match_results'
     AND COLUMN_NAME  = 'team_id'
);
SET @ddl := IF(@is_nullable = 'NO',
  'ALTER TABLE match_results MODIFY COLUMN team_id INT(11) NULL',
  'DO 0'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ---------------------------------------------------------------------------
-- STEP 2 - the side identifier, for matches that have no teams.
-- ---------------------------------------------------------------------------
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = 'match_results'
     AND COLUMN_NAME  = 'side'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE match_results ADD COLUMN side VARCHAR(8) NULL DEFAULT NULL AFTER team_id',
  'DO 0'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ---------------------------------------------------------------------------
-- STEP 3 - one row per side per match.
--
-- The existing unique key on (match_id, team_id) cannot enforce this: a unique
-- index treats NULLs as distinct, so it would happily accept two rows for the
-- same partnership. A second key on (match_id, side) covers the other shape,
-- and is likewise inert for team rows where side is NULL.
-- ---------------------------------------------------------------------------
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = 'match_results'
     AND INDEX_NAME   = 'unique_match_side'
);
SET @ddl := IF(@idx_exists = 0,
  'ALTER TABLE match_results ADD UNIQUE KEY unique_match_side (match_id, side)',
  'DO 0'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;


INSERT IGNORE INTO schema_migrations (version, description) VALUES
  ('012', 'Allow partnership (non-team) match results to be stored');


-- ---------------------------------------------------------------------------
-- STEP 4 - No backfill.
--
-- Already-finalized partnership matches are deliberately left alone. Writing a
-- result for them now would mean scoring them today and calling the answer
-- history, which is the exact move this whole change exists to prevent. They
-- stay protected by their tournament's handicap_mode, and the audit continues
-- to report them as skipped. Matches finalized from here on will be frozen.
-- ---------------------------------------------------------------------------
-- SELECT match_id, team_id, side, points FROM match_results WHERE side IS NOT NULL;
