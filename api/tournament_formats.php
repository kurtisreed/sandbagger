<?php
require_once '../cors_headers.php';
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';

$method        = $_SERVER['REQUEST_METHOD'];
$tournament_id = isset($_GET['tournament_id']) ? intval($_GET['tournament_id']) : null;
$format_id     = isset($_GET['format_id'])     ? intval($_GET['format_id'])     : null;

switch ($method) {
  case 'GET':
    if ($tournament_id !== null && $format_id !== null) {
      // Fetch single assignment
      $stmt = $conn->prepare("
        SELECT tournament_id, format_id
          FROM tournament_formats
         WHERE tournament_id = ? AND format_id = ?
      ");
      $stmt->bind_param('ii', $tournament_id, $format_id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_assoc());
    } elseif ($tournament_id !== null) {
      // List all formats for a tournament (with labels)
      $stmt = $conn->prepare("
        SELECT tf.format_id, f.name, f.label
          FROM tournament_formats tf
          JOIN formats f USING (format_id)
         WHERE tf.tournament_id = ?
         ORDER BY f.label
      ");
      $stmt->bind_param('i', $tournament_id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    } else {
      // List all assignments
      $result = $conn->query("
        SELECT tournament_id, format_id
          FROM tournament_formats
        ORDER BY tournament_id, format_id
      ");
      echo json_encode($result->fetch_all(MYSQLI_ASSOC));
    }
    break;

  case 'POST':
    // Assign a format to a tournament
    $data = json_decode(file_get_contents('php://input'), true);
    $stmt = $conn->prepare("
      INSERT INTO tournament_formats (tournament_id, format_id)
      VALUES (?, ?)
    ");
    $stmt->bind_param(
      'ii',
      $data['tournament_id'],
      $data['format_id']
    );
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  case 'DELETE':
    // Remove a format from a tournament
    $stmt = $conn->prepare("
      DELETE FROM tournament_formats
       WHERE tournament_id = ?
         AND format_id     = ?
    ");
    $stmt->bind_param('ii', $tournament_id, $format_id);
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  default:
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    break;
}
