<?php
require_once '../cors_headers.php';
// api/get_tee_time_assignments.php
// For a given round_id, returns the round name, a list of its tee times,
// and a list of its matches, with each match containing its assigned golfers (name and team color).

header('Content-Type: application/json');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
require_once 'db_connect.php';

// 1. Input Validation
$round_id = isset($_GET['round_id']) ? intval($_GET['round_id']) : 0;
if (!$round_id) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing or invalid round_id']);
    exit;
}

// Initialize the response structure
$response = [
    'round_name' => '',
    'tee_times'  => [],
    'matches'    => [],
];

// 2. Get Round Info (and tournament_id for later)
$tournament_id = null;
$stmt = $conn->prepare("SELECT tournament_id, round_name, round_date FROM rounds WHERE round_id = ?");
$stmt->bind_param('i', $round_id);
$stmt->execute();
$result = $stmt->get_result();
if ($row = $result->fetch_assoc()) {
    $tournament_id = (int)$row['tournament_id'];
    $response['round_name'] = $row['round_name'];
    $response['round_date'] = $row['round_date']; 
} else {
    http_response_code(404);
    echo json_encode(['error' => 'Round not found']);
    exit;
}
$stmt->close();

// 3. Get All Tee Times for this Round
$stmt = $conn->prepare("SELECT tee_time_id, time FROM tee_times WHERE round_id = ? ORDER BY time ASC");
$stmt->bind_param('i', $round_id);
$stmt->execute();
$tee_times_result = $stmt->get_result();
while ($row = $tee_times_result->fetch_assoc()) {
    $response['tee_times'][] = [
        'tee_time_id' => (int)$row['tee_time_id'],
        'time'        => $row['time']
    ];
}
$stmt->close();

// 4. Get All Matches for this Round
$matches_lookup = [];
$match_ids = [];
$stmt = $conn->prepare("SELECT match_id, match_name, tee_time_id FROM matches WHERE round_id = ?");
$stmt->bind_param('i', $round_id);
$stmt->execute();
$matches_result = $stmt->get_result();
while ($row = $matches_result->fetch_assoc()) {
    $match_id = (int)$row['match_id'];
    $match_ids[] = $match_id;
    $matches_lookup[$match_id] = [
        'match_id'    => $match_id,
        'match_name'  => $row['match_name'],
        'tee_time_id' => $row['tee_time_id'] ? (int)$row['tee_time_id'] : null,
        'golfers'     => [] // We will populate this in the next step
    ];
}
$stmt->close();

// 5. If there are matches, fetch all their golfers
if (!empty($match_ids)) {
    $placeholders = implode(',', array_fill(0, count($match_ids), '?'));
    $types = str_repeat('i', count($match_ids));

    // First try the Ryder Cup style query (with teams)
    $sql = "
        SELECT
            mg.match_id,
            g.golfer_id,
            g.first_name,
            g.last_name,
            g.handicap,
            CONCAT(g.first_name, ' ', g.last_name) AS golfer_name,
            mg.player_order,
            t.color_hex AS team_color,
            t.name AS team_name
        FROM
            match_golfers mg
        JOIN
            golfers g ON mg.golfer_id = g.golfer_id
        LEFT JOIN
            tournament_golfers tg ON g.golfer_id = tg.golfer_id AND tg.tournament_id = ?
        LEFT JOIN
            teams t ON tg.team_id = t.team_id
        WHERE
            mg.match_id IN ($placeholders)
        ORDER BY
            mg.match_id,
            mg.player_order ASC,
            g.last_name ASC
    ";

    $stmt = $conn->prepare($sql);
    $stmt->bind_param('i' . $types, $tournament_id, ...$match_ids);
    $stmt->execute();
    $golfers_result = $stmt->get_result();

    while ($row = $golfers_result->fetch_assoc()) {
        $match_id = (int)$row['match_id'];
        if (isset($matches_lookup[$match_id])) {
            // Use player_order to determine team_position for Guys Trip
            $player_order = $row['player_order'] ? (int)$row['player_order'] : 1;

            $matches_lookup[$match_id]['golfers'][] = [
                'golfer_id'     => (int)$row['golfer_id'],
                'first_name'    => $row['first_name'],
                'last_name'     => $row['last_name'],
                'handicap'      => $row['handicap'],
                'name'          => $row['golfer_name'],
                'team_color'    => $row['team_color'],
                'team_name'     => $row['team_name'],
                'player_order'  => $player_order,
                'team_position' => $player_order
            ];
        }
    }
    $stmt->close();
}

// 6. Final Assembly and Output
// Convert the lookup map to a simple indexed array for the final JSON
$response['matches'] = array_values($matches_lookup);
echo json_encode($response, JSON_PRETTY_PRINT);

?>