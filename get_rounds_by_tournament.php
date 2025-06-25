<?php
session_start();
header('Content-Type: application/json');
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

$sql = "SELECT round_id, round_name, round_date FROM rounds WHERE tournament_id = ? ORDER BY round_date";
$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $tournament_id);
$stmt->execute();
$result = $stmt->get_result();

$rounds = [];
while ($row = $result->fetch_assoc()) {
  $rounds[] = $row;
}

echo json_encode($rounds);
?>