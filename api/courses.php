<?php
require_once '../cors_headers.php';
// public/api/courses.php
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';
require_once 'auth_middleware.php';

$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['course_id']) ? intval($_GET['course_id']) : null;

switch ($method) {
  case 'GET':
    if ($id) {
      // fetch one course — must belong to this org
      $stmt = $conn->prepare("
        SELECT
          course_id,
          course_name AS name
        FROM courses
        WHERE course_id = ? AND org_id = ?
      ");
      $stmt->bind_param('ii', $id, $currentOrgId);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_assoc());
    } else {
      // fetch all courses for this org
      $stmt = $conn->prepare("
        SELECT
          course_id,
          course_name AS name
        FROM courses
        WHERE org_id = ?
        ORDER BY course_name
      ");
      $stmt->bind_param('i', $currentOrgId);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    }
    break;

  case 'POST':
    requireAdmin();
    // create new course for this org
    $data = json_decode(file_get_contents('php://input'), true);
    $stmt = $conn->prepare("
      INSERT INTO courses
        (course_name, par_total, tees, slope, rating, total_yardage, org_id)
      VALUES (?,?,?,?,?,?,?)
    ");
    $stmt->bind_param(
      'sisidii',
      $data['name'],
      $data['par_total'],
      $data['tees'],
      $data['slope'],
      $data['rating'],
      $data['total_yardage'],
      $currentOrgId
    );
    $stmt->execute();
    echo json_encode(['inserted_id' => $stmt->insert_id]);
    break;

  case 'PUT':
    requireAdmin();
    // update existing course — must belong to this org
    parse_str(file_get_contents('php://input'), $data);
    $stmt = $conn->prepare("
      UPDATE courses
         SET course_name   = ?,
             par_total     = ?,
             tees          = ?,
             slope         = ?,
             rating        = ?,
             total_yardage = ?
       WHERE course_id = ? AND org_id = ?
    ");
    $stmt->bind_param(
      'sisidiii',
      $data['name'],
      $data['par_total'],
      $data['tees'],
      $data['slope'],
      $data['rating'],
      $data['total_yardage'],
      $id,
      $currentOrgId
    );
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  case 'DELETE':
    requireAdmin();
    // delete a course — must belong to this org
    $stmt = $conn->prepare("
      DELETE FROM courses
       WHERE course_id = ? AND org_id = ?
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
