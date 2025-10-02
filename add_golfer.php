<?php
header("Access-Control-Allow-Origin: http://localhost");
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

$first_name = $_POST['first_name'] ?? null;
$last_name = $_POST['last_name'] ?? null;
$handicap = $_POST['handicap'] ?? null;

if (!$first_name || !$last_name || $handicap === null) {
    echo json_encode(['success' => false, 'message' => 'Missing required fields']);
    exit;
}

// Insert new golfer into database
$stmt = $conn->prepare("INSERT INTO golfers (first_name, last_name, handicap, active) VALUES (?, ?, ?, 1)");
$stmt->bind_param("ssd", $first_name, $last_name, $handicap);

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
