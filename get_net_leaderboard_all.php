<?php
session_start();
require_once 'db_connect.php';
ini_set('display_errors', '0'); // Suppress error output that would break JSON
header('Content-Type: application/json');
require_once 'cors_headers.php';
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



// Pull golfer handicap and hole handicap_index for all rounds in the tournament
$sql = "
  SELECT
    g.golfer_id,
    g.first_name,
    t.name AS team_name,
    t.color_hex AS team_color,
    g.handicap,
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
  JOIN course_tees ct ON r.tee_id = ct.tee_id
  JOIN tournament_golfers tg ON g.golfer_id = tg.golfer_id AND tg.tournament_id = ?
  JOIN teams t ON tg.team_id = t.team_id
  LEFT JOIN hole_scores s ON mg.match_id = s.match_id AND mg.golfer_id = s.golfer_id
  LEFT JOIN holes h ON r.course_id = h.course_id AND s.hole_number = h.hole_number
  WHERE r.tournament_id = ?
";

$stmt = $conn->prepare($sql);
$stmt->bind_param("ii", $tournament_id, $tournament_id);
$stmt->execute();
$result = $stmt->get_result();

// Get tournament handicap percent (same for all)
$tourSql = $conn->prepare("SELECT handicap_pct FROM tournaments WHERE tournament_id = ?");
$tourSql->bind_param("i", $tournament_id);
$tourSql->execute();
$tourResult = $tourSql->get_result();
$tourRow = $tourResult->fetch_assoc();
$handicap_pct = floatval($tourRow['handicap_pct']);

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

  // Only count holes with a recorded score & par
  if ($row['strokes'] !== null && $row['par'] !== null && $row['slope'] !== null && $row['rating'] !== null) {
    $strokes = intval($row['strokes']);
    $par     = intval($row['par']);
    $hcp     = floatval($row['handicap']);
    $idx     = intval($row['handicap_index']);
    $slope   = floatval($row['slope']);
    $rating  = floatval($row['rating']);

    // Calculate playing handicap for this course/round
    $playing_handicap = ($hcp * ($slope / 113) + ($rating - 72)) * ($handicap_pct / 100);
    $playing_hcp_rounded = round($playing_handicap);

    // Allocate strokes: base + 1 on the lowest-index holes
    $baseStrokes       = intdiv($playing_hcp_rounded, 18);
    $extraStrokeHoles  = $playing_hcp_rounded % 18;
    $handicapStrokes   = $baseStrokes + ($idx <= $extraStrokeHoles ? 1 : 0);

    $netForHole = $strokes - $handicapStrokes;

        // LOGGING
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