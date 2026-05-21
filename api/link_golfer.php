<?php
// Links the logged-in user to a golfer record in their org.
// Called once when a user selects their golfer from the picker.
require_once '../cors_headers.php';
header('Content-Type: application/json');

if (session_status() === PHP_SESSION_NONE) session_start();
require_once 'auth_middleware.php';
require_once 'db_connect.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$data     = json_decode(file_get_contents('php://input'), true);
$golferId = (int) ($data['golfer_id'] ?? 0);

if (!$golferId) {
    http_response_code(400);
    echo json_encode(['error' => 'golfer_id required']);
    exit;
}

// Verify the golfer belongs to this org and is not already claimed by another user
$stmt = $conn->prepare("
    SELECT golfer_id, user_id FROM golfers
    WHERE golfer_id = ? AND org_id = ?
");
$stmt->bind_param('ii', $golferId, $currentOrgId);
$stmt->execute();
$result = $stmt->get_result();
$golfer = $result->fetch_assoc();
$stmt->close();

if (!$golfer) {
    http_response_code(404);
    echo json_encode(['error' => 'Golfer not found in your group']);
    exit;
}

if ($golfer['user_id'] && $golfer['user_id'] != $currentUserId) {
    http_response_code(409);
    echo json_encode(['error' => 'That golfer is already linked to another account']);
    exit;
}

// Save the link
$stmt = $conn->prepare("UPDATE golfers SET user_id = ? WHERE golfer_id = ?");
$stmt->bind_param('ii', $currentUserId, $golferId);
$stmt->execute();
$stmt->close();

$_SESSION['golfer_id'] = $golferId;

echo json_encode(['success' => true, 'golfer_id' => $golferId]);
