<?php
require_once '../cors_headers.php';
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';

$method   = $_SERVER['REQUEST_METHOD'];
$id       = isset($_GET['match_id'])   ? intval($_GET['match_id'])   : null;
$round_id = isset($_GET['round_id'])   ? intval($_GET['round_id'])   : null;

switch ($method) {
  case 'GET':
    if ($id) {
      // fetch one match
      $stmt = $conn->prepare("
        SELECT match_id, round_id
          FROM matches
         WHERE match_id = ?
      ");
      $stmt->bind_param('i', $id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_assoc());
    } elseif ($round_id) {
      // fetch matches for a given round
      $stmt = $conn->prepare("
        SELECT match_id, match_type, round_id
          FROM matches
         WHERE round_id = ?
         ORDER BY match_id
      ");
      $stmt->bind_param('i', $round_id);
      $stmt->execute();
      echo json_encode($stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    } else {
      // fetch all matches
      $result = $conn->query("
        SELECT match_id, round_id
          FROM matches
         ORDER BY match_id
      ");
      echo json_encode($result->fetch_all(MYSQLI_ASSOC));
    }
    break;

    case 'POST':
      try {
          // Create a new match
          $data = json_decode(file_get_contents('php://input'), true);
          if (!$data) {
              throw new Exception('Invalid JSON data received');
          }
  
          // Start transaction
          $conn->begin_transaction();
  
          try {
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
    // update an existing match (e.g. move to a different round)
    parse_str(file_get_contents('php://input'), $data);
    $stmt = $conn->prepare("
      UPDATE matches
         SET round_id = ?
       WHERE match_id = ?
    ");
    $stmt->bind_param('ii', $data['round_id'], $id);
    $stmt->execute();
    echo json_encode(['affected_rows' => $stmt->affected_rows]);
    break;

  case 'DELETE':
    $stmt = $conn->prepare("DELETE FROM matches WHERE match_id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    echo json_encode(['deleted_rows' => $stmt->affected_rows]);
    break;

  default:
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    break;
}
