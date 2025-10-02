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
    !isset($data['team1_player1']) ||
    !isset($data['team1_player2']) ||
    !isset($data['team2_player1']) ||
    !isset($data['team2_player2']) ||
    !isset($data['course_id']) ||
    !isset($data['tee_id']) ||
    !isset($data['handicap_pct'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing required fields']);
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
    $tournamentName = "Quick Round - " . $currentDateTime;
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
    $roundName = "Best Ball";
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
        $matchCode = rand(1000, 9999); // Generate 4-digit number

        // Check if code already exists
        $stmt = $conn->prepare("SELECT match_id FROM matches WHERE match_code = ?");
        $stmt->bind_param('i', $matchCode);
        $stmt->execute();
        $result = $stmt->get_result();
        $codeExists = $result->num_rows > 0;
    }

    // 5. Create Match with descriptive name and code
    $matchName = "Best Ball Match at " . $courseName . ", " . $currentDate;
    $stmt = $conn->prepare("
        INSERT INTO matches (round_id, match_name, match_code)
        VALUES (?, ?, ?)
    ");
    $stmt->bind_param('isi', $roundId, $matchName, $matchCode);
    $stmt->execute();
    $matchId = $stmt->insert_id;

    // 6. Create tournament teams
    $stmt = $conn->prepare("
        INSERT INTO tournament_teams (tournament_id, team_id, team_color)
        VALUES (?, ?, ?)
    ");

    // Team 1 - Purple
    $team1Id = 1;
    $team1Color = '#4F2185';
    $stmt->bind_param('iis', $tournamentId, $team1Id, $team1Color);
    $stmt->execute();

    // Team 2 - Gold
    $team2Id = 2;
    $team2Color = '#FFC62F';
    $stmt->bind_param('iis', $tournamentId, $team2Id, $team2Color);
    $stmt->execute();

    // 7. Link golfers to tournament with team assignments
    $team1Golfers = [$data['team1_player1'], $data['team1_player2']];
    $team2Golfers = [$data['team2_player1'], $data['team2_player2']];

    $stmt = $conn->prepare("
        INSERT INTO tournament_golfers (tournament_id, golfer_id, team_id)
        VALUES (?, ?, ?)
    ");

    // Team 1
    foreach ($team1Golfers as $golferId) {
        $teamId = 1;
        $stmt->bind_param('iii', $tournamentId, $golferId, $teamId);
        $stmt->execute();
    }

    // Team 2
    foreach ($team2Golfers as $golferId) {
        $teamId = 2;
        $stmt->bind_param('iii', $tournamentId, $golferId, $teamId);
        $stmt->execute();
    }

    // 8. Link all golfers to the match
    $stmt = $conn->prepare("
        INSERT INTO match_golfers (match_id, golfer_id)
        VALUES (?, ?)
    ");

    foreach (array_merge($team1Golfers, $team2Golfers) as $golferId) {
        $stmt->bind_param('ii', $matchId, $golferId);
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
