<?php
// ghin_helpers.php
// Shared logic for the optional GHIN handicap-sync feature.
//
// Everything here is gated on the per-server allowlist in config.php
// ($GHIN_ENABLED_ORG_IDS). If config.php is absent or the array is empty,
// the feature is simply off — endpoints 404/403 and the UI never shows it.
//
// Requires: db_connect.php + auth_middleware.php already loaded by the caller
// (so $conn and $currentOrgId exist).

require_once __DIR__ . '/config.php';

define('GHIN_API_BASE', 'https://api2.ghin.com/api/v1');
define('GHIN_UA', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15');

/** Is the GHIN feature enabled for this org on this server? */
function ghinFeatureAllowed($orgId) {
    global $GHIN_ENABLED_ORG_IDS;
    if (!isset($GHIN_ENABLED_ORG_IDS) || !is_array($GHIN_ENABLED_ORG_IDS)) return false;
    if (!defined('GHIN_EMAIL') || !defined('GHIN_PASSWORD')) return false;
    if (GHIN_EMAIL === 'your-ghin-login@example.com' || GHIN_EMAIL === '') return false;
    return in_array((int) $orgId, array_map('intval', $GHIN_ENABLED_ORG_IDS), true);
}

/** Guard for GHIN endpoints — 403 unless the session's org is allowlisted. */
function ghinRequireEnabled() {
    global $currentOrgId;
    if (!ghinFeatureAllowed($currentOrgId)) {
        http_response_code(403);
        echo json_encode(['error' => 'GHIN sync is not enabled for this group.']);
        exit;
    }
}

/** Small cURL JSON helper. Returns [httpCode, decodedBody|null]. */
function ghinHttp($method, $url, $bearer = null, $jsonBody = null) {
    $ch = curl_init($url);
    $headers = ['Accept: application/json', 'User-Agent: ' . GHIN_UA];
    if ($bearer)   $headers[] = 'Authorization: Bearer ' . $bearer;
    if ($jsonBody !== null) $headers[] = 'Content-Type: application/json';
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 12,
        CURLOPT_HTTPHEADER     => $headers,
    ]);
    if ($jsonBody !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($jsonBody));
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$code, $body === false ? null : json_decode($body, true)];
}

/** app_settings get/set (global, single GHIN service account). */
function ghinSettingGet($conn, $key) {
    $stmt = $conn->prepare("SELECT setting_value FROM app_settings WHERE setting_key = ?");
    $stmt->bind_param('s', $key);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ? $row['setting_value'] : null;
}
function ghinSettingSet($conn, $key, $val) {
    $stmt = $conn->prepare(
        "INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)"
    );
    $stmt->bind_param('ss', $key, $val);
    $stmt->execute();
    $stmt->close();
}

/** Read the `exp` claim (unix ts) out of a JWT, or 0 if unreadable. */
function ghinJwtExp($jwt) {
    $parts = explode('.', $jwt);
    if (count($parts) < 2) return 0;
    $payload = json_decode(base64_decode(strtr($parts[1], '-_', '+/')), true);
    return isset($payload['exp']) ? (int) $payload['exp'] : 0;
}

/** Log in to GHIN and return a fresh token, or null on failure. */
function ghinLogin() {
    [$code, $data] = ghinHttp('POST', GHIN_API_BASE . '/golfer_login.json', null, [
        'user'   => [
            'email_or_ghin' => GHIN_EMAIL,
            'password'      => GHIN_PASSWORD,
            'remember_me'   => true,
        ],
        'token'  => 'dummy',
        'source' => 'GHINcom',
    ]);
    if ($code === 200 && !empty($data['golfer_user']['golfer_user_token'])) {
        return $data['golfer_user']['golfer_user_token'];
    }
    return null;
}

/** Return a valid cached token, re-logging in if missing or near expiry. */
function ghinGetToken($conn, $forceRefresh = false) {
    if (!$forceRefresh) {
        $token = ghinSettingGet($conn, 'ghin_token');
        $exp   = (int) ghinSettingGet($conn, 'ghin_token_exp');
        if ($token && $exp > time() + 60) return $token;
    }
    $token = ghinLogin();
    if ($token) {
        ghinSettingSet($conn, 'ghin_token', $token);
        ghinSettingSet($conn, 'ghin_token_exp', (string) ghinJwtExp($token));
    }
    return $token;
}

/**
 * Look up a golfer by GHIN number. Returns a normalized array
 * ['ghin','name','club','handicap_index','rev_date','status'] or null.
 * Transparently re-authenticates once on a 401.
 */
function ghinSearchGolfer($conn, $ghinNumber) {
    $ghinNumber = preg_replace('/\D/', '', (string) $ghinNumber);
    if ($ghinNumber === '') return null;

    $token = ghinGetToken($conn);
    if (!$token) return null;

    $url = GHIN_API_BASE . '/golfers/search.json?golfer_id=' . urlencode($ghinNumber)
         . '&page=1&per_page=1';
    [$code, $data] = ghinHttp('GET', $url, $token);

    if ($code === 401) { // token rejected — force a fresh login and retry once
        $token = ghinGetToken($conn, true);
        if (!$token) return null;
        [$code, $data] = ghinHttp('GET', $url, $token);
    }

    if ($code !== 200 || empty($data['golfers'][0])) return null;
    $g = $data['golfers'][0];

    // Confirm the record actually matches the requested number
    if (isset($g['ghin']) && preg_replace('/\D/', '', (string) $g['ghin']) !== $ghinNumber) {
        return null;
    }

    $hi  = $g['hi_value'] ?? $g['handicap_index'] ?? null;
    $hi  = ($hi === null || $hi === '') ? null : (float) $hi;
    // GHIN reports "no established handicap" (NH / withdrawn) as a sentinel like
    // 999. Real WHS indexes top out at 54.0, so treat anything >= 55 as none.
    if ($hi !== null && $hi >= 55) $hi = null;

    return [
        'ghin'           => (string) ($g['ghin'] ?? $ghinNumber),
        'name'           => trim(($g['first_name'] ?? '') . ' ' . ($g['last_name'] ?? '')),
        'club'           => $g['club_name'] ?? '',
        'handicap_index' => $hi,
        'rev_date'       => $g['rev_date'] ?? null,
        'status'         => $g['status'] ?? null,
    ];
}
