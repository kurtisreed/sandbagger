<?php
require_once '../cors_headers.php';
header('Content-Type: application/json');

require_once __DIR__ . '/session_setup.php'; // db_connect already included by session_setup

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);

$firstName = trim($data['first_name'] ?? '');
$lastName  = trim($data['last_name']  ?? '');
$email     = trim($data['email']      ?? '');
$password  = trim($data['password']   ?? '');
$groupName = trim($data['group_name'] ?? '');
$name      = trim("$firstName $lastName");

// Basic validation
if (!$firstName || !$lastName || !$email || !$password || !$groupName) {
    http_response_code(400);
    echo json_encode(['error' => 'First name, last name, email, password, and group name are required']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid email address']);
    exit;
}

if (strlen($password) < 8) {
    http_response_code(400);
    echo json_encode(['error' => 'Password must be at least 8 characters']);
    exit;
}

// Check email not already taken
$stmt = $conn->prepare("SELECT user_id FROM users WHERE email = ?");
$stmt->bind_param('s', $email);
$stmt->execute();
$stmt->store_result();
if ($stmt->num_rows > 0) {
    http_response_code(409);
    echo json_encode(['error' => 'An account with that email already exists']);
    exit;
}
$stmt->close();

// Generate a URL-friendly slug from group name
function makeSlug($name) {
    $slug = strtolower(trim($name));
    $slug = preg_replace('/[^a-z0-9]+/', '-', $slug);
    $slug = trim($slug, '-');
    return $slug;
}

$baseSlug = makeSlug($groupName);
$slug = $baseSlug;
$suffix = 1;

// Ensure slug is unique
while (true) {
    $stmt = $conn->prepare("SELECT org_id FROM organizations WHERE slug = ?");
    $stmt->bind_param('s', $slug);
    $stmt->execute();
    $stmt->store_result();
    $exists = $stmt->num_rows > 0;
    $stmt->close();
    if (!$exists) break;
    $slug = $baseSlug . '-' . $suffix++;
}

// Begin transaction
$conn->begin_transaction();

try {
    // Create organization
    $stmt = $conn->prepare("INSERT INTO organizations (name, slug) VALUES (?, ?)");
    $stmt->bind_param('ss', $groupName, $slug);
    $stmt->execute();
    $orgId = $conn->insert_id;
    $stmt->close();

    // Create user
    $passwordHash = password_hash($password, PASSWORD_BCRYPT);
    $stmt = $conn->prepare("INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)");
    $stmt->bind_param('sss', $email, $passwordHash, $name);
    $stmt->execute();
    $userId = $conn->insert_id;
    $stmt->close();

    // Link user to org as admin
    $role = 'admin';
    $stmt = $conn->prepare("INSERT INTO user_organizations (user_id, org_id, role) VALUES (?, ?, ?)");
    $stmt->bind_param('iis', $userId, $orgId, $role);
    $stmt->execute();
    $stmt->close();

    // Create a golfer record for the admin (they're a player too)
    $handicap = 0.0;
    $stmt = $conn->prepare("
        INSERT INTO golfers (first_name, last_name, handicap, org_id, user_id, active)
        VALUES (?, ?, ?, ?, ?, 1)
    ");
    $stmt->bind_param('ssdii', $firstName, $lastName, $handicap, $orgId, $userId);
    $stmt->execute();
    $golferId = $conn->insert_id;
    $stmt->close();

    $conn->commit();

    // Log the user in immediately
    $_SESSION['user_id']   = $userId;
    $_SESSION['org_id']    = $orgId;
    $_SESSION['role']      = 'admin';
    $_SESSION['name']      = $name;
    $_SESSION['org_name']  = $groupName;
    $_SESSION['golfer_id'] = $golferId;

    session_regenerate_id(true);

    echo json_encode([
        'success'  => true,
        'user_id'  => $userId,
        'org_id'   => $orgId,
        'org_name' => $groupName,
        'role'     => 'admin',
        'name'     => $name,
        'golfer'   => [
            'golfer_id'  => $golferId,
            'first_name' => $firstName,
            'last_name'  => $lastName,
            'handicap'   => $handicap,
            'role'       => null
        ]
    ]);

} catch (Exception $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode(['error' => 'Registration failed: ' . $e->getMessage()]);
}
