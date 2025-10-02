<?php
header('Content-Type: application/json');
header("Access-Control-Allow-Origin: http://localhost");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");
require_once '../db_connect.php';

$match_id = isset($_GET['match_id']) ? intval($_GET['match_id']) : null;

if (!$match_id) {
  http_response_code(400);
  echo json_encode(['error' => 'Missing match_id']);
  exit;
}

$conn = new mysqli($servername, $username, $password, $dbname);
if ($conn->connect_error) {
  http_response_code(500);
  echo json_encode(['error' => 'Database connection failed']);
  exit;
}

// Get match info with golfers and player_order
$sql = "
SELECT
  m.match_id,
  m.match_name,
  m.match_code,
  m.round_id,
  m.finalized,
  r.course_id,
  r.tee_id,
  r.tournament_id,
  c.course_name,
  ct.tee_name,
  ct.slope,
  ct.rating,
  ct.par,
  g.golfer_id,
  g.first_name,
  g.last_name,
  g.handicap,
  mg.player_order,
  t.handicap_pct AS tournament_handicap_pct
FROM matches m
JOIN rounds r ON m.round_id = r.round_id
JOIN tournaments t ON r.tournament_id = t.tournament_id
JOIN courses c ON r.course_id = c.course_id
JOIN course_tees ct ON r.tee_id = ct.tee_id
JOIN match_golfers mg ON m.match_id = mg.match_id
JOIN golfers g ON mg.golfer_id = g.golfer_id
WHERE m.match_id = ?
ORDER BY mg.player_order
";

$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $match_id);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
  echo json_encode(['error' => 'No match found']);
  exit;
}

$matchData = [];
while ($row = $result->fetch_assoc()) {
  $matchData[] = $row;
}

// Get holes for the course
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

// Get wolf partner selections
$partners = [];
$partnerQuery = $conn->prepare("SELECT hole_number, wolf_golfer_id, partner_golfer_id FROM wolf_partners WHERE match_id = ? ORDER BY hole_number");
$partnerQuery->bind_param("i", $match_id);
$partnerQuery->execute();
$partnerResult = $partnerQuery->get_result();

while ($row = $partnerResult->fetch_assoc()) {
  $partners[] = $row;
}

$response = [
  'match' => $matchData,
  'holes' => $holes,
  'partners' => $partners
];

echo json_encode($response);
?>
