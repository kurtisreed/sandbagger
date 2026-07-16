<?php
// Admin endpoint — promote a group member to admin or demote back to scorer.
// Guardrails: an admin can't change their own role (avoids locking themselves
// out), and the last remaining admin can't be demoted.
require_once '../cors_headers.php';
header('Content-Type: application/json');
require_once 'auth_middleware.php'; // includes session_setup.php + db_connect.php
requireAdmin();
require_once 'db_connect.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$data   = json_decode(file_get_contents('php://input'), true);
$userId = (int) ($data['user_id'] ?? 0);
$role   = $data['role'] ?? '';

if (!$userId || !in_array($role, ['admin', 'scorer'], true)) {
    http_response_code(400);
    echo json_encode(['error' => 'user_id and a valid role (admin or scorer) are required']);
    exit;
}

// An admin can't change their own role from here
if ($userId === $currentUserId) {
    http_response_code(400);
    echo json_encode(['error' => "You can't change your own role"]);
    exit;
}

// Verify the target user belongs to the admin's org
$stmt = $conn->prepare("SELECT role FROM user_organizations WHERE user_id = ? AND org_id = ?");
$stmt->bind_param('ii', $userId, $currentOrgId);
$stmt->execute();
$membership = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$membership) {
    http_response_code(404);
    echo json_encode(['error' => 'User not found in your group']);
    exit;
}

// Don't demote the last admin in the group
if ($membership['role'] === 'admin' && $role !== 'admin') {
    $stmt = $conn->prepare("SELECT COUNT(*) AS n FROM user_organizations WHERE org_id = ? AND role = 'admin'");
    $stmt->bind_param('i', $currentOrgId);
    $stmt->execute();
    $adminCount = (int) $stmt->get_result()->fetch_assoc()['n'];
    $stmt->close();
    if ($adminCount <= 1) {
        http_response_code(409);
        echo json_encode(['error' => 'Your group needs at least one administrator']);
        exit;
    }
}

$stmt = $conn->prepare("UPDATE user_organizations SET role = ? WHERE user_id = ? AND org_id = ?");
$stmt->bind_param('sii', $role, $userId, $currentOrgId);
$stmt->execute();
$stmt->close();

echo json_encode(['success' => true, 'role' => $role]);
