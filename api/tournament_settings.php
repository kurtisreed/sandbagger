<?php
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';

$method         = $_SERVER['REQUEST_METHOD'];
$tournament_id  = isset($_GET['tournament_id'])  ? intval($_GET['tournament_id'])  : null;
$setting_key    = isset($_GET['setting_key'])    ? $_GET['setting_key']             : null;

switch ($method) {
  case 'GET':
    if ($tournament_id !== null && $setting_key !== null) {
      // fetch one setting
      $stmt = $conn->prepare("
        SELECT tournament_id, setting_key, setting_value
          FROM tournament_settings
         WHERE tournament_id = ?
           AND setting_key   = ?
      ");
      $stmt->bind_param('is', $tournament_id, $setting_key);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_assoc());
    } elseif ($tournament_id !== null) {
      // fetch all settings for a tournament
      $stmt = $conn->prepare("
        SELECT tournament_id, setting_key, setting_value
          FROM tournament_settings
         WHERE tournament_id = ?
         ORDER BY setting_key
      ");
      $stmt->bind_param('i', $tournament_id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    } else {
      // fetch all settings
      $result = $conn->query("
        SELECT tournament_id, setting_key, setting_value
          FROM tournament_settings
         ORDER BY tournament_id, setting_key
      ");
      echo json_encode($result->fetch_all(MYSQLI_ASSOC));
    }
    break;

  case 'POST':
    // create a new setting
    $data = json_decode(file_get_contents('php://input'), true);
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
    // update an existing setting’s value
    parse_str(file_get_contents('php://input'), $data);
    $stmt = $conn->prepare("
      UPDATE tournament_settings
         SET setting_value = ?
       WHERE tournament_id  = ?
         AND setting_key    = ?
    ");
    $stmt->bind_param(
      'sis',
      $data['setting_value'],
      $tournament_id,
      $data['setting_key']
    );
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  case 'DELETE':
    // delete a setting
    $stmt = $conn->prepare("
      DELETE FROM tournament_settings
       WHERE tournament_id = ?
         AND setting_key   = ?
    ");
    $stmt->bind_param('is', $tournament_id, $setting_key);
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  default:
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    break;
}
