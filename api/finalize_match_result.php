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

if (!$match_id || !$points || !is_array($points)) {
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

// Update matches table to set finalized = 1
$sql = "UPDATE matches SET finalized = 1 WHERE match_id = ?";
$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $match_id);
$stmt->execute();

echo json_encode(['success' => true]);
