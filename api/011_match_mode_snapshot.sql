-- 011: Snapshot the handicap rule onto the match at finalize
--
-- Migration 010 records the scoring rule per tournament. That is the right
-- place to CHOOSE the rule, but the wrong place to rely on when reading back a
-- finished match: a commissioner editing a tournament's mode would silently
-- re-score every match already completed under the old one - the exact class of
-- bug 010 exists to prevent, just moved one level up.
--
-- So the rule gets frozen onto the match when it is finalized, alongside the
-- inputs already frozen there (tournament_golfers.handicap_at_assignment and
-- handicap_pct_at_assignment). A finalized match then carries everything needed
-- to reproduce its own result, independent of any later edit.
--
-- Read order everywhere is:
--     COALESCE(matches.handicap_mode_at_finalize, tournaments.handicap_mode)
--
-- NULL means "not finalized yet" - such a match is still live and correctly
-- follows the tournament's current mode.
--
-- Run this AFTER 010; the backfill below reads the tournament modes 010 sets.
--
-- Portable across MySQL 8.x (production, Percona) and MariaDB 10.x (local dev).
-- In phpMyAdmin, select the database first - the guard calls DATABASE().
--
-- Safe to run more than once.


-- ---------------------------------------------------------------------------
-- STEP 1 - Schema. NULL until the match is finalized.
--
-- Guarded rather than "ADD COLUMN IF NOT EXISTS" so this runs on MySQL 8 as
-- well as MariaDB. 'DO 0' is a valid no-op statement on both engines.
-- ---------------------------------------------------------------------------
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = 'matches'
     AND COLUMN_NAME  = 'handicap_mode_at_finalize'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE matches ADD COLUMN handicap_mode_at_finalize ENUM(''full'',''match_relative'') NULL DEFAULT NULL AFTER finalized',
  'DO 0'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- ---------------------------------------------------------------------------
-- STEP 2 - Backfill matches finalized before this column existed. They were
-- played under whatever rule 010 assigned their tournament, which the audit in
-- verify_scoring.php has already confirmed reproduces their stored results.
--
-- Gated on the migration record so a re-run cannot overwrite a value that was
-- later corrected by hand, and restricted to NULL rows so it only ever fills
-- gaps.
-- ---------------------------------------------------------------------------
UPDATE matches m
JOIN rounds      r ON r.round_id      = m.round_id
JOIN tournaments t ON t.tournament_id = r.tournament_id
SET m.handicap_mode_at_finalize = t.handicap_mode
WHERE m.finalized = 1
  AND m.handicap_mode_at_finalize IS NULL
  AND NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '011');


INSERT IGNORE INTO schema_migrations (version, description) VALUES
  ('011', 'Snapshot handicap rule onto match at finalize');


-- ---------------------------------------------------------------------------
-- STEP 3 - Confirm, then re-run api/verify_scoring.php. Every finalized match
-- should carry a mode, and every stored result should still reproduce.
-- ---------------------------------------------------------------------------
-- SELECT m.finalized, m.handicap_mode_at_finalize, COUNT(*)
-- FROM matches m GROUP BY m.finalized, m.handicap_mode_at_finalize;
