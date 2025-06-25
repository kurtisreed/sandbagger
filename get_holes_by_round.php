<?php
session_start();
// DB credentials
require db_connect.php;

$round_id = $_GET['round_id'] ?? null;

if (!$round_id) {
  echo json_encode([]);
  exit;
}

$conn = new mysqli($servername, $username, $password, $dbname);
if ($conn->connect_error) {
    http_response_code(500);
    echo "DB connection failed";
    exit;
}

$sql = "
SELECT h.hole_number, h.par, h.handicap_index
FROM holes h
JOIN matches m ON m.course_id = h.course_id
WHERE m.round_id = ?
ORDER BY h.hole_number
";

$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $round_id);
$stmt->execute();
$result = $stmt->get_result();

$holes = [];
while ($row = $result->fetch_assoc()) {
  $holes[] = $row;
}

echo json_encode($holes);
?>
