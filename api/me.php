<?php
// Returns the currently logged-in user's session info.
// Frontend calls this on app load to check if already logged in.
require_once '../cors_headers.php';
header('Content-Type: application/json');

require_once __DIR__ . '/session_setup.php';

if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['authenticated' => false]);
    exit;
}

require_once 'db_connect.php';
require_once 'auth_helpers.php';

$userId = (int) $_SESSION['user_id'];
$orgId  = (int) $_SESSION['org_id'];

// Re-fetch golfer link in case it was just established
$golfer = getLinkedGolfer($conn, $userId, $orgId);
if ($golfer) {
    $_SESSION['golfer_id'] = (int) $golfer['golfer_id'];
}

echo json_encode([
    'authenticated' => true,
    'user_id'       => $userId,
    'name'          => $_SESSION['name']     ?? '',
    'org_id'        => $orgId,
    'org_name'      => $_SESSION['org_name'] ?? '',
    'role'          => $_SESSION['role']     ?? 'scorer',
    'golfer'        => $golfer
]);
