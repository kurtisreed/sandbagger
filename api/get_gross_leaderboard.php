<?php
ini_set('display_errors', '0');
header('Content-Type: application/json');
require_once '../cors_headers.php';
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");

require_once 'db_connect.php';
require_once 'auth_middleware.php';

// Accept GET parameters with fallback to session
$round_id = $_GET['round_id'] ?? $_SESSION['round_id'] ?? null;
$tournament_id = $_GET['tournament_id'] ?? $_SESSION['tournament_id'] ?? null;
if (!$tournament_id) {
  echo json_encode(['error' => 'No tournament specified']);
  exit;
}

if (!$round_id) {
  echo json_encode(['error' => 'No round specified']);
  exit;
}

$sql = "
  SELECT
    g.golfer_id,
    g.first_name,
    t.name AS team_name,
    t.color_hex AS team_color,
    s.hole_number,
    s.strokes,
    h.par
  FROM match_golfers mg
  JOIN golfers g ON mg.golfer_id = g.golfer_id
  JOIN matches m ON mg.match_id = m.match_id
  JOIN rounds r ON m.round_id = r.round_id
  JOIN tournaments tour ON r.tournament_id = tour.tournament_id
  JOIN tournament_golfers tg ON g.golfer_id = tg.golfer_id AND tg.tournament_id = ?
  LEFT JOIN teams t ON tg.team_id = t.team_id
  LEFT JOIN hole_scores s ON mg.match_id = s.match_id AND mg.golfer_id = s.golfer_id
  LEFT JOIN holes h ON r.course_id = h.course_id AND s.hole_number = h.hole_number
  WHERE m.round_id = ? AND tour.org_id = ?
";

$stmt = $conn->prepare($sql);
$stmt->bind_param("iii", $tournament_id, $round_id, $currentOrgId);
$stmt->execute();
$result = $stmt->get_result();

$leaderboard = [];

while ($row = $result->fetch_assoc()) {
  $id = $row['golfer_id'];
  if (!isset($leaderboard[$id])) {
    $leaderboard[$id] = [
      'golfer_id' => $id,
      'name' => $row['first_name'],
      'team_name' => $row['team_name'],
      'team_color' => $row['team_color'],
      'strokes' => 0,
      'par' => 0,
      'holes_played' => 0
    ];
  }
  if ($row['strokes'] !== null && $row['par'] !== null) {
    $leaderboard[$id]['strokes'] += intval($row['strokes']);
    $leaderboard[$id]['par'] += intval($row['par']);
    $leaderboard[$id]['holes_played'] += 1;
  }
}

echo json_encode(array_values($leaderboard));
?>
