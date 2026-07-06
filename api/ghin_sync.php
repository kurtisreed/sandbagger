<?php
// ghin_sync.php — pull current Handicap Indexes from GHIN into golfers.handicap.
// POST { golfer_id: N }  → sync one golfer
// POST { all: true }     → sync every golfer in this org that has a GHIN number
// Returns per-golfer results: updated / unchanged / not_found / no_ghin.
// Admin-only and gated to allowlisted orgs.
require_once '../cors_headers.php';
ini_set('serialize_precision', '-1'); // emit clean decimals (13.7, not 13.6999…)
header('Content-Type: application/json; charset=utf-8');
require_once 'db_connect.php';
require_once 'auth_middleware.php';
require_once 'ghin_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    exit;
}

requireAdmin();
ghinRequireEnabled();

$data     = json_decode(file_get_contents('php://input'), true) ?: [];
$syncAll  = !empty($data['all']);
$golferId = isset($data['golfer_id']) ? (int) $data['golfer_id'] : 0;

// Gather the target golfers (scoped to this org).
if ($syncAll) {
    $stmt = $conn->prepare(
        "SELECT golfer_id, first_name, last_name, handicap, ghin_number
           FROM golfers
          WHERE org_id = ? AND active = 1
            AND ghin_number IS NOT NULL AND ghin_number <> ''"
    );
    $stmt->bind_param('i', $currentOrgId);
} elseif ($golferId) {
    $stmt = $conn->prepare(
        "SELECT golfer_id, first_name, last_name, handicap, ghin_number
           FROM golfers
          WHERE golfer_id = ? AND org_id = ?"
    );
    $stmt->bind_param('ii', $golferId, $currentOrgId);
} else {
    http_response_code(400);
    echo json_encode(['error' => 'Provide golfer_id or all:true.']);
    exit;
}
$stmt->execute();
$golfers = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
$stmt->close();

$upd = $conn->prepare(
    "UPDATE golfers
        SET handicap = ?, handicap_source = 'ghin', handicap_updated_at = NOW()
      WHERE golfer_id = ? AND org_id = ?"
);

$results = [];
$updatedCount = 0;

foreach ($golfers as $g) {
    $name = trim($g['first_name'] . ' ' . $g['last_name']);
    $ghin = preg_replace('/\D/', '', (string) $g['ghin_number']);

    if ($ghin === '') {
        $results[] = ['golfer_id' => (int) $g['golfer_id'], 'name' => $name, 'status' => 'no_ghin'];
        continue;
    }

    $rec = ghinSearchGolfer($conn, $ghin);
    if (!$rec) {
        $results[] = ['golfer_id' => (int) $g['golfer_id'], 'name' => $name,
                      'ghin' => $ghin, 'status' => 'not_found'];
        continue;
    }
    // Archived record or no established index — don't overwrite a real handicap.
    if ($rec['handicap_index'] === null) {
        $results[] = ['golfer_id' => (int) $g['golfer_id'], 'name' => $name,
                      'ghin' => $ghin, 'status' => 'no_index'];
        continue;
    }

    $old = $g['handicap'] === null ? null : round((float) $g['handicap'], 1);
    $new = round($rec['handicap_index'], 1);

    $upd->bind_param('dii', $new, $g['golfer_id'], $currentOrgId);
    $upd->execute();
    $updatedCount++;

    $results[] = [
        'golfer_id' => (int) $g['golfer_id'],
        'name'      => $name,
        'ghin'      => $ghin,
        'old'       => $old,
        'new'       => $new,
        'rev_date'  => $rec['rev_date'],
        'status'    => ($old !== null && abs($old - $new) < 0.05) ? 'unchanged' : 'updated',
    ];
}
$upd->close();

echo json_encode(['synced' => $updatedCount, 'results' => $results]);
