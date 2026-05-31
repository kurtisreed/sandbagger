<?php
// session_setup.php
// Central session initializer — include via require_once before any session use.
// Centralizes the 30-day lifetime config so it's applied consistently everywhere,
// regardless of whether a file includes auth_middleware or starts a session directly.

if (session_status() !== PHP_SESSION_NONE) {
    return; // Already started — nothing to do.
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
