<?php
require_once '../cors_headers.php';
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, private, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';
require_once 'auth_middleware.php';

$method      = $_SERVER['REQUEST_METHOD'];
$course_id   = isset($_GET['course_id'])   ? intval($_GET['course_id'])   : null;
$hole_number = isset($_GET['hole_number']) ? intval($_GET['hole_number']) : null;

// Helper: verify a course belongs to the current org
function courseOwnedByOrg($conn, $course_id, $orgId) {
    $stmt = $conn->prepare("SELECT course_id FROM courses WHERE course_id = ? AND org_id = ?");
    $stmt->bind_param('ii', $course_id, $orgId);
    $stmt->execute();
    $stmt->store_result();
    $found = $stmt->num_rows > 0;
    $stmt->close();
    return $found;
}

switch ($method) {
  case 'GET':
    if ($course_id !== null && $hole_number !== null) {
      // fetch one hole — scope through course org check
      if (!courseOwnedByOrg($conn, $course_id, $currentOrgId)) {
        http_response_code(403);
        echo json_encode(['error' => 'Course not found']);
        exit;
      }
      $stmt = $conn->prepare("
        SELECT course_id, hole_number, par, handicap_index
          FROM holes
         WHERE course_id = ? AND hole_number = ?
      ");
      $stmt->bind_param('ii', $course_id, $hole_number);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_assoc());
    } elseif ($course_id !== null) {
      // fetch all holes for a course — scope through course org check
      if (!courseOwnedByOrg($conn, $course_id, $currentOrgId)) {
        http_response_code(403);
        echo json_encode(['error' => 'Course not found']);
        exit;
      }
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
      // fetch all holes across this org's courses
      $stmt = $conn->prepare("
        SELECT h.course_id, h.hole_number, h.par, h.handicap_index
          FROM holes h
          JOIN courses c ON c.course_id = h.course_id AND c.org_id = ?
         ORDER BY h.course_id, h.hole_number
      ");
      $stmt->bind_param('i', $currentOrgId);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    }
    break;

  case 'POST':
    requireAdmin();
    // create a new hole — verify course belongs to org first
    $data = json_decode(file_get_contents('php://input'), true);
    $cid  = intval($data['course_id'] ?? 0);
    if (!courseOwnedByOrg($conn, $cid, $currentOrgId)) {
      http_response_code(403);
      echo json_encode(['error' => 'Course not found']);
      exit;
    }
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
    requireAdmin();
    // update an existing hole — verify course belongs to org first
    parse_str(file_get_contents('php://input'), $data);
    if (!courseOwnedByOrg($conn, $course_id, $currentOrgId)) {
      http_response_code(403);
      echo json_encode(['error' => 'Course not found']);
      exit;
    }
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
    requireAdmin();
    // delete a hole — verify course belongs to org first
    if (!courseOwnedByOrg($conn, $course_id, $currentOrgId)) {
      http_response_code(403);
      echo json_encode(['error' => 'Course not found']);
      exit;
    }
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
