<?php
require_once '../cors_headers.php';
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, private, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';
require_once 'auth_middleware.php';

$method    = $_SERVER['REQUEST_METHOD'];
$match_id  = isset($_GET['match_id'])  ? intval($_GET['match_id'])  : null;
$golfer_id = isset($_GET['golfer_id']) ? intval($_GET['golfer_id']) : null;

switch ($method) {
  case 'GET':
    if ($match_id !== null && $golfer_id !== null) {
      // one entry (org-scoped)
      $stmt = $conn->prepare("
        SELECT mg.match_id, mg.golfer_id
          FROM match_golfers mg
          JOIN matches m ON m.match_id = mg.match_id
          JOIN rounds r ON r.round_id = m.round_id
          JOIN tournaments t ON t.tournament_id = r.tournament_id AND t.org_id = ?
         WHERE mg.match_id  = ?
           AND mg.golfer_id = ?
      ");
      $stmt->bind_param('iii', $currentOrgId, $match_id, $golfer_id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_assoc());
    } elseif ($match_id !== null) {
      // all golfers in a match (org-scoped)
      $stmt = $conn->prepare("
          SELECT
              g.golfer_id,
              CONCAT(g.first_name, ' ', g.last_name) AS golfer_name,
              t.name AS team_name,
              t.color_hex AS team_color
          FROM match_golfers mg
          JOIN golfers g ON g.golfer_id = mg.golfer_id
          JOIN matches m ON m.match_id = mg.match_id
          JOIN rounds r ON r.round_id = m.round_id
          JOIN tournaments tn ON tn.tournament_id = r.tournament_id AND tn.org_id = ?
          LEFT JOIN teams t ON t.team_id = g.team_id
          WHERE mg.match_id = ?
      ");
      $stmt->bind_param('ii', $currentOrgId, $match_id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    } else {
      // fetch all records for this org
      $stmt = $conn->prepare("
        SELECT mg.match_id, mg.golfer_id
          FROM match_golfers mg
          JOIN matches m ON m.match_id = mg.match_id
          JOIN rounds r ON r.round_id = m.round_id
          JOIN tournaments t ON t.tournament_id = r.tournament_id AND t.org_id = ?
      ");
      $stmt->bind_param('i', $currentOrgId);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    }
    break;

    case 'POST':
      requireAdmin();
      $data = json_decode(file_get_contents('php://input'), true);

      if (!isset($data['match_id']) || !isset($data['golfer_id'])) {
          http_response_code(400);
          echo json_encode(['error' => 'Missing required fields']);
          exit;
      }

      // Verify match belongs to this org
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
          INSERT INTO match_golfers (match_id, golfer_id)
          VALUES (?, ?)
      ");

      $stmt->bind_param('ii',
          $data['match_id'],
          $data['golfer_id']
      );

      if ($stmt->execute()) {
          echo json_encode(['success' => true]);
      } else {
          http_response_code(500);
          echo json_encode(['error' => 'Failed to create match golfer assignment']);
      }
      break;

    case 'PUT':
      // Update golfers for a match (org-scoped)
      $data = json_decode(file_get_contents('php://input'), true);

      if ($match_id && is_array($data)) {
          // Verify match belongs to this org
          $checkStmt = $conn->prepare("
            SELECT m.match_id FROM matches m
            JOIN rounds r ON r.round_id = m.round_id
            JOIN tournaments t ON t.tournament_id = r.tournament_id AND t.org_id = ?
            WHERE m.match_id = ?
          ");
          $checkStmt->bind_param('ii', $currentOrgId, $match_id);
          $checkStmt->execute();
          if ($checkStmt->get_result()->num_rows === 0) {
              http_response_code(403);
              echo json_encode(['error' => 'Match not found or access denied']);
              exit;
          }
          $checkStmt->close();

          // Delete existing golfers for the match
          $stmt = $conn->prepare("DELETE FROM match_golfers WHERE match_id = ?");
          $stmt->bind_param('i', $match_id);
          $stmt->execute();

          // Insert updated golfers
          $stmt = $conn->prepare("INSERT INTO match_golfers (match_id, golfer_id) VALUES (?, ?)");
          foreach ($data as $golfer) {
              $stmt->bind_param('ii', $match_id, $golfer['golfer_id']);
              $stmt->execute();
          }

          echo json_encode(['success' => true, 'affected_rows' => $stmt->affected_rows]);
      } else {
          http_response_code(400);
          echo json_encode(['error' => 'Invalid data']);
      }
      break;

  case 'DELETE':
    requireAdmin();
    // remove from match (org-scoped)
    $stmt = $conn->prepare("
      DELETE mg FROM match_golfers mg
        JOIN matches m ON m.match_id = mg.match_id
        JOIN rounds r ON r.round_id = m.round_id
        JOIN tournaments t ON t.tournament_id = r.tournament_id AND t.org_id = ?
       WHERE mg.match_id  = ?
         AND mg.golfer_id = ?
    ");
    $stmt->bind_param('iii', $currentOrgId, $match_id, $golfer_id);
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  default:
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    break;
}
