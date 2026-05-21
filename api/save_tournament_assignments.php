<?php
require_once '../cors_headers.php';
header('Content-Type: application/json');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';
require_once 'auth_middleware.php';

// Get POST data
$json = file_get_contents('php://input');
$data = json_decode($json, true);

if (!$data || !isset($data['tournament_id']) || !isset($data['assignments'])) {
    die(json_encode(['success' => false, 'error' => 'Missing required data']));
}


try {
    // Start transaction
    $conn->begin_transaction();

    // Get tournament's handicap_pct for snapshot (org-scoped)
    $tournamentStmt = $conn->prepare("SELECT handicap_pct FROM tournaments WHERE tournament_id = ? AND org_id = ?");
    $tournamentStmt->bind_param('ii', $data['tournament_id'], $currentOrgId);
    $tournamentStmt->execute();
    $tournamentResult = $tournamentStmt->get_result()->fetch_assoc();
    if (!$tournamentResult) {
        $conn->rollback();
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Tournament not found or access denied']);
        exit;
    }
    $handicapPct = $tournamentResult['handicap_pct'] ?? null;
    $tournamentStmt->close();

    // 1. Preserve any manually locked handicaps before deleting (org already verified above)
    $lockedStmt = $conn->prepare("SELECT golfer_id, handicap_at_assignment FROM tournament_golfers WHERE tournament_id = ? AND handicap_at_assignment IS NOT NULL");
    $lockedStmt->bind_param("i", $data['tournament_id']);
    $lockedStmt->execute();
    $lockedRows = $lockedStmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $lockedStmt->close();

    $lockedMap = [];
    foreach ($lockedRows as $row) {
        $lockedMap[$row['golfer_id']] = $row['handicap_at_assignment'];
    }

    // 2. Delete all existing assignments for this tournament
    $stmt = $conn->prepare("DELETE FROM tournament_golfers WHERE tournament_id = ?");
    $stmt->bind_param("i", $data['tournament_id']);
    $stmt->execute();

    // 3. Re-insert assignments — restore locked handicap if one existed, otherwise snapshot live handicap
    if (!empty($data['assignments'])) {
        $insertWithLocked = $conn->prepare("
            INSERT INTO tournament_golfers (tournament_id, golfer_id, team_id, handicap_at_assignment, handicap_pct_at_assignment)
            VALUES (?, ?, ?, ?, ?)
        ");
        $insertFromLive = $conn->prepare("
            INSERT INTO tournament_golfers (tournament_id, golfer_id, team_id, handicap_at_assignment, handicap_pct_at_assignment)
            SELECT ?, ?, ?, g.handicap, ?
            FROM golfers g
            WHERE g.golfer_id = ?
        ");

        foreach ($data['assignments'] as $assignment) {
            $golferId = $assignment['golfer_id'];
            $teamId   = $assignment['team_id'];

            if (isset($lockedMap[$golferId])) {
                $lockedHcp = $lockedMap[$golferId];
                $insertWithLocked->bind_param("iiidi",
                    $data['tournament_id'], $golferId, $teamId, $lockedHcp, $handicapPct
                );
                $insertWithLocked->execute();
            } else {
                $insertFromLive->bind_param("iiidi",
                    $data['tournament_id'], $golferId, $teamId, $handicapPct, $golferId
                );
                $insertFromLive->execute();
            }
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