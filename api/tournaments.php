<?php
require_once '../cors_headers.php';
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, private, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';
require_once 'auth_middleware.php';

$method = $_SERVER['REQUEST_METHOD'];
$id     = $_GET['tournament_id'] ?? null;

/**
 * A dollar figure from the payouts card.
 *
 * Blank means "not set", which displays as $0 rather than as an amount anyone
 * agreed to. An explicit 0 is preserved - "there is no pot this round" is a
 * real answer and must stay distinguishable from "nobody has said yet".
 * Negative figures are rejected to null; a payout cannot be less than nothing.
 */
function normalizeMoney($value) {
    if ($value === null || $value === '' || !is_numeric($value)) return null;
    $n = round((float) $value, 2);
    return $n < 0 ? null : $n;
}

switch ($method) {
  case 'GET':
      if ($id) {
          // fetch one tournament (scoped to org)
          $stmt = $conn->prepare("
              SELECT
                  t.*,
                  f.name AS format_name
              FROM tournaments t
              LEFT JOIN formats f
                ON f.format_id = t.format_id
              WHERE t.tournament_id = ?
                AND t.org_id = ?
          ");
          $stmt->bind_param('ii', $id, $currentOrgId);
          $stmt->execute();
          $res = $stmt->get_result()->fetch_assoc();
          echo json_encode($res);
      } else {
          // fetch all for this org
          $stmt = $conn->prepare("
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
              WHERE t.org_id = ?
          ");
          $stmt->bind_param('i', $currentOrgId);
          $stmt->execute();
          echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
      }
      break;

  case 'POST':
    requireAdmin();
    // create new (scoped to this org)
    $data = json_decode(file_get_contents('php://input'), true);
    $stmt = $conn->prepare(
      "INSERT INTO tournaments (name, start_date, end_date, handicap_pct, format_id, org_id)
       VALUES (?, ?, ?, ?, ?, ?)"
    );
    $stmt->bind_param(
      'sssdii',
      $data['name'], $data['start_date'], $data['end_date'], $data['handicap_pct'], $data['format_id'], $currentOrgId
    );
    $stmt->execute();
    echo json_encode(['inserted_id' => $stmt->insert_id]);
    break;

  case 'PUT':
    requireAdmin();
    // update existing (must belong to this org)
    $data = json_decode(file_get_contents('php://input'), true);

    // Payout figures are optional and only sent by the Ryder Cup payouts card.
    // A key that is absent leaves the stored value alone; a key present but
    // blank clears it. Those are different intentions and must not be
    // collapsed, or saving the Details card would wipe the payouts.
    $hasPayouts = array_key_exists('buy_in', $data)
               || array_key_exists('payout_per_match', $data)
               || array_key_exists('skins_payout_per_round', $data);

    if ($hasPayouts) {
      $buyIn   = normalizeMoney($data['buy_in'] ?? null);
      $perWin  = normalizeMoney($data['payout_per_match'] ?? null);
      $skins   = normalizeMoney($data['skins_payout_per_round'] ?? null);

      $stmt = $conn->prepare(
        "UPDATE tournaments
           SET name = ?, start_date = ?, end_date = ?, handicap_pct = ?,
               buy_in = ?, payout_per_match = ?, skins_payout_per_round = ?
         WHERE tournament_id = ?
           AND org_id = ?"
      );
      $stmt->bind_param(
        'sssdddd' . 'ii',
        $data['name'], $data['start_date'], $data['end_date'],
        $data['handicap_pct'], $buyIn, $perWin, $skins,
        $id, $currentOrgId
      );
      $stmt->execute();
      $affected = $stmt->affected_rows;

      // Cascade the skins figure down to the rounds, which is where
      // get_individual_skins.php reads it from.
      //
      // Finished rounds are left alone. A round whose matches are all
      // finalized was played for whatever pot was agreed at the time, and
      // editing the tournament later should not rewrite what it paid out - the
      // same reasoning that keeps a completed match on its original handicap
      // rule. Rounds with no matches yet, or with any match still open, follow
      // the tournament.
      $cascade = $conn->prepare("
        UPDATE rounds r
          JOIN tournaments t ON t.tournament_id = r.tournament_id AND t.org_id = ?
           SET r.skins_total = ?
         WHERE r.tournament_id = ?
           AND (
                 NOT EXISTS (SELECT 1 FROM matches m WHERE m.round_id = r.round_id)
                 OR EXISTS (SELECT 1 FROM matches m
                             WHERE m.round_id = r.round_id AND m.finalized = 0)
               )
      ");
      $cascade->bind_param('idi', $currentOrgId, $skins, $id);
      $cascade->execute();

      echo json_encode([
        'affected'        => $affected,
        'rounds_cascaded' => $cascade->affected_rows,
      ]);
      break;
    }

    $stmt = $conn->prepare(
      "UPDATE tournaments
         SET name = ?, start_date = ?, end_date = ?, handicap_pct = ?
       WHERE tournament_id = ?
         AND org_id = ?"
    );
    $stmt->bind_param(
      'sssdii',
      $data['name'], $data['start_date'], $data['end_date'],
      $data['handicap_pct'], $id, $currentOrgId
    );
    $stmt->execute();
    echo json_encode(['affected' => $stmt->affected_rows]);
    break;

case 'DELETE':
    requireAdmin();
    error_log("Deleting tournament_id = " . var_export($id, true));

  try {
    // Start a transaction
    $conn->begin_transaction();

    // Verify the tournament belongs to this org before deleting
    $checkStmt = $conn->prepare("SELECT tournament_id FROM tournaments WHERE tournament_id = ? AND org_id = ?");
    $checkStmt->bind_param('ii', $id, $currentOrgId);
    $checkStmt->execute();
    if ($checkStmt->get_result()->num_rows === 0) {
      http_response_code(403);
      echo json_encode(['error' => 'Tournament not found or access denied']);
      exit;
    }
    $checkStmt->close();

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
