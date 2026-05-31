<?php
// auth_middleware.php
// Include at the top of any API that requires authentication.
// Sets $currentUserId and $currentOrgId from session, or returns 401.

// Start the session using the MySQL-backed handler (see session_setup.php).
// This prevents shared-hosting file GC from other virtual hosts from
// expiring our sessions after 15-30 minutes.
require_once __DIR__ . '/session_setup.php'; // also sets $_sessionLifetime

// Refresh the cookie on every authenticated request so the 30-day
// clock resets from the last activity, not from initial login.
if (!empty($_SESSION['user_id'])) {
    setcookie(session_name(), session_id(), [
        'expires'  => time() + $_sessionLifetime,
        'path'     => '/',
        'secure'   => true,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
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
