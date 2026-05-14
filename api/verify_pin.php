<?php
error_reporting(E_ALL);
ini_set('log_errors', '1');
require_once '../cors_headers.php';
header('Content-Type: application/json');
error_log('[verify_pin] step1: cors+header done');
require_once 'db_connect.php';
error_log('[verify_pin] step2: db connected, conn=' . ($conn ? 'OK' : 'FAIL'));

// Ensure settings table and default PIN exist (wrapped for PHP 8.1+ exception safety)
try {
  $conn->query("CREATE TABLE IF NOT EXISTS app_settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value VARCHAR(500) NOT NULL
  )");
  $conn->query("INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES ('group_pin', '1234')");
} catch (Exception $e) {
  // Table likely already exists or user lacks CREATE privilege — safe to continue
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  echo json_encode(['error' => 'Method not allowed']);
  exit;
}

$data = json_decode(file_get_contents('php://input'), true);
$entered = trim($data['pin'] ?? '');

error_log('[verify_pin] step3: about to prepare');
$stmt = $conn->prepare("SELECT setting_value FROM app_settings WHERE setting_key = 'group_pin'");
error_log('[verify_pin] step4: prepare result=' . ($stmt ? 'OK' : 'FAIL: ' . $conn->error));
if (!$stmt) {
  // app_settings table doesn't exist yet — fall back to default PIN
  echo json_encode(['success' => $entered === '1234']);
  exit;
}
$stmt->execute();
$row = $stmt->get_result()->fetch_assoc();
$correct = $row['setting_value'] ?? '1234';

echo json_encode(['success' => $entered === $correct]);
