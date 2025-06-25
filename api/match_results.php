<?php
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';

$method   = $_SERVER['REQUEST_METHOD'];
$match_id = isset($_GET['match_id']) ? intval($_GET['match_id']) : null;

switch ($method) {
  case 'GET':
    if ($match_id !== null) {
      // fetch one result
      $stmt = $conn->prepare("
        SELECT match_id, points_team_a, points_team_b
          FROM match_results
         WHERE match_id = ?
      ");
      $stmt->bind_param('i', $match_id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_assoc());
    } else {
      // fetch all results
      $result = $conn->query("
        SELECT match_id, points_team_a, points_team_b
          FROM match_results
         ORDER BY match_id
      ");
      echo json_encode($result->fetch_all(MYSQLI_ASSOC));
    }
    break;

  case 'POST':
    // create a new match_results entry
    $data = json_decode(file_get_contents('php://input'), true);
    $stmt = $conn->prepare("
      INSERT INTO match_results (match_id, points_team_a, points_team_b)
      VALUES (?, ?, ?)
    ");
    $stmt->bind_param(
      'idd',
      $data['match_id'],
      $data['points_team_a'],
      $data['points_team_b']
    );
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  case 'PUT':
    // update an existing result
    parse_str(file_get_contents('php://input'), $data);
    $stmt = $conn->prepare("
      UPDATE match_results
         SET points_team_a = ?,
             points_team_b = ?
       WHERE match_id      = ?
    ");
    $stmt->bind_param(
      'ddi',
      $data['points_team_a'],
      $data['points_team_b'],
      $match_id
    );
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  case 'DELETE':
    // delete a result
    $stmt = $conn->prepare("
      DELETE FROM match_results
       WHERE match_id = ?
    ");
    $stmt->bind_param('i', $match_id);
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  default:
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    break;
}
