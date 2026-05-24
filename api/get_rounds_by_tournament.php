<?php
header('Content-Type: application/json');

require_once 'db_connect.php';
require_once 'auth_middleware.php';

$tournament_id = $_GET['tournament_id'] ?? null;

if (!$tournament_id) {
  echo json_encode(['error' => 'Missing tournament ID']);
  exit;
}

$sql = "
  SELECT r.round_id, r.round_name, r.round_date
  FROM rounds r
  JOIN tournaments t ON r.tournament_id = t.tournament_id
  WHERE r.tournament_id = ? AND t.org_id = ?
  ORDER BY r.round_date
";
$stmt = $conn->prepare($sql);
$stmt->bind_param("ii", $tournament_id, $currentOrgId);
$stmt->execute();
$result = $stmt->get_result();

$rounds = [];
while ($row = $result->fetch_assoc()) {
  $rounds[] = $row;
}

echo json_encode($rounds);
?>
