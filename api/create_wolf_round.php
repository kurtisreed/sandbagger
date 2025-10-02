<?php
header('Content-Type: application/json; charset=utf-8');
header("Access-Control-Allow-Origin: http://localhost");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");
require_once '../db_connect.php';

// Set timezone to Mountain Time
date_default_timezone_set('America/Denver');

$data = json_decode(file_get_contents('php://input'), true);

// Validate required data
if (!$data ||
    !isset($data['players']) ||
    !is_array($data['players']) ||
    count($data['players']) !== 4 ||
    !isset($data['course_id']) ||
    !isset($data['tee_id']) ||
    !isset($data['handicap_pct'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing required fields or incorrect number of players']);
    exit;
}

try {
    // Start transaction
    $conn->begin_transaction();

    // Set MySQL timezone to match PHP timezone
    $conn->query("SET time_zone = '-07:00'"); // Mountain Time (MST/MDT)

    // 1. Create Tournament
    $currentDate = date('Y-m-d');
    $currentDateTime = date('Y-m-d H:i');
    $tournamentName = "Wolf Round - " . $currentDateTime;
    $stmt = $conn->prepare("
        INSERT INTO tournaments (name, start_date, end_date, handicap_pct, format_id)
        VALUES (?, ?, ?, ?, NULL)
    ");
    $stmt->bind_param('sssd', $tournamentName, $currentDate, $currentDate, $data['handicap_pct']);
    $stmt->execute();
    $tournamentId = $stmt->insert_id;

    // 2. Get course name for match name
    $stmt = $conn->prepare("SELECT course_name FROM courses WHERE course_id = ?");
    $stmt->bind_param('i', $data['course_id']);
    $stmt->execute();
    $result = $stmt->get_result();
    $course = $result->fetch_assoc();
    $courseName = $course['course_name'] ?? 'Unknown Course';

    // 3. Create Round
    $roundName = "Wolf";
    $stmt = $conn->prepare("
        INSERT INTO rounds (tournament_id, course_id, tee_id, round_name, round_date)
        VALUES (?, ?, ?, ?, ?)
    ");
    $stmt->bind_param('iiiss', $tournamentId, $data['course_id'], $data['tee_id'], $roundName, $currentDate);
    $stmt->execute();
    $roundId = $stmt->insert_id;

    // 4. Generate unique 4-digit code
    $matchCode = 0;
    $codeExists = true;
    while ($codeExists) {
        $matchCode = rand(1000, 9999);

        $stmt = $conn->prepare("SELECT match_id FROM matches WHERE match_code = ?");
        $stmt->bind_param('i', $matchCode);
        $stmt->execute();
        $result = $stmt->get_result();
        $codeExists = $result->num_rows > 0;
    }

    // 5. Create Match with descriptive name and code
    $matchName = "Wolf Match at " . $courseName . ", " . $currentDate;
    $stmt = $conn->prepare("
        INSERT INTO matches (round_id, match_name, match_code)
        VALUES (?, ?, ?)
    ");
    $stmt->bind_param('isi', $roundId, $matchName, $matchCode);
    $stmt->execute();
    $matchId = $stmt->insert_id;

    // 6. Link golfers to tournament (no team assignments for Wolf)
    $stmt = $conn->prepare("
        INSERT INTO tournament_golfers (tournament_id, golfer_id, team_id)
        VALUES (?, ?, NULL)
    ");

    foreach ($data['players'] as $golferId) {
        $stmt->bind_param('ii', $tournamentId, $golferId);
        $stmt->execute();
    }

    // 7. Link all golfers to the match WITH player_order
    $stmt = $conn->prepare("
        INSERT INTO match_golfers (match_id, golfer_id, player_order)
        VALUES (?, ?, ?)
    ");

    foreach ($data['players'] as $order => $golferId) {
        $playerOrder = $order + 1; // 1-based indexing
        $stmt->bind_param('iii', $matchId, $golferId, $playerOrder);
        $stmt->execute();
    }

    // Commit transaction
    $conn->commit();

    // Return success with IDs and code
    echo json_encode([
        'success' => true,
        'tournament_id' => $tournamentId,
        'round_id' => $roundId,
        'match_id' => $matchId,
        'match_code' => $matchCode
    ]);

} catch (Exception $e) {
    // Rollback on error
    $conn->rollback();
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
