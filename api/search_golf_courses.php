<?php
require_once '../cors_headers.php';
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/auth_middleware.php';

$configFile = __DIR__ . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['error' => 'GolfCourseAPI not configured. Create api/config.php from api/config.example.php.']);
    exit;
}
require_once $configFile;

if (!defined('GOLF_COURSE_API_KEY') || GOLF_COURSE_API_KEY === 'YOUR_API_KEY_HERE') {
    http_response_code(503);
    echo json_encode(['error' => 'GolfCourseAPI key not set in api/config.php.']);
    exit;
}

$q = trim($_GET['q'] ?? '');
if (strlen($q) < 2) {
    echo json_encode(['courses' => []]);
    exit;
}

$url = 'https://api.golfcourseapi.com/v1/search?search_query=' . urlencode($q);

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 8,
    CURLOPT_HTTPHEADER     => [
        'Authorization: Key ' . GOLF_COURSE_API_KEY,
        'Accept: application/json',
    ],
]);
$body = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($body === false || $httpCode !== 200) {
    http_response_code(502);
    echo json_encode(['error' => 'GolfCourseAPI search failed (HTTP ' . $httpCode . ')']);
    exit;
}

$data = json_decode($body, true);
echo json_encode($data);
