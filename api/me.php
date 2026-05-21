<?php
// Returns the currently logged-in user's session info.
// Frontend calls this on app load to check if already logged in.
require_once '../cors_headers.php';
header('Content-Type: application/json');

if (session_status() === PHP_SESSION_NONE) session_start();

if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['authenticated' => false]);
    exit;
}

echo json_encode([
    'authenticated' => true,
    'user_id'       => (int) $_SESSION['user_id'],
    'name'          => $_SESSION['name']     ?? '',
    'org_id'        => (int) $_SESSION['org_id'],
    'org_name'      => $_SESSION['org_name'] ?? '',
    'role'          => $_SESSION['role']     ?? 'scorer'
]);
