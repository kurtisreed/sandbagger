<?php
// Shared helper functions for auth endpoints.

// Look up the golfer linked to a user in a specific org.
// Returns the golfer row as an assoc array, or null if not linked yet.
function getLinkedGolfer($conn, $userId, $orgId) {
    $stmt = $conn->prepare("
        SELECT golfer_id, first_name, last_name, handicap, role
        FROM golfers
        WHERE user_id = ? AND org_id = ?
        LIMIT 1
    ");
    $stmt->bind_param('ii', $userId, $orgId);
    $stmt->execute();
    $result = $stmt->get_result();
    $golfer = $result->fetch_assoc();
    $stmt->close();
    return $golfer ?: null;
}
