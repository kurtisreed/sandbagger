<?php
session_start();
require_once 'db_connect.php';
header('Content-Type: application/json');
require_once 'cors_headers.php';
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");

// Accept GET parameters with fallback to session
$round_id = $_GET['round_id'] ?? $_SESSION['round_id'] ?? null;
$tournament_id = $_GET['tournament_id'] ?? $_SESSION['tournament_id'] ?? null;
if (!$tournament_id) {
  echo json_encode(['error' => 'Missing tournament ID']);
  exit;
}
if (!$round_id) {
  echo json_encode(['error' => 'Missing round ID']);
  exit;
}

$conn = new mysqli($servername, $username, $password, $dbname);
if ($conn->connect_error) {
  http_response_code(500);
  echo json_encode(['error' => 'Database connection failed']);
  exit;
}

// Step 1: Get all matches for this round
$sql = "
SELECT 
  m.match_id,
  g.golfer_id,
  g.handicap,
  g.first_name,
  g.last_name,
  t.name AS team_name
FROM matches m
JOIN match_golfers mg ON m.match_id = mg.match_id
JOIN golfers g ON mg.golfer_id = g.golfer_id
JOIN tournament_golfers tg ON g.golfer_id = tg.golfer_id AND tg.tournament_id = ?
LEFT JOIN teams t ON tg.team_id = t.team_id
WHERE m.round_id = ?
ORDER BY m.match_id, t.name, g.last_name
";

$stmt = $conn->prepare($sql);
$stmt->bind_param("ii", $tournament_id, $round_id);
$stmt->execute();
$result = $stmt->get_result();

$matches = [];

while ($row = $result->fetch_assoc()) {
  $mid = $row['match_id'];
  if (!isset($matches[$mid])) {
    $matches[$mid] = [
      'match_id' => $mid,
      'golfers' => [],
      'scores' => []
    ];
  }
  $matches[$mid]['golfers'][] = $row;
}

// Step 2: Get all scores for those matches
$matchIds = array_keys($matches);
if (count($matchIds) > 0) {
  $placeholders = implode(',', array_fill(0, count($matchIds), '?'));
  $types = str_repeat('i', count($matchIds));

  $scoreSql = "SELECT match_id, golfer_id, hole_number, strokes FROM hole_scores WHERE match_id IN ($placeholders)";
  $scoreStmt = $conn->prepare($scoreSql);
  $scoreStmt->bind_param($types, ...$matchIds);
  $scoreStmt->execute();
  $scoreResult = $scoreStmt->get_result();

  while ($row = $scoreResult->fetch_assoc()) {
    $matches[$row['match_id']]['scores'][] = $row;
  }
}

echo json_encode(array_values($matches));
?>