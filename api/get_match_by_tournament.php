<?php
require_once '../cors_headers.php';
header('Content-Type: application/json');
header("Access-Control-Allow-Origin: http://localhost");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(200);
  exit;
}

require_once '../db_connect.php';

$tournamentId = isset($_GET['tournament_id']) ? intval($_GET['tournament_id']) : null;

if (!$tournamentId) {
  http_response_code(400);
  echo json_encode(['success' => false, 'error' => 'Missing tournament_id']);
  exit;
}

$conn = new mysqli($servername, $username, $password, $dbname);
if ($conn->connect_error) {
  http_response_code(500);
  echo json_encode(['success' => false, 'error' => 'Database connection failed']);
  exit;
}

// Get the match associated with this tournament
// Matches are linked to tournaments through rounds
$sql = "
SELECT m.match_id, m.match_code, m.round_id, m.finalized, r.round_name, r.tournament_id
FROM matches m
JOIN rounds r ON m.round_id = r.round_id
WHERE r.tournament_id = ?
LIMIT 1
";

$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $tournamentId);
$stmt->execute();
$result = $stmt->get_result();

if ($row = $result->fetch_assoc()) {
  echo json_encode([
    'success' => true,
    'match_id' => $row['match_id'],
    'match_code' => $row['match_code'],
    'round_id' => $row['round_id'],
    'round_name' => $row['round_name'],
    'tournament_id' => $row['tournament_id'],
    'finalized' => $row['finalized']
  ]);
} else {
  http_response_code(404);
  echo json_encode(['success' => false, 'error' => 'No match found for this tournament']);
}

$stmt->close();
$conn->close();
?>
