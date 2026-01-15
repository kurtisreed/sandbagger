<?php
session_start();
require_once 'db_connect.php';
header('Content-Type: application/json');
header("Access-Control-Allow-Origin: http://localhost");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");

// Accept GET parameter with fallback to session
$tournament_id = $_GET['tournament_id'] ?? $_SESSION['tournament_id'] ?? null;
if (!$tournament_id) {
    echo json_encode(['error' => 'No tournament specified']);
    exit;
}

$sql = "
SELECT 
    t.team_id, 
    t.name AS team_name, 
    t.color_hex, 
    COALESCE(SUM(mr.points), 0) AS total_points
FROM teams t
LEFT JOIN match_results mr ON t.team_id = mr.team_id
WHERE t.team_id IN (
    SELECT DISTINCT tg.team_id 
    FROM tournament_golfers tg 
    WHERE tg.tournament_id = ?
)
GROUP BY t.team_id, t.name, t.color_hex
ORDER BY total_points DESC, team_name
";
$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $tournament_id);
$stmt->execute();
$result = $stmt->get_result();

$scoreboard = [];
while ($row = $result->fetch_assoc()) {
    $scoreboard[$row['team_id']] = $row;
    $scoreboard[$row['team_id']]['golfers'] = [];
}

// Get golfers for each team in this tournament
$sql2 = "
SELECT tg.team_id, g.golfer_id, g.first_name, g.last_name
FROM tournament_golfers tg
JOIN golfers g ON tg.golfer_id = g.golfer_id
WHERE tg.tournament_id = ?
";
$stmt2 = $conn->prepare($sql2);
$stmt2->bind_param("i", $tournament_id);
$stmt2->execute();
$result2 = $stmt2->get_result();

while ($row = $result2->fetch_assoc()) {
    if (isset($scoreboard[$row['team_id']])) {
        $scoreboard[$row['team_id']]['golfers'][] = [
            'golfer_id' => $row['golfer_id'],
            'first_name' => $row['first_name'],
            'last_name' => $row['last_name']
        ];
    }
}

echo json_encode(array_values($scoreboard));