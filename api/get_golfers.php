<?php
ini_set('display_errors', '0');
header('Content-Type: application/json');
header("Cache-Control: no-store, no-cache, private, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once '../cors_headers.php';

require_once 'db_connect.php';
require_once 'auth_middleware.php';

$sql = "SELECT golfer_id, first_name, last_name, handicap, role FROM golfers WHERE active = 1 AND org_id = ? ORDER BY last_name, first_name";
$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $currentOrgId);
$stmt->execute();
$result = $stmt->get_result();

$golfers = [];
while ($row = $result->fetch_assoc()) {
    $golfers[] = $row;
}

echo json_encode($golfers);
?>
