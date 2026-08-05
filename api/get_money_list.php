<?php
/**
 * get_money_list.php - what each player has won in a Ryder Cup tournament.
 *
 * Three sources of money, all driven by the figures on the Edit Tournament
 * payouts card:
 *
 *   matches   payout_per_player_per_match, per match won
 *   team      payout_per_player_team_win, for taking the tournament
 *   skins     that round's pot, split across the skins won in it
 *
 * TIES
 * Both tie rules reduce to the same arithmetic: a player earns their side's
 * POINTS multiplied by the per-player figure.
 *
 *   won        1.0 x payout  -> the full amount
 *   halved     0.5 x payout  -> half
 *   lost       0.0
 *
 * With even sides that is identical to "pot split across everyone involved" -
 * a halved 2v2 pays 2 x P across 4 players, which is P/2 each - but it also
 * behaves sensibly when sides are uneven, where splitting a pot would not.
 *
 * ONLY SETTLED MONEY COUNTS
 * Match money needs the match finalized. Team money needs every match in the
 * tournament finalized, because until then nobody has won the thing. Skins need
 * their round finalized, since the pot is divided by the skins won and a
 * part-played round would overpay the early ones. A tournament in progress
 * therefore shows money banked so far, not a projection.
 */

require_once '../cors_headers.php';
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, private, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");

require_once 'db_connect.php';
require_once 'auth_middleware.php';
require_once __DIR__ . '/skins.php';

$tournament_id = isset($_GET['tournament_id']) ? (int) $_GET['tournament_id'] : 0;
if (!$tournament_id) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing tournament_id']);
    exit;
}

// Tournament, scoped to the caller's org.
$stmt = $conn->prepare("
    SELECT tournament_id, name, format_id,
           buy_in, payout_per_player_per_match, payout_per_player_team_win
    FROM tournaments WHERE tournament_id = ? AND org_id = ?
");
$stmt->bind_param('ii', $tournament_id, $currentOrgId);
$stmt->execute();
$tournament = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$tournament) {
    http_response_code(404);
    echo json_encode(['error' => 'Tournament not found']);
    exit;
}

$perMatch = (float) ($tournament['payout_per_player_per_match'] ?? 0);
$perTeam  = (float) ($tournament['payout_per_player_team_win'] ?? 0);

