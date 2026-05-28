<?php
require_once '../cors_headers.php';
// public/api/flights.php
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, private, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';
require_once 'auth_middleware.php';

$method        = $_SERVER['REQUEST_METHOD'];
$flight_id     = isset($_GET['flight_id'])     ? intval($_GET['flight_id'])     : null;
$tournament_id = isset($_GET['tournament_id']) ? intval($_GET['tournament_id']) : null;

switch ($method) {
  case 'GET':
    if ($flight_id) {
      // fetch one flight (org-scoped via tournament)
      $stmt = $conn->prepare("
        SELECT f.flight_id, f.tournament_id, f.name, f.hcp_low, f.hcp_high
          FROM flights f
          JOIN tournaments t ON t.tournament_id = f.tournament_id AND t.org_id = ?
         WHERE f.flight_id = ?
      ");
      $stmt->bind_param('ii', $currentOrgId, $flight_id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_assoc());
    } elseif ($tournament_id) {
      // fetch flights for a tournament (org-scoped)
      $stmt = $conn->prepare("
        SELECT f.flight_id, f.tournament_id, f.name, f.hcp_low, f.hcp_high
          FROM flights f
          JOIN tournaments t ON t.tournament_id = f.tournament_id AND t.org_id = ?
         WHERE f.tournament_id = ?
         ORDER BY f.hcp_low
      ");
      $stmt->bind_param('ii', $currentOrgId, $tournament_id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    } else {
      // fetch all flights for this org
      $stmt = $conn->prepare("
        SELECT f.flight_id, f.tournament_id, f.name, f.hcp_low, f.hcp_high
          FROM flights f
          JOIN tournaments t ON t.tournament_id = f.tournament_id AND t.org_id = ?
         ORDER BY f.tournament_id, f.hcp_low
      ");
      $stmt->bind_param('i', $currentOrgId);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    }
    break;

  case 'POST':
    requireAdmin();
    // create a new flight (org-scoped: verify tournament)
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
      INSERT INTO flights (tournament_id, name, hcp_low, hcp_high)
      VALUES (?, ?, ?, ?)
    ");
    $stmt->bind_param(
      'isdd',
      $data['tournament_id'],
      $data['name'],
      $data['hcp_low'],
      $data['hcp_high']
    );
    $stmt->execute();
    echo json_encode(['inserted_id' => $stmt->insert_id]);
    break;

  case 'PUT':
    requireAdmin();
    // update an existing flight (org-scoped)
    parse_str(file_get_contents('php://input'), $data);
    $stmt = $conn->prepare("
      UPDATE flights f
        JOIN tournaments t ON t.tournament_id = f.tournament_id AND t.org_id = ?
         SET f.tournament_id = ?,
             f.name          = ?,
             f.hcp_low       = ?,
             f.hcp_high      = ?
       WHERE f.flight_id     = ?
    ");
    $stmt->bind_param(
      'iisddi',
      $currentOrgId,
      $data['tournament_id'],
      $data['name'],
      $data['hcp_low'],
      $data['hcp_high'],
      $flight_id
    );
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  case 'DELETE':
    requireAdmin();
    // delete a flight (org-scoped)
    $stmt = $conn->prepare("
      DELETE f FROM flights f
        JOIN tournaments t ON t.tournament_id = f.tournament_id AND t.org_id = ?
       WHERE f.flight_id = ?
    ");
    $stmt->bind_param('ii', $currentOrgId, $flight_id);
    $stmt->execute();
    echo json_encode(['deleted_rows' => $stmt->affected_rows]);
    break;

  default:
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    break;
}
