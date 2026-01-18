<?php
require_once '../cors_headers.php';
header('Content-Type: application/json');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';

$roundId = isset($_GET['round_id']) ? (int)$_GET['round_id'] : 0;
if ($roundId < 1) {
  echo json_encode(['success'=>false, 'error'=>'Missing or invalid round_id']);
  exit;
}

// Decode incoming JSON
$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (json_last_error() !== JSON_ERROR_NONE || !isset($data['assignments'])) {
  echo json_encode(['success'=>false, 'error'=>'Invalid JSON payload']);
  exit;
}
$assignments = $data['assignments'];
$matchNames = isset($data['matchNames']) ? $data['matchNames'] : [];

// 0) Grab all existing match_ids for this round
$existingIds = [];
$stmtFetch = $conn->prepare("SELECT match_id FROM matches WHERE round_id = ?");
$stmtFetch->bind_param('i', $roundId);
$stmtFetch->execute();
$resFetch = $stmtFetch->get_result();
while ($row = $resFetch->fetch_assoc()) {
  $existingIds[] = (int)$row['match_id'];
}
$stmtFetch->close();

// We'll collect the subset of those we actually keep
$keepIds   = [];
$newIdMap  = [];

$conn->begin_transaction();
try {
  // Prepare statements
  $stmtCheck   = $conn->prepare("
    SELECT match_id 
      FROM matches 
     WHERE match_id = ? AND round_id = ?
  ");
  $stmtDelGolf = $conn->prepare("
    DELETE FROM match_golfers 
     WHERE match_id = ?
  ");
  $stmtInsMatch= $conn->prepare("
    INSERT INTO matches (match_name, round_id) 
    VALUES (?, ?)
  ");
  $stmtInsGolf = $conn->prepare("
    INSERT INTO match_golfers (match_id, golfer_id) 
    VALUES (?, ?)
  ");
  
  foreach ($assignments as $provId => $teams) {
    $provId = (int)$provId;
    
    // 1) Check if this match already exists
    $stmtCheck->bind_param('ii', $provId, $roundId);
    $stmtCheck->execute();
    $res = $stmtCheck->get_result();
    
    if ($res->num_rows > 0) {
      // existing → reuse ID, clear its golfers
      $matchId = $provId;
      $stmtDelGolf->bind_param('i', $matchId);
      $stmtDelGolf->execute();

      if (isset($matchNames[$provId])) {
        $stmtUpdateName = $conn->prepare("UPDATE matches SET match_name = ? WHERE match_id = ?");
        $stmtUpdateName->bind_param('si', $matchNames[$provId], $matchId);
        $stmtUpdateName->execute();
        $stmtUpdateName->close();
      }
      
    } else {
      // new → insert and map provisional → real
      $matchName = isset($matchNames[$provId]) ? $matchNames[$provId] : "Match";
      $stmtInsMatch->bind_param('si', $matchName, $roundId);
      $stmtInsMatch->execute();
      $matchId = $conn->insert_id;
      $newIdMap[$provId] = $matchId;
    }
    
    $keepIds[] = $matchId;
    
    // 2) Re‐insert all golfers for this match
    $allGolfers = [];
    if (!empty($teams['teamA']) && is_array($teams['teamA'])) {
      $allGolfers = array_merge($allGolfers, $teams['teamA']);
    }
    if (!empty($teams['teamB']) && is_array($teams['teamB'])) {
      $allGolfers = array_merge($allGolfers, $teams['teamB']);
    }
    foreach ($allGolfers as $gid) {
      $gid = (int)$gid;
      $stmtInsGolf->bind_param('ii', $matchId, $gid);
      $stmtInsGolf->execute();
    }
  }
  
  // 3) Delete any matches that were dropped on the front end
  $toDelete = array_diff($existingIds, $keepIds);
  if (!empty($toDelete)) {
    $stmtDelAllGolf = $conn->prepare("DELETE FROM match_golfers WHERE match_id = ?");
    $stmtDelMatch   = $conn->prepare("DELETE FROM matches       WHERE match_id = ?");
    foreach ($toDelete as $delId) {
      $stmtDelAllGolf->bind_param('i', $delId);
      $stmtDelAllGolf->execute();
      $stmtDelMatch->bind_param('i', $delId);
      $stmtDelMatch->execute();
    }
    $stmtDelAllGolf->close();
    $stmtDelMatch->close();
  }

  $conn->commit();
  echo json_encode([
    'success'    => true,
    'newIdMap'   => $newIdMap,
    'deletedIds' => array_values($toDelete)
  ]);
  
} catch (Exception $e) {
  $conn->rollback();
  echo json_encode([
    'success'=>false,
    'error'  => $e->getMessage()
  ]);
}

// Cleanup
$stmtCheck->close();
$stmtDelGolf->close();
$stmtInsMatch->close();
$stmtInsGolf->close();
$conn->close();