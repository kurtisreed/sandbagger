<?php
require_once '../cors_headers.php';
header('Content-Type: application/json');

if (session_status() === PHP_SESSION_NONE) session_start();

session_unset();
session_destroy();

echo json_encode(['success' => true]);
