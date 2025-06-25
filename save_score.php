<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);
session_start();
header('Content-Type: application/json');

// DB credentials
require_once 'db_connect.php';
$conn = new mysqli($servername, $username, $password, $dbname);
    
if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'DB connection failed']);
    exit;
}

// Get JSON input
$data = json_decode(file_get_contents("php://input"), true);

$match_id = $data['match_id'] ?? null;
$hole = $data['hole'] ?? null;
$strokes = $data['strokes'] ?? null;
$golfer_id = $data['golfer_id'];


error_log("match_id: $match_id, hole: $hole, strokes: $strokes, golfer_id: $golfer_id");


if ($match_id === null || $hole === null || $strokes === null || $golfer_id === null) {
    echo json_encode(['success' => false, 'message' => 'Missing data']);
    exit;
}





// Save or update score
$stmt = $conn->prepare("
    INSERT INTO hole_scores (match_id, golfer_id, hole_number, strokes)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE strokes = VALUES(strokes)
");
$stmt->bind_param("iiii", $match_id, $golfer_id, $hole, $strokes);
$success = $stmt->execute();

echo json_encode(['success' => $success]);
?>