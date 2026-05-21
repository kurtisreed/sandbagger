<?php
require_once '../cors_headers.php';
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';
require_once 'auth_middleware.php';

$method        = $_SERVER['REQUEST_METHOD'];
$tournament_id = isset($_GET['tournament_id']) ? intval($_GET['tournament_id']) : null;
$format_id     = isset($_GET['format_id'])     ? intval($_GET['format_id'])     : null;

switch ($method) {
  case 'GET':
    if ($tournament_id !== null && $format_id !== null) {
      // Fetch single assignment (org-scoped)
      $stmt = $conn->prepare("
        SELECT tf.tournament_id, tf.format_id
          FROM tournament_formats tf
          JOIN tournaments t ON t.tournament_id = tf.tournament_id AND t.org_id = ?
         WHERE tf.tournament_id = ? AND tf.format_id = ?
      ");
      $stmt->bind_param('iii', $currentOrgId, $tournament_id, $format_id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_assoc());
    } elseif ($tournament_id !== null) {
      // List all formats for a tournament (org-scoped)
      $stmt = $conn->prepare("
        SELECT tf.format_id, f.name, f.label
          FROM tournament_formats tf
          JOIN formats f USING (format_id)
          JOIN tournaments t ON t.tournament_id = tf.tournament_id AND t.org_id = ?
         WHERE tf.tournament_id = ?
         ORDER BY f.label
      ");
      $stmt->bind_param('ii', $currentOrgId, $tournament_id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    } else {
      // List all assignments for this org
      $stmt = $conn->prepare("
        SELECT tf.tournament_id, tf.format_id
          FROM tournament_formats tf
          JOIN tournaments t ON t.tournament_id = tf.tournament_id AND t.org_id = ?
        ORDER BY tf.tournament_id, tf.format_id
      ");
      $stmt->bind_param('i', $currentOrgId);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    }
    break;

  case 'POST':
    // Assign a format to a tournament (org-scoped)
    $data = json_decode(file_get_contents('php://input'), true);
    $checkStmt = $conn->prepare("SELECT tournament_id FROM tournaments WHERE tournament_id = ? AND org_id = ?");
    $checkStmt->bind_param('ii', $data['tournament_id'], $currentOrgId);
    $checkStmt->execute();
    if ($checkStmt->get_result()->num_rows === 0) {
      http_response_code(403);
      echo json_encode(['error' => 'Tournament not found or access denied']);
      exit;
    }
    $checkStmt->close();
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
    // Remove a format from a tournament (org-scoped)
    $stmt = $conn->prepare("
      DELETE tf FROM tournament_formats tf
        JOIN tournaments t ON t.tournament_id = tf.tournament_id AND t.org_id = ?
       WHERE tf.tournament_id = ?
         AND tf.format_id     = ?
    ");
    $stmt->bind_param('iii', $currentOrgId, $tournament_id, $format_id);
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  default:
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    break;
}
