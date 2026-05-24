<?php
require_once '../cors_headers.php';
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");

require_once 'db_connect.php';
require_once 'auth_middleware.php';

$tournament_id = $_GET['tournament_id'] ?? null;

if (!$tournament_id) {
  echo json_encode(['error' => 'Missing tournament ID']);
  exit;
}

// 1) Fetch rounds (scoped by org)
$sqlRounds = "
  SELECT r.round_id, r.round_name, r.round_date
  FROM rounds r
  JOIN tournaments t ON r.tournament_id = t.tournament_id
  WHERE r.tournament_id = ? AND t.org_id = ?
  ORDER BY r.round_date
";
$stmt = $conn->prepare($sqlRounds);
$stmt->bind_param("ii", $tournament_id, $currentOrgId);
$stmt->execute();
$res = $stmt->get_result();

$rounds = [];
while ($row = $res->fetch_assoc()) {
  $rounds[] = $row;
}
$stmt->close();

// 2) Fetch players in this tournament (scoped by org via tournament)
$sqlPlayers = "
  SELECT
    g.golfer_id,
    CONCAT(g.first_name, ' ', g.last_name) AS name
  FROM tournament_golfers tg
  JOIN golfers g ON tg.golfer_id = g.golfer_id
  JOIN tournaments t ON tg.tournament_id = t.tournament_id
  WHERE tg.tournament_id = ? AND t.org_id = ?
  ORDER BY g.last_name, g.first_name
";
$stmt = $conn->prepare($sqlPlayers);
$stmt->bind_param("ii", $tournament_id, $currentOrgId);
$stmt->execute();
$res = $stmt->get_result();

$players = [];
while ($row = $res->fetch_assoc()) {
  $players[] = $row;
}
$stmt->close();

echo json_encode([
  'rounds'  => $rounds,
  'players' => $players
]);
