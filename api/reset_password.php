<?php
// Public endpoint — no auth required.
// GET ?token=... → validates token (returns user name for display)
// POST {token, password} → sets new password and marks token used
require_once '../cors_headers.php';
header('Content-Type: application/json');
require_once __DIR__ . '/session_setup.php'; // db_connect included by session_setup

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $token = trim($_GET['token'] ?? '');
    if (!$token) {
        http_response_code(400);
        echo json_encode(['error' => 'Token required']);
        exit;
    }

    $stmt = $conn->prepare("
        SELECT u.name
          FROM password_reset_tokens t
          JOIN users u ON u.user_id = t.user_id
         WHERE t.token = ?
           AND t.used_at IS NULL
           AND t.expires_at > NOW()
    ");
    $stmt->bind_param('s', $token);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row) {
        http_response_code(404);
        echo json_encode(['valid' => false, 'error' => 'This reset link is invalid or has expired']);
        exit;
    }

    echo json_encode(['valid' => true, 'name' => $row['name']]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data     = json_decode(file_get_contents('php://input'), true);
    $token    = trim($data['token']    ?? '');
    $password = trim($data['password'] ?? '');

    if (!$token || !$password) {
        http_response_code(400);
        echo json_encode(['error' => 'Token and password are required']);
        exit;
    }

    if (strlen($password) < 8) {
        http_response_code(400);
        echo json_encode(['error' => 'Password must be at least 8 characters']);
        exit;
    }

    // Fetch and validate token
    $stmt = $conn->prepare("
        SELECT t.token_id, t.user_id
          FROM password_reset_tokens t
         WHERE t.token = ?
           AND t.used_at IS NULL
           AND t.expires_at > NOW()
    ");
    $stmt->bind_param('s', $token);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row) {
        http_response_code(404);
        echo json_encode(['error' => 'This reset link is invalid or has expired']);
        exit;
    }

    $conn->begin_transaction();
    try {
        // Update password
        $hash = password_hash($password, PASSWORD_BCRYPT);
        $stmt = $conn->prepare("UPDATE users SET password_hash = ? WHERE user_id = ?");
        $stmt->bind_param('si', $hash, $row['user_id']);
        $stmt->execute();
        $stmt->close();

        // Mark token as used
        $stmt = $conn->prepare("UPDATE password_reset_tokens SET used_at = NOW() WHERE token_id = ?");
        $stmt->bind_param('i', $row['token_id']);
        $stmt->execute();
        $stmt->close();

        $conn->commit();
        echo json_encode(['success' => true]);
    } catch (Exception $e) {
        $conn->rollback();
        http_response_code(500);
        echo json_encode(['error' => 'Password reset failed. Please try again.']);
    }
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
