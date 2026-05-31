<?php
// keep_alive.php — called periodically by the frontend to extend the session.
// auth_middleware.php handles session lifetime and cookie refresh.
require_once '../cors_headers.php';
header('Content-Type: application/json');
require_once 'auth_middleware.php';

// auth_middleware already validates user_id and refreshes the cookie.
// If we reach here the session is alive.
echo json_encode(['status' => 'ok']);
