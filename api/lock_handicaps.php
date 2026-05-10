<?php
require_once '../cors_headers.php';
header('Content-Type: application/json');
require_once '../db_connect.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $tournament_id = intval($_GET['tournament_id'] ?? 0);
  if (!$tournament_id) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing tournament_id']);
    exit;
  }

  $stmt = $conn->prepare("
    SELECT g.golfer_id, g.first_name, g.last_name,
           g.handicap AS live_handicap,
           tg.handicap_at_assignment
    FROM tournament_golfers tg
    JOIN golfers g ON tg.golfer_id = g.golfer_id
    WHERE tg.tournament_id = ?
    ORDER BY g.last_name, g.first_name
  ");
  $stmt->bind_param('i', $tournament_id);
  $stmt->execute();
  $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
  echo json_encode($rows);

} elseif ($method === 'POST') {
  $data = json_decode(file_get_contents('php://input'), true);
  $tournament_id = intval($data['tournament_id'] ?? 0);
  $golfers = $data['golfers'] ?? [];

  if (!$tournament_id || !is_array($golfers) || count($golfers) === 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing tournament_id or golfers']);
    exit;
  }

  $stmt = $conn->prepare("
    UPDATE tournament_golfers
    SET handicap_at_assignment = ?
    WHERE tournament_id = ? AND golfer_id = ?
  ");

  foreach ($golfers as $g) {
    $golfer_id = intval($g['golfer_id']);
    $handicap  = floatval($g['handicap_at_assignment']);
    $stmt->bind_param('dii', $handicap, $tournament_id, $golfer_id);
    $stmt->execute();
  }

  echo json_encode(['success' => true]);

} else {
  http_response_code(405);
  echo json_encode(['error' => 'Method not allowed']);
}
