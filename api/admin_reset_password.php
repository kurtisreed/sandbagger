<?php
// Admin endpoint — generates a password reset link for any org member.
// Returns the link so the admin can share it however they like.
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

if (!$userId) {
    http_response_code(400);
    echo json_encode(['error' => 'user_id required']);
    exit;
}

// Verify the target user belongs to the admin's org
$stmt = $conn->prepare("
    SELECT u.user_id, u.name, u.email
      FROM users u
      JOIN user_organizations uo ON uo.user_id = u.user_id
     WHERE u.user_id = ? AND uo.org_id = ?
");
$stmt->bind_param('ii', $userId, $currentOrgId);
$stmt->execute();
$user = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$user) {
    http_response_code(404);
    echo json_encode(['error' => 'User not found in your group']);
    exit;
}

// Expire any existing unused tokens for this user
$stmt = $conn->prepare("
    UPDATE password_reset_tokens
       SET expires_at = NOW()
     WHERE user_id = ? AND used_at IS NULL AND expires_at > NOW()
");
$stmt->bind_param('i', $userId);
$stmt->execute();
$stmt->close();

// Generate new token, 24-hour expiry for admin-generated links
$token     = bin2hex(random_bytes(32));
$expiresAt = date('Y-m-d H:i:s', strtotime('+24 hours'));

$stmt = $conn->prepare("
    INSERT INTO password_reset_tokens (user_id, token, expires_at)
    VALUES (?, ?, ?)
");
$stmt->bind_param('iss', $userId, $token, $expiresAt);
$stmt->execute();
$stmt->close();

$protocol  = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host      = $_SERVER['HTTP_HOST'] ?? 'sandbaggerscoring.com';
$resetLink = "{$protocol}://{$host}/?reset={$token}";

echo json_encode([
    'success'    => true,
    'reset_link' => $resetLink,
    'name'       => $user['name'],
    'email'      => $user['email'],
    'expires_in' => '24 hours'
]);
