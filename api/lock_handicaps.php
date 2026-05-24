<?php
require_once '../cors_headers.php';
header('Content-Type: application/json');
require_once '../db_connect.php';
require_once __DIR__ . '/auth_middleware.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $tournament_id = intval($_GET['tournament_id'] ?? 0);
  if (!$tournament_id) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing tournament_id']);
    exit;
  }

  // org-scoped
  $stmt = $conn->prepare("
    SELECT g.golfer_id, g.first_name, g.last_name,
           g.handicap AS live_handicap,
           tg.handicap_at_assignment
    FROM tournament_golfers tg
    JOIN golfers g ON tg.golfer_id = g.golfer_id
    JOIN tournaments t ON t.tournament_id = tg.tournament_id AND t.org_id = ?
    WHERE tg.tournament_id = ?
    ORDER BY g.last_name, g.first_name
  ");
  $stmt->bind_param('ii', $currentOrgId, $tournament_id);
  $stmt->execute();
  $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
  echo json_encode($rows);

} elseif ($method === 'POST') {
  requireAdmin();
  $data = json_decode(file_get_contents('php://input'), true);
  $tournament_id = intval($data['tournament_id'] ?? 0);
  $golfers = $data['golfers'] ?? [];

  if (!$tournament_id || !is_array($golfers) || count($golfers) === 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing tournament_id or golfers']);
    exit;
  }

  // Verify tournament belongs to this org
  $checkStmt = $conn->prepare("SELECT tournament_id FROM tournaments WHERE tournament_id = ? AND org_id = ?");
  $checkStmt->bind_param('ii', $tournament_id, $currentOrgId);
  $checkStmt->execute();
  if ($checkStmt->get_result()->num_rows === 0) {
    http_response_code(403);
    echo json_encode(['error' => 'Tournament not found or access denied']);
    exit;
  }
  $checkStmt->close();

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
