<?php
require_once '../cors_headers.php';
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';
require_once 'auth_middleware.php';

$method   = $_SERVER['REQUEST_METHOD'];
$match_id = isset($_GET['match_id']) ? intval($_GET['match_id']) : null;

switch ($method) {
  case 'GET':
    if ($match_id !== null) {
      // fetch one result (org-scoped)
      $stmt = $conn->prepare("
        SELECT mr.match_id, mr.points_team_a, mr.points_team_b
          FROM match_results mr
          JOIN matches m ON m.match_id = mr.match_id
          JOIN rounds r ON r.round_id = m.round_id
          JOIN tournaments t ON t.tournament_id = r.tournament_id AND t.org_id = ?
         WHERE mr.match_id = ?
      ");
      $stmt->bind_param('ii', $currentOrgId, $match_id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_assoc());
    } else {
      // fetch all results for this org
      $stmt = $conn->prepare("
        SELECT mr.match_id, mr.points_team_a, mr.points_team_b
          FROM match_results mr
          JOIN matches m ON m.match_id = mr.match_id
          JOIN rounds r ON r.round_id = m.round_id
          JOIN tournaments t ON t.tournament_id = r.tournament_id AND t.org_id = ?
         ORDER BY mr.match_id
      ");
      $stmt->bind_param('i', $currentOrgId);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    }
    break;

  case 'POST':
    // create a new match_results entry (verify match belongs to this org)
    $data = json_decode(file_get_contents('php://input'), true);
    $checkStmt = $conn->prepare("
      SELECT m.match_id FROM matches m
      JOIN rounds r ON r.round_id = m.round_id
      JOIN tournaments t ON t.tournament_id = r.tournament_id AND t.org_id = ?
      WHERE m.match_id = ?
    ");
    $checkStmt->bind_param('ii', $currentOrgId, $data['match_id']);
    $checkStmt->execute();
    if ($checkStmt->get_result()->num_rows === 0) {
      http_response_code(403);
      echo json_encode(['error' => 'Match not found or access denied']);
      exit;
    }
    $checkStmt->close();
    $stmt = $conn->prepare("
      INSERT INTO match_results (match_id, points_team_a, points_team_b)
      VALUES (?, ?, ?)
    ");
    $stmt->bind_param(
      'idd',
      $data['match_id'],
      $data['points_team_a'],
      $data['points_team_b']
    );
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  case 'PUT':
    // update an existing result (org-scoped)
    parse_str(file_get_contents('php://input'), $data);
    $stmt = $conn->prepare("
      UPDATE match_results mr
        JOIN matches m ON m.match_id = mr.match_id
        JOIN rounds r ON r.round_id = m.round_id
        JOIN tournaments t ON t.tournament_id = r.tournament_id AND t.org_id = ?
         SET mr.points_team_a = ?,
             mr.points_team_b = ?
       WHERE mr.match_id      = ?
    ");
    $stmt->bind_param(
      'iddi',
      $currentOrgId,
      $data['points_team_a'],
      $data['points_team_b'],
      $match_id
    );
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  case 'DELETE':
    // delete a result (org-scoped)
    $stmt = $conn->prepare("
      DELETE mr FROM match_results mr
        JOIN matches m ON m.match_id = mr.match_id
        JOIN rounds r ON r.round_id = m.round_id
        JOIN tournaments t ON t.tournament_id = r.tournament_id AND t.org_id = ?
       WHERE mr.match_id = ?
    ");
    $stmt->bind_param('ii', $currentOrgId, $match_id);
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  default:
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    break;
}
