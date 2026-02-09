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

switch ($method) {
  case 'GET':
    if ($tournament_id !== null) {
      // list all golfers in a tournament (with names)
      $stmt = $conn->prepare("
          SELECT 
            tg.tournament_id,
            tg.golfer_id,
            tg.team_id,
            g.first_name,
            g.last_name,
            g.handicap
          FROM tournament_golfers tg
          JOIN golfers g ON tg.golfer_id = g.golfer_id
          WHERE tg.tournament_id = ?
          ORDER BY g.last_name, g.first_name
      ");
      $stmt->bind_param('i', $tournament_id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    } else {
      // list all assignments
      $result = $conn->query("
        SELECT tournament_id, golfer_id
          FROM tournament_golfers
      ");
      echo json_encode($result->fetch_all(MYSQLI_ASSOC));
    }
    break;

  case 'POST':
    $data = json_decode(file_get_contents('php://input'), true);

    // Check if bulk save (array of golfer_ids) or single golfer
    if (isset($data['golfer_ids']) && is_array($data['golfer_ids'])) {
      // Bulk save: replace all golfers for this tournament
      $tournamentId = intval($data['tournament_id']);
      $golferIds = $data['golfer_ids'];

      // Start transaction
      $conn->begin_transaction();

      try {
        // Get tournament's handicap_pct for snapshot
        $tournamentStmt = $conn->prepare("SELECT handicap_pct FROM tournaments WHERE tournament_id = ?");
        $tournamentStmt->bind_param('i', $tournamentId);
        $tournamentStmt->execute();
        $tournamentResult = $tournamentStmt->get_result()->fetch_assoc();
        $handicapPct = $tournamentResult['handicap_pct'] ?? null;
        $tournamentStmt->close();

        // Delete existing assignments for this tournament (that have no team)
        // Keep team assignments intact for Ryder Cup style tournaments
        $stmt = $conn->prepare("
          DELETE FROM tournament_golfers
          WHERE tournament_id = ? AND (team_id IS NULL OR team_id = 0)
        ");
        $stmt->bind_param('i', $tournamentId);
        $stmt->execute();

        // Insert new golfer assignments with handicap snapshot
        $insertStmt = $conn->prepare("
          INSERT INTO tournament_golfers (tournament_id, golfer_id, handicap_at_assignment, handicap_pct_at_assignment)
          SELECT ?, ?, g.handicap, ?
          FROM golfers g
          WHERE g.golfer_id = ?
        ");

        $insertCount = 0;
        foreach ($golferIds as $golferId) {
          $gid = intval($golferId);
          $insertStmt->bind_param('iidi', $tournamentId, $gid, $handicapPct, $gid);
          $insertStmt->execute();
          $insertCount++;
        }

        $conn->commit();
        echo json_encode(['success' => true, 'inserted' => $insertCount]);

      } catch (Exception $e) {
        $conn->rollback();
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
      }

    } else {
      // Single golfer assignment (original behavior) with handicap snapshot
      $tournamentId = intval($data['tournament_id']);
      $golferId = intval($data['golfer_id']);

      // Get tournament's handicap_pct for snapshot
      $tournamentStmt = $conn->prepare("SELECT handicap_pct FROM tournaments WHERE tournament_id = ?");
      $tournamentStmt->bind_param('i', $tournamentId);
      $tournamentStmt->execute();
      $tournamentResult = $tournamentStmt->get_result()->fetch_assoc();
      $handicapPct = $tournamentResult['handicap_pct'] ?? null;
      $tournamentStmt->close();

      $stmt = $conn->prepare("
        INSERT INTO tournament_golfers (tournament_id, golfer_id, handicap_at_assignment, handicap_pct_at_assignment)
        SELECT ?, ?, g.handicap, ?
        FROM golfers g
        WHERE g.golfer_id = ?
      ");
      $stmt->bind_param('iidi', $tournamentId, $golferId, $handicapPct, $golferId);
      $stmt->execute();
      echo json_encode(['affected_rows' => $stmt->affected_rows]);
    }
    break;

  case 'DELETE':
    // remove a golfer from a tournament
    $stmt = $conn->prepare("
      DELETE FROM tournament_golfers
       WHERE tournament_id = ?
         AND golfer_id     = ?
    ");
    $stmt->bind_param('ii', $tournament_id, $golfer_id);
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;
    
  case 'PUT':
      // Update team assignment
      parse_str(file_get_contents('php://input'), $data);
      $stmt = $conn->prepare("
        UPDATE tournament_golfers
           SET team_id = ?
         WHERE tournament_id = ?
           AND golfer_id     = ?
      ");
      // allow empty = NULL team
      $teamParam = ($data['team_id'] === '') ? null : intval($data['team_id']);
      $stmt->bind_param(
        'iii',
        $teamParam,
        $tournament_id,
        $golfer_id
      );
      $stmt->execute();
      echo json_encode(['affected_rows' => $stmt->affected_rows]);
      break;
    

  default:
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    break;
}
