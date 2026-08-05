<?php
require_once '../cors_headers.php';
header('Content-Type: application/json');
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");

require_once 'db_connect.php';
require_once 'auth_middleware.php';
require_once __DIR__ . '/skins.php';

// Accept GET parameters with fallback to session
$round_id      = $_GET['round_id']      ?? $_SESSION['round_id']      ?? null;
$tournament_id = $_GET['tournament_id'] ?? $_SESSION['tournament_id'] ?? null;

if (!$round_id) {
    echo json_encode(['error' => 'Missing round ID']);
    exit;
}
if (!$tournament_id) {
    echo json_encode(['error' => 'Missing tournament ID']);
    exit;
}

// The calculation lives in skins.php so the Money List settles skins from the
// same numbers this table displays.
$result = computeRoundSkins($conn, $round_id, $tournament_id, $currentOrgId);

if ($result['error'] !== null) {
    echo json_encode(['error' => $result['error']]);
    exit;
}

echo json_encode([
    'skins'       => $result['skins'],
    'skins_total' => $result['skins_total'],
]);
