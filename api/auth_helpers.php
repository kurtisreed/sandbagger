<?php
// Shared helper functions for auth endpoints.

// Look up the golfer linked to a user in a specific org.
// Returns the golfer row as an assoc array, or null if not linked yet.
function getLinkedGolfer($conn, $userId, $orgId) {
    $stmt = $conn->prepare("
        SELECT g.golfer_id, g.first_name, g.last_name, g.handicap, g.role,
               u.email
        FROM golfers g
        JOIN users u ON u.user_id = g.user_id
        WHERE g.user_id = ? AND g.org_id = ?
        LIMIT 1
    ");
    $stmt->bind_param('ii', $userId, $orgId);
    $stmt->execute();
    $result = $stmt->get_result();
    $golfer = $result->fetch_assoc();
    $stmt->close();
    return $golfer ?: null;
}
