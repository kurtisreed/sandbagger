<?php
// auth_middleware.php
// Include at the top of any API that requires authentication.
// Sets $currentUserId and $currentOrgId from session, or returns 401.

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

if (empty($_SESSION['user_id']) || empty($_SESSION['org_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

$currentUserId = (int) $_SESSION['user_id'];
$currentOrgId  = (int) $_SESSION['org_id'];
$currentRole   = $_SESSION['role'] ?? 'scorer';

// Call this at the top of any admin-only endpoint
function requireAdmin() {
    global $currentRole;
    if ($currentRole !== 'admin') {
        http_response_code(403);
        echo json_encode(['error' => 'Admin access required']);
        exit;
    }
}
