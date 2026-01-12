<?php
header('Content-Type: application/json; charset=utf-8');
header("Access-Control-Allow-Origin: http://localhost");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");
require_once '../db_connect.php';

$data = json_decode(file_get_contents('php://input'), true);

// Validate required data
if (!$data ||
    !isset($data['match_id']) ||
    !isset($data['hole_number']) ||
    !isset($data['wolf_golfer_id']) ||
    !isset($data['partner_choice'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing required fields']);
    exit;
}

$match_id = intval($data['match_id']);
$hole_number = intval($data['hole_number']);
$wolf_golfer_id = intval($data['wolf_golfer_id']);
$partner_choice = $data['partner_choice']; // Can be 'lone' or a golfer_id

try {
    // Determine partner_golfer_id
    $partner_golfer_id = null;
    if ($partner_choice !== 'lone' && $partner_choice !== '') {
        $partner_golfer_id = intval($partner_choice);
    }

    // Insert or update partner selection
    $stmt = $conn->prepare("
        INSERT INTO wolf_partners (match_id, hole_number, wolf_golfer_id, partner_golfer_id)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            wolf_golfer_id = VALUES(wolf_golfer_id),
            partner_golfer_id = VALUES(partner_golfer_id)
    ");

    if ($partner_golfer_id === null) {
        $stmt->bind_param('iiii', $match_id, $hole_number, $wolf_golfer_id, $partner_golfer_id);
    } else {
        $stmt->bind_param('iiii', $match_id, $hole_number, $wolf_golfer_id, $partner_golfer_id);
    }

    $stmt->execute();

    echo json_encode([
        'success' => true,
        'message' => 'Partner selection saved'
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
