<?php
require_once '../cors_headers.php';
// api/save_tee_time_assignments.php
// Saves the assignment of matches to tee times for a given round.
// Expects a POST request with a JSON body: { "round_id": X, "assignments": [...] }

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

// 2. Get and decode the JSON payload
$json_data = file_get_contents('php://input');
$data = json_decode($json_data, true);

if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400); // Bad Request
    echo json_encode(['success' => false, 'error' => 'Invalid JSON provided.']);
    exit;
}

// 3. Validate the input data
$round_id = isset($data['round_id']) ? intval($data['round_id']) : 0;
$assignments = isset($data['assignments']) && is_array($data['assignments']) ? $data['assignments'] : null;

if (empty($round_id) || $assignments === null) {
    http_response_code(400); // Bad Request
    echo json_encode(['success' => false, 'error' => 'Missing required fields: round_id and assignments array.']);
    exit;
}

// 4. Perform the update within a database transaction for data integrity
$conn->begin_transaction();

try {
    // Step A: Reset all tee time assignments for this round to NULL.
    // This handles matches that were un-assigned (dragged back to the pool).
    $reset_sql = "UPDATE matches SET tee_time_id = NULL WHERE round_id = ?";
    $stmt_reset = $conn->prepare($reset_sql);
    if ($stmt_reset === false) {
        throw new Exception("Prepare failed (reset): " . $conn->error);
    }
    $stmt_reset->bind_param('i', $round_id);
    if (!$stmt_reset->execute()) {
        throw new Exception("Execute failed (reset): " . $stmt_reset->error);
    }
    $stmt_reset->close();

    // Step B: Loop through the provided assignments and update each match.
    if (!empty($assignments)) {
        $update_sql = "UPDATE matches SET tee_time_id = ? WHERE match_id = ? AND round_id = ?";
        $stmt_update = $conn->prepare($update_sql);
        if ($stmt_update === false) {
            throw new Exception("Prepare failed (update): " . $conn->error);
        }

        foreach ($assignments as $assignment) {
            $tee_time_id = intval($assignment['tee_time_id']);
            $match_id = intval($assignment['match_id']);
            
            if (empty($tee_time_id) || empty($match_id)) continue; // Skip invalid entries

            $stmt_update->bind_param('iii', $tee_time_id, $match_id, $round_id);
            if (!$stmt_update->execute()) {
                throw new Exception("Execute failed (update loop): " . $stmt_update->error);
            }
        }
        $stmt_update->close();
    }

    // If we get here, all queries were successful. Commit the transaction.
    $conn->commit();
    echo json_encode(['success' => true, 'message' => 'Tee time assignments saved successfully.']);

} catch (Exception $e) {
    // An error occurred. Roll back all changes.
    $conn->rollback();
    http_response_code(500); // Internal Server Error
    // In a production environment, you might log the error instead of echoing it.
    echo json_encode(['success' => false, 'error' => 'An error occurred while saving. Changes have been reverted.', 'details' => $e->getMessage()]);
}
?>