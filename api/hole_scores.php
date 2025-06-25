<?php
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';

$method      = $_SERVER['REQUEST_METHOD'];
$match_id    = isset($_GET['match_id'])    ? intval($_GET['match_id'])    : null;
$golfer_id   = isset($_GET['golfer_id'])   ? intval($_GET['golfer_id'])   : null;
$hole_number = isset($_GET['hole_number']) ? intval($_GET['hole_number']) : null;

switch ($method) {
  case 'GET':
    if ($match_id !== null && $golfer_id !== null && $hole_number !== null) {
      // single hole score
      $stmt = $conn->prepare("
        SELECT match_id, golfer_id, hole_number, strokes
          FROM hole_scores
         WHERE match_id    = ?
           AND golfer_id   = ?
           AND hole_number = ?
      ");
      $stmt->bind_param('iii', $match_id, $golfer_id, $hole_number);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_assoc());
    } elseif ($match_id !== null && $golfer_id !== null) {
      // all scores for a golfer in a match
      $stmt = $conn->prepare("
        SELECT match_id, golfer_id, hole_number, strokes
          FROM hole_scores
         WHERE match_id  = ?
           AND golfer_id = ?
         ORDER BY hole_number
      ");
      $stmt->bind_param('ii', $match_id, $golfer_id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    } elseif ($match_id !== null) {
      // all scores for a match
      $stmt = $conn->prepare("
        SELECT match_id, golfer_id, hole_number, strokes
          FROM hole_scores
         WHERE match_id = ?
         ORDER BY golfer_id, hole_number
      ");
      $stmt->bind_param('i', $match_id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    } else {
      // fetch all hole_scores
      $result = $conn->query("
        SELECT match_id, golfer_id, hole_number, strokes
          FROM hole_scores
         ORDER BY match_id, golfer_id, hole_number
      ");
      echo json_encode($result->fetch_all(MYSQLI_ASSOC));
    }
    break;

  case 'POST':
    // record a new hole score
    $data = json_decode(file_get_contents('php://input'), true);
    $stmt = $conn->prepare("
      INSERT INTO hole_scores (match_id, golfer_id, hole_number, strokes)
      VALUES (?, ?, ?, ?)
    ");
    $stmt->bind_param(
      'iiii',
      $data['match_id'],
      $data['golfer_id'],
      $data['hole_number'],
      $data['strokes']
    );
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  case 'PUT':
    // update an existing hole score
    parse_str(file_get_contents('php://input'), $data);
    $stmt = $conn->prepare("
      UPDATE hole_scores
         SET strokes = ?
       WHERE match_id    = ?
         AND golfer_id   = ?
         AND hole_number = ?
    ");
    $stmt->bind_param(
      'iiii',
      $data['strokes'],
      $match_id,
      $golfer_id,
      $hole_number
    );
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  case 'DELETE':
    // delete a hole score
    $stmt = $conn->prepare("
      DELETE FROM hole_scores
       WHERE match_id    = ?
         AND golfer_id   = ?
         AND hole_number = ?
    ");
    $stmt->bind_param('iii', $match_id, $golfer_id, $hole_number);
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  default:
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    break;
}
