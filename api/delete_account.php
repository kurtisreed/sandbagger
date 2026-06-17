<?php
// delete_account.php
// Permanently deletes the *currently logged-in user's own* account.
//
// Personal login data (email, password, name) is hard-deleted from `users`.
// The user's golfer profiles are anonymized and disassociated (user_id → NULL)
// rather than deleted, so the scores they recorded in shared group tournaments
// stay intact for everyone else's leaderboards. This matches the public
// deletion policy at /deleteaccount.html.
//
// Unlike delete_golfer.php (admin-only member removal), this acts on the
// session's own user and requires no admin role.

require_once '../cors_headers.php';
header('Content-Type: application/json');
require_once '../db_connect.php';
require_once __DIR__ . '/auth_middleware.php'; // sets $currentUserId, starts session

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$userId = $currentUserId;

$conn->begin_transaction();
try {
    // Invites this user accepted: keep the invite row but drop the personal link.
    $stmt = $conn->prepare("UPDATE org_invites SET used_by = NULL WHERE used_by = ?");
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $stmt->close();

    // Invites this user created (created_by is NOT NULL, so remove the rows).
    $stmt = $conn->prepare("DELETE FROM org_invites WHERE created_by = ?");
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $stmt->close();

    // Anonymize + disassociate the user's golfer profiles. golfer_id is kept so
    // hole_scores, tournament_golfers, etc. remain valid for shared history.
    $stmt = $conn->prepare(
        "UPDATE golfers
         SET first_name = 'Former', last_name = 'Member',
             handicap = NULL, ghin_number = NULL, email = NULL,
             active = 0, user_id = NULL
         WHERE user_id = ?"
    );
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $stmt->close();

    // Transient + membership records tied to the login.
    $stmt = $conn->prepare("DELETE FROM password_reset_tokens WHERE user_id = ?");
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $stmt->close();

    $stmt = $conn->prepare("DELETE FROM user_organizations WHERE user_id = ?");
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $stmt->close();

    // Permanently delete the login itself (email + password hash + name).
    $stmt = $conn->prepare("DELETE FROM users WHERE user_id = ?");
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $stmt->close();

    $conn->commit();
} catch (Exception $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode(['error' => 'Could not delete account']);
    exit;
}

// Fully sign the user out by destroying the session.
$_SESSION = [];
if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000,
        $params['path'], $params['domain'], $params['secure'], $params['httponly']);
}
session_destroy();

echo json_encode(['success' => true]);
