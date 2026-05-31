<?php
// session_setup.php
// Central session initializer — include this (via require_once) anywhere
// a PHP session is needed.
//
// WHY: On shared hosting (NewFold/Bluehost), all sites share the same
// /tmp/ session-file directory. When any OTHER site triggers PHP's session
// garbage collector, it uses THAT site's gc_maxlifetime (often 1440 s = 24 min)
// and deletes every session file older than that — including ours — regardless
// of our own .user.ini settings.
//
// FIX: Store sessions in MySQL. Database rows are invisible to other sites'
// GC. We control expiry entirely through expires_at in the sessions table.
//
// This file is safe to require_once from multiple places in one request.
// If the session is already active it exits immediately.

if (session_status() !== PHP_SESSION_NONE) {
    return; // Already started — nothing to do.
}

require_once __DIR__ . '/db_connect.php'; // provides $conn (mysqli)

class DbSessionHandler implements SessionHandlerInterface
{
    private mysqli $conn;

    public function __construct(mysqli $conn)
    {
        $this->conn = $conn;
    }

    public function open(string $savePath, string $sessionName): bool
    {
        return true;
    }

    public function close(): bool
    {
        return true;
    }

    public function read(string $id): string|false
    {
        $now  = time();
        $stmt = $this->conn->prepare(
            "SELECT data FROM sessions WHERE session_id = ? AND expires_at > ?"
        );
        $stmt->bind_param('si', $id, $now);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ? $row['data'] : '';
    }

    public function write(string $id, string $data): bool
    {
        // Use the gc_maxlifetime we set via ini_set below.
        $exp  = time() + (int) ini_get('session.gc_maxlifetime');
        $stmt = $this->conn->prepare(
            "INSERT INTO sessions (session_id, data, expires_at)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE data = VALUES(data), expires_at = VALUES(expires_at)"
        );
        $stmt->bind_param('ssi', $id, $data, $exp);
        $ok = $stmt->execute();
        $stmt->close();
        return $ok;
    }

    public function destroy(string $id): bool
    {
        $stmt = $this->conn->prepare(
            "DELETE FROM sessions WHERE session_id = ?"
        );
        $stmt->bind_param('s', $id);
        $ok = $stmt->execute();
        $stmt->close();
        return $ok;
    }

    public function gc(int $maxLifetime): int|false
    {
        $now  = time();
        $stmt = $this->conn->prepare(
            "DELETE FROM sessions WHERE expires_at < ?"
        );
        $stmt->bind_param('i', $now);
        $stmt->execute();
        $count = $stmt->affected_rows;
        $stmt->close();
        return $count >= 0 ? $count : false;
    }
}

// 30-day lifetime — rolling window reset on every authenticated request
// (auth_middleware.php refreshes the cookie and the DB row on each hit).
$_sessionLifetime = 60 * 60 * 24 * 30;

ini_set('session.gc_maxlifetime', $_sessionLifetime);
ini_set('session.cookie_lifetime', $_sessionLifetime);
session_set_cookie_params([
    'lifetime' => $_sessionLifetime,
    'path'     => '/',
    'secure'   => true,
    'httponly' => true,
    'samesite' => 'Lax',
]);

session_set_save_handler(new DbSessionHandler($conn), true);
session_start();
