<?php
require_once '../cors_headers.php';
header('Content-Type: application/json');

require_once __DIR__ . '/session_setup.php';

session_unset();
session_destroy();

echo json_encode(['success' => true]);
