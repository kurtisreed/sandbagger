<?php
// Saves golfer list for a Guys Trip tournament (no teams).
require_once '../cors_headers.php';
header('Content-Type: application/json');

require_once 'auth_middleware.php';
requireAdmin();

$data = json_decode(file_get_contents('php://input'), true);

if (!isset($data['tournament_id']) || empty($data['golfer_ids']) || !is_array($data['golfer_ids'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'tournament_id and golfer_ids required']);
    exit;
}

$tournamentId = (int) $data['tournament_id'];

// Verify tournament belongs to this org
$stmt = $conn->prepare("SELECT handicap_pct FROM tournaments WHERE tournament_id = ? AND org_id = ?");
$stmt->bind_param('ii', $tournamentId, $currentOrgId);
$stmt->execute();
$tournament = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$tournament) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Tournament not found']);
    exit;
}

$handicapPct = $tournament['handicap_pct'];

$conn->begin_transaction();
try {
    // Clear any existing assignments
    $stmt = $conn->prepare("DELETE FROM tournament_golfers WHERE tournament_id = ?");
    $stmt->bind_param('i', $tournamentId);
    $stmt->execute();
    $stmt->close();

    // Insert each golfer with NULL team_id, snapshotting their live handicap
    $stmt = $conn->prepare("
        INSERT INTO tournament_golfers (tournament_id, golfer_id, team_id, handicap_at_assignment, handicap_pct_at_assignment)
        SELECT ?, ?, NULL, g.handicap, ?
        FROM golfers g
        WHERE g.golfer_id = ? AND g.org_id = ?
    ");

    foreach ($data['golfer_ids'] as $golferId) {
        $golferId = (int) $golferId;
        $stmt->bind_param('iiiii', $tournamentId, $golferId, $handicapPct, $golferId, $currentOrgId);
        $stmt->execute();
    }
    $stmt->close();

    $conn->commit();
    echo json_encode(['success' => true]);
} catch (Exception $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
