<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);
header('Content-Type: application/json');
require_once '../cors_headers.php';
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

require_once 'db_connect.php';
require_once 'auth_middleware.php';

// Get JSON input
$data = json_decode(file_get_contents("php://input"), true);

$match_id = $data['match_id'] ?? null;
$hole = $data['hole'] ?? null;
$strokes = $data['strokes'] ?? null;
$golfer_id = $data['golfer_id'];

error_log("match_id: $match_id, hole: $hole, strokes: $strokes, golfer_id: $golfer_id");

if ($match_id === null || $hole === null || $strokes === null || $golfer_id === null) {
    echo json_encode(['success' => false, 'message' => 'Missing data']);
    exit;
}

// Verify match belongs to this org before saving
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

// Save or update score
$stmt = $conn->prepare("
    INSERT INTO hole_scores (match_id, golfer_id, hole_number, strokes)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE strokes = VALUES(strokes)
");
$stmt->bind_param("iiii", $match_id, $golfer_id, $hole, $strokes);
$success = $stmt->execute();

echo json_encode(['success' => $success]);
?>
