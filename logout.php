<?php
session_start();
header('Content-Type: application/json');
require_once 'cors_headers.php';
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");
session_destroy();
echo json_encode(['success' => true]);
?>