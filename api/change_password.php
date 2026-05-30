<?php
// Self-service: any authenticated user can change their own password.
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

$data            = json_decode(file_get_contents('php://input'), true);
$currentPassword = trim($data['current_password'] ?? '');
$newPassword     = trim($data['new_password']     ?? '');

if (!$currentPassword || !$newPassword) {
    http_response_code(400);
    echo json_encode(['error' => 'Current and new password are required']);
    exit;
}

if (strlen($newPassword) < 8) {
    http_response_code(400);
    echo json_encode(['error' => 'New password must be at least 8 characters']);
    exit;
}

// Fetch current hash
$stmt = $conn->prepare("SELECT password_hash FROM users WHERE user_id = ?");
$stmt->bind_param('i', $currentUserId);
$stmt->execute();
$row = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$row || !password_verify($currentPassword, $row['password_hash'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Current password is incorrect']);
    exit;
}

$newHash = password_hash($newPassword, PASSWORD_BCRYPT);
$stmt = $conn->prepare("UPDATE users SET password_hash = ? WHERE user_id = ?");
$stmt->bind_param('si', $newHash, $currentUserId);
$stmt->execute();
$stmt->close();

echo json_encode(['success' => true]);
