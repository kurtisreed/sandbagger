<?php
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';

$method        = $_SERVER['REQUEST_METHOD'];
$id            = isset($_GET['round_id'])      ? intval($_GET['round_id'])      : null;
$tournament_id = isset($_GET['tournament_id']) ? intval($_GET['tournament_id']) : null;

switch ($method) {
  case 'GET':
    if ($id) {
      // fetch one round
      $stmt = $conn->prepare("
        SELECT round_id, tournament_id, course_id, tee_id, round_name, round_date
          FROM rounds
         WHERE round_id = ?
      ");
      $stmt->bind_param('i', $id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_assoc());
    } elseif ($tournament_id) {
      // fetch rounds for a specific tournament
      $stmt = $conn->prepare("
        SELECT round_id, tournament_id, course_id, tee_id, round_name, round_date
          FROM rounds
         WHERE tournament_id = ?
         ORDER BY round_name
      ");
      $stmt->bind_param('i', $tournament_id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    } else {
      // fetch all rounds
      $result = $conn->query("
        SELECT round_id, tournament_id, course_id, tee_id, round_name, round_date
          FROM rounds
         ORDER BY round_date DESC
      ");
      echo json_encode($result->fetch_all(MYSQLI_ASSOC));
    }
    break;

  case 'POST':
    // create a new round
    $data = json_decode(file_get_contents('php://input'), true);
    $stmt = $conn->prepare("
      INSERT INTO rounds (tournament_id, course_id, tee_id, round_name, round_date)
      VALUES (?, ?, ?, ?, ?)
    ");
    $stmt->bind_param(
      'iiiss',
      $data['tournament_id'],
      $data['course_id'],
      $data['tee_id'], // Assuming tee_id is part of the data
      $data['round_name'],
      $data['round_date']
    );
    $stmt->execute();
    echo json_encode(['inserted_id' => $stmt->insert_id]);
    break;

  case 'PUT':
    // update an existing round
    parse_str(file_get_contents('php://input'), $data);
    $stmt = $conn->prepare("
      UPDATE rounds
         SET tournament_id = ?,
             course_id     = ?,
             tee_id        = ?,  // Assuming tee_id is part of the data
             round_name    = ?,
             round_date    = ?
       WHERE round_id     = ?
    ");
    $stmt->bind_param(
      'iissi',
      $data['tournament_id'],
      $data['course_id'],
      $data['tee_id'], // Assuming tee_id is part of the data
      $data['round_name'],
      $data['round_date'],
      $id
    );
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  case 'DELETE':
    $stmt = $conn->prepare("DELETE FROM rounds WHERE round_id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    echo json_encode(['deleted_rows' => $stmt->affected_rows]);
    break;

  default:
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    break;
}
