<?php
session_start();
// DB credentials
require_once 'db_connect.php';

$round_id = $_SESSION['round_id'] ?? null;
$tournament_id = $_SESSION['tournament_id'] ?? null;


if (!$round_id) {
    echo json_encode(['error' => 'Missing round ID']);
    exit;
}

$conn = new mysqli($servername, $username, $password, $dbname);
if ($conn->connect_error) {
    echo json_encode(['error' => 'Database connection failed']);
    exit;
}

// Step 1: Get all matches in this round
$matchSql = $conn->prepare("
    SELECT m.match_id, r.course_id
    FROM matches m
    JOIN rounds r ON m.round_id = r.round_id
    WHERE m.round_id = ?
");
$matchSql->bind_param("i", $round_id);
$matchSql->execute();
$matchResult = $matchSql->get_result();

$matches = [];
$course_id = null;

while ($row = $matchResult->fetch_assoc()) {
    $matches[] = $row['match_id'];
    $course_id = $row['course_id'];  // Now pulling course_id from the rounds table
}

if (empty($matches) || !$course_id) {
    echo json_encode(['error' => 'No matches found']);
    exit;
}




// Step 2: Get all golfers and their handicaps, along with their team names
$golferSql = $conn->prepare("
    SELECT 
        g.golfer_id, 
        g.first_name, 
        g.handicap, 
        mg.match_id, 
        t.name AS team_name,
        t.color_hex AS team_color
    FROM match_golfers mg
    JOIN golfers g ON mg.golfer_id = g.golfer_id
    JOIN tournament_golfers tg ON g.golfer_id = tg.golfer_id AND tg.tournament_id = ?
    JOIN teams t ON tg.team_id = t.team_id
    WHERE mg.match_id IN (" . implode(',', array_fill(0, count($matches), '?')) . ")
");
$golferSql->bind_param(str_repeat('i', count($matches) + 1), $tournament_id, ...$matches);
$golferSql->execute();
$golferResult = $golferSql->get_result();

$golfers = [];
while ($row = $golferResult->fetch_assoc()) {
    $golfers[$row['golfer_id']] = [
        'name' => $row['first_name'],
        'handicap' => floatval($row['handicap']),
        'team' => $row['team_name'], // Use team name from the `teams` table
        'team_color' => $row['team_color'], // Added team color
        'match_id' => $row['match_id']
    ];
}

$totalGolfers = count(array_unique(array_keys($golfers)));

// Step 2.5: Get course slope/rating and tournament handicap percent
$courseSql = $conn->prepare("SELECT slope, rating FROM courses WHERE course_id = ?");
$courseSql->bind_param("i", $course_id);
$courseSql->execute();
$courseResult = $courseSql->get_result();
$courseRow = $courseResult->fetch_assoc();
$slope = floatval($courseRow['slope']);
$rating = floatval($courseRow['rating']);

$tourSql = $conn->prepare("SELECT handicap_pct FROM tournaments WHERE tournament_id = ?");
$tourSql->bind_param("i", $tournament_id);
$tourSql->execute();
$tourResult = $tourSql->get_result();
$tourRow = $tourResult->fetch_assoc();
$handicap_pct = floatval($tourRow['handicap_pct']);

// Step 2.6: Calculate playing handicap for each golfer
foreach ($golfers as $gid => &$g) {
    $hcp = $g['handicap'];
    $playing_handicap = ($hcp * ($slope / 113) + ($rating - 72)) * ($handicap_pct / 100);
    $g['playing_handicap'] = round($playing_handicap, 1); // 1 decimal place
}
unset($g); // break reference

// Step 3: Get hole handicap indexes
$holeSql = $conn->prepare("SELECT hole_number, handicap_index FROM holes WHERE course_id = ?");
$holeSql->bind_param("i", $course_id);
$holeSql->execute();
$holeResult = $holeSql->get_result();

$holeMap = [];
while ($row = $holeResult->fetch_assoc()) {
    $holeMap[intval($row['hole_number'])] = intval($row['handicap_index']);
}


// Step 4: Get all scores
$scoreSql = $conn->prepare("
    SELECT hs.match_id, hs.golfer_id, hs.hole_number, hs.strokes
    FROM hole_scores hs
    WHERE hs.match_id IN (" . implode(',', array_fill(0, count($matches), '?')) . ")
");
$scoreSql->bind_param(str_repeat('i', count($matches)), ...$matches);
$scoreSql->execute();
$scoreResult = $scoreSql->get_result();

// Step 5: Organize and calculate net scores with 0.5 handicap strokes
$holes = []; // hole_number => [golfer_id => net_score]

while ($row = $scoreResult->fetch_assoc()) {
    $hole = intval($row['hole_number']);
    $golfer_id = $row['golfer_id'];
    $strokes = intval($row['strokes']);

    $handicap = isset($golfers[$golfer_id]) ? $golfers[$golfer_id]['playing_handicap'] : 0;
    $index = $holeMap[$hole];

    // Calculate handicap strokes: full 18 gets 1 per hole, >18 gets 2 on some
    $bonus = 0;
    if ($handicap >= $index) $bonus += 0.5;
    if ($handicap > 18 && $handicap - 18 >= $index) $bonus += 0.5;

    $net = $strokes - $bonus;

    if (!isset($holes[$hole])) $holes[$hole] = [];
    $holes[$hole][$golfer_id] = $net;



}



// Step 6: Find skins (lowest unique net score per hole)
$skins = [];


foreach ($holes as $holeNum => $scores) {


    if (count($scores) < $totalGolfers) {
        error_log("Skipping hole $holeNum: Not all golfers have scores");
        continue;
    }

    $counts = [];
    foreach ($scores as $netScore) {
        $key = (string)$netScore;
        $counts[$key] = ($counts[$key] ?? 0) + 1;
    }

    $minScore = min($scores);
    $winners = array_keys($scores, $minScore);



    if (count($winners) === 1) {
        $winnerId = $winners[0];

        if (isset($golfers[$winnerId])) {
            $skins[] = [
                'hole' => $holeNum,
                'golfer_id' => $winnerId,
                'golfer_name' => $golfers[$winnerId]['name'] ?? 'Unknown',
                'team' => $golfers[$winnerId]['team'] ?? 'Unknown',
                'team_color' => $golfers[$winnerId]['team_color'] ?? '#000000',
                'net_score' => $scores[$winnerId]
            ];
            
        } else {
            error_log("Missing golfer data for golfer_id: $winnerId");
        }
    } else {
        error_log("No unique winner for hole $holeNum");
    }
}

echo json_encode($skins);

