<?php
// live_tournament.php — PUBLIC read-only feed for the live spectator page.
// No session/auth: access is granted solely by a tournament's live share code
// (enabled per tournament by an admin via live_share.php). Every query is
// keyed off the tournament resolved from the code, so no other org's or
// tournament's data is reachable. Exposes first names only — no last names,
// emails, or GHIN data.
require_once 'db_connect.php';
ini_set('display_errors', '0');
ini_set('serialize_precision', '-1');
header('Content-Type: application/json');
require_once '../cors_headers.php';

$code = strtoupper(trim($_GET['code'] ?? ''));
if ($code === '' || strlen($code) > 8) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing code']);
    exit;
}

$stmt = $conn->prepare("SELECT t.tournament_id, t.org_id, t.name, t.start_date, t.end_date,
                               t.handicap_pct, t.format_id, f.name AS format_name
                        FROM tournaments t
                        LEFT JOIN formats f ON t.format_id = f.format_id
                        WHERE t.live_share_code = ? AND t.live_share_enabled = 1");
$stmt->bind_param('s', $code);
$stmt->execute();
$tournament = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$tournament) {
    usleep(300000); // damp brute-force guessing; invalid and disabled look identical
    http_response_code(404);
    echo json_encode(['error' => 'Invalid code']);
    exit;
}

$tournament_id = (int)$tournament['tournament_id'];
$default_pct = (float)$tournament['handicap_pct'];

