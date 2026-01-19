<?php
// CORS headers for mobile app access
// Capacitor apps use different origins based on platform and scheme
$allowed_origins = [
    'http://localhost',
    'https://localhost',
    'capacitor://localhost',  // iOS
    'https://sandbaggerscoring.com',
    'http://sandbaggerscoring.com'
];

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';

if (in_array($origin, $allowed_origins)) {
    header("Access-Control-Allow-Origin: $origin");
} else if (empty($origin)) {
    // No origin header (same-origin requests or non-browser clients)
    header("Access-Control-Allow-Origin: https://sandbaggerscoring.com");
}

header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Credentials: true");

// Handle preflight OPTIONS requests
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(200);
    exit;
}
?>
