<?php
// Minimal auth guard for legacy root-level PHP endpoints.
// Included at the top of each file to block unauthenticated access.
// These files predate the /api/ directory and lack org_id scoping —
// the guard is a stop-gap until they are migrated or replaced.

if (session_status() === PHP_SESSION_NONE) session_start();

if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Not authenticated']);
    exit;
}

// Convenience variables matching auth_middleware.php
$currentUserId = (int) $_SESSION['user_id'];
$currentOrgId  = (int) ($_SESSION['org_id'] ?? 0);
$currentRole   = $_SESSION['role'] ?? 'scorer';

function requireAdminLegacy() {
    global $currentRole;
    if ($currentRole !== 'admin') {
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Admin access required']);
        exit;
    }
}
