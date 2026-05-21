<?php
require_once '../cors_headers.php';
header('Content-Type: application/json');
require_once 'db_connect.php';
require_once 'auth_middleware.php';

$course_id = isset($_GET['course_id']) ? intval($_GET['course_id']) : 0;
if (!$course_id) {
    echo json_encode(['error' => 'Missing course_id']);
    exit;
}

// Verify the course belongs to the current org
$stmt = $conn->prepare("SELECT course_id FROM courses WHERE course_id = ? AND org_id = ?");
$stmt->bind_param('ii', $course_id, $currentOrgId);
$stmt->execute();
$stmt->store_result();
if ($stmt->num_rows === 0) {
    http_response_code(403);
    echo json_encode(['error' => 'Course not found']);
    exit;
}
$stmt->close();

// Get all tees for this course
$stmt = $conn->prepare("SELECT * FROM course_tees WHERE course_id = ?");
$stmt->bind_param('i', $course_id);
$stmt->execute();
$res = $stmt->get_result();
$tees = [];
while ($row = $res->fetch_assoc()) {
    $tees[] = $row;
}
$stmt->close();

// Get all holes for this course, ordered by hole_number
$stmt = $conn->prepare("SELECT hole_number, par, handicap_index FROM holes WHERE course_id = ? ORDER BY hole_number ASC");
$stmt->bind_param('i', $course_id);
$stmt->execute();
$res = $stmt->get_result();
$holes = [];
while ($row = $res->fetch_assoc()) {
    $holes[] = $row;
}
$stmt->close();

echo json_encode([
    'tees' => $tees,
    'holes' => $holes
]);