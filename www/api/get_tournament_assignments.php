<?php
header('Content-Type: application/json');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';

// 1) Validate input
$tournament_id = isset($_GET['tournament_id'])
  ? intval($_GET['tournament_id'])
  : null;

if (!$tournament_id) {
  http_response_code(400);
  echo json_encode(['error' => 'Missing tournament_id']);
  exit;
}

// 2) Fetch teams associated with the tournament
$stmt = $conn->prepare("
  SELECT tt.team_id, t.name, t.color_hex
    FROM tournament_teams AS tt
    JOIN teams AS t ON tt.team_id = t.team_id
   WHERE tt.tournament_id = ?
");
$stmt->bind_param("i", $tournament_id);
$stmt->execute();
$res = $stmt->get_result();

$teams = [];
while ($row = $res->fetch_assoc()) {
  $teams[(int)$row['team_id']] = [
    'id'    => (int)$row['team_id'],
    'name'  => $row['name'],
    'color' => $row['color_hex'],
    'golfers' => [] // Initialize empty golfer list for each team
  ];
}
$stmt->close();

// 3) Fetch all golfers
$stmt = $conn->prepare("
  SELECT g.golfer_id, g.first_name, g.last_name, g.handicap, tg.team_id
    FROM golfers AS g
    LEFT JOIN tournament_golfers AS tg
      ON g.golfer_id = tg.golfer_id AND tg.tournament_id = ?
");
$stmt->bind_param("i", $tournament_id);
$stmt->execute();
$res = $stmt->get_result();

$unassignedGolfers = [];
while ($row = $res->fetch_assoc()) {
  // Combine first_name and last_name into a single name field
  $golfer = [
    'id'       => (int)$row['golfer_id'],
    'name'     => $row['first_name'] . ' ' . $row['last_name'], // Combine names
    'handicap' => (float)$row['handicap']
  ];

  $team_id = $row['team_id'];
  if ($team_id && isset($teams[$team_id])) {
    // Add golfer to the appropriate team
    $teams[$team_id]['golfers'][] = $golfer;
  } else {
    // Golfer is unassigned
    $unassignedGolfers[] = $golfer;
  }
}
$stmt->close();

// 4) Output JSON
echo json_encode([
  'tournament_id' => $tournament_id,
  'teams'         => array_values($teams), // Convert associative array to indexed array
  'unassigned'    => $unassignedGolfers    // List of unassigned golfers
]);