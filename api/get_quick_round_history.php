<?php
require_once '../cors_headers.php';
header('Content-Type: application/json');
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");
require_once '../db_connect.php';

$conn = new mysqli($servername, $username, $password, $dbname);
if ($conn->connect_error) {
  http_response_code(500);
  echo json_encode(['error' => 'Database connection failed']);
  exit;
}

// Get all quick round matches (Best Ball, Rabbit, Wolf)
$sql = "
SELECT
  m.match_id,
  m.match_name,
  m.match_code,
  m.round_id,
  m.finalized,
  r.round_name,
  GROUP_CONCAT(CONCAT(g.first_name, ' ', g.last_name) ORDER BY g.first_name SEPARATOR ', ') AS participants
FROM matches m
JOIN rounds r ON m.round_id = r.round_id
JOIN match_golfers mg ON m.match_id = mg.match_id
JOIN golfers g ON mg.golfer_id = g.golfer_id
WHERE r.round_name IN ('Best Ball', 'Rabbit', 'Wolf')
GROUP BY m.match_id, m.match_name, m.match_code, m.round_id, m.finalized, r.round_name
ORDER BY m.match_id DESC
LIMIT 50
";

$result = $conn->query($sql);

if ($result === false) {
  http_response_code(500);
  echo json_encode(['error' => 'Query failed: ' . $conn->error]);
  exit;
}

$matches = [];
while ($row = $result->fetch_assoc()) {
  $matches[] = $row;
}

echo json_encode(['success' => true, 'matches' => $matches]);
$conn->close();
?>
