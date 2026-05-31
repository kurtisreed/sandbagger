<?php
// auth_middleware.php
// Include at the top of any API that requires authentication.
// Sets $currentUserId and $currentOrgId from session, or returns 401.

// Set long session lifetime before starting the session.
// Belt-and-suspenders alongside .user.ini — some shared hosts apply
// ini_set correctly even when .user.ini isn't picked up.
$_sessionLifetime = 60 * 60 * 24 * 30; // 30 days
ini_set('session.gc_maxlifetime', $_sessionLifetime);
ini_set('session.cookie_lifetime', $_sessionLifetime);
session_set_cookie_params([
    'lifetime' => $_sessionLifetime,
    'path'     => '/',
    'secure'   => true,
    'httponly' => true,
    'samesite' => 'Lax',
]);

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

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
