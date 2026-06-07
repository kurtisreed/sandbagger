<?php
require_once '../cors_headers.php';
header('Content-Type: application/json');
require_once 'db_connect.php';
require_once __DIR__ . '/auth_middleware.php';
requireAdmin();

$configFile = __DIR__ . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['error' => 'GHIN credentials not configured. Add GHIN_EMAIL and GHIN_PASSWORD to api/config.php.']);
    exit;
}
require_once $configFile;

if (!defined('GHIN_EMAIL') || !defined('GHIN_PASSWORD') ||
    GHIN_EMAIL === 'your_ghin_email@example.com') {
    http_response_code(503);
    echo json_encode(['error' => 'GHIN credentials not set in api/config.php.']);
    exit;
}

// ── Step 1: Get all golfers with a GHIN number for this org ──────────────────
$stmt = $conn->prepare("
    SELECT golfer_id, first_name, last_name, ghin_number
    FROM golfers
    WHERE org_id = ? AND ghin_number IS NOT NULL AND ghin_number != '' AND active = 1
");
$stmt->bind_param('i', $currentOrgId);
$stmt->execute();
$golfers = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
$stmt->close();

if (empty($golfers)) {
    echo json_encode(['success' => true, 'updated' => 0, 'message' => 'No golfers have a GHIN number set.']);
    exit;
}

// ── Step 2: Authenticate with GHIN API ───────────────────────────────────────
$authPayload = json_encode([
    'user' => [
        'email_or_ghin' => GHIN_EMAIL,
        'password'      => GHIN_PASSWORD,
    ],
    'token' => 'true',
]);

$ch = curl_init('https://api2.ghin.com/api/v1/golfer_activations.json');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $authPayload,
    CURLOPT_TIMEOUT        => 10,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'Accept: application/json',
        'User-Agent: Sandbagger/1.0',
    ],
]);
$authBody = curl_exec($ch);
$authCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($authBody === false || $authCode !== 200) {
    http_response_code(502);
    echo json_encode(['error' => 'GHIN login failed (HTTP ' . $authCode . '). Check your credentials in api/config.php.']);
    exit;
}

$authData = json_decode($authBody, true);
$token = $authData['golfer']['token'] ?? ($authData['token'] ?? null);

if (!$token) {
    http_response_code(502);
    echo json_encode(['error' => 'GHIN login succeeded but no token returned. The API may have changed.']);
    exit;
}

// ── Step 3: Look up each golfer's handicap and update the DB ─────────────────
$updated  = 0;
$skipped  = 0;
$errors   = [];

$updateStmt = $conn->prepare("UPDATE golfers SET handicap = ? WHERE golfer_id = ? AND org_id = ?");

foreach ($golfers as $golfer) {
    $ghinNum = $golfer['ghin_number'];

    $ch = curl_init("https://api2.ghin.com/api/v1/golfers.json?golfer_id={$ghinNum}&per_page=1");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 8,
        CURLOPT_HTTPHEADER     => [
            'Accept: application/json',
            'Authorization: Bearer ' . $token,
            'User-Agent: Sandbagger/1.0',
        ],
    ]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($body === false || $code !== 200) {
        $errors[] = "{$golfer['first_name']} {$golfer['last_name']} (GHIN {$ghinNum}): HTTP {$code}";
        $skipped++;
        continue;
    }

    $data    = json_decode($body, true);
    $golfers_data = $data['golfers'] ?? [];
    if (empty($golfers_data)) {
        $errors[] = "{$golfer['first_name']} {$golfer['last_name']} (GHIN {$ghinNum}): not found";
        $skipped++;
        continue;
    }

    $handicapIndex = $golfers_data[0]['handicap_index'] ?? null;
    if ($handicapIndex === null || $handicapIndex === 'NH' || $handicapIndex === '') {
        $errors[] = "{$golfer['first_name']} {$golfer['last_name']} (GHIN {$ghinNum}): no handicap index";
        $skipped++;
        continue;
    }

    $hcp = (float) $handicapIndex;
    $updateStmt->bind_param('dii', $hcp, $golfer['golfer_id'], $currentOrgId);
    $updateStmt->execute();
    $updated++;
}

$updateStmt->close();

echo json_encode([
    'success' => true,
    'updated' => $updated,
    'skipped' => $skipped,
    'errors'  => $errors,
]);
