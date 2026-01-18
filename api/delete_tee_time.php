<?php
require_once '../cors_headers.php';
// api/delete_tee_time.php
// Handles the deletion of a single tee time.
// Expects a DELETE request with a query parameter: ?tee_time_id=X

header('Content-Type: application/json');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';

// 1. Ensure the request method is DELETE
if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    http_response_code(405); // Method Not Allowed
    echo json_encode(['success' => false, 'error' => 'Invalid request method. Only DELETE is accepted.']);
    exit;
}

// 2. Get and validate the tee_time_id from the query string
$tee_time_id = isset($_GET['tee_time_id']) ? intval($_GET['tee_time_id']) : 0;

if (empty($tee_time_id)) {
    http_response_code(400); // Bad Request
    echo json_encode(['success' => false, 'error' => 'Missing or invalid tee_time_id.']);
    exit;
}

// NOTE: Because your 'matches' table has ON DELETE SET NULL for its foreign key
// to 'tee_times', the database will automatically handle un-assigning any matches
// that were in this tee time. This is very efficient.

// 3. Prepare and execute the database deletion
$sql = "DELETE FROM tee_times WHERE tee_time_id = ?";

$stmt = $conn->prepare($sql);
if ($stmt === false) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database prepare statement failed.']);
    exit;
}

$stmt->bind_param('i', $tee_time_id);

if ($stmt->execute()) {
    if ($stmt->affected_rows > 0) {
        // Success
        echo json_encode(['success' => true, 'message' => 'Tee time deleted successfully.']);
    } else {
        // No rows were deleted, meaning the ID was not found
        http_response_code(404); // Not Found
        echo json_encode(['success' => false, 'error' => 'Tee time not found.']);
    }
} else {
    // Failure
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to delete tee time.']);
}

$stmt->close();
?>