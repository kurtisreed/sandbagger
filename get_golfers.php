<?php
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';

$conn = new mysqli($servername, $username, $password, $dbname);
if ($conn->connect_error) {
    http_response_code(500);
    echo "DB connection failed";
    exit;
}

$sql = "SELECT golfer_id, first_name, last_name FROM golfers WHERE active = 1 ORDER BY last_name, first_name";
$result = $conn->query($sql);

$golfers = [];

while ($row = $result->fetch_assoc()) {
    $golfers[] = $row;
}

header('Content-Type: application/json');
echo json_encode($golfers);
?>
