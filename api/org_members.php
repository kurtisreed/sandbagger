<?php
// Admin endpoint — returns all users in the admin's org with their roles.
require_once '../cors_headers.php';
header('Content-Type: application/json');
if (session_status() === PHP_SESSION_NONE) session_start();
require_once 'auth_middleware.php';
requireAdmin();
require_once 'db_connect.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$stmt = $conn->prepare("
    SELECT u.user_id, u.name, u.email, uo.role
      FROM users u
      JOIN user_organizations uo ON uo.user_id = u.user_id
     WHERE uo.org_id = ?
     ORDER BY uo.role DESC, u.name ASC
");
$stmt->bind_param('i', $currentOrgId);
$stmt->execute();
$members = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
$stmt->close();

echo json_encode($members);
