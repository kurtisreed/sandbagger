-- Migration 007: MySQL-backed PHP sessions
-- Run once on both local (XAMPP) and production (sandbaggerscoring.com).
--
-- WHY: On shared hosting the PHP session save path (/tmp or similar) is
-- shared across all virtual hosts on the server. Any other site can trigger
-- session GC with its own shorter gc_maxlifetime and delete Sandbagger's
-- active session files — causing the 15-30 minute "session expired" bug.
--
-- FIX: Storing sessions in MySQL means only our own code can expire them.
-- The sessions table is scoped entirely to this database.

CREATE TABLE IF NOT EXISTS sessions (
    session_id  VARCHAR(128)  NOT NULL,
    data        MEDIUMTEXT    NOT NULL,
    expires_at  INT UNSIGNED  NOT NULL,
    PRIMARY KEY (session_id),
    KEY idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
