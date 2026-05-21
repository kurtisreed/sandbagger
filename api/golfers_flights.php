<?php
require_once '../cors_headers.php';
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once ‘db_connect.php’;
require_once ‘auth_middleware.php’;

$method        = $_SERVER[‘REQUEST_METHOD’];
$tournament_id = isset($_GET[‘tournament_id’]) ? intval($_GET[‘tournament_id’]) : null;
$golfer_id     = isset($_GET[‘golfer_id’])     ? intval($_GET[‘golfer_id’])     : null;
$flight_id     = isset($_GET[‘flight_id’])     ? intval($_GET[‘flight_id’])     : null;

switch ($method) {
  case ‘GET’:
    if ($tournament_id !== null && $golfer_id !== null) {
      // Fetch one assignment (org-scoped)
      $stmt = $conn->prepare("
        SELECT gf.tournament_id, gf.golfer_id, gf.flight_id
          FROM golfer_flights gf
          JOIN tournaments t ON t.tournament_id = gf.tournament_id AND t.org_id = ?
         WHERE gf.tournament_id = ? AND gf.golfer_id = ?
      ");
      $stmt->bind_param(‘iii’, $currentOrgId, $tournament_id, $golfer_id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_assoc());
    } elseif ($tournament_id !== null) {
      // List all golfers & their flights in a tournament (org-scoped)
      $stmt = $conn->prepare("
        SELECT gf.golfer_id,
               CONCAT(g.first_name,’ ‘,g.last_name) AS name,
               gf.flight_id,
               f.name   AS flight_name,
               f.hcp_low,
               f.hcp_high
          FROM golfer_flights gf
          JOIN golfers g     ON gf.golfer_id = g.golfer_id
          JOIN flights f     ON gf.flight_id = f.flight_id
          JOIN tournaments t ON t.tournament_id = gf.tournament_id AND t.org_id = ?
         WHERE gf.tournament_id = ?
         ORDER BY g.last_name, g.first_name
      ");
      $stmt->bind_param(‘ii’, $currentOrgId, $tournament_id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    } else {
      // List all assignments for this org
      $stmt = $conn->prepare("
        SELECT gf.tournament_id, gf.golfer_id, gf.flight_id
          FROM golfer_flights gf
          JOIN tournaments t ON t.tournament_id = gf.tournament_id AND t.org_id = ?
        ORDER BY gf.tournament_id, gf.golfer_id
      ");
      $stmt->bind_param(‘i’, $currentOrgId);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    }
    break;

  case ‘POST’:
    // Assign a golfer to a flight (org-scoped: verify tournament)
    $data = json_decode(file_get_contents(‘php://input’), true);
    $checkStmt = $conn->prepare("SELECT tournament_id FROM tournaments WHERE tournament_id = ? AND org_id = ?");
    $checkStmt->bind_param(‘ii’, $data[‘tournament_id’], $currentOrgId);
    $checkStmt->execute();
    if ($checkStmt->get_result()->num_rows === 0) {
      http_response_code(403);
      echo json_encode([‘error’ => ‘Tournament not found or access denied’]);
      exit;
    }
    $checkStmt->close();
    $stmt = $conn->prepare("
      INSERT INTO golfer_flights (tournament_id, golfer_id, flight_id)
      VALUES (?, ?, ?)
    ");
    $stmt->bind_param(
      ‘iii’,
      $data[‘tournament_id’],
      $data[‘golfer_id’],
      $data[‘flight_id’]
    );
    $stmt->execute();
    echo json_encode([‘affected_rows’ => $stmt->affected_rows]);
    break;

  case ‘PUT’:
    // Change a golfer’s flight (org-scoped)
    parse_str(file_get_contents(‘php://input’), $data);
    $stmt = $conn->prepare("
      UPDATE golfer_flights gf
        JOIN tournaments t ON t.tournament_id = gf.tournament_id AND t.org_id = ?
         SET gf.flight_id = ?
       WHERE gf.tournament_id = ?
         AND gf.golfer_id     = ?
    ");
    $stmt->bind_param(
      ‘iiii’,
      $currentOrgId,
      $data[‘flight_id’],
      $tournament_id,
      $golfer_id
    );
    $stmt->execute();
    echo json_encode([‘affected_rows’ => $stmt->affected_rows]);
    break;

  case ‘DELETE’:
    // Remove a golfer from their flight (org-scoped)
    $stmt = $conn->prepare("
      DELETE gf FROM golfer_flights gf
        JOIN tournaments t ON t.tournament_id = gf.tournament_id AND t.org_id = ?
       WHERE gf.tournament_id = ?
         AND gf.golfer_id     = ?
    ");
    $stmt->bind_param(‘iii’, $currentOrgId, $tournament_id, $golfer_id);
    $stmt->execute();
    echo json_encode([‘affected_rows’ => $stmt->affected_rows]);
    break;

  default:
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    break;
}
