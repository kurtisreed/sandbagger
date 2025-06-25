<?php
// public/api/courses.php
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';

$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['course_id']) ? intval($_GET['course_id']) : null;

switch ($method) {
  case 'GET':
    if ($id) {
      // fetch one course (alias course_name → name)
      $stmt = $conn->prepare("
        SELECT 
          course_id,
          course_name AS name,
          par_total,
          tees,
          slope,
          rating,
          total_yardage
        FROM courses
        WHERE course_id = ?
      ");
      $stmt->bind_param('i', $id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_assoc());
    } else {
      // fetch all courses
      $result = $conn->query("
        SELECT 
          course_id,
          course_name AS name,
          par_total,
          tees,
          slope,
          rating,
          total_yardage
        FROM courses
        ORDER BY course_name
      ");
      echo json_encode($result->fetch_all(MYSQLI_ASSOC));
    }
    break;

  case 'POST':
    // create new course
    $data = json_decode(file_get_contents('php://input'), true);
    $stmt = $conn->prepare("
      INSERT INTO courses 
        (course_name, par_total, tees, slope, rating, total_yardage)
      VALUES (?,?,?,?,?,?)
    ");
    $stmt->bind_param(
      'sisidi',
      $data['name'],
      $data['par_total'],
      $data['tees'],
      $data['slope'],
      $data['rating'],
      $data['total_yardage']
    );
    $stmt->execute();
    echo json_encode(['inserted_id' => $stmt->insert_id]);
    break;

  case 'PUT':
    // update existing course
    parse_str(file_get_contents('php://input'), $data);
    $stmt = $conn->prepare("
      UPDATE courses
         SET course_name   = ?,
             par_total     = ?,
             tees          = ?, 
             slope         = ?,
             rating        = ?,
             total_yardage = ?
       WHERE course_id    = ?
    ");
    $stmt->bind_param(
      'sisidii',
      $data['name'],
      $data['par_total'],
      $data['tees'],
      $data['slope'],
      $data['rating'],
      $data['total_yardage'],
      $id
    );
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  case 'DELETE':
    // delete a course
    $stmt = $conn->prepare("
      DELETE FROM courses 
       WHERE course_id = ?
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
