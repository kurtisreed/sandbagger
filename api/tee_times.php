<?php
// api/tee_times.php
// Handles the creation of a new tee time.
// Expects a POST request with a JSON body containing 'round_id' and 'time' in HH:MM format.

header('Content-Type: application/json');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';

// 1. Ensure the request method is POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405); // Method Not Allowed
    echo json_encode(['success' => false, 'error' => 'Invalid request method. Only POST is accepted.']);
    exit;
}

// 2. Get the raw POST data and decode the JSON
$json_data = file_get_contents('php://input');
$data = json_decode($json_data, true);

// 3. Validate the input data
if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400); // Bad Request
    echo json_encode(['success' => false, 'error' => 'Invalid JSON provided.']);
    exit;
}

$round_id = isset($data['round_id']) ? intval($data['round_id']) : 0;
$time = isset($data['time']) ? trim($data['time']) : '';

if (empty($round_id) || empty($time)) {
    http_response_code(400); // Bad Request
    echo json_encode(['success' => false, 'error' => 'Missing required fields: round_id and time.']);
    exit;
}

// Simplified validation: The HTML input with step="600" will send time in HH:MM format.
// The database's TIME column will handle the rest.
if (!preg_match('/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/', $time)) {
    http_response_code(400); // Bad Request
    echo json_encode(['success' => false, 'error' => 'Invalid time format. Expected HH:MM.']);
    exit;
}

// 4. Prepare and execute the database insertion
$sql = "INSERT INTO tee_times (round_id, time) VALUES (?, ?)";

$stmt = $conn->prepare($sql);
if ($stmt === false) {
    http_response_code(500); // Internal Server Error
    echo json_encode(['success' => false, 'error' => 'Database prepare statement failed.']);
    exit;
}

// Bind parameters: 'i' for integer (round_id), 's' for string (time)
$stmt->bind_param('is', $round_id, $time);

if ($stmt->execute()) {
    // Success!
    $new_tee_time_id = $conn->insert_id;
    http_response_code(201); // 201 Created
    echo json_encode([
        'success' => true,
        'message' => 'Tee time created successfully.',
        'tee_time_id' => $new_tee_time_id
    ]);
} else {
    // Failure
    http_response_code(500); // Internal Server Error
    echo json_encode(['success' => false, 'error' => 'Failed to create tee time. Please ensure the round exists.']);
}

// 5. Close the statement
$stmt->close();
?>