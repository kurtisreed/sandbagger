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

  // Start a transaction
  $conn->begin_transaction();

  // 1) Remove any format assignments
  $stmt = $conn->prepare("
    DELETE FROM tournament_formats
     WHERE tournament_id = ?
  ");
  $stmt->bind_param('i', $id);
  $stmt->execute();

  // 2) Remove any golfer assignments
  $stmt = $conn->prepare("
    DELETE FROM tournament_golfers
     WHERE tournament_id = ?
  ");
  $stmt->bind_param('i', $id);
  $stmt->execute();

  // 3) Remove any round assignments
  $stmt = $conn->prepare("
    DELETE FROM tournament_rounds
     WHERE tournament_id = ?
  ");
  $stmt->bind_param('i', $id);
  $stmt->execute();

  // 4) Remove settings
  $stmt = $conn->prepare("
    DELETE FROM tournament_settings
     WHERE tournament_id = ?
  ");
  $stmt->bind_param('i', $id);
  $stmt->execute();

  //Delete associated rounds
  $stmt = $conn->prepare("DELETE FROM rounds WHERE tournament_id = ?");
  $stmt->bind_param("i", $tournament_id);
  $stmt->execute();
  
  
  //Delete associated tournament teams
  $stmt = $conn->prepare("
    DELETE FROM tournament_teams
     WHERE tournament_id = ?
  ");
  $stmt->bind_param('i', $id);
  $stmt->execute();

  // 5) Finally delete the tournament itself
  $stmt = $conn->prepare("
    DELETE FROM tournaments
     WHERE tournament_id = ?
  ");
  $stmt->bind_param('i', $id);
  $stmt->execute();

  // Commit & return
  $conn->commit();
  echo json_encode(['deleted_rows' => $stmt->affected_rows]);
  break;
}
