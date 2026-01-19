<?php
header('Content-Type: application/json');
require_once 'cors_headers.php';
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");
require_once 'db_connect.php';

$tournament_id = isset($_GET['tournament_id']) ? intval($_GET['tournament_id']) : 0;
if (!$tournament_id) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing or invalid tournament_id']);
    exit;
}

// 1. Get all rounds for this tournament
$rounds = [];
$stmt = $conn->prepare("SELECT round_id, round_name, round_date FROM rounds WHERE tournament_id = ? ORDER BY round_date ASC");
$stmt->bind_param('i', $tournament_id);
$stmt->execute();
$res = $stmt->get_result();
while ($row = $res->fetch_assoc()) {
    $rounds[] = [
        'round_id' => (int)$row['round_id'],
        'round_name' => $row['round_name'],
        'round_date' => $row['round_date'],
        'tee_times' => []
    ];
}
$stmt->close();

// 2. For each round, get tee times
foreach ($rounds as &$round) {
    $stmt = $conn->prepare("SELECT tee_time_id, time FROM tee_times WHERE round_id = ? ORDER BY time ASC");
    $stmt->bind_param('i', $round['round_id']);
    $stmt->execute();
    $tee_times = [];
    $res = $stmt->get_result();
    while ($row = $res->fetch_assoc()) {
        $tee_times[] = [
            'tee_time_id' => (int)$row['tee_time_id'],
            'time' => $row['time'],
            'matches' => []
        ];
    }
    $stmt->close();

    // 3. For each tee time, get matches
    foreach ($tee_times as &$tee_time) {
        $stmt = $conn->prepare("SELECT match_id FROM matches WHERE tee_time_id = ?");
        $stmt->bind_param('i', $tee_time['tee_time_id']);
        $stmt->execute();
        $matches = [];
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $matches[] = [
                'match_id' => (int)$row['match_id'],
                'golfers' => []
            ];
        }
        $stmt->close();

        // 4. For each match, get golfers (with team color)
        foreach ($matches as &$match) {
            // Get golfers (with team color)
            $sql = "
                SELECT
                    g.first_name AS name,
                    t.color_hex AS team_color,
                    t.name AS team_name
                FROM match_golfers mg
                JOIN golfers g ON mg.golfer_id = g.golfer_id
                JOIN tournament_golfers tg ON g.golfer_id = tg.golfer_id AND tg.tournament_id = ?
                JOIN teams t ON tg.team_id = t.team_id
                WHERE mg.match_id = ?
                ORDER BY t.name ASC
            ";
            $stmt2 = $conn->prepare($sql);
            $stmt2->bind_param('ii', $tournament_id, $match['match_id']);
            $stmt2->execute();
            $res2 = $stmt2->get_result();
            while ($row2 = $res2->fetch_assoc()) {
                $match['golfers'][] = [
                    'name' => $row2['name'],
                    'team_color' => $row2['team_color'],
                    'team_name' => $row2['team_name']
                ];
            }
            $stmt2->close();

            // Get match results for this match
            $results = [];
            $stmt3 = $conn->prepare("SELECT team_id, points FROM match_results WHERE match_id = ?");
            $stmt3->bind_param('i', $match['match_id']);
            $stmt3->execute();
            $res3 = $stmt3->get_result();
            while ($row3 = $res3->fetch_assoc()) {
                $results[] = [
                    'team_id' => (int)$row3['team_id'],
                    'points' => (float)$row3['points']
                ];
            }
            $stmt3->close();
            $match['results'] = $results;
        }
        $tee_time['matches'] = $matches;
    }
    $round['tee_times'] = $tee_times;
}

echo json_encode($rounds, JSON_PRETTY_PRINT);