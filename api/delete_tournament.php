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

$data         = json_decode(file_get_contents('php://input'), true);
$tournamentId = intval($data['tournament_id'] ?? 0);

if (!$tournamentId) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing tournament_id']);
    exit;
}

// Verify the tournament belongs to this org
$stmt = $conn->prepare("SELECT tournament_id FROM tournaments WHERE tournament_id = ? AND org_id = ?");
$stmt->bind_param('ii', $tournamentId, $currentOrgId);
$stmt->execute();
if ($stmt->get_result()->num_rows === 0) {
    http_response_code(404);
    echo json_encode(['error' => 'Tournament not found or access denied']);
    exit;
}

try {
    $conn->begin_transaction();

    // 1. Get all round IDs
    $res      = $conn->query("SELECT round_id FROM rounds WHERE tournament_id = $tournamentId");
    $roundIds = [];
    while ($row = $res->fetch_assoc()) $roundIds[] = $row['round_id'];

    if (!empty($roundIds)) {
        $roundList = implode(',', $roundIds);

        // 2. Get all match IDs
        $res      = $conn->query("SELECT match_id FROM matches WHERE round_id IN ($roundList)");
        $matchIds = [];
        while ($row = $res->fetch_assoc()) $matchIds[] = $row['match_id'];

        if (!empty($matchIds)) {
            $matchList = implode(',', $matchIds);
            $conn->query("DELETE FROM hole_scores  WHERE match_id IN ($matchList)");
            $conn->query("DELETE FROM match_golfers WHERE match_id IN ($matchList)");
            $conn->query("DELETE FROM matches       WHERE match_id IN ($matchList)");
        }

        $conn->query("DELETE FROM tee_times WHERE round_id IN ($roundList)");
        $conn->query("DELETE FROM rounds    WHERE round_id IN ($roundList)");
    }

    // 3. Association tables
    foreach (['tournament_formats', 'tournament_golfers', 'tournament_rounds',
              'tournament_settings', 'tournament_teams'] as $table) {
        $stmt = $conn->prepare("DELETE FROM `$table` WHERE tournament_id = ?");
        $stmt->bind_param('i', $tournamentId);
        $stmt->execute();
    }

    // 4. Delete the tournament
    $stmt = $conn->prepare("DELETE FROM tournaments WHERE tournament_id = ?");
    $stmt->bind_param('i', $tournamentId);
    $stmt->execute();

    $conn->commit();
    echo json_encode(['success' => true]);

} catch (Exception $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode(['error' => 'Delete failed: ' . $e->getMessage()]);
}
