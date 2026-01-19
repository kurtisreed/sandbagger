<?php
require_once 'cors_headers.php';
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header('Content-Type: application/json');

require_once 'db_connect.php';

$conn = new mysqli($servername, $username, $password, $dbname);
if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed']);
    exit;
}

$golfer_id = $_POST['golfer_id'] ?? null;
$first_name = $_POST['first_name'] ?? null;
$last_name = $_POST['last_name'] ?? null;
$handicap = $_POST['handicap'] ?? null;

if (!$golfer_id || !$first_name || !$last_name || $handicap === null) {
    echo json_encode(['success' => false, 'message' => 'Missing required fields']);
    exit;
}

// Update golfer in database
$stmt = $conn->prepare("UPDATE golfers SET first_name = ?, last_name = ?, handicap = ? WHERE golfer_id = ?");
$stmt->bind_param("ssdi", $first_name, $last_name, $handicap, $golfer_id);

if ($stmt->execute()) {
    echo json_encode([
        'success' => true,
        'message' => 'Golfer updated successfully'
    ]);
} else {
    echo json_encode(['success' => false, 'message' => 'Error updating golfer: ' . $stmt->error]);
}

$stmt->close();
$conn->close();
?>
