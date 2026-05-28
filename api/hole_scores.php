<?php
require_once '../cors_headers.php';
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, private, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';
require_once 'auth_middleware.php';

$method      = $_SERVER['REQUEST_METHOD'];
$match_id    = isset($_GET['match_id'])    ? intval($_GET['match_id'])    : null;
$golfer_id   = isset($_GET['golfer_id'])   ? intval($_GET['golfer_id'])   : null;
$hole_number = isset($_GET['hole_number']) ? intval($_GET['hole_number']) : null;

// Org-scope subquery for hole_scores
$orgScopeSubquery = "match_id IN (
  SELECT m.match_id FROM matches m
  JOIN rounds r ON r.round_id = m.round_id
  JOIN tournaments t ON t.tournament_id = r.tournament_id
  WHERE t.org_id = ?
)";

switch ($method) {
  case 'GET':
    if ($match_id !== null && $golfer_id !== null && $hole_number !== null) {
      // single hole score (org-scoped)
      $stmt = $conn->prepare("
        SELECT hs.match_id, hs.golfer_id, hs.hole_number, hs.strokes
          FROM hole_scores hs
          JOIN matches m ON m.match_id = hs.match_id
          JOIN rounds r ON r.round_id = m.round_id
          JOIN tournaments t ON t.tournament_id = r.tournament_id AND t.org_id = ?
         WHERE hs.match_id    = ?
           AND hs.golfer_id   = ?
           AND hs.hole_number = ?
      ");
      $stmt->bind_param('iiii', $currentOrgId, $match_id, $golfer_id, $hole_number);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_assoc());
    } elseif ($match_id !== null && $golfer_id !== null) {
      // all scores for a golfer in a match (org-scoped)
      $stmt = $conn->prepare("
        SELECT hs.match_id, hs.golfer_id, hs.hole_number, hs.strokes
          FROM hole_scores hs
          JOIN matches m ON m.match_id = hs.match_id
          JOIN rounds r ON r.round_id = m.round_id
          JOIN tournaments t ON t.tournament_id = r.tournament_id AND t.org_id = ?
         WHERE hs.match_id  = ?
           AND hs.golfer_id = ?
         ORDER BY hs.hole_number
      ");
      $stmt->bind_param('iii', $currentOrgId, $match_id, $golfer_id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    } elseif ($match_id !== null) {
      // all scores for a match (org-scoped)
      $stmt = $conn->prepare("
        SELECT hs.match_id, hs.golfer_id, hs.hole_number, hs.strokes
          FROM hole_scores hs
          JOIN matches m ON m.match_id = hs.match_id
          JOIN rounds r ON r.round_id = m.round_id
          JOIN tournaments t ON t.tournament_id = r.tournament_id AND t.org_id = ?
         WHERE hs.match_id = ?
         ORDER BY hs.golfer_id, hs.hole_number
      ");
      $stmt->bind_param('ii', $currentOrgId, $match_id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    } else {
      // fetch all hole_scores for this org
      $stmt = $conn->prepare("
        SELECT hs.match_id, hs.golfer_id, hs.hole_number, hs.strokes
          FROM hole_scores hs
          JOIN matches m ON m.match_id = hs.match_id
          JOIN rounds r ON r.round_id = m.round_id
          JOIN tournaments t ON t.tournament_id = r.tournament_id AND t.org_id = ?
         ORDER BY hs.match_id, hs.golfer_id, hs.hole_number
      ");
      $stmt->bind_param('i', $currentOrgId);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    }
    break;

  case 'POST':
    // record a new hole score (verify match belongs to this org)
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
      INSERT INTO hole_scores (match_id, golfer_id, hole_number, strokes)
      VALUES (?, ?, ?, ?)
    ");
    $stmt->bind_param(
      'iiii',
      $data['match_id'],
      $data['golfer_id'],
      $data['hole_number'],
      $data['strokes']
    );
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  case 'PUT':
    // update an existing hole score (org-scoped via JOIN)
    parse_str(file_get_contents('php://input'), $data);
    $stmt = $conn->prepare("
      UPDATE hole_scores hs
        JOIN matches m ON m.match_id = hs.match_id
        JOIN rounds r ON r.round_id = m.round_id
        JOIN tournaments t ON t.tournament_id = r.tournament_id AND t.org_id = ?
         SET hs.strokes = ?
       WHERE hs.match_id    = ?
         AND hs.golfer_id   = ?
         AND hs.hole_number = ?
    ");
    $stmt->bind_param(
      'iiiii',
      $currentOrgId,
      $data['strokes'],
      $match_id,
      $golfer_id,
      $hole_number
    );
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  case 'DELETE':
    // delete a hole score (org-scoped via JOIN)
    $stmt = $conn->prepare("
      DELETE hs FROM hole_scores hs
        JOIN matches m ON m.match_id = hs.match_id
        JOIN rounds r ON r.round_id = m.round_id
        JOIN tournaments t ON t.tournament_id = r.tournament_id AND t.org_id = ?
       WHERE hs.match_id    = ?
         AND hs.golfer_id   = ?
         AND hs.hole_number = ?
    ");
    $stmt->bind_param('iiii', $currentOrgId, $match_id, $golfer_id, $hole_number);
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  default:
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    break;
}
