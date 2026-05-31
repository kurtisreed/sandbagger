<?php
// Self-service: any authenticated user can update their own name, email, and handicap.
require_once '../cors_headers.php';
header('Content-Type: application/json');
require_once 'auth_middleware.php'; // includes session_setup.php + db_connect.php
require_once 'db_connect.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$data      = json_decode(file_get_contents('php://input'), true);
$firstName = trim($data['first_name'] ?? '');
$lastName  = trim($data['last_name']  ?? '');
$email     = trim($data['email']      ?? '');
$handicap  = isset($data['handicap']) ? floatval($data['handicap']) : null;

if (!$firstName || !$lastName || !$email) {
    http_response_code(400);
    echo json_encode(['error' => 'First name, last name, and email are required']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid email address']);
    exit;
}

// Check email not taken by a different user
$stmt = $conn->prepare("SELECT user_id FROM users WHERE email = ? AND user_id != ?");
$stmt->bind_param('si', $email, $currentUserId);
$stmt->execute();
$stmt->store_result();
if ($stmt->num_rows > 0) {
    http_response_code(409);
    echo json_encode(['error' => 'That email address is already in use']);
    exit;
}
$stmt->close();

// Update users table
$fullName = trim("$firstName $lastName");
$stmt = $conn->prepare("UPDATE users SET name = ?, email = ? WHERE user_id = ?");
$stmt->bind_param('ssi', $fullName, $email, $currentUserId);
$stmt->execute();
$stmt->close();

// Update linked golfer (first_name, last_name, and optionally handicap)
if ($handicap !== null) {
    $stmt = $conn->prepare("
        UPDATE golfers SET first_name = ?, last_name = ?, handicap = ?
         WHERE user_id = ? AND org_id = ?
    ");
    $stmt->bind_param('ssdii', $firstName, $lastName, $handicap, $currentUserId, $currentOrgId);
} else {
    $stmt = $conn->prepare("
        UPDATE golfers SET first_name = ?, last_name = ?
         WHERE user_id = ? AND org_id = ?
    ");
    $stmt->bind_param('ssii', $firstName, $lastName, $currentUserId, $currentOrgId);
}
$stmt->execute();
$stmt->close();

// Refresh session
$_SESSION['name'] = $fullName;

echo json_encode([
    'success'    => true,
    'name'       => $fullName,
    'first_name' => $firstName,
    'last_name'  => $lastName,
    'email'      => $email,
    'handicap'   => $handicap,
]);
