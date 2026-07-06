-- 008_ghin_columns.sql
-- Adds handicap source tracking for the optional GHIN sync feature.
-- ghin_number already exists on the golfers table.
ALTER TABLE golfers
  ADD COLUMN handicap_source ENUM('manual','ghin') NOT NULL DEFAULT 'manual' AFTER ghin_number,
  ADD COLUMN handicap_updated_at DATETIME NULL AFTER handicap_source;
