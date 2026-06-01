<?php
// session_setup.php
// Central session + DB initializer — include via require_once before any session use.
// Provides both the $conn (mysqli) database connection and a started PHP session
// with a 30-day lifetime, so any file that calls require_once session_setup.php
// gets both without needing separate require_once 'db_connect.php' calls.

// Always provide $conn — other files depend on it regardless of session state.
require_once __DIR__ . '/db_connect.php';

if (session_status() !== PHP_SESSION_NONE) {
    return; // Session already active — db_connect included above, nothing more to do.
}

$_sessionLifetime = 60 * 60 * 24 * 30; // 30 days

ini_set('session.gc_maxlifetime', $_sessionLifetime);
ini_set('session.cookie_lifetime', $_sessionLifetime);
session_set_cookie_params([
    'lifetime' => $_sessionLifetime,
    'path'     => '/',
    'secure'   => true,
    'httponly' => true,
    'samesite' => 'Lax',
]);

session_start();
