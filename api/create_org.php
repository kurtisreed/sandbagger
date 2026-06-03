<?php
// Allows a logged-in user to create a brand-new organization and become its admin.
require_once '../cors_headers.php';
header('Content-Type: application/json');

require_once __DIR__ . '/session_setup.php';

if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Not logged in']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$data    = json_decode(file_get_contents('php://input'), true);
$orgName = trim($data['name'] ?? '');

if (!$orgName) {
    http_response_code(400);
    echo json_encode(['error' => 'Group name is required']);
    exit;
}

if (mb_strlen($orgName) > 100) {
    http_response_code(400);
    echo json_encode(['error' => 'Group name must be 100 characters or fewer']);
    exit;
}

$userId = (int) $_SESSION['user_id'];

// Fetch user's name for golfer record
$stmt = $conn->prepare("SELECT name FROM users WHERE user_id = ?");
$stmt->bind_param('i', $userId);
$stmt->execute();
$user = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$user) {
    http_response_code(404);
    echo json_encode(['error' => 'User not found']);
    exit;
}

$nameParts = explode(' ', $user['name'], 2);
$firstName = $nameParts[0] ?? '';
$lastName  = $nameParts[1] ?? '';

// Fetch current handicap from existing golfer record (any org)
$stmt = $conn->prepare("SELECT handicap FROM golfers WHERE user_id = ? ORDER BY golfer_id ASC LIMIT 1");
$stmt->bind_param('i', $userId);
$stmt->execute();
$existingGolfer = $stmt->get_result()->fetch_assoc();
$stmt->close();
$handicap = $existingGolfer ? (float) $existingGolfer['handicap'] : 0.0;

$conn->begin_transaction();
try {
    // 1. Create the organization
    $slug = preg_replace('/[^a-z0-9]+/', '-', strtolower($orgName));
    $slug = trim($slug, '-');
    // Ensure slug is unique by appending a short random suffix if needed
    $baseSlug = substr($slug, 0, 80);
    $slug = $baseSlug . '-' . substr(bin2hex(random_bytes(3)), 0, 6);

    $stmt = $conn->prepare("INSERT INTO organizations (name, slug) VALUES (?, ?)");
    $stmt->bind_param('ss', $orgName, $slug);
    $stmt->execute();
    $orgId = $conn->insert_id;
    $stmt->close();

    // 2. Add user as admin of the new org
    $role = 'admin';
    $stmt = $conn->prepare("INSERT INTO user_organizations (user_id, org_id, role) VALUES (?, ?, ?)");
    $stmt->bind_param('iis', $userId, $orgId, $role);
    $stmt->execute();
    $stmt->close();

    // 3. Create a golfer record for this user in the new org
    $stmt = $conn->prepare("
        INSERT INTO golfers (first_name, last_name, handicap, org_id, user_id, active)
        VALUES (?, ?, ?, ?, ?, 1)
    ");
    $stmt->bind_param('ssdii', $firstName, $lastName, $handicap, $orgId, $userId);
    $stmt->execute();
    $stmt->close();

    $conn->commit();

    echo json_encode([
        'success'  => true,
        'org_id'   => $orgId,
        'org_name' => $orgName,
    ]);
} catch (Exception $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode(['error' => 'Failed to create group: ' . $e->getMessage()]);
}
