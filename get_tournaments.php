<?php
header('Content-Type: application/json');
// DB credentials
require_once 'db_connect.php';

$conn = new mysqli($servername, $username, $password, $dbname);
if ($conn->connect_error) {
  http_response_code(500);
  echo json_encode(['error' => 'Database connection failed']);
  exit;
}

$sql = "SELECT tournament_id, name FROM tournaments ORDER BY start_date DESC";
$result = $conn->query($sql);

$tournaments = [];
while ($row = $result->fetch_assoc()) {
  $tournaments[] = $row;
}

echo json_encode($tournaments);
?>