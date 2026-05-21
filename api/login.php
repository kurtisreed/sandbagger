<?php
require_once '../cors_headers.php';
header('Content-Type: application/json');

if (session_status() === PHP_SESSION_NONE) session_start();

require_once 'db_connect.php';
require_once 'auth_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$data     = json_decode(file_get_contents('php://input'), true);
$email    = trim($data['email']    ?? '');
$password = trim($data['password'] ?? '');

if (!$email || !$password) {
    http_response_code(400);
    echo json_encode(['error' => 'Email and password are required']);
    exit;
}

// Fetch user
$stmt = $conn->prepare("SELECT user_id, password_hash, name FROM users WHERE email = ?");
$stmt->bind_param('s', $email);
$stmt->execute();
$result = $stmt->get_result();
$user = $result->fetch_assoc();
$stmt->close();

if (!$user || !password_verify($password, $user['password_hash'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid email or password']);
    exit;
}

// Fetch org memberships
$stmt = $conn->prepare("
    SELECT uo.org_id, uo.role, o.name AS org_name, o.slug
    FROM user_organizations uo
    JOIN organizations o ON o.org_id = uo.org_id
    WHERE uo.user_id = ?
");
$stmt->bind_param('i', $user['user_id']);
$stmt->execute();
$result = $stmt->get_result();
$orgs = $result->fetch_all(MYSQLI_ASSOC);
$stmt->close();

if (empty($orgs)) {
    http_response_code(403);
    echo json_encode(['error' => 'You are not a member of any group']);
    exit;
}

// If user belongs to exactly one org, log them in directly
// If multiple orgs, return the list so the frontend can ask which one
$userId = (int) $user['user_id'];

if (count($orgs) === 1) {
    $org = $orgs[0];
    $orgId = (int) $org['org_id'];

    $_SESSION['user_id']  = $userId;
    $_SESSION['org_id']   = $orgId;
    $_SESSION['role']     = $org['role'];
    $_SESSION['name']     = $user['name'];
    $_SESSION['org_name'] = $org['org_name'];

    $golfer = getLinkedGolfer($conn, $userId, $orgId);
    if ($golfer) {
        $_SESSION['golfer_id'] = (int) $golfer['golfer_id'];
    }

    echo json_encode([
        'success'          => true,
        'user_id'          => $userId,
        'name'             => $user['name'],
        'org_id'           => $orgId,
        'org_name'         => $org['org_name'],
        'role'             => $org['role'],
        'needs_org_select' => false,
        'golfer'           => $golfer
    ]);
} else {
    // Multiple orgs — frontend needs to show an org picker
    // Store user_id temporarily so org selection can complete the login
    $_SESSION['pending_user_id'] = $userId;
    $_SESSION['pending_name']    = $user['name'];

    echo json_encode([
        'success'          => true,
        'needs_org_select' => true,
        'name'             => $user['name'],
        'orgs'             => $orgs
    ]);
}
