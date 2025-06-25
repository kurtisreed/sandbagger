<?php
// public/api/formats.php
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';

$method    = $_SERVER['REQUEST_METHOD'];
$format_id = isset($_GET['format_id']) ? intval($_GET['format_id']) : null;

switch ($method) {
  case 'GET':
    if ($format_id) {
      // fetch one format
      $stmt = $conn->prepare("
        SELECT format_id, name, label
          FROM formats
         WHERE format_id = ?
      ");
      $stmt->bind_param('i', $format_id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_assoc());
    } else {
      // fetch all formats
      $result = $conn->query("
        SELECT format_id, name, label
          FROM formats
         ORDER BY label
      ");
      echo json_encode($result->fetch_all(MYSQLI_ASSOC));
    }
    break;

  case 'POST':
    // create a new format
    $data = json_decode(file_get_contents('php://input'), true);
    $stmt = $conn->prepare("
      INSERT INTO formats (name, label)
      VALUES (?, ?)
    ");
    $stmt->bind_param(
      'ss',
      $data['name'],
      $data['label']
    );
    $stmt->execute();
    echo json_encode(['inserted_id' => $stmt->insert_id]);
    break;

  case 'PUT':
    // update an existing format
    parse_str(file_get_contents('php://input'), $data);
    $stmt = $conn->prepare("
      UPDATE formats
         SET name  = ?,
             label = ?
       WHERE format_id = ?
    ");
    $stmt->bind_param(
      'ssi',
      $data['name'],
      $data['label'],
      $format_id
    );
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  case 'DELETE':
    // delete a format
    $stmt = $conn->prepare("DELETE FROM formats WHERE format_id = ?");
    $stmt->bind_param('i', $format_id);
    $stmt->execute();
    echo json_encode(['deleted_rows' => $stmt->affected_rows]);
    break;

  default:
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    break;
}
