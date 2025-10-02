<?php
session_start();
require_once 'db_connect.php';

header('Content-Type: application/json');
header("Access-Control-Allow-Origin: http://localhost");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");

$match_id = $_GET['match_id'] ?? null;
$tournament_id = $_SESSION['tournament_id'] ?? null;
if (!$tournament_id) {
  echo json_encode(['error' => 'Missing tournament ID']);
  exit;
}

if (!$match_id) {
  echo json_encode(['error' => 'Missing match ID']);
  exit;
}

// Connect
$conn = new mysqli($servername, $username, $password, $dbname);
if ($conn->connect_error) {
  http_response_code(500);
  echo json_encode(['error' => 'Database connection failed']);
  exit;
}

// Step 1: Get golfer and match details
$sql = "
SELECT 
  mg.match_id,
  m.round_id,
  r.course_id,
  r.round_name,
  r.round_date,
  c.course_name,
  g.golfer_id,
  g.first_name,
  t.name AS team_name,
  t.color_hex AS team_color,
  g.handicap
FROM match_golfers mg
JOIN matches m ON mg.match_id = m.match_id
JOIN rounds r ON m.round_id = r.round_id
JOIN courses c ON r.course_id = c.course_id
JOIN golfers g ON mg.golfer_id = g.golfer_id
JOIN tournament_golfers tg ON g.golfer_id = tg.golfer_id AND tg.tournament_id = ?
JOIN teams t ON tg.team_id = t.team_id
WHERE mg.match_id = ?
ORDER BY 
  t.name,
  g.first_name
";

$stmt = $conn->prepare($sql);
$stmt->bind_param("ii", $tournament_id, $match_id);
$stmt->execute();
$result = $stmt->get_result();

$matchData = [];
$course_id = null;

while ($row = $result->fetch_assoc()) {
  $matchData[] = $row;
  $course_id = $row['course_id']; // use last one (they're all the same)
}

// Step 2: Get holes for the course
$holes = [];
if ($course_id) {
  $holeQuery = $conn->prepare("SELECT hole_number, par, handicap_index FROM holes WHERE course_id = ? ORDER BY hole_number");
  $holeQuery->bind_param("i", $course_id);
  $holeQuery->execute();
  $holeResult = $holeQuery->get_result();
  while ($row = $holeResult->fetch_assoc()) {
    $holes[] = $row;
  }
}

echo json_encode([
  'match' => $matchData,
  'holes' => $holes
]);
?>
    