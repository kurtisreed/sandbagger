<?php
require_once '../cors_headers.php';
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';

$method        = $_SERVER['REQUEST_METHOD'];
$tournament_id = isset($_GET['tournament_id']) ? intval($_GET['tournament_id']) : null;
$golfer_id     = isset($_GET['golfer_id'])     ? intval($_GET['golfer_id'])     : null;
$flight_id     = isset($_GET['flight_id'])     ? intval($_GET['flight_id'])     : null;

switch ($method) {
  case 'GET':
    if ($tournament_id !== null && $golfer_id !== null) {
      // Fetch one assignment
      $stmt = $conn->prepare("
        SELECT tournament_id, golfer_id, flight_id
          FROM golfer_flights
         WHERE tournament_id = ? AND golfer_id = ?
      ");
      $stmt->bind_param('ii', $tournament_id, $golfer_id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_assoc());
    } elseif ($tournament_id !== null) {
      // List all golfers & their flights in a tournament
      $stmt = $conn->prepare("
        SELECT gf.golfer_id,
               CONCAT(g.first_name,' ',g.last_name) AS name,
               gf.flight_id,
               f.name   AS flight_name,
               f.hcp_low,
               f.hcp_high
          FROM golfer_flights gf
          JOIN golfers g     ON gf.golfer_id = g.golfer_id
          JOIN flights f     ON gf.flight_id = f.flight_id
         WHERE gf.tournament_id = ?
         ORDER BY g.last_name, g.first_name
      ");
      $stmt->bind_param('i', $tournament_id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    } else {
      // List all assignments
      $result = $conn->query("
        SELECT tournament_id, golfer_id, flight_id
          FROM golfer_flights
        ORDER BY tournament_id, golfer_id
      ");
      echo json_encode($result->fetch_all(MYSQLI_ASSOC));
    }
    break;

  case 'POST':
    // Assign a golfer to a flight
    $data = json_decode(file_get_contents('php://input'), true);
    $stmt = $conn->prepare("
      INSERT INTO golfer_flights (tournament_id, golfer_id, flight_id)
      VALUES (?, ?, ?)
    ");
    $stmt->bind_param(
      'iii',
      $data['tournament_id'],
      $data['golfer_id'],
      $data['flight_id']
    );
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  case 'PUT':
    // Change a golfer’s flight
    parse_str(file_get_contents('php://input'), $data);
    $stmt = $conn->prepare("
      UPDATE golfer_flights
         SET flight_id = ?
       WHERE tournament_id = ?
         AND golfer_id     = ?
    ");
    $stmt->bind_param(
      'iii',
      $data['flight_id'],
      $tournament_id,
      $golfer_id
    );
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  case 'DELETE':
    // Remove a golfer from their flight
    $stmt = $conn->prepare("
      DELETE FROM golfer_flights
       WHERE tournament_id = ?
         AND golfer_id     = ?
    ");
    $stmt->bind_param('ii', $tournament_id, $golfer_id);
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  default:
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    break;
}
