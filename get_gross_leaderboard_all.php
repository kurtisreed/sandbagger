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

$conn = new mysqli($servername, $username, $password, $dbname);
if ($conn->connect_error) {
  http_response_code(500);
  echo json_encode(['error' => 'DB connection failed']);
  exit;
}

$sql = "
  SELECT 
    g.golfer_id, 
    g.first_name, 
    t.name AS team_name, 
    t.color_hex AS team_color,
    SUM(s.strokes) AS strokes,
    SUM(h.par) AS par,
    COUNT(s.hole_number) AS holes_played
  FROM match_golfers mg
  JOIN golfers g ON mg.golfer_id = g.golfer_id
  JOIN matches m ON mg.match_id = m.match_id
  JOIN rounds r ON m.round_id = r.round_id
  JOIN tournament_golfers tg ON g.golfer_id = tg.golfer_id AND tg.tournament_id = ?
  JOIN teams t ON tg.team_id = t.team_id
  LEFT JOIN hole_scores s ON mg.match_id = s.match_id AND mg.golfer_id = s.golfer_id
  LEFT JOIN holes h ON r.course_id = h.course_id AND s.hole_number = h.hole_number
  WHERE r.tournament_id = ?
  GROUP BY g.golfer_id, g.first_name, t.name, t.color_hex
";

$stmt = $conn->prepare($sql);
$stmt->bind_param("ii", $tournament_id, $tournament_id);
$stmt->execute();
$result = $stmt->get_result();

$leaderboard = [];
while ($row = $result->fetch_assoc()) {
  $leaderboard[] = [
    'golfer_id' => $row['golfer_id'],
    'name' => $row['first_name'],
    'team_name' => $row['team_name'],
    'team_color' => $row['team_color'],
    'strokes' => intval($row['strokes']),
    'par' => intval($row['par']),
    'holes_played' => intval($row['holes_played'])
  ];
}

echo json_encode($leaderboard);
?>