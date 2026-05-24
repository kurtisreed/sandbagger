<?php
require_once 'db_connect.php';
ini_set('display_errors', '0');
header('Content-Type: application/json');
require_once '../cors_headers.php';
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");

require_once 'auth_middleware.php';

// Accept GET parameter with fallback to session
$tournament_id = $_GET['tournament_id'] ?? $_SESSION['tournament_id'] ?? null;
if (!$tournament_id) {
  echo json_encode(['error' => 'No tournament specified']);
  exit;
}

// Pull golfer handicap (snapshot from tournament assignment) and hole handicap_index for all rounds in the tournament
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
    h.handicap_index,
    ct.slope,
    ct.rating
  FROM match_golfers mg
  JOIN golfers g ON mg.golfer_id = g.golfer_id
  JOIN matches m ON mg.match_id = m.match_id
  JOIN rounds r ON m.round_id = r.round_id
  JOIN tournaments tour ON r.tournament_id = tour.tournament_id
  JOIN course_tees ct ON r.tee_id = ct.tee_id
  JOIN tournament_golfers tg ON g.golfer_id = tg.golfer_id AND tg.tournament_id = ?
  LEFT JOIN teams t ON tg.team_id = t.team_id
  LEFT JOIN hole_scores s ON mg.match_id = s.match_id AND mg.golfer_id = s.golfer_id
  LEFT JOIN holes h ON r.course_id = h.course_id AND s.hole_number = h.hole_number
  WHERE r.tournament_id = ? AND tour.org_id = ?
";

$stmt = $conn->prepare($sql);
$stmt->bind_param("iiii", $tournament_id, $tournament_id, $tournament_id, $currentOrgId);
$stmt->execute();
$result = $stmt->get_result();

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
  }

  if ($row['strokes'] !== null && $row['par'] !== null && $row['slope'] !== null && $row['rating'] !== null) {
    $strokes = intval($row['strokes']);
    $par     = intval($row['par']);
    $hcp     = floatval($row['handicap']);
    $idx     = intval($row['handicap_index']);
    $slope   = floatval($row['slope']);
    $rating  = floatval($row['rating']);
    $handicap_pct = floatval($row['handicap_pct_snapshot']);

    $playing_handicap = ($hcp * ($slope / 113) + ($rating - 72)) * ($handicap_pct / 100);
    $playing_hcp_rounded = round($playing_handicap);

    if ($playing_hcp_rounded >= 0) {
      $baseStrokes      = intdiv($playing_hcp_rounded, 18);
      $extraStrokeHoles = $playing_hcp_rounded % 18;
      $handicapStrokes  = $baseStrokes + ($idx <= $extraStrokeHoles ? 1 : 0);
    } else {
      $absHcp           = abs($playing_hcp_rounded);
      $baseStrokes      = intdiv($absHcp, 18);
      $extraStrokeHoles = $absHcp % 18;
      $penaltyStrokes   = $baseStrokes + ($idx > (18 - $extraStrokeHoles) ? 1 : 0);
      $handicapStrokes  = -$penaltyStrokes;
    }

    $netForHole = $strokes - $handicapStrokes;

    error_log("Golfer: {$row['first_name']} (ID: $id), Hole: {$row['hole_number']}, Par: $par, Strokes: $strokes, Handicap: $hcp, Slope: $slope, Rating: $rating, Handicap %: $handicap_pct");
    error_log("  -> Playing Handicap (raw): $playing_handicap, Rounded: $playing_hcp_rounded");
    error_log("  -> Handicap Index: $idx, Base Strokes: $baseStrokes, Extra Stroke Holes: $extraStrokeHoles, Handicap Strokes for this hole: $handicapStrokes");
    error_log("  -> Net for Hole: $netForHole");

    $leaderboard[$id]['net_strokes']  += $netForHole;
    $leaderboard[$id]['par']          += $par;
    $leaderboard[$id]['holes_played'] ++;
  }
}

echo json_encode(array_values($leaderboard));
