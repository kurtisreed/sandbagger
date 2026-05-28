<?php
require_once '../cors_headers.php';
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, private, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';
require_once 'auth_middleware.php';

$method         = $_SERVER['REQUEST_METHOD'];
$tournament_id  = isset($_GET['tournament_id'])  ? intval($_GET['tournament_id'])  : null;
$setting_key    = isset($_GET['setting_key'])    ? $_GET['setting_key']             : null;

switch ($method) {
  case 'GET':
    if ($tournament_id !== null && $setting_key !== null) {
      // fetch one setting (org-scoped)
      $stmt = $conn->prepare("
        SELECT ts.tournament_id, ts.setting_key, ts.setting_value
          FROM tournament_settings ts
          JOIN tournaments t ON t.tournament_id = ts.tournament_id AND t.org_id = ?
         WHERE ts.tournament_id = ?
           AND ts.setting_key   = ?
      ");
      $stmt->bind_param('iis', $currentOrgId, $tournament_id, $setting_key);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_assoc());
    } elseif ($tournament_id !== null) {
      // fetch all settings for a tournament (org-scoped)
      $stmt = $conn->prepare("
        SELECT ts.tournament_id, ts.setting_key, ts.setting_value
          FROM tournament_settings ts
          JOIN tournaments t ON t.tournament_id = ts.tournament_id AND t.org_id = ?
         WHERE ts.tournament_id = ?
         ORDER BY ts.setting_key
      ");
      $stmt->bind_param('ii', $currentOrgId, $tournament_id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    } else {
      // fetch all settings for this org
      $stmt = $conn->prepare("
        SELECT ts.tournament_id, ts.setting_key, ts.setting_value
          FROM tournament_settings ts
          JOIN tournaments t ON t.tournament_id = ts.tournament_id AND t.org_id = ?
         ORDER BY ts.tournament_id, ts.setting_key
      ");
      $stmt->bind_param('i', $currentOrgId);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    }
    break;

  case 'POST':
    requireAdmin();
    // create a new setting (org-scoped: verify tournament)
    $data = json_decode(file_get_contents('php://input'), true);
    $checkStmt = $conn->prepare("SELECT tournament_id FROM tournaments WHERE tournament_id = ? AND org_id = ?");
    $checkStmt->bind_param('ii', $data['tournament_id'], $currentOrgId);
    $checkStmt->execute();
    if ($checkStmt->get_result()->num_rows === 0) {
      http_response_code(403);
      echo json_encode(['error' => 'Tournament not found or access denied']);
      exit;
    }
    $checkStmt->close();
    $stmt = $conn->prepare("
      INSERT INTO tournament_settings (tournament_id, setting_key, setting_value)
      VALUES (?, ?, ?)
    ");
    $stmt->bind_param(
      'iss',
      $data['tournament_id'],
      $data['setting_key'],
      $data['setting_value']
    );
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  case 'PUT':
    requireAdmin();
    // update an existing setting's value (org-scoped)
    parse_str(file_get_contents('php://input'), $data);
    $stmt = $conn->prepare("
      UPDATE tournament_settings ts
        JOIN tournaments t ON t.tournament_id = ts.tournament_id AND t.org_id = ?
         SET ts.setting_value = ?
       WHERE ts.tournament_id  = ?
         AND ts.setting_key    = ?
    ");
    $stmt->bind_param(
      'isis',
      $currentOrgId,
      $data['setting_value'],
      $tournament_id,
      $data['setting_key']
    );
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  case 'DELETE':
    requireAdmin();
    // delete a setting (org-scoped)
    $stmt = $conn->prepare("
      DELETE ts FROM tournament_settings ts
        JOIN tournaments t ON t.tournament_id = ts.tournament_id AND t.org_id = ?
       WHERE ts.tournament_id = ?
         AND ts.setting_key   = ?
    ");
    $stmt->bind_param('iis', $currentOrgId, $tournament_id, $setting_key);
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  default:
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    break;
}
