<?php
ini_set('session.gc_maxlifetime', 28800);
ini_set('session.cookie_lifetime', 28800);

require_once '../cors_headers.php';
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");

require_once 'auth_middleware.php';

// Check if a session exists and the user is authenticated
if (isset($_SESSION['golfer_id'])) {
    header('Content-Type: application/json');
    echo json_encode(['status' => 'success', 'message' => 'Session extended.']);
} else {
    header('Content-Type: application/json');
    http_response_code(401);
    echo json_encode(['status' => 'error', 'message' => 'Session expired. Please log in again.']);
}
