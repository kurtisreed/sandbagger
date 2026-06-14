<?php
require_once 'db_connect.php';
header('Content-Type: application/json');
require_once '../cors_headers.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");
require_once 'auth_middleware.php';

$tournament_id = $_GET['tournament_id'] ?? $_SESSION['tournament_id'] ?? null;
if (!$tournament_id) {
  echo json_encode(['error' => 'No tournament specified']);
  exit;
}

// 1. Members per match (team), with handicap + course slope/rating + handicap %
$memberSql = "
  SELECT
    m.match_id, r.round_id, r.round_name,
    ct.slope, ct.rating,
    COALESCE(tg.handicap_pct_at_assignment, tour.handicap_pct) AS pct,
    g.golfer_id, g.first_name,
    COALESCE(tg.handicap_at_assignment, g.handicap) AS handicap
  FROM matches m
  JOIN rounds r ON m.round_id = r.round_id
  JOIN tournaments tour ON r.tournament_id = tour.tournament_id
  JOIN course_tees ct ON r.tee_id = ct.tee_id
  JOIN match_golfers mg ON mg.match_id = m.match_id
  JOIN golfers g ON mg.golfer_id = g.golfer_id
  JOIN tournament_golfers tg ON tg.golfer_id = g.golfer_id AND tg.tournament_id = tour.tournament_id
  WHERE r.tournament_id = ? AND tour.org_id = ?
  ORDER BY r.round_id, m.match_id, g.first_name
";
$stmt = $conn->prepare($memberSql);
$stmt->bind_param("ii", $tournament_id, $currentOrgId);
$stmt->execute();
$res = $stmt->get_result();

$matches = [];
while ($row = $res->fetch_assoc()) {
  $mid = $row['match_id'];
  if (!isset($matches[$mid])) {
    $matches[$mid] = [
      'match_id'   => intval($mid),
      'round_id'   => intval($row['round_id']),
      'round_name' => $row['round_name'],
      'slope'      => floatval($row['slope']),
      'rating'     => floatval($row['rating']),
      'pct'        => floatval($row['pct']),
      'members'    => [],
    ];
  }
  $matches[$mid]['members'][] = [
    'golfer_id'  => intval($row['golfer_id']),
    'first_name' => $row['first_name'],
    'handicap'   => floatval($row['handicap']),
  ];
}

// 2. Team score per hole (all members share the score → AVG = the value), with par
$scoreSql = "
  SELECT s.match_id, s.hole_number, AVG(s.strokes) AS strokes, h.par
  FROM hole_scores s
  JOIN matches m ON s.match_id = m.match_id
  JOIN rounds r ON m.round_id = r.round_id
  JOIN tournaments tour ON r.tournament_id = tour.tournament_id
  LEFT JOIN holes h ON r.course_id = h.course_id AND s.hole_number = h.hole_number
  WHERE r.tournament_id = ? AND tour.org_id = ?
  GROUP BY s.match_id, s.hole_number, h.par
";
$stmt2 = $conn->prepare($scoreSql);
$stmt2->bind_param("ii", $tournament_id, $currentOrgId);
$stmt2->execute();
$res2 = $stmt2->get_result();

$grossByMatch = [];
$parByMatch   = [];
$holesByMatch = [];
while ($row = $res2->fetch_assoc()) {
  $mid = $row['match_id'];
  $grossByMatch[$mid] = ($grossByMatch[$mid] ?? 0) + round($row['strokes']);
  $parByMatch[$mid]   = ($parByMatch[$mid] ?? 0) + intval($row['par']);
  $holesByMatch[$mid] = ($holesByMatch[$mid] ?? 0) + 1;
}

// 3. Assemble per-team rows: team net = gross − average of members' playing handicaps
$teams = [];
foreach ($matches as $mid => $mt) {
  $gross  = $grossByMatch[$mid] ?? 0;
  $par    = $parByMatch[$mid] ?? 0;
  $holes  = $holesByMatch[$mid] ?? 0;

  // Average playing handicap across members for this round's course
  $phSum = 0.0;
  $ids   = [];
  foreach ($mt['members'] as $mem) {
    $courseHcp = ($mem['handicap'] * ($mt['slope'] / 113)) + ($mt['rating'] - 72);
    $playing   = $mt['pct'] < 0 ? $mem['handicap'] : ($courseHcp * $mt['pct'] / 100); // honor manual-handicap sentinel
    $phSum    += $playing;
    $ids[]     = $mem['golfer_id'];
  }
  $avgPh = count($mt['members']) ? round($phSum / count($mt['members'])) : 0;

  sort($ids);
  $teams[] = [
    'match_id'     => $mt['match_id'],
    'round_id'     => $mt['round_id'],
    'round_name'   => $mt['round_name'],
    'team_key'     => implode('-', $ids),
    'team_label'   => implode(', ', array_map(fn($m) => $m['first_name'], $mt['members'])),
    'gross'        => $gross,
    'net'          => $gross - $avgPh,
    'par'          => $par,
    'holes_played' => $holes,
  ];
}

echo json_encode(['teams' => array_values($teams)]);
?>
