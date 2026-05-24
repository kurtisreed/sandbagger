<?php
header('Content-Type: application/json');
require_once '../cors_headers.php';
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");

require_once 'db_connect.php';
require_once 'auth_middleware.php';

// Accept GET parameters with fallback to session
$round_id = $_GET['round_id'] ?? $_SESSION['round_id'] ?? null;
$tournament_id = $_GET['tournament_id'] ?? $_SESSION['tournament_id'] ?? null;

if (!$round_id) {
    echo json_encode(['error' => 'Missing round ID']);
    exit;
}

if (!$tournament_id) {
    echo json_encode(['error' => 'Missing tournament ID']);
    exit;
}

// Step 1: Get all matches in this round (scoped by org)
$matchSql = $conn->prepare("
    SELECT m.match_id, r.course_id
    FROM matches m
    JOIN rounds r ON m.round_id = r.round_id
    JOIN tournaments t ON r.tournament_id = t.tournament_id
    WHERE m.round_id = ? AND t.org_id = ?
");
$matchSql->bind_param("ii", $round_id, $currentOrgId);
$matchSql->execute();
$matchResult = $matchSql->get_result();

$matches = [];
$course_id = null;

while ($row = $matchResult->fetch_assoc()) {
    $matches[] = $row['match_id'];
    $course_id = $row['course_id'];
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
    LEFT JOIN teams t ON tg.team_id = t.team_id
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
        'team' => $row['team_name'],
        'team_color' => $row['team_color'],
        'match_id' => $row['match_id']
    ];
}

$totalGolfers = count(array_unique(array_keys($golfers)));

// Step 2.5: Get tee_id and skins_total for this round, then get slope/rating from course_tees
$teeSql = $conn->prepare("SELECT tee_id, skins_total FROM rounds WHERE round_id = ?");
$teeSql->bind_param("i", $round_id);
$teeSql->execute();
$teeResult = $teeSql->get_result();
$teeRow = $teeResult->fetch_assoc();
$tee_id = $teeRow ? $teeRow['tee_id'] : null;
$skins_total = $teeRow ? $teeRow['skins_total'] : 450;

if (!$tee_id) {
    echo json_encode(['error' => 'No tee_id found for this round']);
    exit;
}

$courseTeeSql = $conn->prepare("SELECT slope, rating FROM course_tees WHERE tee_id = ?");
$courseTeeSql->bind_param("i", $tee_id);
$courseTeeSql->execute();
$courseTeeResult = $courseTeeSql->get_result();
$courseTeeRow = $courseTeeResult->fetch_assoc();
$slope = floatval($courseTeeRow['slope']);
$rating = floatval($courseTeeRow['rating']);

$tourSql = $conn->prepare("SELECT handicap_pct FROM tournaments WHERE tournament_id = ? AND org_id = ?");
$tourSql->bind_param("ii", $tournament_id, $currentOrgId);
$tourSql->execute();
$tourResult = $tourSql->get_result();
$tourRow = $tourResult->fetch_assoc();
$handicap_pct = floatval($tourRow['handicap_pct']);

// Step 2.6: Calculate playing handicap for each golfer
foreach ($golfers as $gid => &$g) {
    $hcp = $g['handicap'];
    $playing_handicap = ($hcp * ($slope / 113) + ($rating - 72)) * ($handicap_pct / 100);
    $g['playing_handicap'] = round($playing_handicap, 1);
}
unset($g);

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
$holes = [];

while ($row = $scoreResult->fetch_assoc()) {
    $hole = intval($row['hole_number']);
    $golfer_id = $row['golfer_id'];
    $strokes = intval($row['strokes']);

    $handicap = isset($golfers[$golfer_id]) ? $golfers[$golfer_id]['playing_handicap'] : 0;
    $index = $holeMap[$hole];

    $bonus = 0;
    if ($handicap >= 0) {
      if ($handicap >= $index) $bonus += 0.5;
      if ($handicap > 18 && $handicap - 18 >= $index) $bonus += 0.5;
    } else {
      $absHcp = abs($handicap);
      if ($index > 18 - $absHcp) $bonus -= 0.5;
    }

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

// Return both skins data and skins_total
echo json_encode([
    'skins' => $skins,
    'skins_total' => $skins_total
]);