// ── Teams with total points and golfer first names ──────────────────────────
$teams = [];
$stmt = $conn->prepare("
    SELECT t.team_id, t.name AS team_name, t.color_hex,
           COALESCE(SUM(mr.points), 0) AS total_points
    FROM teams t
    LEFT JOIN match_results mr ON t.team_id = mr.team_id
    WHERE t.team_id IN (
        SELECT DISTINCT tg.team_id FROM tournament_golfers tg WHERE tg.tournament_id = ?
    )
    GROUP BY t.team_id, t.name, t.color_hex
    ORDER BY total_points DESC, team_name");
$stmt->bind_param('i', $tournament_id);
$stmt->execute();
$res = $stmt->get_result();
while ($row = $res->fetch_assoc()) {
    $teams[$row['team_id']] = [
        'team_id' => (int)$row['team_id'],
        'name' => $row['team_name'],
        'color_hex' => $row['color_hex'],
        'total_points' => (float)$row['total_points'],
        'golfers' => [],
    ];
}
$stmt->close();

$stmt = $conn->prepare("
    SELECT tg.team_id, g.golfer_id, g.first_name
    FROM tournament_golfers tg
    JOIN golfers g ON tg.golfer_id = g.golfer_id
    WHERE tg.tournament_id = ?
    ORDER BY g.first_name");
$stmt->bind_param('i', $tournament_id);
$stmt->execute();
$res = $stmt->get_result();
while ($row = $res->fetch_assoc()) {
    if (isset($teams[$row['team_id']])) {
        $teams[$row['team_id']]['golfers'][] = [
            'golfer_id' => (int)$row['golfer_id'],
            'first_name' => $row['first_name'],
        ];
    }
}
$stmt->close();

// ── Rounds tree: rounds → tee_times → matches (golfers, results, scores) ────
$rounds = [];
$stmt = $conn->prepare("
    SELECT r.round_id, r.round_name, r.round_date, r.course_id,
           c.course_name, ct.tee_name, ct.slope, ct.rating
    FROM rounds r
    LEFT JOIN courses c ON r.course_id = c.course_id
    LEFT JOIN course_tees ct ON r.tee_id = ct.tee_id
    WHERE r.tournament_id = ?
    ORDER BY r.round_date ASC");
$stmt->bind_param('i', $tournament_id);
$stmt->execute();
$res = $stmt->get_result();
while ($row = $res->fetch_assoc()) {
    $rounds[] = [
        'round_id' => (int)$row['round_id'],
        'round_name' => $row['round_name'],
        'round_date' => $row['round_date'],
        'course_id' => $row['course_id'] !== null ? (int)$row['course_id'] : null,
        'course_name' => $row['course_name'],
        'tee_name' => $row['tee_name'],
        'slope' => $row['slope'] !== null ? (float)$row['slope'] : null,
        'rating' => $row['rating'] !== null ? (float)$row['rating'] : null,
        'holes' => [],
        'tee_times' => [],
    ];
}
$stmt->close();

foreach ($rounds as &$round) {
    // Hole pars/indexes so the client can compute match status and stroke dots
    if ($round['course_id'] !== null) {
        $stmt = $conn->prepare("SELECT hole_number, par, handicap_index
                                FROM holes WHERE course_id = ? ORDER BY hole_number");
        $stmt->bind_param('i', $round['course_id']);
        $stmt->execute();
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $round['holes'][] = [
                'hole_number' => (int)$row['hole_number'],
                'par' => (int)$row['par'],
                'handicap_index' => (int)$row['handicap_index'],
            ];
        }
        $stmt->close();
    }
    unset($round['course_id']);

    $stmt = $conn->prepare("SELECT tee_time_id, time FROM tee_times WHERE round_id = ? ORDER BY time ASC");
    $stmt->bind_param('i', $round['round_id']);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($row = $res->fetch_assoc()) {
        $round['tee_times'][] = [
            'tee_time_id' => (int)$row['tee_time_id'],
            'time' => $row['time'],
            'matches' => [],
        ];
    }
    $stmt->close();

    foreach ($round['tee_times'] as &$tee_time) {
        $stmt = $conn->prepare("SELECT match_id FROM matches WHERE tee_time_id = ?");
        $stmt->bind_param('i', $tee_time['tee_time_id']);
        $stmt->execute();
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $tee_time['matches'][] = ['match_id' => (int)$row['match_id']];
        }
        $stmt->close();

        foreach ($tee_time['matches'] as &$match) {
            $stmt = $conn->prepare("
                SELECT g.golfer_id, g.first_name,
                       t.name AS team_name, t.color_hex AS team_color, tg.team_id,
                       COALESCE(tg.handicap_at_assignment, g.handicap) AS handicap,
                       COALESCE(tg.handicap_pct_at_assignment, ?) AS handicap_pct,
                       mg.player_order
                FROM match_golfers mg
                JOIN golfers g ON mg.golfer_id = g.golfer_id
                JOIN tournament_golfers tg ON g.golfer_id = tg.golfer_id AND tg.tournament_id = ?
                LEFT JOIN teams t ON tg.team_id = t.team_id
                WHERE mg.match_id = ?
                ORDER BY t.name ASC, mg.player_order ASC");
            $stmt->bind_param('dii', $default_pct, $tournament_id, $match['match_id']);
            $stmt->execute();
            $res = $stmt->get_result();
            $match['golfers'] = [];
            while ($row = $res->fetch_assoc()) {
                $match['golfers'][] = [
                    'golfer_id' => (int)$row['golfer_id'],
                    'first_name' => $row['first_name'],
                    'team_id' => $row['team_id'] !== null ? (int)$row['team_id'] : null,
                    'team_name' => $row['team_name'],
                    'team_color' => $row['team_color'],
                    'handicap' => (float)$row['handicap'],
                    'handicap_pct' => (float)$row['handicap_pct'],
                    'player_order' => $row['player_order'] !== null ? (int)$row['player_order'] : null,
                ];
            }
            $stmt->close();

            $stmt = $conn->prepare("SELECT team_id, points FROM match_results WHERE match_id = ?");
            $stmt->bind_param('i', $match['match_id']);
            $stmt->execute();
            $res = $stmt->get_result();
            $match['results'] = [];
            while ($row = $res->fetch_assoc()) {
                $match['results'][] = [
                    'team_id' => (int)$row['team_id'],
                    'points' => (float)$row['points'],
                ];
            }
            $stmt->close();

            $stmt = $conn->prepare("SELECT golfer_id, hole_number, strokes
                                    FROM hole_scores WHERE match_id = ? ORDER BY hole_number");
            $stmt->bind_param('i', $match['match_id']);
            $stmt->execute();
            $res = $stmt->get_result();
            $match['hole_scores'] = [];
            while ($row = $res->fetch_assoc()) {
                $match['hole_scores'][] = [
                    'golfer_id' => (int)$row['golfer_id'],
                    'hole_number' => (int)$row['hole_number'],
                    'strokes' => (int)$row['strokes'],
                ];
            }
            $stmt->close();
        }
        unset($match);
    }
    unset($tee_time);
}
unset($round);

// ── Gross leaderboard (same math as get_gross_leaderboard_all.php) ──────────
$gross = [];
$stmt = $conn->prepare("
    SELECT g.golfer_id, g.first_name,
           t.name AS team_name, t.color_hex AS team_color,
           SUM(s.strokes) AS strokes, SUM(h.par) AS par,
           COUNT(s.hole_number) AS holes_played
    FROM match_golfers mg
    JOIN golfers g ON mg.golfer_id = g.golfer_id
    JOIN matches m ON mg.match_id = m.match_id
    JOIN rounds r ON m.round_id = r.round_id
    JOIN tournament_golfers tg ON g.golfer_id = tg.golfer_id AND tg.tournament_id = ?
    LEFT JOIN teams t ON tg.team_id = t.team_id
    LEFT JOIN hole_scores s ON mg.match_id = s.match_id AND mg.golfer_id = s.golfer_id
    LEFT JOIN holes h ON r.course_id = h.course_id AND s.hole_number = h.hole_number
    WHERE r.tournament_id = ?
    GROUP BY g.golfer_id, g.first_name, t.name, t.color_hex");
$stmt->bind_param('ii', $tournament_id, $tournament_id);
$stmt->execute();
$res = $stmt->get_result();
while ($row = $res->fetch_assoc()) {
    $gross[] = [
        'golfer_id' => (int)$row['golfer_id'],
        'name' => $row['first_name'],
        'team_name' => $row['team_name'],
        'team_color' => $row['team_color'],
        'strokes' => intval($row['strokes']),
        'par' => intval($row['par']),
        'holes_played' => intval($row['holes_played']),
    ];
}
$stmt->close();

// ── Net leaderboard (same math as get_net_leaderboard_all.php) ──────────────
$net = [];
$stmt = $conn->prepare("
    SELECT g.golfer_id, g.first_name,
           t.name AS team_name, t.color_hex AS team_color,
           COALESCE(tg.handicap_at_assignment, g.handicap) AS handicap,
           COALESCE(tg.handicap_pct_at_assignment, ?) AS handicap_pct_snapshot,
           s.hole_number, s.strokes, h.par, h.handicap_index,
           ct.slope, ct.rating
    FROM match_golfers mg
    JOIN golfers g ON mg.golfer_id = g.golfer_id
    JOIN matches m ON mg.match_id = m.match_id
    JOIN rounds r ON m.round_id = r.round_id
    JOIN course_tees ct ON r.tee_id = ct.tee_id
    JOIN tournament_golfers tg ON g.golfer_id = tg.golfer_id AND tg.tournament_id = ?
    LEFT JOIN teams t ON tg.team_id = t.team_id
    LEFT JOIN hole_scores s ON mg.match_id = s.match_id AND mg.golfer_id = s.golfer_id
    LEFT JOIN holes h ON r.course_id = h.course_id AND s.hole_number = h.hole_number
    WHERE r.tournament_id = ?");
$stmt->bind_param('dii', $default_pct, $tournament_id, $tournament_id);
$stmt->execute();
$res = $stmt->get_result();
while ($row = $res->fetch_assoc()) {
    $id = $row['golfer_id'];
    if (!isset($net[$id])) {
        $net[$id] = [
            'golfer_id' => (int)$id,
            'name' => $row['first_name'],
            'team_name' => $row['team_name'],
            'team_color' => $row['team_color'],
            'net_strokes' => 0,
            'par' => 0,
            'holes_played' => 0,
        ];
    }

    if ($row['strokes'] !== null && $row['par'] !== null && $row['slope'] !== null && $row['rating'] !== null) {
        $strokes = intval($row['strokes']);
        $par = intval($row['par']);
        $hcp = floatval($row['handicap']);
        $idx = intval($row['handicap_index']);
        $slope = floatval($row['slope']);
        $rating = floatval($row['rating']);
        $handicap_pct = floatval($row['handicap_pct_snapshot']);

        $playing_handicap = ($hcp * ($slope / 113) + ($rating - 72)) * ($handicap_pct / 100);
        $playing_hcp_rounded = round($playing_handicap);

        if ($playing_hcp_rounded >= 0) {
            $baseStrokes = intdiv($playing_hcp_rounded, 18);
            $extraStrokeHoles = $playing_hcp_rounded % 18;
            $handicapStrokes = $baseStrokes + ($idx <= $extraStrokeHoles ? 1 : 0);
        } else {
            $absHcp = abs($playing_hcp_rounded);
            $baseStrokes = intdiv($absHcp, 18);
            $extraStrokeHoles = $absHcp % 18;
            $penaltyStrokes = $baseStrokes + ($idx > (18 - $extraStrokeHoles) ? 1 : 0);
            $handicapStrokes = -$penaltyStrokes;
        }

        $net[$id]['net_strokes'] += $strokes - $handicapStrokes;
        $net[$id]['par'] += $par;
        $net[$id]['holes_played']++;
    }
}
$stmt->close();

echo json_encode([
    'tournament' => [
        'name' => $tournament['name'],
        'start_date' => $tournament['start_date'],
        'end_date' => $tournament['end_date'],
        'format_id' => (int)$tournament['format_id'],
        'format_name' => $tournament['format_name'],
        'handicap_pct' => $default_pct,
    ],
    'teams' => array_values($teams),
    'rounds' => $rounds,
    'gross_leaderboard' => $gross,
    'net_leaderboard' => array_values($net),
    'generated_at' => gmdate('c'),
]);
