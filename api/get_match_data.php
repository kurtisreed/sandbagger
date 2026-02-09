<?php
require_once '../cors_headers.php';
// get_match_data.php
// Returns JSON with tournament teams (with name/color), their golfers, matches, and assignments for a given round_id

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

$response = [
    'tournament_id' => null,
    'teams'         => [],   // will hold each team with its golfers
    'matches'       => [],
    'assignments'   => []
];

// 1) Lookup tournament_id from rounds
$stmt = $conn->prepare("SELECT tournament_id, round_name, round_date FROM rounds WHERE round_id = ?");
$stmt->bind_param('i', $round_id);
$stmt->execute();
$res = $stmt->get_result();
if ($row = $res->fetch_assoc()) {
    $tournament_id = (int)$row['tournament_id'];
    $response['tournament_id'] = $tournament_id;
    $response['round_name'] = $row['round_name'];
    $response['round_date'] = $row['round_date'];
} else {
    http_response_code(404);
    echo json_encode(['error' => 'Round not found']);
    exit;
}
$stmt->close();

// 2) Fetch teams for this tournament via tournament_teams -> teams table
$stmt = $conn->prepare(
    "SELECT tt.team_id, tm.name, tm.color_hex
     FROM tournament_teams tt
     JOIN teams tm ON tt.team_id = tm.team_id
     WHERE tt.tournament_id = ?"
);
$stmt->bind_param('i', $tournament_id);
$stmt->execute();
$res = $stmt->get_result();
$teams = [];
while ($row = $res->fetch_assoc()) {
    $teams[(int)$row['team_id']] = [
        'id'        => (int)$row['team_id'],
        'name'      => $row['name'],
        'color_hex' => $row['color_hex'],
        'golfers'   => []
    ];
}
$stmt->close();

// 3) Fetch golfers for this tournament via tournament_golfers with handicap snapshot
$stmt = $conn->prepare(
    "SELECT tg.golfer_id, tg.team_id, g.first_name, g.last_name,
            COALESCE(tg.handicap_at_assignment, g.handicap) AS handicap
     FROM tournament_golfers tg
     JOIN golfers g ON tg.golfer_id = g.golfer_id
     WHERE tg.tournament_id = ? AND g.active = 1
     ORDER BY tg.team_id, g.last_name, g.first_name"
);
$stmt->bind_param('i', $tournament_id);
$stmt->execute();
$res = $stmt->get_result();
while ($row = $res->fetch_assoc()) {
    $tid = (int)$row['team_id'];
    if (!isset($teams[$tid])) continue;

    $teams[$tid]['golfers'][] = [
        'id'        => (int)$row['golfer_id'],
        'name'      => $row['first_name'] . ' ' . $row['last_name'],
        'handicap'  => $row['handicap']
    ];
}
$stmt->close();

$response['teams'] = array_values($teams);

// 4) Fetch matches for this round
$stmt = $conn->prepare(
    "SELECT match_id, match_name, course_id
     FROM matches
     WHERE round_id = ?
     ORDER BY match_id"
);
$stmt->bind_param('i', $round_id);
$stmt->execute();
$res = $stmt->get_result();
$matchIds = [];
while ($row = $res->fetch_assoc()) {
    $mid = (int)$row['match_id'];
    $matchIds[] = $mid;
    $response['matches'][] = [
        'id'        => $mid,
        'name'      => $row['match_name'],
        'course_id' => (int)$row['course_id']
    ];
    $response['assignments'][$mid] = ['teamA' => [], 'teamB' => []];
}
$stmt->close();

foreach ($response['matches'] as &$match) {
    $match_id = $match['id'];
    $stmt = $conn->prepare("SELECT COUNT(*) FROM hole_scores WHERE match_id = ?");
    $stmt->bind_param('i', $match_id);
    $stmt->execute();
    $stmt->bind_result($scoreCount);
    $stmt->fetch();
    $stmt->close();

    $match['locked'] = $scoreCount > 0 ? true : false;
}
unset($match); // break reference

// 5) Fetch existing assignments
if (!empty($matchIds)) {
    $placeholders = implode(',', array_fill(0, count($matchIds), '?'));
    $types = str_repeat('i', count($matchIds));
    $sql = "SELECT match_id, golfer_id FROM match_golfers WHERE match_id IN ($placeholders)";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$matchIds);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($row = $res->fetch_assoc()) {
        $mid = (int)$row['match_id'];
        $gid = (int)$row['golfer_id'];
        // find golfer object in teams
        foreach ($response['teams'] as &$team) {
            if ($team['id'] === $tid) {
                // match team mapping A/B by order
                if (empty($response['assignments'][$mid]['teamA']) || count($response['assignments'][$mid]['teamA']) < count($team['golfers'])) {
                    $response['assignments'][$mid]['teamA'][] = $gid;
                } else {
                    $response['assignments'][$mid]['teamB'][] = $gid;
                }
            }
        }
    }
    $stmt->close();
}




echo json_encode($response);
