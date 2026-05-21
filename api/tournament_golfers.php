<?php
require_once '../cors_headers.php';
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';
require_once 'auth_middleware.php';

$method        = $_SERVER['REQUEST_METHOD'];
$tournament_id = isset($_GET['tournament_id']) ? intval($_GET['tournament_id']) : null;
$golfer_id     = isset($_GET['golfer_id'])     ? intval($_GET['golfer_id'])     : null;

switch ($method) {
  case 'GET':
    if ($tournament_id !== null) {
      // list all golfers in a tournament (scoped to org)
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
          JOIN tournaments t ON t.tournament_id = tg.tournament_id AND t.org_id = ?
          WHERE tg.tournament_id = ?
          ORDER BY g.last_name, g.first_name
      ");
      $stmt->bind_param('ii', $currentOrgId, $tournament_id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    } else {
      // list all assignments for this org
      $stmt = $conn->prepare("
        SELECT tg.tournament_id, tg.golfer_id
          FROM tournament_golfers tg
          JOIN tournaments t ON t.tournament_id = tg.tournament_id AND t.org_id = ?
      ");
      $stmt->bind_param('i', $currentOrgId);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
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
        // Get tournament's handicap_pct for snapshot (org-scoped)
        $tournamentStmt = $conn->prepare("SELECT handicap_pct FROM tournaments WHERE tournament_id = ? AND org_id = ?");
        $tournamentStmt->bind_param('ii', $tournamentId, $currentOrgId);
        $tournamentStmt->execute();
        $tournamentResult = $tournamentStmt->get_result()->fetch_assoc();
        if (!$tournamentResult) {
          $conn->rollback();
          http_response_code(403);
          echo json_encode(['error' => 'Tournament not found or access denied']);
          exit;
        }
        $handicapPct = $tournamentResult['handicap_pct'] ?? null;
        $tournamentStmt->close();

        // Preserve any manually locked handicaps before deleting
        $lockedStmt = $conn->prepare("SELECT golfer_id, handicap_at_assignment FROM tournament_golfers WHERE tournament_id = ? AND handicap_at_assignment IS NOT NULL");
        $lockedStmt->bind_param('i', $tournamentId);
        $lockedStmt->execute();
        $lockedRows = $lockedStmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $lockedStmt->close();
        $lockedMap = [];
        foreach ($lockedRows as $row) {
          $lockedMap[$row['golfer_id']] = $row['handicap_at_assignment'];
        }

        // Delete existing assignments for this tournament (that have no team)
        // Keep team assignments intact for Ryder Cup style tournaments
        $stmt = $conn->prepare("
          DELETE FROM tournament_golfers
          WHERE tournament_id = ? AND (team_id IS NULL OR team_id = 0)
        ");
        $stmt->bind_param('i', $tournamentId);
        $stmt->execute();

        // Re-insert — restore locked handicap if one existed, otherwise snapshot live
        $insertWithLocked = $conn->prepare("
          INSERT INTO tournament_golfers (tournament_id, golfer_id, handicap_at_assignment, handicap_pct_at_assignment)
          VALUES (?, ?, ?, ?)
        ");
        $insertFromLive = $conn->prepare("
          INSERT INTO tournament_golfers (tournament_id, golfer_id, handicap_at_assignment, handicap_pct_at_assignment)
          SELECT ?, ?, g.handicap, ?
          FROM golfers g WHERE g.golfer_id = ?
        ");

        $insertCount = 0;
        foreach ($golferIds as $golferId) {
          $gid = intval($golferId);
          if (isset($lockedMap[$gid])) {
            $lockedHcp = $lockedMap[$gid];
            $insertWithLocked->bind_param('iidi', $tournamentId, $gid, $lockedHcp, $handicapPct);
            $insertWithLocked->execute();
          } else {
            $insertFromLive->bind_param('iidi', $tournamentId, $gid, $handicapPct, $gid);
            $insertFromLive->execute();
          }
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

      // Get tournament's handicap_pct for snapshot (org-scoped)
      $tournamentStmt = $conn->prepare("SELECT handicap_pct FROM tournaments WHERE tournament_id = ? AND org_id = ?");
      $tournamentStmt->bind_param('ii', $tournamentId, $currentOrgId);
      $tournamentStmt->execute();
      $tournamentResult = $tournamentStmt->get_result()->fetch_assoc();
      if (!$tournamentResult) {
        http_response_code(403);
        echo json_encode(['error' => 'Tournament not found or access denied']);
        exit;
      }
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
    // remove a golfer from a tournament (org-scoped)
    $stmt = $conn->prepare("
      DELETE tg FROM tournament_golfers tg
        JOIN tournaments t ON t.tournament_id = tg.tournament_id AND t.org_id = ?
       WHERE tg.tournament_id = ?
         AND tg.golfer_id     = ?
    ");
    $stmt->bind_param('iii', $currentOrgId, $tournament_id, $golfer_id);
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  case 'PUT':
      // Update team assignment (org-scoped)
      parse_str(file_get_contents('php://input'), $data);
      $stmt = $conn->prepare("
        UPDATE tournament_golfers tg
          JOIN tournaments t ON t.tournament_id = tg.tournament_id AND t.org_id = ?
           SET tg.team_id = ?
         WHERE tg.tournament_id = ?
           AND tg.golfer_id     = ?
      ");
      // allow empty = NULL team
      $teamParam = ($data['team_id'] === '') ? null : intval($data['team_id']);
      $stmt->bind_param(
        'iiii',
        $currentOrgId,
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
