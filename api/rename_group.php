<?php
// Admin endpoint — rename the current org.
require_once '../cors_headers.php';
header('Content-Type: application/json');
if (session_status() === PHP_SESSION_NONE) session_start();
require_once 'auth_middleware.php';
requireAdmin();
require_once 'db_connect.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);
$name = trim($data['name'] ?? '');

if (!$name) {
    http_response_code(400);
    echo json_encode(['error' => 'Group name is required']);
    exit;
}

if (mb_strlen($name) > 100) {
    http_response_code(400);
    echo json_encode(['error' => 'Group name must be 100 characters or fewer']);
    exit;
}

$stmt = $conn->prepare("UPDATE organizations SET name = ? WHERE org_id = ?");
$stmt->bind_param('si', $name, $currentOrgId);
$stmt->execute();
$affected = $stmt->affected_rows;
$stmt->close();

// Update session so header bar and other UI reflects the new name immediately
$_SESSION['org_name'] = $name;

echo json_encode(['success' => true, 'name' => $name, 'affected_rows' => $affected]);
