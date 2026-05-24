<?php
require_once 'db_connect.php';
header('Content-Type: application/json');
require_once '../cors_headers.php';
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");

require_once 'auth_middleware.php';

$match_id = $_GET['match_id'] ?? null;
// Accept GET parameter with fallback to session
$tournament_id = $_GET['tournament_id'] ?? $_SESSION['tournament_id'] ?? null;
if (!$tournament_id) {
  echo json_encode(['error' => 'Missing tournament ID']);
  exit;
}

if (!$match_id) {
  echo json_encode(['error' => 'Missing match ID']);
  exit;
}

// Step 1: Get golfer and match details (scoped by org)
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
  COALESCE(tg.handicap_at_assignment, g.handicap) AS handicap,
  mg.player_order
FROM match_golfers mg
JOIN matches m ON mg.match_id = m.match_id
JOIN rounds r ON m.round_id = r.round_id
JOIN tournaments tour ON r.tournament_id = tour.tournament_id
JOIN courses c ON r.course_id = c.course_id
JOIN golfers g ON mg.golfer_id = g.golfer_id
JOIN tournament_golfers tg ON g.golfer_id = tg.golfer_id AND tg.tournament_id = ?
LEFT JOIN teams t ON tg.team_id = t.team_id
WHERE mg.match_id = ? AND tour.org_id = ?
ORDER BY
  COALESCE(t.name, ''),
  mg.player_order,
  g.first_name
";

$stmt = $conn->prepare($sql);
$stmt->bind_param("iii", $tournament_id, $match_id, $currentOrgId);
$stmt->execute();
$result = $stmt->get_result();

$matchData = [];
$course_id = null;

while ($row = $result->fetch_assoc()) {
  $matchData[] = $row;
  $course_id = $row['course_id'];
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
