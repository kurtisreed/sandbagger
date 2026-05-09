<?php
require_once '../cors_headers.php';
header('Content-Type: application/json');
require_once 'db_connect.php';

// Ensure settings table and default PIN exist
$conn->query("CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value VARCHAR(500) NOT NULL
)");
$conn->query("INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES ('group_pin', '1234')");

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  echo json_encode(['error' => 'Method not allowed']);
  exit;
}

$data = json_decode(file_get_contents('php://input'), true);
$entered = trim($data['pin'] ?? '');

$stmt = $conn->prepare("SELECT setting_value FROM app_settings WHERE setting_key = 'group_pin'");
$stmt->execute();
$row = $stmt->get_result()->fetch_assoc();
$correct = $row['setting_value'] ?? '1234';

echo json_encode(['success' => $entered === $correct]);
