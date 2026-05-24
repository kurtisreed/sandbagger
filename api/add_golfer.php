<?php
require_once '../cors_headers.php';
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header('Content-Type: application/json');

require_once 'db_connect.php';
require_once 'auth_middleware.php';
requireAdmin();

$first_name = $_POST['first_name'] ?? null;
$last_name = $_POST['last_name'] ?? null;
$handicap = $_POST['handicap'] ?? null;

if (!$first_name || !$last_name || $handicap === null) {
    echo json_encode(['success' => false, 'message' => 'Missing required fields']);
    exit;
}

// Insert new golfer into database
$stmt = $conn->prepare("INSERT INTO golfers (first_name, last_name, handicap, active, org_id) VALUES (?, ?, ?, 1, ?)");
$stmt->bind_param("ssdi", $first_name, $last_name, $handicap, $currentOrgId);

if ($stmt->execute()) {
    $new_golfer_id = $conn->insert_id;
    echo json_encode([
        'success' => true,
        'message' => 'Golfer added successfully',
        'golfer_id' => $new_golfer_id
    ]);
} else {
    echo json_encode(['success' => false, 'message' => 'Error adding golfer: ' . $stmt->error]);
}

$stmt->close();
$conn->close();
?>
