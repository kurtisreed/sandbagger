<?php
// public/api/flights.php
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';

$method        = $_SERVER['REQUEST_METHOD'];
$flight_id     = isset($_GET['flight_id'])     ? intval($_GET['flight_id'])     : null;
$tournament_id = isset($_GET['tournament_id']) ? intval($_GET['tournament_id']) : null;

switch ($method) {
  case 'GET':
    if ($flight_id) {
      // fetch one flight
      $stmt = $conn->prepare("
        SELECT flight_id, tournament_id, name, hcp_low, hcp_high
          FROM flights
         WHERE flight_id = ?
      ");
      $stmt->bind_param('i', $flight_id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_assoc());
    } elseif ($tournament_id) {
      // fetch flights for a tournament
      $stmt = $conn->prepare("
        SELECT flight_id, tournament_id, name, hcp_low, hcp_high
          FROM flights
         WHERE tournament_id = ?
         ORDER BY hcp_low
      ");
      $stmt->bind_param('i', $tournament_id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    } else {
      // fetch all flights
      $result = $conn->query("
        SELECT flight_id, tournament_id, name, hcp_low, hcp_high
          FROM flights
         ORDER BY tournament_id, hcp_low
      ");
      echo json_encode($result->fetch_all(MYSQLI_ASSOC));
    }
    break;

  case 'POST':
    // create a new flight
    $data = json_decode(file_get_contents('php://input'), true);
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
    // update an existing flight
    parse_str(file_get_contents('php://input'), $data);
    $stmt = $conn->prepare("
      UPDATE flights
         SET tournament_id = ?,
             name          = ?,
             hcp_low       = ?,
             hcp_high      = ?
       WHERE flight_id     = ?
    ");
    $stmt->bind_param(
      'isddi',
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
    // delete a flight
    $stmt = $conn->prepare("DELETE FROM flights WHERE flight_id = ?");
    $stmt->bind_param('i', $flight_id);
    $stmt->execute();
    echo json_encode(['deleted_rows' => $stmt->affected_rows]);
    break;

  default:
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    break;
}
