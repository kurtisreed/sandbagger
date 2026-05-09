<?php
require_once '../cors_headers.php';
header('Content-Type: application/json');
require_once 'db_connect.php';

$conn->query("CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value VARCHAR(500) NOT NULL
)");
$conn->query("INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES ('group_pin', '1234')");

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $key = $_GET['key'] ?? null;
  if ($key) {
    $stmt = $conn->prepare("SELECT setting_value FROM app_settings WHERE setting_key = ?");
    $stmt->bind_param('s', $key);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    echo json_encode($row ?? ['setting_value' => null]);
  } else {
    $result = $conn->query("SELECT setting_key, setting_value FROM app_settings");
    echo json_encode($result->fetch_all(MYSQLI_ASSOC));
  }

} elseif ($method === 'PUT') {
  $data = json_decode(file_get_contents('php://input'), true);
  $key   = $data['key']   ?? null;
  $value = $data['value'] ?? null;
  if (!$key || $value === null) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing key or value']);
    exit;
  }
  $stmt = $conn->prepare("INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
    ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)");
  $stmt->bind_param('ss', $key, $value);
  $stmt->execute();
  echo json_encode(['success' => true]);

} else {
  http_response_code(405);
  echo json_encode(['error' => 'Method not allowed']);
}
