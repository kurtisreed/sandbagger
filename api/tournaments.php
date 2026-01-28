<?php
require_once '../cors_headers.php';
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';

$method = $_SERVER['REQUEST_METHOD'];
$id     = $_GET['tournament_id'] ?? null;

switch ($method) {
  case 'GET':
      if ($id) {
          // fetch one tournament
          $stmt = $conn->prepare("
              SELECT
                  t.*,
                  f.name AS format_name
              FROM tournaments t
              LEFT JOIN formats f
                ON f.format_id = t.format_id
              WHERE t.tournament_id = ?
          ");
          $stmt->bind_param('i', $id);
          $stmt->execute();
          $res = $stmt->get_result()->fetch_assoc();
          echo json_encode($res);
      } else {
          // fetch all
          $sql = "
              SELECT
                  t.*,
                  f.name                    AS format_name,
                  COALESCE(r.rounds,0)      AS round_count,
                  COALESCE(g.golfers,0)     AS golfer_count
              FROM tournaments t
              LEFT JOIN (
                  SELECT tournament_id, COUNT(*) AS rounds
                  FROM rounds
                  GROUP BY tournament_id
              ) r ON r.tournament_id = t.tournament_id
              LEFT JOIN (
                  SELECT tournament_id, COUNT(*) AS golfers
                  FROM tournament_golfers
                  GROUP BY tournament_id
              ) g ON g.tournament_id = t.tournament_id
              LEFT JOIN formats f
                ON f.format_id = t.format_id
          ";
          $result = $conn->query($sql);
          echo json_encode($result->fetch_all(MYSQLI_ASSOC));
      }
      break;

  case 'POST':
    // create new
    $data = json_decode(file_get_contents('php://input'), true);
    $stmt = $conn->prepare(
      "INSERT INTO tournaments (name, start_date, end_date, handicap_pct, format_id) 
       VALUES (?, ?, ?, ?, ?)"
    );
    $stmt->bind_param(
      'sssdi',
      $data['name'], $data['start_date'], $data['end_date'], $data['handicap_pct'], $data['format_id']
    );
    $stmt->execute();
    echo json_encode(['inserted_id' => $stmt->insert_id]);
    break;

  case 'PUT':
    // update existing
    parse_str(file_get_contents('php://input'), $data);
    $stmt = $conn->prepare(
      "UPDATE tournaments 
         SET name = ?, start_date = ?, end_date = ?, handicap_pct = ? 
       WHERE tournament_id = ?"
    );
    $stmt->bind_param(
      'sssdi',
      $data['name'], $data['start_date'], $data['end_date'],
      $data['handicap_pct'], $id
    );
    $stmt->execute();
    echo json_encode(['affected' => $stmt->affected_rows]);
    break;

case 'DELETE':
    error_log("Deleting tournament_id = " . var_export($id, true));

  try {
    // Start a transaction
    $conn->begin_transaction();

    // Step 1: Get all round IDs for this tournament
    $stmt = $conn->prepare("SELECT round_id FROM rounds WHERE tournament_id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $result = $stmt->get_result();
    $roundIds = [];
    while ($row = $result->fetch_assoc()) {
      $roundIds[] = $row['round_id'];
    }

    if (!empty($roundIds)) {
      // Step 2: Get all match IDs for these rounds
      $roundIdsList = implode(',', array_map('intval', $roundIds));
      $matchResult = $conn->query("SELECT match_id FROM matches WHERE round_id IN ($roundIdsList)");
      $matchIds = [];
      while ($row = $matchResult->fetch_assoc()) {
        $matchIds[] = $row['match_id'];
      }

      if (!empty($matchIds)) {
        $matchIdsList = implode(',', array_map('intval', $matchIds));

        // Step 3: Delete hole_scores for these matches (leaf node)
        $conn->query("DELETE FROM hole_scores WHERE match_id IN ($matchIdsList)");
        error_log("Deleted hole_scores for matches: $matchIdsList");

        // Step 4: Delete match_golfers for these matches
        $conn->query("DELETE FROM match_golfers WHERE match_id IN ($matchIdsList)");
        error_log("Deleted match_golfers for matches: $matchIdsList");

        // Step 5: Delete matches for these rounds
        $conn->query("DELETE FROM matches WHERE round_id IN ($roundIdsList)");
        error_log("Deleted matches for rounds: $roundIdsList");
      }

      // Step 6: Delete tee_times for these rounds
      $conn->query("DELETE FROM tee_times WHERE round_id IN ($roundIdsList)");
      error_log("Deleted tee_times for rounds: $roundIdsList");

      // Step 7: Delete rounds for this tournament
      $stmt = $conn->prepare("DELETE FROM rounds WHERE tournament_id = ?");
      $stmt->bind_param('i', $id);
      $stmt->execute();
      error_log("Deleted rounds for tournament_id: $id");
    }

    // Step 8: Delete tournament association tables

    // Delete tournament_formats
    $stmt = $conn->prepare("DELETE FROM tournament_formats WHERE tournament_id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();

    // Delete tournament_golfers
    $stmt = $conn->prepare("DELETE FROM tournament_golfers WHERE tournament_id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();

    // Delete tournament_rounds
    $stmt = $conn->prepare("DELETE FROM tournament_rounds WHERE tournament_id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();

    // Delete tournament_settings
    $stmt = $conn->prepare("DELETE FROM tournament_settings WHERE tournament_id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();

    // Delete tournament_teams
    $stmt = $conn->prepare("DELETE FROM tournament_teams WHERE tournament_id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();

    // Step 9: Finally delete the tournament itself
    $stmt = $conn->prepare("DELETE FROM tournaments WHERE tournament_id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $deleted_rows = $stmt->affected_rows;

    // Commit & return
    $conn->commit();
    error_log("Successfully deleted tournament_id: $id");
    echo json_encode(['deleted_rows' => $deleted_rows, 'success' => true]);

  } catch (Exception $e) {
    // Rollback on error
    $conn->rollback();
    error_log("Error deleting tournament_id $id: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Failed to delete tournament: ' . $e->getMessage()]);
  }
  break;
}
