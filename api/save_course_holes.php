<?php
// Batch upsert for 18 holes on a course (par + handicap_index).
// Replaces all existing hole records for the course in one transaction.
require_once '../cors_headers.php';
header('Content-Type: application/json');
require_once '../db_connect.php';
require_once __DIR__ . '/auth_middleware.php';

requireAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405); echo json_encode(['error' => 'POST only']); exit;
}

$data     = json_decode(file_get_contents('php://input'), true);
$courseId = intval($data['course_id'] ?? 0);
$holes    = $data['holes'] ?? [];   // [{hole_number, par, handicap_index}, ...]

if (!$courseId || empty($holes)) {
    http_response_code(400); echo json_encode(['error' => 'Missing course_id or holes']); exit;
}

// Verify course belongs to org
$s = $conn->prepare("SELECT course_id FROM courses WHERE course_id = ? AND org_id = ?");
$s->bind_param('ii', $courseId, $currentOrgId);
$s->execute();
$s->store_result();
if ($s->num_rows === 0) {
    http_response_code(403); echo json_encode(['error' => 'Course not found']); exit;
}
$s->close();

$conn->begin_transaction();
try {
    // Delete existing holes for this course
    $del = $conn->prepare("DELETE FROM holes WHERE course_id = ?");
    $del->bind_param('i', $courseId);
    $del->execute();
    $del->close();

    // Insert all holes
    $ins = $conn->prepare("INSERT INTO holes (course_id, hole_number, par, handicap_index) VALUES (?,?,?,?)");
    foreach ($holes as $hole) {
        $num = intval($hole['hole_number']);
        $par = intval($hole['par'] ?? 4);
        $hi  = isset($hole['handicap_index']) && $hole['handicap_index'] !== '' ? intval($hole['handicap_index']) : null;
        $ins->bind_param('iiii', $courseId, $num, $par, $hi);
        $ins->execute();
    }
    $ins->close();

    $conn->commit();
    echo json_encode(['success' => true]);
} catch (Exception $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
