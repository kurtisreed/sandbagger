<?php
require_once '../cors_headers.php';
// get_match_data_flat.php
// Returns JSON with tournament teams, their golfers, matches, and flat assignment records for a given round_id

header('Content-Type: application/json');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';

$round_id = isset($_GET['round_id']) ? intval($_GET['round_id']) : null;
if (!$round_id) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing round_id']);
    exit;
}

// 1) Determine tournament
$t = $conn->prepare("SELECT tournament_id FROM rounds WHERE round_id = ?");
$t->bind_param('i', $round_id);
$t->execute();
$ret = $t->get_result()->fetch_assoc();
$t->close();
if (!$ret) {
    http_response_code(404);
    echo json_encode(['error' => 'Round not found']);
    exit;
}
$tournament_id = (int)$ret['tournament_id'];

// 2) Fetch teams + colors
$teams = [];
$stmt = $conn->prepare("SELECT tt.team_id, tm.name, tm.color_hex FROM tournament_teams tt JOIN teams tm ON tt.team_id = tm.team_id WHERE tt.tournament_id = ?");
$stmt->bind_param('i', $tournament_id);
$stmt->execute();
$rs = $stmt->get_result();
while ($row = $rs->fetch_assoc()) {
    $teams[(int)$row['team_id']] = ['id'=> (int)$row['team_id'], 'name'=>$row['name'], 'color_hex'=>$row['color_hex']];
}
$stmt->close();

// 3) Fetch golfers for tournament with team_id
$golfers = [];
$stmt = $conn->prepare("SELECT tg.golfer_id, tg.team_id, g.first_name, g.last_name, g.handicap FROM tournament_golfers tg JOIN golfers g ON tg.golfer_id = g.golfer_id WHERE tg.tournament_id = ? AND g.active = 1");
$stmt->bind_param('i', $tournament_id);
$stmt->execute();
$rs = $stmt->get_result();
while ($row = $rs->fetch_assoc()) {
    $golfers[] = [
        'id' => (int)$row['golfer_id'],
        'team_id' => (int)$row['team_id'],
        'name' => $row['first_name'] . ' ' . $row['last_name'],
        'handicap' => $row['handicap']
    ];
}
$stmt->close();

// 4) Fetch matches
$matches = [];
$stmt = $conn->prepare("SELECT match_id, match_name FROM matches WHERE round_id = ? ORDER BY match_id");
$stmt->bind_param('i', $round_id);
$stmt->execute();
$rs = $stmt->get_result();
while ($row = $rs->fetch_assoc()) {
    $matches[] = ['id'=> (int)$row['match_id'], 'name'=> $row['match_name']];
}
$stmt->close();

// 5) Fetch flat assignments
$assignments = [];
if (!empty($matches)) {
    $ids = array_column($matches,'id');
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $types = str_repeat('i', count($ids));
    $sql = "SELECT match_id, golfer_id, team_id FROM match_golfers WHERE match_id IN ($ph)";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$ids);
    $stmt->execute();
    $rs = $stmt->get_result();
    while ($row = $rs->fetch_assoc()) {
        $assignments[] = [
            'match_id' => (int)$row['match_id'],
            'golfer_id'=> (int)$row['golfer_id'],
            'team_id'  => (int)$row['team_id']
        ];
    }
    $stmt->close();
}

echo json_encode([
    'tournament_id' => $tournament_id,
    'teams'         => array_values($teams),
    'golfers'       => $golfers,
    'matches'       => $matches,
    'assignments'   => $assignments
]);
