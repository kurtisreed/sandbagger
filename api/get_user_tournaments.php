<?php
require_once '../cors_headers.php';
header('Content-Type: application/json');
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");
require_once '../db_connect.php';

$golferId = isset($_GET['golfer_id']) ? intval($_GET['golfer_id']) : null;

if (!$golferId) {
  http_response_code(400);
  echo json_encode(['error' => 'Missing golfer_id']);
  exit;
}

$conn = new mysqli($servername, $username, $password, $dbname);
if ($conn->connect_error) {
  http_response_code(500);
  echo json_encode(['error' => 'Database connection failed']);
  exit;
}

// Get tournaments the golfer is enrolled in
// Include future tournaments and those within the past 2 weeks
$sql = "
SELECT DISTINCT
  t.tournament_id,
  t.name AS tournament_name,
  t.start_date,
  t.end_date,
  t.format_id,
  r.round_id,
  r.round_name,
  r.round_date,
  c.course_name
FROM tournament_golfers tg
JOIN tournaments t ON tg.tournament_id = t.tournament_id
LEFT JOIN rounds r ON t.tournament_id = r.tournament_id
LEFT JOIN courses c ON r.course_id = c.course_id
WHERE tg.golfer_id = ?
  AND t.end_date >= DATE_SUB(CURDATE(), INTERVAL 2 WEEK)
ORDER BY t.start_date DESC, r.round_date ASC
";

$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $golferId);
$stmt->execute();
$result = $stmt->get_result();

$tournaments = [];
while ($row = $result->fetch_assoc()) {
  $tournamentId = $row['tournament_id'];

  // Group rounds under tournaments
  if (!isset($tournaments[$tournamentId])) {
    $tournaments[$tournamentId] = [
      'tournament_id' => $row['tournament_id'],
      'tournament_name' => $row['tournament_name'],
      'start_date' => $row['start_date'],
      'end_date' => $row['end_date'],
      'format_id' => $row['format_id'],
      'rounds' => []
    ];
  }

  if ($row['round_id']) {
    $tournaments[$tournamentId]['rounds'][] = [
      'round_id' => $row['round_id'],
      'round_name' => $row['round_name'],
      'round_date' => $row['round_date'],
      'course_name' => $row['course_name']
    ];
  }
}

echo json_encode([
  'success' => true,
  'tournaments' => array_values($tournaments)
]);

$stmt->close();
$conn->close();
?>
