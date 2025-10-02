<?php
header('Content-Type: application/json; charset=utf-8');
header("Access-Control-Allow-Origin: http://localhost");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");
require_once '../db_connect.php';

$code = isset($_GET['code']) ? intval($_GET['code']) : null;

if (!$code || $code < 1000 || $code > 9999) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid code']);
    exit;
}

try {
    // Find match by code
    $stmt = $conn->prepare("
        SELECT m.match_id, m.round_id, r.tournament_id
        FROM matches m
        JOIN rounds r ON m.round_id = r.round_id
        WHERE m.match_code = ?
    ");
    $stmt->bind_param('i', $code);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result->num_rows === 0) {
        echo json_encode(['success' => false, 'error' => 'Match not found']);
        exit;
    }

    $match = $result->fetch_assoc();

    echo json_encode([
        'success' => true,
        'match_id' => $match['match_id'],
        'round_id' => $match['round_id'],
        'tournament_id' => $match['tournament_id']
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
