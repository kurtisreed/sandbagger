<?php
// public/api/golfers.php
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';

$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['golfer_id']) ? intval($_GET['golfer_id']) : null;

switch ($method) {
  case 'GET':
    if ($id) {
      // Fetch one golfer
      $stmt = $conn->prepare("
        SELECT golfer_id, first_name, last_name, handicap
          FROM golfers
         WHERE golfer_id = ?
      ");
      $stmt->bind_param('i', $id);
      $stmt->execute();
      $row = $stmt->get_result()->fetch_assoc();
      echo json_encode($row);
    } else {
      // Fetch all golfers
      $result = $conn->query("
        SELECT golfer_id, first_name, last_name, handicap
          FROM golfers
         ORDER BY last_name, first_name
      ");
      echo json_encode($result->fetch_all(MYSQLI_ASSOC));
    }
    break;

  case 'POST':
    // Create a new golfer
    $data = json_decode(file_get_contents('php://input'), true);
    $stmt = $conn->prepare("
      INSERT INTO golfers (first_name, last_name, handicap)
      VALUES (?, ?, ?)
    ");
    $stmt->bind_param(
      'ssd',
      $data['first_name'],
      $data['last_name'],
      $data['handicap']
    );
    $stmt->execute();
    echo json_encode(['inserted_id' => $stmt->insert_id]);
    break;

  case 'PUT':
    // Update an existing golfer
    parse_str(file_get_contents('php://input'), $data);
    $stmt = $conn->prepare("
      UPDATE golfers
         SET first_name = ?, last_name = ?, handicap = ?
       WHERE golfer_id = ?
    ");
    $stmt->bind_param(
      'ssdi',
      $data['first_name'],
      $data['last_name'],
      $data['handicap'],
      $id
    );
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  case 'DELETE':
    // Delete a golfer
    $stmt = $conn->prepare("
      DELETE FROM golfers
       WHERE golfer_id = ?
    ");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    echo json_encode(['deleted_rows' => $stmt->affected_rows]);
    break;

  default:
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    break;
}
