<?php
ini_set('display_errors', '0');
header('Content-Type: application/json');
require_once '../cors_headers.php';
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");

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

// Pull golfer handicap (snapshot from tournament assignment) and hole handicap_index
$sql = "
  SELECT
    g.golfer_id,
    g.first_name,
    t.name AS team_name,
    t.color_hex AS team_color,
    COALESCE(tg.handicap_at_assignment, g.handicap) AS handicap,
    COALESCE(tg.handicap_pct_at_assignment, (SELECT handicap_pct FROM tournaments WHERE tournament_id = ?)) AS handicap_pct_snapshot,
    s.hole_number,
    s.strokes,
    h.par,
    h.handicap_index
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
$stmt->bind_param("iiii", $tournament_id, $tournament_id, $round_id, $currentOrgId);
$stmt->execute();
$result = $stmt->get_result();

// Get tee_id for this round
$teeSql = $conn->prepare("SELECT tee_id FROM rounds WHERE round_id = ?");
$teeSql->bind_param("i", $round_id);
$teeSql->execute();
$teeResult = $teeSql->get_result();
$teeRow = $teeResult->fetch_assoc();
$tee_id = $teeRow ? $teeRow['tee_id'] : null;

if (!$tee_id) {
  echo json_encode(['error' => 'No tee_id found for this round']);
  exit;
}

// Get slope and rating from course_tees
$courseTeeSql = $conn->prepare("SELECT slope, rating FROM course_tees WHERE tee_id = ?");
$courseTeeSql->bind_param("i", $tee_id);
$courseTeeSql->execute();
$courseTeeResult = $courseTeeSql->get_result();
$courseTeeRow = $courseTeeResult->fetch_assoc();
$slope = floatval($courseTeeRow['slope']);
$rating = floatval($courseTeeRow['rating']);

$playingHandicaps = [];
$leaderboard = [];
while ($row = $result->fetch_assoc()) {
  $id = $row['golfer_id'];
  if (!isset($leaderboard[$id])) {
    $leaderboard[$id] = [
      'golfer_id'   => $id,
      'name'        => $row['first_name'],
      'team_name'   => $row['team_name'],
      'team_color'  => $row['team_color'],
      'net_strokes' => 0,
      'par'         => 0,
      'holes_played'=> 0,
    ];
    $hcp = floatval($row['handicap']);
    $handicap_pct = floatval($row['handicap_pct_snapshot']);
    $playing_handicap = ($hcp * ($slope / 113) + ($rating - 72)) * ($handicap_pct / 100);
    $playingHandicaps[$id] = round($playing_handicap);
  }

  if ($row['strokes'] !== null && $row['par'] !== null) {
    $strokes = intval($row['strokes']);
    $par     = intval($row['par']);
    $idx     = intval($row['handicap_index']);
    $playing_hcp = $playingHandicaps[$id];

    if ($playing_hcp >= 0) {
      $baseStrokes      = intdiv($playing_hcp, 18);
      $extraStrokeHoles = $playing_hcp % 18;
      $handicapStrokes  = $baseStrokes + ($idx <= $extraStrokeHoles ? 1 : 0);
    } else {
      $absHcp           = abs($playing_hcp);
      $baseStrokes      = intdiv($absHcp, 18);
      $extraStrokeHoles = $absHcp % 18;
      $penaltyStrokes   = $baseStrokes + ($idx > (18 - $extraStrokeHoles) ? 1 : 0);
      $handicapStrokes  = -$penaltyStrokes;
    }

    $netForHole = $strokes - $handicapStrokes;

    $leaderboard[$id]['net_strokes']  += $netForHole;
    $leaderboard[$id]['par']          += $par;
    $leaderboard[$id]['holes_played'] ++;
  }
}

echo json_encode(array_values($leaderboard));
