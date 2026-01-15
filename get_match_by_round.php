<?php
session_start();
header('Content-Type: application/json');
header("Access-Control-Allow-Origin: http://localhost");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");
// DB credentials
require_once 'db_connect.php';

// Accept GET parameters with fallback to session
$golfer_id = $_GET['golfer_id'] ?? $_SESSION['golfer_id'] ?? null;
$round_id = $_GET['round_id'] ?? $_SESSION['round_id'] ?? null;
$tournament_id = $_GET['tournament_id'] ?? $_SESSION['tournament_id'] ?? null;

if (!$golfer_id || !$round_id || !$tournament_id) {
  echo json_encode(['error' => 'Missing golfer, round, or tournament ID']);
  exit;
}

$conn = new mysqli($servername, $username, $password, $dbname);
if ($conn->connect_error) {
  http_response_code(500);
  echo json_encode(['error' => 'Database connection failed']);
  exit;
}

$sql = "
SELECT 
  mg.match_id,
  m.round_id,
  m.finalized,
  r.course_id,
  r.tee_id,
  r.round_name,
  r.round_date,
  c.course_name,
  ct.tee_name,
  ct.slope,
  ct.rating,
  ct.par,
  g.golfer_id,
  g.first_name,
  tg.team_id,
  t.name AS team_name,
  t.color_hex AS team_color,
  g.handicap
FROM match_golfers mg
JOIN matches m ON mg.match_id = m.match_id
JOIN rounds r ON m.round_id = r.round_id
JOIN courses c ON r.course_id = c.course_id
JOIN course_tees ct ON r.tee_id = ct.tee_id
JOIN match_golfers mg2 ON mg.match_id = mg2.match_id
JOIN golfers g ON mg2.golfer_id = g.golfer_id
JOIN tournament_golfers tg ON g.golfer_id = tg.golfer_id AND tg.tournament_id = ?
JOIN teams t ON tg.team_id = t.team_id
WHERE mg.golfer_id = ? AND m.round_id = ?
ORDER BY 
  CASE
    WHEN g.golfer_id = ? THEN 0
    WHEN tg.team_id = (SELECT tg2.team_id FROM tournament_golfers tg2 WHERE tg2.golfer_id = ? AND tg2.tournament_id = ?) THEN 1
    ELSE 2
  END,
  g.first_name
";

$stmt = $conn->prepare($sql);
$stmt->bind_param("iiiiii", $tournament_id, $golfer_id, $round_id, $golfer_id, $golfer_id, $tournament_id);
$stmt->execute();
$result = $stmt->get_result();


if ($result->num_rows === 0) {
  echo json_encode(['error' => 'No matches found for this golfer']);
  exit;
}

$matchData = [];
while ($row = $result->fetch_assoc()) {
  $matchData[] = $row;
}

// ✅ Get course_id after fetching matchData
$course_id = $matchData[0]['course_id'] ?? null;
$holes = [];

if ($course_id) {
  $holeQuery = $conn->prepare("SELECT hole_number, handicap_index, par FROM holes WHERE course_id = ? ORDER BY hole_number");
  $holeQuery->bind_param("i", $course_id);
  $holeQuery->execute();
  $holeResult = $holeQuery->get_result();

  while ($row = $holeResult->fetch_assoc()) {
    $holes[] = $row;
  }
}

// Get tournament handicap percentage
$tournamentQuery = $conn->prepare("SELECT handicap_pct FROM tournaments WHERE tournament_id = ?");
$tournamentQuery->bind_param("i", $tournament_id);
$tournamentQuery->execute();
$tournamentResult = $tournamentQuery->get_result();
$tournamentRow = $tournamentResult->fetch_assoc();
$handicap_pct = $tournamentRow ? $tournamentRow['handicap_pct'] : 100;

$response = [
  'match' => $matchData,
  'holes' => $holes,
  'tournament_handicap_pct' => $handicap_pct
];

echo json_encode($response);
?>