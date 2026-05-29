<?php
// Admin endpoint — update a group member's name and/or email.
require_once '../cors_headers.php';
header('Content-Type: application/json');
if (session_status() === PHP_SESSION_NONE) session_start();
require_once 'auth_middleware.php';
requireAdmin();
require_once 'db_connect.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$data   = json_decode(file_get_contents('php://input'), true);
$userId = (int) ($data['user_id'] ?? 0);
$name   = trim($data['name']    ?? '');
$email  = trim($data['email']   ?? '');

if (!$userId || !$name || !$email) {
    http_response_code(400);
    echo json_encode(['error' => 'user_id, name, and email are required']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid email address']);
    exit;
}

// Verify target user belongs to the admin's org
$stmt = $conn->prepare("
    SELECT u.user_id FROM users u
      JOIN user_organizations uo ON uo.user_id = u.user_id
     WHERE u.user_id = ? AND uo.org_id = ?
");
$stmt->bind_param('ii', $userId, $currentOrgId);
$stmt->execute();
$stmt->store_result();
if ($stmt->num_rows === 0) {
    http_response_code(404);
    echo json_encode(['error' => 'User not found in your group']);
    exit;
}
$stmt->close();

// Check email not already taken by a different user
$stmt = $conn->prepare("SELECT user_id FROM users WHERE email = ? AND user_id != ?");
$stmt->bind_param('si', $email, $userId);
$stmt->execute();
$stmt->store_result();
if ($stmt->num_rows > 0) {
    http_response_code(409);
    echo json_encode(['error' => 'That email address is already in use']);
    exit;
}
$stmt->close();

$stmt = $conn->prepare("UPDATE users SET name = ?, email = ? WHERE user_id = ?");
$stmt->bind_param('ssi', $name, $email, $userId);
$stmt->execute();
$affected = $stmt->affected_rows;
$stmt->close();

echo json_encode(['success' => true, 'affected_rows' => $affected]);
