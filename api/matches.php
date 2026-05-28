<?php
require_once '../cors_headers.php';
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, private, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';
require_once 'auth_middleware.php';

$method   = $_SERVER['REQUEST_METHOD'];
$id       = isset($_GET['match_id'])   ? intval($_GET['match_id'])   : null;
$round_id = isset($_GET['round_id'])   ? intval($_GET['round_id'])   : null;

switch ($method) {
  case 'GET':
    if ($id) {
      // fetch one match (verify belongs to this org)
      $stmt = $conn->prepare("
        SELECT m.match_id, m.round_id
          FROM matches m
          JOIN rounds r ON r.round_id = m.round_id
          JOIN tournaments t ON t.tournament_id = r.tournament_id AND t.org_id = ?
         WHERE m.match_id = ?
      ");
      $stmt->bind_param('ii', $currentOrgId, $id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_assoc());
    } elseif ($round_id) {
      // fetch matches for a given round with golfer details (verify org)
      $stmt = $conn->prepare("
        SELECT m.match_id, m.match_name, m.round_id
          FROM matches m
          JOIN rounds r ON r.round_id = m.round_id
          JOIN tournaments t ON t.tournament_id = r.tournament_id AND t.org_id = ?
         WHERE m.round_id = ?
         ORDER BY m.match_id
      ");
      $stmt->bind_param('ii', $currentOrgId, $round_id);
      $stmt->execute();
      $matches = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);

      // Get golfers for each match
      foreach ($matches as &$match) {
        $stmt2 = $conn->prepare("
          SELECT mg.golfer_id, mg.player_order, g.first_name, g.last_name,
                 COALESCE(tg.handicap_at_assignment, g.handicap) AS handicap
          FROM match_golfers mg
          JOIN golfers g ON mg.golfer_id = g.golfer_id
          JOIN matches m ON mg.match_id = m.match_id
          JOIN rounds r ON m.round_id = r.round_id
          LEFT JOIN tournament_golfers tg ON g.golfer_id = tg.golfer_id AND tg.tournament_id = r.tournament_id
          WHERE mg.match_id = ?
          ORDER BY mg.player_order
        ");
        $stmt2->bind_param('i', $match['match_id']);
        $stmt2->execute();
        $golfers = $stmt2->get_result()->fetch_all(MYSQLI_ASSOC);

        // player_order is the team_position (1,2 = Team 1, 3,4 = Team 2)
        foreach ($golfers as &$golfer) {
          $golfer['team_position'] = $golfer['player_order'] ?: 1;
        }

        $match['golfers'] = $golfers;
      }

      echo json_encode($matches);
    } else {
      // fetch all matches for this org
      $stmt = $conn->prepare("
        SELECT m.match_id, m.round_id
          FROM matches m
          JOIN rounds r ON r.round_id = m.round_id
          JOIN tournaments t ON t.tournament_id = r.tournament_id AND t.org_id = ?
         ORDER BY m.match_id
      ");
      $stmt->bind_param('i', $currentOrgId);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    }
    break;

    case 'POST':
      requireAdmin();
      try {
          // Create a new match
          $data = json_decode(file_get_contents('php://input'), true);
          if (!$data) {
              throw new Exception('Invalid JSON data received');
          }

          // Start transaction
          $conn->begin_transaction();

          try {
              // Verify the round belongs to this org
              $checkStmt = $conn->prepare("
                SELECT r.round_id FROM rounds r
                JOIN tournaments t ON t.tournament_id = r.tournament_id AND t.org_id = ?
                WHERE r.round_id = ?
              ");
              $checkStmt->bind_param('ii', $currentOrgId, $data['round_id']);
              $checkStmt->execute();
              if ($checkStmt->get_result()->num_rows === 0) {
                  $conn->rollback();
                  http_response_code(403);
                  echo json_encode(['success' => false, 'error' => 'Round not found or access denied']);
                  exit;
              }
              $checkStmt->close();

              // Insert the match into the matches table
              $stmt = $conn->prepare("
                  INSERT INTO matches (round_id, match_type)
                  VALUES (?, ?)
              ");
              $stmt->bind_param('is', $data['round_id'], $data['match_type']);
              $stmt->execute();
              $matchId = $stmt->insert_id;
  
              // Update tournament_golfers for Team 1
              foreach ($data['team_1_golfers'] as $golferId) {
                  $stmt = $conn->prepare("
                      UPDATE tournament_golfers 
                      SET team_id = 1 
                      WHERE tournament_id = (
                          SELECT tournament_id 
                          FROM rounds 
                          WHERE round_id = ?
                      ) 
                      AND golfer_id = ?
                  ");
                  $stmt->bind_param('ii', $data['round_id'], $golferId);
                  $stmt->execute();
              }
  
              // Update tournament_golfers for Team 2
              foreach ($data['team_2_golfers'] as $golferId) {
                  $stmt = $conn->prepare("
                      UPDATE tournament_golfers 
                      SET team_id = 2 
                      WHERE tournament_id = (
                          SELECT tournament_id 
                          FROM rounds 
                          WHERE round_id = ?
                      ) 
                      AND golfer_id = ?
                  ");
                  $stmt->bind_param('ii', $data['round_id'], $golferId);
                  $stmt->execute();
              }
  
              // Insert into match_golfers
              $stmt = $conn->prepare("
                  INSERT INTO match_golfers (match_id, golfer_id)
                  VALUES (?, ?)
              ");
  
              // Add Team 1 golfers
              foreach ($data['team_1_golfers'] as $golferId) {
                  $stmt->bind_param('ii', $matchId, $golferId);
                  $stmt->execute();
              }
  
              // Add Team 2 golfers
              foreach ($data['team_2_golfers'] as $golferId) {
                  $stmt->bind_param('ii', $matchId, $golferId);
                  $stmt->execute();
              }
  
              // Commit transaction
              $conn->commit();
  
              // Send success response
              http_response_code(200);
              echo json_encode(['success' => true, 'match_id' => $matchId]);
  
          } catch (Exception $e) {
              // Rollback on error
              $conn->rollback();
              throw $e;
          }
      } catch (Exception $e) {
          // Send error response
          http_response_code(500);
          echo json_encode([
              'success' => false,
              'error' => $e->getMessage()
          ]);
      }
      break;

  case 'PUT':
    requireAdmin();
    // update an existing match (must belong to this org)
    parse_str(file_get_contents('php://input'), $data);
    $stmt = $conn->prepare("
      UPDATE matches m
         JOIN rounds r ON r.round_id = m.round_id
         JOIN tournaments t ON t.tournament_id = r.tournament_id AND t.org_id = ?
         SET m.round_id = ?
       WHERE m.match_id = ?
    ");
    $stmt->bind_param('iii', $currentOrgId, $data['round_id'], $id);
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  case 'DELETE':
    requireAdmin();
    // Must belong to this org
    $stmt = $conn->prepare("
      DELETE m FROM matches m
        JOIN rounds r ON r.round_id = m.round_id
        JOIN tournaments t ON t.tournament_id = r.tournament_id AND t.org_id = ?
       WHERE m.match_id = ?
    ");
    $stmt->bind_param('ii', $currentOrgId, $id);
    $stmt->execute();
    echo json_encode(['deleted_rows' => $stmt->affected_rows]);
    break;

  default:
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    break;
}
