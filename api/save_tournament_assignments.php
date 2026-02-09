<?php
require_once '../cors_headers.php';
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

    // Get tournament's handicap_pct for snapshot
    $tournamentStmt = $conn->prepare("SELECT handicap_pct FROM tournaments WHERE tournament_id = ?");
    $tournamentStmt->bind_param('i', $data['tournament_id']);
    $tournamentStmt->execute();
    $tournamentResult = $tournamentStmt->get_result()->fetch_assoc();
    $handicapPct = $tournamentResult['handicap_pct'] ?? null;
    $tournamentStmt->close();

    // 1. Delete all existing assignments for this tournament
    $stmt = $conn->prepare("DELETE FROM tournament_golfers WHERE tournament_id = ?");
    $stmt->bind_param("i", $data['tournament_id']);
    $stmt->execute();

    // 2. Insert new assignments with handicap snapshot
    if (!empty($data['assignments'])) {
        $stmt = $conn->prepare("
            INSERT INTO tournament_golfers (tournament_id, golfer_id, team_id, handicap_at_assignment, handicap_pct_at_assignment)
            SELECT ?, ?, ?, g.handicap, ?
            FROM golfers g
            WHERE g.golfer_id = ?
        ");

        foreach ($data['assignments'] as $assignment) {
            $stmt->bind_param("iiidi",
                $data['tournament_id'],
                $assignment['golfer_id'],
                $assignment['team_id'],
                $handicapPct,
                $assignment['golfer_id']
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