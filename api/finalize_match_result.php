<?php
require_once '../cors_headers.php';
header("Cache-Control: no-store, no-cache, private, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");

require_once 'db_connect.php';
require_once 'auth_middleware.php';

$data = json_decode(file_get_contents('php://input'), true);
$match_id = $data['match_id'] ?? null;
$points = $data['points'] ?? null;

if (!$match_id || !isset($points) || !is_array($points)) {
    echo json_encode(['error' => 'Missing or invalid data']);
    exit;
}

// Verify match belongs to this org before updating
$checkStmt = $conn->prepare("
    SELECT m.match_id
    FROM matches m
    JOIN rounds r ON m.round_id = r.round_id
    JOIN tournaments t ON r.tournament_id = t.tournament_id
    WHERE m.match_id = ? AND t.org_id = ?
");
$checkStmt->bind_param("ii", $match_id, $currentOrgId);
$checkStmt->execute();
$checkRes = $checkStmt->get_result();
if (!$checkRes->fetch_assoc()) {
    http_response_code(403);
    echo json_encode(['error' => 'Match not found or access denied']);
    exit;
}

// Insert/update match_results
foreach ($points as $team_id => $pts) {
    $team_id = intval($team_id);
    $sql = "INSERT INTO match_results (match_id, team_id, points)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE points = VALUES(points)";
    $stmt2 = $conn->prepare($sql);
    $stmt2->bind_param("iid", $match_id, $team_id, $pts);
    $stmt2->execute();
}

// Finalize, freezing the handicap rule this match was played under alongside
// the result. Without this a later edit to the tournament's handicap_mode would
// silently re-score a completed match. Only stamped if not already set, so
// re-finalizing cannot rewrite the rule of a match that is already closed.
$sql = "
    UPDATE matches m
    JOIN rounds      r ON r.round_id      = m.round_id
    JOIN tournaments t ON t.tournament_id = r.tournament_id
    SET m.finalized = 1,
        m.handicap_mode_at_finalize = COALESCE(m.handicap_mode_at_finalize, t.handicap_mode)
    WHERE m.match_id = ?";
$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $match_id);
$stmt->execute();

echo json_encode(['success' => true]);
