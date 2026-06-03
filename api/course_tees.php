<?php
// CRUD for course_tees. All operations scoped to the current org via courses.org_id.
require_once '../cors_headers.php';
header('Content-Type: application/json');
require_once '../db_connect.php';
require_once __DIR__ . '/auth_middleware.php';

requireAdmin();

$method = $_SERVER['REQUEST_METHOD'];
$teeId  = isset($_GET['tee_id']) ? intval($_GET['tee_id']) : null;

// Helper: verify course belongs to org
function teesCourseOwnedByOrg($conn, $courseId, $orgId) {
    $s = $conn->prepare("SELECT course_id FROM courses WHERE course_id = ? AND org_id = ?");
    $s->bind_param('ii', $courseId, $orgId);
    $s->execute();
    $s->store_result();
    $ok = $s->num_rows > 0;
    $s->close();
    return $ok;
}

switch ($method) {
    case 'GET':
        $courseId = isset($_GET['course_id']) ? intval($_GET['course_id']) : 0;
        if (!$courseId || !teesCourseOwnedByOrg($conn, $courseId, $currentOrgId)) {
            http_response_code(403); echo json_encode(['error' => 'Course not found']); exit;
        }
        $stmt = $conn->prepare("SELECT tee_id, tee_name, slope, rating, par, yardage FROM course_tees WHERE course_id = ? ORDER BY tee_id ASC");
        $stmt->bind_param('i', $courseId);
        $stmt->execute();
        echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
        break;

    case 'POST':
        $data     = json_decode(file_get_contents('php://input'), true);
        $courseId = intval($data['course_id'] ?? 0);
        $teeName  = trim($data['tee_name'] ?? '');
        $slope    = intval($data['slope']   ?? 0);
        $rating   = floatval($data['rating'] ?? 0);
        $par      = intval($data['par']     ?? 72);
        $yardage  = intval($data['yardage'] ?? 0);

        if (!$courseId || !$teeName) {
            http_response_code(400); echo json_encode(['error' => 'Missing fields']); exit;
        }
        if (!teesCourseOwnedByOrg($conn, $courseId, $currentOrgId)) {
            http_response_code(403); echo json_encode(['error' => 'Course not found']); exit;
        }

        $stmt = $conn->prepare("INSERT INTO course_tees (course_id, tee_name, slope, rating, par, yardage) VALUES (?,?,?,?,?,?)");
        $stmt->bind_param('isidii', $courseId, $teeName, $slope, $rating, $par, $yardage);
        $stmt->execute();
        echo json_encode(['tee_id' => $stmt->insert_id]);
        break;

    case 'PUT':
        if (!$teeId) { http_response_code(400); echo json_encode(['error' => 'Missing tee_id']); exit; }
        $data    = json_decode(file_get_contents('php://input'), true);
        $teeName = trim($data['tee_name'] ?? '');
        $slope   = intval($data['slope']   ?? 0);
        $rating  = floatval($data['rating'] ?? 0);
        $par     = intval($data['par']     ?? 72);
        $yardage = intval($data['yardage'] ?? 0);

        // Verify ownership via JOIN
        $stmt = $conn->prepare("
            UPDATE course_tees ct
            JOIN courses c ON ct.course_id = c.course_id AND c.org_id = ?
            SET ct.tee_name = ?, ct.slope = ?, ct.rating = ?, ct.par = ?, ct.yardage = ?
            WHERE ct.tee_id = ?
        ");
        $stmt->bind_param('isidiii', $currentOrgId, $teeName, $slope, $rating, $par, $yardage, $teeId);
        $stmt->execute();
        echo json_encode(['success' => true, 'affected' => $stmt->affected_rows]);
        break;

    case 'DELETE':
        if (!$teeId) { http_response_code(400); echo json_encode(['error' => 'Missing tee_id']); exit; }
        $stmt = $conn->prepare("
            DELETE ct FROM course_tees ct
            JOIN courses c ON ct.course_id = c.course_id AND c.org_id = ?
            WHERE ct.tee_id = ?
        ");
        $stmt->bind_param('ii', $currentOrgId, $teeId);
        $stmt->execute();
        echo json_encode(['success' => true]);
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
}
?>
