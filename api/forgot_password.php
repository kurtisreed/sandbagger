<?php
// Public endpoint — no auth required.
// Accepts an email, generates a reset token, and sends a reset link.
// Always returns success to avoid leaking whether an email is registered.
require_once '../cors_headers.php';
header('Content-Type: application/json');
require_once __DIR__ . '/session_setup.php'; // db_connect included by session_setup

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$data  = json_decode(file_get_contents('php://input'), true);
$email = trim($data['email'] ?? '');

if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['error' => 'Valid email address required']);
    exit;
}

// Look up the user — silently succeed if not found (don't leak info)
$stmt = $conn->prepare("SELECT user_id, name FROM users WHERE email = ?");
$stmt->bind_param('s', $email);
$stmt->execute();
$user = $stmt->get_result()->fetch_assoc();
$stmt->close();

if ($user) {
    // Expire any existing unused tokens for this user
    $stmt = $conn->prepare("
        UPDATE password_reset_tokens
           SET expires_at = NOW()
         WHERE user_id = ? AND used_at IS NULL AND expires_at > NOW()
    ");
    $stmt->bind_param('i', $user['user_id']);
    $stmt->execute();
    $stmt->close();

    // Generate a secure 64-char token, expires in 1 hour
    $token     = bin2hex(random_bytes(32));
    $expiresAt = date('Y-m-d H:i:s', strtotime('+1 hour'));

    $stmt = $conn->prepare("
        INSERT INTO password_reset_tokens (user_id, token, expires_at)
        VALUES (?, ?, ?)
    ");
    $stmt->bind_param('iss', $user['user_id'], $token, $expiresAt);
    $stmt->execute();
    $stmt->close();

    // Build reset link
    $protocol  = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host      = $_SERVER['HTTP_HOST'] ?? 'sandbaggerscoring.com';
    $resetLink = "{$protocol}://{$host}/?reset={$token}";

    // Send email via PHP mail()
    $firstName = explode(' ', $user['name'])[0];
    $subject   = 'Sandbagger Scoring — Reset your password';
    $body      = "Hi {$firstName},\r\n\r\n"
               . "Someone requested a password reset for your Sandbagger Scoring account.\r\n\r\n"
               . "Click the link below to set a new password (link expires in 1 hour):\r\n\r\n"
               . "{$resetLink}\r\n\r\n"
               . "If you didn't request this, you can ignore this email — your password won't change.\r\n\r\n"
               . "— Sandbagger Scoring";

    $headers  = "From: noreply@sandbaggerscoring.com\r\n";
    $headers .= "Reply-To: noreply@sandbaggerscoring.com\r\n";
    $headers .= "X-Mailer: PHP/" . phpversion();

    mail($email, $subject, $body, $headers);
}

// Always return success — don't reveal whether the email exists
echo json_encode(['success' => true]);
