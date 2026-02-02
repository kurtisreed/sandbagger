<?php
require_once '../cors_headers.php';
header('Content-Type: application/json');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(200);
  exit;
}

require_once '../db_connect.php';

$data = json_decode(file_get_contents('php://input'), true);

$golferId = isset($data['golfer_id']) ? intval($data['golfer_id']) : null;
$firstName = isset($data['first_name']) ? trim($data['first_name']) : null;
$lastName = isset($data['last_name']) ? trim($data['last_name']) : null;
$handicap = isset($data['handicap']) ? floatval($data['handicap']) : 0;
$email = isset($data['email']) && $data['email'] !== null ? trim($data['email']) : '';

if (!$golferId || !$firstName || !$lastName) {
  http_response_code(400);
  echo json_encode(['success' => false, 'error' => 'Golfer ID, first name, and last name are required']);
  exit;
}

$conn = new mysqli($servername, $username, $password, $dbname);
if ($conn->connect_error) {
  http_response_code(500);
  echo json_encode(['success' => false, 'error' => 'Database connection failed']);
  exit;
}

try {
  $stmt = $conn->prepare("UPDATE golfers SET first_name = ?, last_name = ?, handicap = ?, email = ? WHERE golfer_id = ?");
  $stmt->bind_param("ssdsi", $firstName, $lastName, $handicap, $email, $golferId);

  if ($stmt->execute()) {
    if ($stmt->affected_rows > 0 || $stmt->affected_rows === 0) {
      echo json_encode([
        'success' => true,
        'message' => 'Golfer updated successfully'
      ]);
    } else {
      http_response_code(404);
      echo json_encode(['success' => false, 'error' => 'Golfer not found']);
    }
  } else {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to update golfer']);
  }

  $stmt->close();
} catch (Exception $e) {
  http_response_code(500);
  echo json_encode(['success' => false, 'error' => 'Database error: ' . $e->getMessage()]);
}

$conn->close();
?>
