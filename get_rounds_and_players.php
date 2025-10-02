<?php
session_start();
header("Access-Control-Allow-Origin: http://localhost");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");
// DB credentials
require_once 'db_connect.php';

$tournament_id = $_GET['tournament_id'] ?? null;

if (!$tournament_id) {
  echo json_encode(['error' => 'Missing tournament ID']);
  exit;
}

$conn = new mysqli($servername, $username, $password, $dbname);
if ($conn->connect_error) {
  http_response_code(500);
  echo json_encode(['error' => 'Database connection failed']);
  exit;
}

// 1) Fetch rounds
$sqlRounds = "
  SELECT round_id, round_name, round_date
  FROM rounds
  WHERE tournament_id = ?
  ORDER BY round_date
";
$stmt = $conn->prepare($sqlRounds);
$stmt->bind_param("i", $tournament_id);
$stmt->execute();
$res = $stmt->get_result();

$rounds = [];
while ($row = $res->fetch_assoc()) {
  $rounds[] = $row;
}
$stmt->close();

// 2) Fetch players in this tournament
$sqlPlayers = "
  SELECT 
    g.golfer_id, 
    CONCAT(g.first_name, ' ', g.last_name) AS name
  FROM tournament_golfers tg
  JOIN golfers g ON tg.golfer_id = g.golfer_id
  WHERE tg.tournament_id = ?
  ORDER BY g.last_name, g.first_name
";
$stmt = $conn->prepare($sqlPlayers);
$stmt->bind_param("i", $tournament_id);
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
