-- 013: Tournament-level payouts
--
-- Money for a Ryder Cup weekend is agreed once for the whole trip, not
-- per round, so the figures belong on the tournament:
--
--   buy_in                  what each player puts in
--   payout_per_match        what a won match is worth
--   skins_payout_per_round  the skins pot for each round
--
-- The skins figure cascades into rounds.skins_total, which is what
-- get_individual_skins.php already reads, so the payout column on the skins
-- table keeps working with no change to the read path. The per-round input
-- that briefly existed on the Round Information page is removed - the
-- tournament is now the only place this is set.
--
-- rounds.skins_total is widened from INT to match, so cascading a value like
-- 412.50 does not silently lose the cents.
--
-- Portable across MySQL 8.x (production) and MariaDB 10.x (local dev): the
-- MariaDB-only "ADD COLUMN IF NOT EXISTS" is avoided in favour of
-- information_schema guards. In phpMyAdmin, select the database first - the
-- guards call DATABASE().
--
-- Safe to run more than once.


-- ---------------------------------------------------------------------------
-- STEP 1 - The three payout columns. NULL means "not set", which reads as $0
-- rather than as a figure anyone agreed to.
-- ---------------------------------------------------------------------------
SET @cols := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = 'tournaments'
     AND COLUMN_NAME IN ('buy_in','payout_per_match','skins_payout_per_round')
);
SET @ddl := IF(@cols = 0,
  'ALTER TABLE tournaments
     ADD COLUMN buy_in                 DECIMAL(8,2) NULL DEFAULT NULL AFTER handicap_mode,
     ADD COLUMN payout_per_match       DECIMAL(8,2) NULL DEFAULT NULL AFTER buy_in,
     ADD COLUMN skins_payout_per_round DECIMAL(8,2) NULL DEFAULT NULL AFTER payout_per_match',
  'DO 0'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ---------------------------------------------------------------------------
-- STEP 2 - Widen rounds.skins_total so the cascade is lossless. Existing
-- whole-dollar values are unaffected (450 becomes 450.00).
-- ---------------------------------------------------------------------------
SET @dtype := (
  SELECT DATA_TYPE FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = 'rounds'
     AND COLUMN_NAME  = 'skins_total'
);
SET @ddl := IF(@dtype = 'int',
  'ALTER TABLE rounds MODIFY COLUMN skins_total DECIMAL(8,2) NULL DEFAULT NULL',
  'DO 0'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ---------------------------------------------------------------------------
-- STEP 3 - Seed the tournament figure from any per-round values already set,
-- so nothing that was configured under the old per-round field is lost.
--
-- Big Cedar Lodge 2025 has four rounds storing 450; this lifts that to the
-- tournament so the new card opens showing 450 rather than blank. Only applied
-- where every non-null round in the tournament agrees, since a tournament with
-- differing per-round pots has no single correct answer - those are left for an
-- admin to set by hand.
--
-- Gated on the migration record so a re-run cannot overwrite a later edit.
-- ---------------------------------------------------------------------------
UPDATE tournaments t
SET t.skins_payout_per_round = (
      SELECT MIN(r.skins_total) FROM rounds r
       WHERE r.tournament_id = t.tournament_id AND r.skins_total IS NOT NULL
    )
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '013')
  AND t.skins_payout_per_round IS NULL
  AND EXISTS (
      SELECT 1 FROM rounds r
       WHERE r.tournament_id = t.tournament_id AND r.skins_total IS NOT NULL
  )
  AND (
      SELECT COUNT(DISTINCT r.skins_total) FROM rounds r
       WHERE r.tournament_id = t.tournament_id AND r.skins_total IS NOT NULL
  ) = 1;


INSERT IGNORE INTO schema_migrations (version, description) VALUES
  ('013', 'Tournament-level payouts (buy-in, per-match, skins per round)');


-- ---------------------------------------------------------------------------
-- STEP 4 - Confirm.
-- ---------------------------------------------------------------------------
-- SELECT tournament_id, name, buy_in, payout_per_match, skins_payout_per_round
-- FROM tournaments WHERE format_id = 3 ORDER BY start_date;
