<?php
// ghin_lookup.php — verify a GHIN number before linking it to a golfer.
// GET ?ghin_number=NNNNN  →  { golfer: { name, club, handicap_index, rev_date } }
// Admin-only and gated to allowlisted orgs.
require_once '../cors_headers.php';
ini_set('serialize_precision', '-1'); // emit clean decimals (13.7, not 13.6999…)
header('Content-Type: application/json; charset=utf-8');
require_once 'db_connect.php';
require_once 'auth_middleware.php';
require_once 'ghin_helpers.php';

requireAdmin();
ghinRequireEnabled();

$ghin = preg_replace('/\D/', '', $_GET['ghin_number'] ?? '');
if ($ghin === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Missing GHIN number.']);
    exit;
}

$golfer = ghinSearchGolfer($conn, $ghin);
if (!$golfer) {
    http_response_code(404);
    echo json_encode(['error' => 'No GHIN record found for that number.']);
    exit;
}

if ($golfer['handicap_index'] !== null) {
    $golfer['handicap_index'] = round($golfer['handicap_index'], 1);
}
echo json_encode(['golfer' => $golfer]);
