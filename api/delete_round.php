<?php
require_once '../cors_headers.php';
header('Content-Type: application/json');
require_once '../db_connect.php';
require_once __DIR__ . '/auth_middleware.php';
requireAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$data     = json_decode(file_get_contents('php://input'), true);
$roundId  = intval($data['round_id']      ?? 0);
$tournamentId = intval($data['tournament_id'] ?? 0);

if (!$roundId || !$tournamentId) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing round_id or tournament_id']);
    exit;
}

// Verify the round belongs to a tournament owned by this org
$stmt = $conn->prepare("
    SELECT r.round_id
    FROM rounds r
    JOIN tournaments t ON r.tournament_id = t.tournament_id
    WHERE r.round_id = ? AND t.tournament_id = ? AND t.org_id = ?
");
$stmt->bind_param('iii', $roundId, $tournamentId, $currentOrgId);
$stmt->execute();
if ($stmt->get_result()->num_rows === 0) {
    http_response_code(404);
    echo json_encode(['error' => 'Round not found or access denied']);
    exit;
}

try {
    $conn->begin_transaction();

    // 1. Get all match IDs for this round
    $res      = $conn->query("SELECT match_id FROM matches WHERE round_id = $roundId");
    $matchIds = [];
    while ($row = $res->fetch_assoc()) $matchIds[] = $row['match_id'];

    if (!empty($matchIds)) {
        $idList = implode(',', $matchIds);

        // 2. Delete hole scores
        $conn->query("DELETE FROM hole_scores WHERE match_id IN ($idList)");

        // 3. Delete match golfers
        $conn->query("DELETE FROM match_golfers WHERE match_id IN ($idList)");

        // 5. Delete matches
        $conn->query("DELETE FROM matches WHERE match_id IN ($idList)");
    }

    // 6. Delete tee times for this round
    $stmt = $conn->prepare("DELETE FROM tee_times WHERE round_id = ?");
    $stmt->bind_param('i', $roundId);
    $stmt->execute();

    // 7. Delete the round itself
    $stmt = $conn->prepare("DELETE FROM rounds WHERE round_id = ?");
    $stmt->bind_param('i', $roundId);
    $stmt->execute();

    $conn->commit();
    echo json_encode(['success' => true]);

} catch (Exception $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode(['error' => 'Delete failed: ' . $e->getMessage()]);
}