// Everyone on the roster, so a player who has won nothing still appears rather
// than silently vanishing from the list.
$players = [];
$stmt = $conn->prepare("
    SELECT g.golfer_id, g.first_name, g.last_name,
           tm.team_id, tm.name AS team_name, tm.color_hex AS team_color
    FROM tournament_golfers tg
    JOIN golfers g   ON g.golfer_id = tg.golfer_id
    LEFT JOIN teams tm ON tm.team_id = tg.team_id
    WHERE tg.tournament_id = ?
    ORDER BY g.first_name, g.last_name
");
$stmt->bind_param('i', $tournament_id);
$stmt->execute();
$res = $stmt->get_result();
while ($row = $res->fetch_assoc()) {
    $players[(int) $row['golfer_id']] = [
        'golfer_id'      => (int) $row['golfer_id'],
        'name'           => trim($row['first_name'] . ' ' . ($row['last_name'] ?? '')),
        'first_name'     => $row['first_name'],
        'team_id'        => $row['team_id'] !== null ? (int) $row['team_id'] : null,
        'team_name'      => $row['team_name'],
        'team_color'     => $row['team_color'],
        'match_money'    => 0.0,
        'team_money'     => 0.0,
        'skins_money'    => 0.0,
        'matches_won'    => 0,
        'matches_halved' => 0,
        'skins_won'      => 0,
    ];
}
$stmt->close();

// ---------------------------------------------------------------------------
// Match money. Points come from match_results, which is the stored record for
// a finalized match - never recomputed here, so this agrees with every screen.
// ---------------------------------------------------------------------------
$teamPoints  = [];   // team_id => points across the tournament
$openMatches = 0;

$stmt = $conn->prepare("
    SELECT m.match_id, m.finalized
    FROM matches m
    JOIN rounds r      ON r.round_id = m.round_id
    JOIN tournaments t ON t.tournament_id = r.tournament_id
    WHERE r.tournament_id = ? AND t.org_id = ?
");
$stmt->bind_param('ii', $tournament_id, $currentOrgId);
$stmt->execute();
$res = $stmt->get_result();
$matchIds = [];
while ($row = $res->fetch_assoc()) {
    $matchIds[] = (int) $row['match_id'];
    if ((int) $row['finalized'] !== 1) $openMatches++;
}
$stmt->close();

foreach ($matchIds as $mid) {
    $stmt = $conn->prepare("SELECT finalized FROM matches WHERE match_id = ?");
    $stmt->bind_param('i', $mid);
    $stmt->execute();
    $fin = (int) ($stmt->get_result()->fetch_assoc()['finalized'] ?? 0);
    $stmt->close();
    if ($fin !== 1) continue;

    $stmt = $conn->prepare("SELECT team_id, points FROM match_results WHERE match_id = ?");
    $stmt->bind_param('i', $mid);
    $stmt->execute();
    $res = $stmt->get_result();
    $pointsByTeam = [];
    while ($row = $res->fetch_assoc()) {
        if ($row['team_id'] === null) continue;   // partnership row, no team money
        $pointsByTeam[(int) $row['team_id']] = (float) $row['points'];
    }
    $stmt->close();
    if (count($pointsByTeam) !== 2) continue;

    foreach ($pointsByTeam as $teamId => $pts) {
        $teamPoints[$teamId] = ($teamPoints[$teamId] ?? 0) + $pts;
    }

    // Pay every golfer in the match according to their side's points.
    $stmt = $conn->prepare("SELECT golfer_id FROM match_golfers WHERE match_id = ?");
    $stmt->bind_param('i', $mid);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($row = $res->fetch_assoc()) {
        $gid = (int) $row['golfer_id'];
        if (!isset($players[$gid])) continue;
        $teamId = $players[$gid]['team_id'];
        if ($teamId === null || !isset($pointsByTeam[$teamId])) continue;

        $pts = $pointsByTeam[$teamId];
        $players[$gid]['match_money'] += $perMatch * $pts;
        if ($pts >= 1.0)      $players[$gid]['matches_won']++;
        elseif ($pts > 0)     $players[$gid]['matches_halved']++;
    }
    $stmt->close();
}

// ---------------------------------------------------------------------------
// Team money. Only once every match is in - until then the team event is not
// decided and nobody has won it.
// ---------------------------------------------------------------------------
$tournamentComplete = (count($matchIds) > 0 && $openMatches === 0);

if ($tournamentComplete && count($teamPoints) === 2 && $perTeam > 0) {
    $vals = array_values($teamPoints);
    $ids  = array_keys($teamPoints);
    $share = [];
    if ($vals[0] > $vals[1])      { $share[$ids[0]] = 1.0; $share[$ids[1]] = 0.0; }
    elseif ($vals[1] > $vals[0])  { $share[$ids[0]] = 0.0; $share[$ids[1]] = 1.0; }
    else                          { $share[$ids[0]] = 0.5; $share[$ids[1]] = 0.5; }

    foreach ($players as $gid => $p) {
        if ($p['team_id'] !== null && isset($share[$p['team_id']])) {
            $players[$gid]['team_money'] = $perTeam * $share[$p['team_id']];
        }
    }
}

// ---------------------------------------------------------------------------
// Skins money, per finalized round, from the same calculation the skins table
// displays (api/skins.php).
// ---------------------------------------------------------------------------
$stmt = $conn->prepare("
    SELECT r.round_id,
           (SELECT COUNT(*) FROM matches m WHERE m.round_id = r.round_id) AS total_matches,
           (SELECT COUNT(*) FROM matches m WHERE m.round_id = r.round_id AND m.finalized = 0) AS open_matches
    FROM rounds r WHERE r.tournament_id = ?
");
$stmt->bind_param('i', $tournament_id);
$stmt->execute();
$res = $stmt->get_result();
$rounds = [];
while ($row = $res->fetch_assoc()) $rounds[] = $row;
$stmt->close();

foreach ($rounds as $r) {
    if ((int) $r['total_matches'] === 0 || (int) $r['open_matches'] > 0) continue;

    $sk = computeRoundSkins($conn, (int) $r['round_id'], $tournament_id, $currentOrgId);
    $pot   = (float) $sk['skins_total'];
    $count = count($sk['skins']);
    if ($pot <= 0 || $count === 0) continue;

    $perSkin = $pot / $count;
    foreach ($sk['skins'] as $skin) {
        $gid = (int) $skin['golfer_id'];
        if (!isset($players[$gid])) continue;
        $players[$gid]['skins_money'] += $perSkin;
        $players[$gid]['skins_won']++;
    }
}

// ---------------------------------------------------------------------------
// Total, rank, and output. Ranked by money; equal money shares a rank, the way
// a leaderboard ties.
// ---------------------------------------------------------------------------
$list = array_values($players);
foreach ($list as &$p) {
    $p['total'] = round($p['match_money'] + $p['team_money'] + $p['skins_money'], 2);
    $p['match_money'] = round($p['match_money'], 2);
    $p['team_money']  = round($p['team_money'], 2);
    $p['skins_money'] = round($p['skins_money'], 2);
}
unset($p);

usort($list, function ($a, $b) {
    if ($b['total'] != $a['total']) return $b['total'] <=> $a['total'];
    return strcmp($a['name'], $b['name']);
});

$rank = 0; $seen = 0; $prev = null;
foreach ($list as &$p) {
    $seen++;
    if ($prev === null || $p['total'] != $prev) { $rank = $seen; $prev = $p['total']; }
    $p['rank'] = $rank;
}
unset($p);

echo json_encode([
    'tournament_id'  => (int) $tournament['tournament_id'],
    'format_id'      => $tournament['format_id'] !== null ? (int) $tournament['format_id'] : null,
    'complete'       => $tournamentComplete,
    'open_matches'   => $openMatches,
    'payouts'        => [
        'buy_in'                      => $tournament['buy_in'] !== null ? (float) $tournament['buy_in'] : null,
        'payout_per_player_per_match' => $tournament['payout_per_player_per_match'] !== null ? $perMatch : null,
        'payout_per_player_team_win'  => $tournament['payout_per_player_team_win'] !== null ? $perTeam : null,
    ],
    'total_paid_out' => round(array_sum(array_column($list, 'total')), 2),
    'players'        => $list,
]);
