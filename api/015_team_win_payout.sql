-- 015: Payout per player for winning the tournament
--
-- Completes the Ryder Cup payouts card. The three figures already stored cover
-- what a player pays in and what they earn during play; this is the prize for
-- ending up on the winning team:
--
--   buy_in                       what each player puts in
--   payout_per_player_per_match  what each player collects per match won
--   payout_per_player_team_win   what each player on the winning team collects
--   skins_payout_per_round       the skins pot for each round
--
-- Named per_player like its sibling, and for the same reason 014 existed: the
-- figure is what one player receives, not a purse divided among the team. A
-- name that leaves that ambiguous invites the settlement calculation to be
-- wrong by a factor of the team size.
--
-- Portable across MySQL 8.x (production) and MariaDB 10.x (local dev); the
-- MariaDB-only "ADD COLUMN IF NOT EXISTS" is avoided in favour of an
-- information_schema guard.
--
-- In phpMyAdmin, select the database first - the guard calls DATABASE().
-- Safe to run more than once.


-- ---------------------------------------------------------------------------
-- STEP 1 - The column. NULL means "not set", which reads as $0 rather than as
-- a figure anyone agreed to.
-- ---------------------------------------------------------------------------
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = 'tournaments'
     AND COLUMN_NAME  = 'payout_per_player_team_win'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE tournaments
     ADD COLUMN payout_per_player_team_win DECIMAL(8,2) NULL DEFAULT NULL
     AFTER payout_per_player_per_match',
  'DO 0'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;


INSERT IGNORE INTO schema_migrations (version, description) VALUES
  ('015', 'Payout per player for winning the tournament');


-- ---------------------------------------------------------------------------
-- STEP 2 - Confirm.
-- ---------------------------------------------------------------------------
-- SELECT COLUMN_NAME FROM information_schema.COLUMNS
--  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tournaments'
--    AND (COLUMN_NAME LIKE 'payout%' OR COLUMN_NAME IN ('buy_in','skins_payout_per_round'))
--  ORDER BY ORDINAL_POSITION;
