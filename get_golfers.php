<?php
ini_set('display_errors', '0'); // Suppress error output that would break JSON
header('Content-Type: application/json');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
header("Access-Control-Allow-Origin: http://localhost");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
require_once 'db_connect.php';

$conn = new mysqli($servername, $username, $password, $dbname);
if ($conn->connect_error) {
    http_response_code(500);
    echo "DB connection failed";
    exit;
}

$sql = "SELECT golfer_id, first_name, last_name, handicap FROM golfers WHERE active = 1 ORDER BY last_name, first_name";
$result = $conn->query($sql);

$golfers = [];

while ($row = $result->fetch_assoc()) {
    $golfers[] = $row;
}

echo json_encode($golfers);
?>
