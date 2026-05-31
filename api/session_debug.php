<?php
// session_debug.php — TEMPORARY diagnostic tool.
// DELETE THIS FILE after troubleshooting is complete.
// Shows what PHP is actually using for session config on this server.
require_once '../cors_headers.php';
header('Content-Type: application/json');
require_once 'session_setup.php';

echo json_encode([
    'php_version'           => PHP_VERSION,
    'session_status'        => session_status(), // 2 = active
    'session_id'            => session_id(),
    'session_name'          => session_name(),
    'gc_maxlifetime'        => (int) ini_get('session.gc_maxlifetime'),
    'cookie_lifetime'       => (int) ini_get('session.cookie_lifetime'),
    'save_handler'          => ini_get('session.save_handler'),
    'save_path'             => ini_get('session.save_path'),
    'cookie_secure'         => ini_get('session.cookie_secure'),
    'cookie_httponly'       => ini_get('session.cookie_httponly'),
    'cookie_samesite'       => ini_get('session.cookie_samesite'),
    'user_ini_filename'     => ini_get('user_ini.filename'),
    'session_data'          => [
        'user_id'  => $_SESSION['user_id']  ?? null,
        'org_id'   => $_SESSION['org_id']   ?? null,
        'role'     => $_SESSION['role']      ?? null,
    ],
    'logged_in'             => !empty($_SESSION['user_id']),
    'home_dir'              => getenv('HOME') ?: posix_getpwuid(posix_getuid())['dir'] ?? 'unknown',
    'document_root'         => $_SERVER['DOCUMENT_ROOT'] ?? 'unknown',
    'script_filename'       => __FILE__,
    'server_time'           => date('Y-m-d H:i:s'),
    'server_timezone'       => date_default_timezone_get(),
], JSON_PRETTY_PRINT);
