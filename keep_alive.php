<?php
// We use the same session lifetime settings for consistency
ini_set('session.gc_maxlifetime', 28800); 
ini_set('session.cookie_lifetime', 28800);

session_start();
header("Access-Control-Allow-Origin: http://localhost");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");

// Check if a session exists and the user is authenticated
if (isset($_SESSION['golfer_id'])) {
    // Session is active and valid. Send a success response.
    header('Content-Type: application/json');
    echo json_encode(['status' => 'success', 'message' => 'Session extended.']);
} else {
    // Session has expired or is invalid. Send an error response.
    header('Content-Type: application/json');
    http_response_code(401); // 401 Unauthorized
    echo json_encode(['status' => 'error', 'message' => 'Session expired. Please log in again.']);
}