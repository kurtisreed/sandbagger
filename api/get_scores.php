<?php
header('Content-Type: application/json');
require_once '../cors_headers.php';
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");

require_once 'db_connect.php';
require_once 'auth_middleware.php';

$match_id = $_GET['match_id'] ?? null;
if (!$match_id) {
    echo json_encode(['success' => false, 'message' => 'Missing match_id']);
    exit;
}

// Scope: verify match belongs to this org
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
    echo json_encode(['success' => false, 'message' => 'Match not found or access denied']);
    exit;
}

$sql = "SELECT golfer_id, hole_number, strokes FROM hole_scores WHERE match_id = ?";
$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $match_id);
$stmt->execute();
$result = $stmt->get_result();

$scores = [];
while ($row = $result->fetch_assoc()) {
    $scores[] = $row;
}

echo json_encode($scores);
