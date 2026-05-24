<?php
header('Content-Type: application/json');

require_once 'db_connect.php';
require_once 'auth_middleware.php';

$sql = "SELECT tournament_id, name FROM tournaments WHERE org_id = ? ORDER BY start_date DESC";
$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $currentOrgId);
$stmt->execute();
$result = $stmt->get_result();

$tournaments = [];
while ($row = $result->fetch_assoc()) {
  $tournaments[] = $row;
}

echo json_encode($tournaments);
?>
