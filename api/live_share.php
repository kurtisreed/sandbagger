<?php
// live_share.php — admin control of a tournament's public live-spectator code.
// GET  ?tournament_id=N                          -> current state
// POST {tournament_id, action: enable|disable|regenerate} -> new state
// The public viewing endpoint is live_tournament.php (validated by code alone).
require_once '../cors_headers.php';
header('Content-Type: application/json');

require_once 'auth_middleware.php';
requireAdmin();

const LIVE_SHARE_URL_BASE = 'https://sandbaggerscoring.com/live.html?code=';
// Live sharing only applies to real tournaments (quick rounds excluded)
const LIVE_SHARE_FORMATS = [3, 4, 5, 6];

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $tournament_id = intval($_GET['tournament_id'] ?? 0);
    $action = null;
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true) ?: [];
    $tournament_id = intval($body['tournament_id'] ?? 0);
    $action = $body['action'] ?? null;
    if (!in_array($action, ['enable', 'disable', 'regenerate'], true)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid action']);
        exit;
    }
} else {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

if (!$tournament_id) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing tournament_id']);
    exit;
}

// Verify the tournament belongs to this org and is a shareable format
$stmt = $conn->prepare("SELECT format_id, live_share_code, live_share_enabled
                        FROM tournaments WHERE tournament_id = ? AND org_id = ?");
$stmt->bind_param('ii', $tournament_id, $currentOrgId);
$stmt->execute();
$tournament = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$tournament) {
    http_response_code(404);
    echo json_encode(['error' => 'Tournament not found']);
    exit;
}
if (!in_array((int)$tournament['format_id'], LIVE_SHARE_FORMATS, true)) {
    http_response_code(400);
    echo json_encode(['error' => 'Live sharing is only available for tournaments']);
    exit;
}

// 6 chars, no 0/O/1/I so codes are easy to read aloud and retype
function generateLiveCode($conn) {
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    do {
        $code = '';
        for ($i = 0; $i < 6; $i++) {
            $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }
        $stmt = $conn->prepare("SELECT tournament_id FROM tournaments WHERE live_share_code = ?");
        $stmt->bind_param('s', $code);
        $stmt->execute();
        $stmt->store_result();
        $exists = $stmt->num_rows > 0;
        $stmt->close();
    } while ($exists);
    return $code;
}

$code = $tournament['live_share_code'];
$enabled = (bool)$tournament['live_share_enabled'];

if ($action === 'enable') {
    if ($code === null) {
        $code = generateLiveCode($conn);
    }
    $enabled = true;
} elseif ($action === 'disable') {
    $enabled = false;
} elseif ($action === 'regenerate') {
    $code = generateLiveCode($conn);
    $enabled = true;
}

if ($action !== null) {
    $enabledInt = $enabled ? 1 : 0;
    $stmt = $conn->prepare("UPDATE tournaments SET live_share_code = ?, live_share_enabled = ?
                            WHERE tournament_id = ? AND org_id = ?");
    $stmt->bind_param('siii', $code, $enabledInt, $tournament_id, $currentOrgId);
    $stmt->execute();
    $stmt->close();
}

echo json_encode([
    'enabled' => $enabled,
    'code' => $code,
    'url' => $code !== null ? LIVE_SHARE_URL_BASE . $code : null,
]);
