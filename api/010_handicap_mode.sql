-- 010: Versioned handicap scoring rules
--
-- WHY THIS EXISTS
-- ---------------
-- Until 2026-05-20 (commit 0a646be, "Apply match-relative handicap adjustment
-- to all scorecard views") every golfer played off their FULL playing handicap.
-- After that commit, handicaps are adjusted within each match so the lowest
-- player in that match plays off 0 and everyone else is reduced by the same
-- amount.
--
-- Both are legitimate rules. The bug was never the data — it was that the app
-- forgot which rule a completed match was played under, and re-scored history
-- with today's rule. Big Cedar Lodge 2025 finished 7.5-7.5 under the old rule
-- and must keep reading 7.5-7.5 forever.
--
-- This migration makes the scoring rule an explicit, stored property of the
-- tournament instead of an implicit property of whatever code is deployed.
--
--   'full'           - every golfer plays off their full playing handicap
--                      (the rule in force before 2026-05-20)
--   'match_relative' - lowest handicap in the match becomes 0
--                      (the rule in force from 2026-05-20 onward)
--
-- IMPORTANT: the backfill below is DATA-DRIVEN on purpose. It contains no
-- hardcoded tournament ids, because ids differ between the local copy and
-- production. It classifies each tournament by when it was actually scored.
--
-- Requires MariaDB 10.0.2+ for "IF NOT EXISTS" (HostGator shared hosting is
-- MariaDB). Confirm with:  SELECT VERSION();
-- Safe to run more than once.


-- ---------------------------------------------------------------------------
-- STEP 0 - PREVIEW (read-only). Run this FIRST on production and read the
-- output before running anything below. It shows how each tournament WOULD be
-- classified. Nothing is written.
-- ---------------------------------------------------------------------------
-- SELECT
--   t.tournament_id,
--   t.name,
--   t.start_date,
--   (SELECT MIN(mr.created_at)
--      FROM match_results mr
--      JOIN matches m  ON m.match_id = mr.match_id
--      JOIN rounds  r  ON r.round_id = m.round_id
--     WHERE r.tournament_id = t.tournament_id) AS first_scored_at,
--   CASE
--     WHEN (SELECT MIN(mr.created_at)
--             FROM match_results mr
--             JOIN matches m ON m.match_id = mr.match_id
--             JOIN rounds  r ON r.round_id = m.round_id
--            WHERE r.tournament_id = t.tournament_id) < '2026-05-20'
--       THEN 'full  (scored before rule change)'
--     WHEN t.start_date < '2026-05-20'
--       THEN 'full  (played before rule change)'
--     ELSE 'match_relative'
--   END AS proposed_mode
-- FROM tournaments t
-- ORDER BY t.start_date;


-- ---------------------------------------------------------------------------
-- STEP 1 - Migration tracking. Created FIRST, because the backfill in step 3
-- keys off it to decide whether it has already run. Also answers "is
-- production actually up to date?" without diffing schemas by hand.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     VARCHAR(20)  NOT NULL PRIMARY KEY,
  description VARCHAR(255) NOT NULL,
  applied_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- If 007/008/009 are already live on production, record them so the table
-- reflects reality. Harmless; INSERT IGNORE skips anything already present.
INSERT IGNORE INTO schema_migrations (version, description) VALUES
  ('007', 'Database-backed sessions'),
  ('008', 'GHIN handicap source columns'),
  ('009', 'Live spectator sharing');


-- ---------------------------------------------------------------------------
-- STEP 2 - Schema. New tournaments default to today's rule.
-- ---------------------------------------------------------------------------
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS handicap_mode
    ENUM('full','match_relative') NOT NULL DEFAULT 'match_relative'
    AFTER handicap_pct;


-- ---------------------------------------------------------------------------
-- STEP 3 - Backfill (runs exactly once). Anything that already existed when
-- this migration first ran was played under the old rule and is pinned to
-- 'full'.
--
-- Two signals, strongest first:
--   a) hard evidence - the tournament has stored match results written before
--      the rule change (match_results.created_at is the only timestamp we have)
--   b) fallback - the tournament was played before the rule change
--      (covers formats like Guys Trip that never store match_results)
--
-- The NOT EXISTS guard is what makes a re-run safe. Gating on the column's
-- current value would NOT work: it cannot distinguish "still at the default"
-- from "an admin deliberately chose match_relative", so a second run would
-- silently revert a hand correction. Gating on the migration record means the
-- backfill fires once, ever.
-- ---------------------------------------------------------------------------
UPDATE tournaments t
SET t.handicap_mode = 'full'
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '010')
  AND (
        (SELECT MIN(mr.created_at)
           FROM match_results mr
           JOIN matches m ON m.match_id = mr.match_id
           JOIN rounds  r ON r.round_id = m.round_id
          WHERE r.tournament_id = t.tournament_id) < '2026-05-20'
     OR t.start_date < '2026-05-20'
      );


-- Recorded LAST, so a failure above leaves the backfill eligible to retry.
INSERT IGNORE INTO schema_migrations (version, description) VALUES
  ('010', 'Versioned handicap scoring rules (tournaments.handicap_mode)');


-- ---------------------------------------------------------------------------
-- STEP 4 - Confirm. Expect every pre-2026-05-20 tournament to read 'full'.
-- Then run api/verify_scoring.php, which proves the stored results still
-- reproduce exactly under the mode each tournament was just assigned.
-- ---------------------------------------------------------------------------
-- SELECT tournament_id, name, start_date, handicap_mode
-- FROM tournaments ORDER BY start_date;
