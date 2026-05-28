<?php
require_once '../cors_headers.php';
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, private, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';
require_once 'auth_middleware.php';

// Add this to handle PUT requests
if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $roundId = $_GET['round_id'] ?? null;
    if (!$roundId) {
        die(json_encode(['error' => 'Missing round_id']));
    }

    $data = json_decode(file_get_contents('php://input'), true);

    // Verify round belongs to this org via tournament
    $stmt = $conn->prepare("
      UPDATE rounds r
         JOIN tournaments t ON t.tournament_id = r.tournament_id AND t.org_id = ?
         SET r.round_date = ?, r.round_name = ?
       WHERE r.round_id = ?
    ");
    $stmt->bind_param("issi", $currentOrgId, $data['round_date'], $data['round_name'], $roundId);
    
    if ($stmt->execute()) {
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['error' => 'Failed to update round']);
    }
}