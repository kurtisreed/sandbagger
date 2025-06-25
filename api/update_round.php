<?php
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';


// Add this to handle PUT requests
if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $roundId = $_GET['round_id'] ?? null;
    if (!$roundId) {
        die(json_encode(['error' => 'Missing round_id']));
    }

    $data = json_decode(file_get_contents('php://input'), true);
    
    $stmt = $conn->prepare("UPDATE rounds SET round_date = ?, round_name = ? WHERE round_id = ?");
    $stmt->bind_param("ssi", $data['round_date'], $data['round_name'], $roundId);
    
    if ($stmt->execute()) {
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['error' => 'Failed to update round']);
    }
}