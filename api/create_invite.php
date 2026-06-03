<?php
// Generates or returns the org's permanent invite code.
// Codes never expire. Regenerating deletes all previous codes for this org.
require_once '../cors_headers.php';
header('Content-Type: application/json');

require_once 'auth_middleware.php';
requireAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST' && $_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$regenerate = !empty($_GET['regenerate']) || !empty($_POST['regenerate']);

// Return existing code unless admin is forcing a regeneration
if (!$regenerate) {
    $stmt = $conn->prepare("
        SELECT code FROM org_invites
        WHERE org_id = ?
        ORDER BY created_at DESC LIMIT 1
    ");
    $stmt->bind_param('i', $currentOrgId);
    $stmt->execute();
    $existing = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if ($existing) {
        echo json_encode(['success' => true, 'code' => $existing['code']]);
        exit;
    }
}

// Generate a new unique 8-character code
function generateCode($conn) {
    do {
        $code  = strtoupper(substr(bin2hex(random_bytes(5)), 0, 8));
        $stmt  = $conn->prepare("SELECT invite_id FROM org_invites WHERE code = ?");
        $stmt->bind_param('s', $code);
        $stmt->execute();
        $stmt->store_result();
        $exists = $stmt->num_rows > 0;
        $stmt->close();
    } while ($exists);
    return $code;
}

// Delete all previous codes for this org (deprecate old ones)
$stmt = $conn->prepare("DELETE FROM org_invites WHERE org_id = ?");
$stmt->bind_param('i', $currentOrgId);
$stmt->execute();
$stmt->close();

$code = generateCode($conn);

// Insert with no expiry (NULL = permanent)
$stmt = $conn->prepare("
    INSERT INTO org_invites (org_id, code, created_by, expires_at)
    VALUES (?, ?, ?, NULL)
");
$stmt->bind_param('isi', $currentOrgId, $code, $currentUserId);
$stmt->execute();
$stmt->close();

echo json_encode(['success' => true, 'code' => $code]);
