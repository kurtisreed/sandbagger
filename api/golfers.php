<?php
require_once '../cors_headers.php';
// public/api/golfers.php
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, private, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';
require_once 'auth_middleware.php';

$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['golfer_id']) ? intval($_GET['golfer_id']) : null;

switch ($method) {
  case 'GET':
    if ($id) {
      // Fetch one golfer (scoped to org)
      $stmt = $conn->prepare("
        SELECT golfer_id, first_name, last_name, handicap, user_id
          FROM golfers
         WHERE golfer_id = ?
           AND org_id = ?
      ");
      $stmt->bind_param('ii', $id, $currentOrgId);
      $stmt->execute();
      $row = $stmt->get_result()->fetch_assoc();
      echo json_encode($row);
    } else {
      // Fetch all golfers for this org
      $stmt = $conn->prepare("
        SELECT golfer_id, first_name, last_name, handicap, user_id
          FROM golfers
         WHERE org_id = ?
           AND active = 1
         ORDER BY last_name, first_name
      ");
      $stmt->bind_param('i', $currentOrgId);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    }
    break;

  case 'POST':
    requireAdmin();
    // Create a new golfer scoped to this org
    $data      = json_decode(file_get_contents('php://input'), true);
    $firstName = trim($data['first_name'] ?? '');
    $lastName  = trim($data['last_name']  ?? '');
    $handicap  = (float)($data['handicap'] ?? 0);
    $stmt = $conn->prepare("
      INSERT INTO golfers (first_name, last_name, handicap, org_id)
      VALUES (?, ?, ?, ?)
    ");
    $stmt->bind_param('ssdi', $firstName, $lastName, $handicap, $currentOrgId);
    $stmt->execute();
    echo json_encode(['inserted_id' => $stmt->insert_id]);
    break;

  case 'PUT':
    requireAdmin();
    // Update an existing golfer (must belong to this org)
    $data      = json_decode(file_get_contents('php://input'), true);
    $firstName = trim($data['first_name'] ?? '');
    $lastName  = trim($data['last_name']  ?? '');
    $handicap  = (float)($data['handicap'] ?? 0);
    $stmt = $conn->prepare("
      UPDATE golfers
         SET first_name = ?, last_name = ?, handicap = ?
       WHERE golfer_id = ?
         AND org_id = ?
    ");
    $stmt->bind_param('ssdii', $firstName, $lastName, $handicap, $id, $currentOrgId);
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  case 'DELETE':
    requireAdmin();
    // Delete a golfer (must belong to this org)
    $stmt = $conn->prepare("
      DELETE FROM golfers
       WHERE golfer_id = ?
         AND org_id = ?
    ");
    $stmt->bind_param('ii', $id, $currentOrgId);
    $stmt->execute();
    echo json_encode(['deleted_rows' => $stmt->affected_rows]);
    break;

  default:
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    break;
}
