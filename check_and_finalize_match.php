<?php
session_start();
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';

$match_id = $_GET['match_id'] ?? null;
if (!$match_id) {
    echo json_encode(['error' => 'No match_id']);
    exit;
}

$conn = new mysqli($servername, $username, $password, $dbname);
if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(['error' => 'DB connection failed']);
    exit;
}

// 1. Get all golfers and teams in this match
$sql = "
    SELECT mg.golfer_id, tg.team_id, g.handicap
    FROM match_golfers mg
    JOIN golfers g ON mg.golfer_id = g.golfer_id
    JOIN matches m ON mg.match_id = m.match_id
    JOIN rounds r ON m.round_id = r.round_id
    JOIN tournament_golfers tg ON g.golfer_id = tg.golfer_id AND tg.tournament_id = r.tournament_id
    WHERE mg.match_id = ?
";
$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $match_id);
$stmt->execute();
$res = $stmt->get_result();

$golfers = [];
$teams = [];
while ($row = $res->fetch_assoc()) {
    $golfers[$row['golfer_id']] = $row['team_id'];
    $teams[$row['team_id']] = true;
}
$team_ids = array_keys($teams);

if (count($team_ids) !== 2) {
    echo json_encode([
        'error' => 'Match does not have exactly 2 teams',
        'teams_found' => $team_ids,
        'golfers' => $golfers
    ]);
    exit;
}

// 2. Check if all holes are scored for all golfers
$sql = "SELECT COUNT(*) AS cnt FROM hole_scores WHERE match_id = ?";
$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $match_id);
$stmt->execute();
$res = $stmt->get_result();
$row = $res->fetch_assoc();
$total_scores = $row['cnt'];

if ($total_scores < count($golfers) * 18) {
    echo json_encode(['status' => 'not finished']);
    exit;
}

// 3. Get all scores for this match
$sql = "SELECT golfer_id, hole_number, strokes FROM hole_scores WHERE match_id = ?";
$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $match_id);
$stmt->execute();
$res = $stmt->get_result();

$scores = [];
while ($row = $res->fetch_assoc()) {
    $scores[$row['hole_number']][$row['golfer_id']] = $row['strokes'];
}

// 4. Calculate best-ball match play result
$differential = 0;
for ($hole = 1; $hole <= 18; $hole++) {
    $teamScores = [];
    foreach ($scores[$hole] ?? [] as $golfer_id => $strokes) {
        $team_id = $golfers[$golfer_id];
        if (!isset($teamScores[$team_id]) || $strokes < $teamScores[$team_id]) {
            $teamScores[$team_id] = $strokes;
        }
    }
    if (count($teamScores) == 2) {
        $teamA = $team_ids[0];
        $teamB = $team_ids[1];
        if ($teamScores[$teamA] < $teamScores[$teamB]) $differential++;
        elseif ($teamScores[$teamB] < $teamScores[$teamA]) $differential--;
    }
}

if ($differential > 0) {
    $points = [$team_ids[0] => 1, $team_ids[1] => 0];
} elseif ($differential < 0) {
    $points = [$team_ids[0] => 0, $team_ids[1] => 1];
} else {
    $points = [$team_ids[0] => 0.5, $team_ids[1] => 0.5];
}

// 5. Insert/update match_results
foreach ($points as $team_id => $pts) {
    $sql = "INSERT INTO match_results (match_id, team_id, points)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE points = VALUES(points)";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("iid", $match_id, $team_id, $pts);
    $stmt->execute();
}

echo json_encode(['status' => 'finalized', 'points' => $points]);