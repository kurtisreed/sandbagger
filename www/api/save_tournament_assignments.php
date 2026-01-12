<?php
header('Content-Type: application/json');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';

// Get POST data
$json = file_get_contents('php://input');
$data = json_decode($json, true);

if (!$data || !isset($data['tournament_id']) || !isset($data['assignments'])) {
    die(json_encode(['success' => false, 'error' => 'Missing required data']));
}


try {
    // Start transaction
    $conn->begin_transaction();

    // 1. Delete all existing assignments for this tournament
    $stmt = $conn->prepare("DELETE FROM tournament_golfers WHERE tournament_id = ?");
    $stmt->bind_param("i", $data['tournament_id']);
    $stmt->execute();

    // 2. Insert new assignments
    if (!empty($data['assignments'])) {
        $stmt = $conn->prepare("INSERT INTO tournament_golfers (tournament_id, golfer_id, team_id) VALUES (?, ?, ?)");
        
        foreach ($data['assignments'] as $assignment) {
            $stmt->bind_param("iii", 
                $data['tournament_id'],
                $assignment['golfer_id'],
                $assignment['team_id']
            );
            $stmt->execute();
        }
    }

    // Commit transaction
    $conn->commit();
    echo json_encode(['success' => true]);

} catch (Exception $e) {
    // Roll back transaction on error
    $conn->rollback();
    echo json_encode([
        'success' => false, 
        'error' => 'Database error: ' . $e->getMessage()
    ]);
}

$conn->close();