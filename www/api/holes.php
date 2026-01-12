<?php
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';

$method      = $_SERVER['REQUEST_METHOD'];
$course_id   = isset($_GET['course_id'])   ? intval($_GET['course_id'])   : null;
$hole_number = isset($_GET['hole_number']) ? intval($_GET['hole_number']) : null;

switch ($method) {
  case 'GET':
    if ($course_id !== null && $hole_number !== null) {
      // fetch one hole
      $stmt = $conn->prepare("
        SELECT course_id, hole_number, par, handicap_index
          FROM holes
         WHERE course_id = ? AND hole_number = ?
      ");
      $stmt->bind_param('ii', $course_id, $hole_number);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_assoc());
    } elseif ($course_id !== null) {
      // fetch all holes for a course
      $stmt = $conn->prepare("
        SELECT course_id, hole_number, par, handicap_index
          FROM holes
         WHERE course_id = ?
         ORDER BY hole_number
      ");
      $stmt->bind_param('i', $course_id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    } else {
      // fetch all holes
      $result = $conn->query("
        SELECT course_id, hole_number, par, handicap_index
          FROM holes
         ORDER BY course_id, hole_number
      ");
      echo json_encode($result->fetch_all(MYSQLI_ASSOC));
    }
    break;

  case 'POST':
    // create a new hole
    $data = json_decode(file_get_contents('php://input'), true);
    $stmt = $conn->prepare("
      INSERT INTO holes (course_id, hole_number, par, handicap_index)
      VALUES (?, ?, ?, ?)
    ");
    $stmt->bind_param(
      'iidi',
      $data['course_id'],
      $data['hole_number'],
      $data['par'],
      $data['handicap_index']
    );
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  case 'PUT':
    // update an existing hole
    parse_str(file_get_contents('php://input'), $data);
    $stmt = $conn->prepare("
      UPDATE holes
         SET par            = ?,
             handicap_index = ?
       WHERE course_id     = ? 
         AND hole_number   = ?
    ");
    $stmt->bind_param(
      'diii',
      $data['par'],
      $data['handicap_index'],
      $course_id,
      $hole_number
    );
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  case 'DELETE':
    // delete a hole
    $stmt = $conn->prepare("
      DELETE FROM holes
       WHERE course_id   = ?
         AND hole_number = ?
    ");
    $stmt->bind_param('ii', $course_id, $hole_number);
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  default:
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    break;
}
