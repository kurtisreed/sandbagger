<?php
require_once '../cors_headers.php';
header('Content-Type: application/json');
require_once '../db_connect.php';
require_once __DIR__ . '/auth_middleware.php';
requireAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  echo json_encode(['error' => 'Method not allowed']);
  exit;
}

$data = json_decode(file_get_contents('php://input'), true);
$golfer_id = intval($data['golfer_id'] ?? 0);

if (!$golfer_id) {
  http_response_code(400);
  echo json_encode(['error' => 'Missing golfer_id']);
  exit;
}

// Soft-delete: set active = 0 to preserve scoring history (must belong to this org)
$stmt = $conn->prepare("UPDATE golfers SET active = 0 WHERE golfer_id = ? AND org_id = ?");
$stmt->bind_param('ii', $golfer_id, $currentOrgId);
$stmt->execute();

if ($stmt->affected_rows > 0) {
  echo json_encode(['success' => true]);
} else {
  http_response_code(404);
  echo json_encode(['error' => 'Golfer not found']);
}
