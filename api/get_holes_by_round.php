<?php
require_once 'db_connect.php';
require_once 'auth_middleware.php';

$round_id = $_GET['round_id'] ?? null;

if (!$round_id) {
  echo json_encode([]);
  exit;
}

// Scope: round must belong to a tournament in the current org
$sql = "
SELECT h.hole_number, h.par, h.handicap_index
FROM holes h
JOIN matches m ON m.course_id = h.course_id
JOIN rounds r ON m.round_id = r.round_id
JOIN tournaments t ON r.tournament_id = t.tournament_id
WHERE m.round_id = ? AND t.org_id = ?
ORDER BY h.hole_number
";

$stmt = $conn->prepare($sql);
$stmt->bind_param("ii", $round_id, $currentOrgId);
$stmt->execute();
$result = $stmt->get_result();

$holes = [];
while ($row = $result->fetch_assoc()) {
  $holes[] = $row;
}

echo json_encode($holes);
?>
