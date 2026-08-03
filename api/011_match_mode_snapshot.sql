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
-- Safe to run more than once.


-- ---------------------------------------------------------------------------
-- STEP 1 - Schema. NULL until the match is finalized.
-- ---------------------------------------------------------------------------
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS handicap_mode_at_finalize
    ENUM('full','match_relative') NULL DEFAULT NULL
    AFTER finalized;


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
