<?php
// Called after login when user belongs to multiple orgs.
// Client sends the chosen org_id and this completes the session.
require_once '../cors_headers.php';
header('Content-Type: application/json');

if (session_status() === PHP_SESSION_NONE) session_start();

require_once 'db_connect.php';
require_once 'auth_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

if (empty($_SESSION['pending_user_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'No pending login session']);
    exit;
}

$data  = json_decode(file_get_contents('php://input'), true);
$orgId = (int) ($data['org_id'] ?? 0);

if (!$orgId) {
    http_response_code(400);
    echo json_encode(['error' => 'org_id required']);
    exit;
}

$userId = (int) $_SESSION['pending_user_id'];

// Verify the user actually belongs to this org
$stmt = $conn->prepare("
    SELECT uo.role, o.name AS org_name
    FROM user_organizations uo
    JOIN organizations o ON o.org_id = uo.org_id
    WHERE uo.user_id = ? AND uo.org_id = ?
");
$stmt->bind_param('ii', $userId, $orgId);
$stmt->execute();
$result = $stmt->get_result();
$membership = $result->fetch_assoc();
$stmt->close();

if (!$membership) {
    http_response_code(403);
    echo json_encode(['error' => 'You are not a member of that group']);
    exit;
}

// Complete the login
unset($_SESSION['pending_user_id']);
unset($_SESSION['pending_name']);

$_SESSION['user_id']  = $userId;
$_SESSION['org_id']   = $orgId;
$_SESSION['role']     = $membership['role'];
$_SESSION['org_name'] = $membership['org_name'];

$golfer = getLinkedGolfer($conn, $userId, $orgId);
if ($golfer) {
    $_SESSION['golfer_id'] = (int) $golfer['golfer_id'];
}

echo json_encode([
    'success'  => true,
    'org_id'   => $orgId,
    'org_name' => $membership['org_name'],
    'role'     => $membership['role'],
    'golfer'   => $golfer
]);
