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
require_once __DIR__ . '/auth_middleware.php';
requireAdmin();

$data = json_decode(file_get_contents('php://input'), true);

$firstName = isset($data['first_name']) ? trim($data['first_name']) : null;
$lastName = isset($data['last_name']) ? trim($data['last_name']) : null;
$handicap = isset($data['handicap']) ? floatval($data['handicap']) : 0;
$email = isset($data['email']) ? trim($data['email']) : null;

if (!$firstName || !$lastName) {
  http_response_code(400);
  echo json_encode(['success' => false, 'error' => 'First name and last name are required']);
  exit;
}

if (!isset($conn) || $conn->connect_error) {
  $conn = new mysqli($servername, $username, $password, $dbname);
  if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database connection failed']);
    exit;
  }
}

try {
  $stmt = $conn->prepare("INSERT INTO golfers (first_name, last_name, handicap, email, org_id) VALUES (?, ?, ?, ?, ?)");
  $stmt->bind_param("ssdsi", $firstName, $lastName, $handicap, $email, $currentOrgId);

  if ($stmt->execute()) {
    $golferId = $conn->insert_id;
    echo json_encode([
      'success' => true,
      'golfer_id' => $golferId,
      'message' => 'Golfer created successfully'
    ]);
  } else {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to create golfer']);
  }

  $stmt->close();
} catch (Exception $e) {
  http_response_code(500);
  echo json_encode(['success' => false, 'error' => 'Database error: ' . $e->getMessage()]);
}

$conn->close();
?>
