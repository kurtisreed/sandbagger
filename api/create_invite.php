<?php
// Generates an invite code for the admin's org.
// Returns the existing active code if one exists, or creates a new one.
require_once '../cors_headers.php';
header('Content-Type: application/json');

if (session_status() === PHP_SESSION_NONE) session_start();
require_once 'auth_middleware.php';
requireAdmin();
require_once 'db_connect.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST' && $_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Return existing active invite if one exists
$stmt = $conn->prepare("
    SELECT code FROM org_invites
    WHERE org_id = ? AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY created_at DESC LIMIT 1
");
$stmt->bind_param('i', $currentOrgId);
$stmt->execute();
$result = $stmt->get_result();
$existing = $result->fetch_assoc();
$stmt->close();

if ($existing) {
    echo json_encode(['success' => true, 'code' => $existing['code']]);
    exit;
}

// Generate a new unique 8-character code
function generateCode($conn) {
    do {
        $code = strtoupper(substr(bin2hex(random_bytes(5)), 0, 8));
        $stmt = $conn->prepare("SELECT invite_id FROM org_invites WHERE code = ?");
        $stmt->bind_param('s', $code);
        $stmt->execute();
        $stmt->store_result();
        $exists = $stmt->num_rows > 0;
        $stmt->close();
    } while ($exists);
    return $code;
}

$code = generateCode($conn);

$stmt = $conn->prepare("INSERT INTO org_invites (org_id, code, created_by) VALUES (?, ?, ?)");
$stmt->bind_param('isi', $currentOrgId, $code, $currentUserId);
$stmt->execute();
$stmt->close();

echo json_encode(['success' => true, 'code' => $code]);
