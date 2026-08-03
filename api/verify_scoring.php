<?php
/**
 * verify_scoring.php - READ-ONLY scoring audit.
 *
 * Recomputes every finalized match from raw hole scores and compares the
 * result against the points stored in match_results. Nothing is ever written.
 *
 * WHY: on 2026-05-20 the handicap rule changed (full playing handicaps ->
 * match-relative, lowest player in the match plays off 0). Completed
 * tournaments kept their correct stored results, but the app began re-scoring
 * them under the new rule, so three screens disagreed with each other and with
 * history. tournaments.handicap_mode now records which rule each tournament
 * was played under. This script proves that every stored result still
 * reproduces exactly under the mode it has been assigned.
 *
 * Run it after applying migration 010 to production, and before every release
 * that touches scoring. A clean run is the guarantee that a code change has
 * not silently rewritten a finished tournament.
 *
 * USAGE
 *   CLI      php api/verify_scoring.php            (all orgs; exit 1 on drift)
 *   Browser  /api/verify_scoring.php               (logged-in admin; own org)
 *
 * For each tournament that has stored results the report also shows which
 * rule(s) actually fit the data, so a mis-tagged tournament is caught rather
 * than assumed.
 */

$isCli = (php_sapi_name() === 'cli');

if ($isCli) {
    require_once __DIR__ . '/db_connect.php';
    $scopeOrgId = null;                 // audit everything
} else {
    require_once __DIR__ . '/../cors_headers.php';
    header('Content-Type: text/plain; charset=utf-8');
    require_once __DIR__ . '/db_connect.php';
    require_once __DIR__ . '/auth_middleware.php';
    requireAdmin();
    $scopeOrgId = $currentOrgId;        // never expose another org's data
}

const RULE_FULL  = 'full';
const RULE_MATCH = 'match_relative';

/** Playing handicap. Course rating is relative to the tee's par, not a fixed 72. */
function vs_playing_handicap($index, $slope, $rating, $par, $pct) {
    if ($pct < 0) return (float) $index;            // manual-handicap sentinel
    if (!$slope || !$rating) return 0.0;
    $courseHandicap = ($index * ($slope / 113)) + ($rating - $par);
    return round($courseHandicap * $pct / 100, 1);
}

/** Strokes received per hole. Mirrors buildStrokeMapForGolfer() in script.js. */
function vs_stroke_map($handicap, array $holes) {
    $map = [];
    foreach ($holes as $holeNumber => $strokeIndex) {
        $strokes = 0;
        if ($handicap >= 0) {
            if ($handicap >= $strokeIndex)                 $strokes = 1;
            if ($handicap > 18 && $handicap - 18 >= $strokeIndex) $strokes = 2;
        } else {
            if ($strokeIndex > 18 - abs($handicap))        $strokes = -1;
        }
        $map[$holeNumber] = $strokes;
    }
    return $map;
}

/**
 * Best-ball match play differential for one match under one rule.
 * Positive favours $teamIds[0]. Stops early once the match is mathematically
 * decided, the same way the scorecard does.
 */
function vs_differential(array $golfers, array $scores, array $holes, array $teamIds, $rule) {
    $adjust = 0.0;
    if ($rule === RULE_MATCH && $golfers) {
        $adjust = min(array_column($golfers, 'playing'));
    }
    $maps = [];
    foreach ($golfers as $id => $g) {
        $maps[$id] = vs_stroke_map($g['playing'] - $adjust, $holes);
    }

    $differential = 0;
    $holesPlayed  = 0;
    $endedAt      = null;

    for ($hole = 1; $hole <= 18; $hole++) {
        if (empty($scores[$hole])) continue;
        $best = [];
        foreach ($scores[$hole] as $golferId => $strokes) {
            if (!isset($golfers[$golferId])) continue;
            $teamId = $golfers[$golferId]['team_id'];
            $net    = $strokes - ($maps[$golferId][$hole] ?? 0);
            if (!isset($best[$teamId]) || $net < $best[$teamId]) $best[$teamId] = $net;
        }
        if (count($best) !== 2) continue;

        $holesPlayed++;
        if     ($best[$teamIds[0]] < $best[$teamIds[1]]) $differential++;
        elseif ($best[$teamIds[1]] < $best[$teamIds[0]]) $differential--;

        if (abs($differential) > 18 - $hole) { $endedAt = $hole; break; }
    }

    return ['differential' => $differential, 'holes_played' => $holesPlayed, 'ended_at' => $endedAt];
}

/** Match play points from a differential. */
function vs_points($differential, array $teamIds) {
    if ($differential > 0) return [$teamIds[0] => 1.0, $teamIds[1] => 0.0];
    if ($differential < 0) return [$teamIds[0] => 0.0, $teamIds[1] => 1.0];
    return [$teamIds[0] => 0.5, $teamIds[1] => 0.5];
}

function vs_points_match(array $a, array $b) {
    foreach ($a as $teamId => $points) {
        if (!isset($b[$teamId]) || abs($b[$teamId] - $points) > 0.01) return false;
    }
    return count($a) === count($b);
}

// ---------------------------------------------------------------------------

$sql = "
    SELECT m.match_id, m.finalized,
           r.round_id, r.round_name, r.course_id,
           t.tournament_id, t.name AS tournament_name, t.handicap_pct, t.handicap_mode,
           ct.slope, ct.rating, ct.par
    FROM matches m
    JOIN rounds      r  ON r.round_id      = m.round_id
    JOIN tournaments t  ON t.tournament_id = r.tournament_id
    LEFT JOIN course_tees ct ON ct.tee_id  = r.tee_id
    WHERE m.finalized = 1
";
if ($scopeOrgId !== null) $sql .= " AND t.org_id = " . (int) $scopeOrgId;
$sql .= " ORDER BY t.start_date, r.round_id, m.match_id";

$matches = [];
$res = $conn->query($sql);
while ($row = $res->fetch_assoc()) $matches[] = $row;

$audited = 0; $drift = 0; $skipped = 0;
$byTournament = [];   // name => [drift, audited, mode, fits[]]
$lines = [];

foreach ($matches as $m) {
    $matchId      = (int) $m['match_id'];
    $tournamentId = (int) $m['tournament_id'];
    $mode         = $m['handicap_mode'] ?: RULE_MATCH;

    // Holes for this round's own course.
    $holes = [];
    $hr = $conn->query("SELECT hole_number, handicap_index FROM holes
                        WHERE course_id = " . (int) $m['course_id']);
    while ($h = $hr->fetch_assoc()) $holes[(int) $h['hole_number']] = (int) $h['handicap_index'];
    if (count($holes) !== 18) { $skipped++; continue; }

    // Golfers, using the handicap and percentage snapshotted at assignment.
    $golfers = [];
    $gr = $conn->query("
        SELECT mg.golfer_id, tg.team_id,
               COALESCE(tg.handicap_at_assignment, g.handicap)          AS hcp,
               COALESCE(tg.handicap_pct_at_assignment, {$m['handicap_pct']}) AS pct
        FROM match_golfers mg
        JOIN golfers g ON g.golfer_id = mg.golfer_id
        JOIN tournament_golfers tg
          ON tg.golfer_id = mg.golfer_id AND tg.tournament_id = {$tournamentId}
        WHERE mg.match_id = {$matchId}");
    while ($g = $gr->fetch_assoc()) {
        if ($g['team_id'] === null) continue;
        $golfers[(int) $g['golfer_id']] = [
            'team_id' => (int) $g['team_id'],
            'playing' => vs_playing_handicap(
                (float) $g['hcp'], (float) $m['slope'], (float) $m['rating'],
                (float) ($m['par'] ?: 72), (float) $g['pct']
            ),
        ];
    }
    $teamIds = array_values(array_unique(array_column($golfers, 'team_id')));
    if (count($teamIds) !== 2) { $skipped++; continue; }   // not a two-team match

    // Stored result. Formats that never write points have nothing to verify.
    $stored = [];
    $sr = $conn->query("SELECT team_id, points FROM match_results WHERE match_id = {$matchId}");
    while ($s = $sr->fetch_assoc()) $stored[(int) $s['team_id']] = (float) $s['points'];
    if (count($stored) !== 2) { $skipped++; continue; }

    $scores = [];
    $cr = $conn->query("SELECT golfer_id, hole_number, strokes FROM hole_scores
                        WHERE match_id = {$matchId}");
    while ($c = $cr->fetch_assoc()) {
        $scores[(int) $c['hole_number']][(int) $c['golfer_id']] = (int) $c['strokes'];
    }
    if (!$scores) { $skipped++; continue; }

    // Score under the assigned mode, and under both rules for diagnostics.
    $fits = [];
    foreach ([RULE_FULL, RULE_MATCH] as $rule) {
        $d = vs_differential($golfers, $scores, $holes, $teamIds, $rule);
        if (vs_points_match(vs_points($d['differential'], $teamIds), $stored)) $fits[] = $rule;
    }

    $result   = vs_differential($golfers, $scores, $holes, $teamIds, $mode);
    $computed = vs_points($result['differential'], $teamIds);
    $ok       = vs_points_match($computed, $stored);

    $audited++;
    $key = $m['tournament_name'];
    if (!isset($byTournament[$key])) $byTournament[$key] = [0, 0, $mode, []];
    $byTournament[$key][1]++;
    $byTournament[$key][3] = array_unique(array_merge($byTournament[$key][3], $fits));

    if (!$ok) {
        $drift++;
        $byTournament[$key][0]++;
        $fmt = function (array $p) { $o = []; foreach ($p as $t => $v) $o[] = "team{$t}={$v}"; return implode(' ', $o); };
        $lines[] = sprintf(
            "  DRIFT  match %-6d %-34s mode=%-14s stored[%s]  computed[%s]  rules that fit: %s",
            $matchId, substr($m['round_name'], 0, 34), $mode,
            $fmt($stored), $fmt($computed), $fits ? implode(',', $fits) : 'NONE'
        );
    }
}

$out = [];
$out[] = '';
$out[] = 'Scoring audit - recomputed every finalized match against its stored result';
$out[] = str_repeat('=', 78);
if ($lines) { $out = array_merge($out, $lines); $out[] = ''; }

foreach ($byTournament as $name => [$bad, $total, $mode, $fits]) {
    sort($fits);
    $fitNote = !$fits                        ? '  <- NO rule reproduces this data'
             : (in_array($mode, $fits, true) ? ''
             : '  <- assigned mode does not fit; data matches: ' . implode(',', $fits));
    $out[] = sprintf('  %-32s %-14s %d/%d verified%s',
        substr($name, 0, 32), $mode, $total - $bad, $total, $fitNote);
}

$out[] = str_repeat('=', 78);
$out[] = sprintf('  audited %d   drift %d   skipped %d (no stored points / not head-to-head)',
    $audited, $drift, $skipped);
$out[] = $drift === 0
    ? '  PASS - every stored result reproduces under its tournament\'s rule.'
    : '  FAIL - stored results no longer reproduce. Do NOT ship scoring changes.';
$out[] = '';

echo implode(PHP_EOL, $out) . PHP_EOL;

if ($isCli) exit($drift === 0 ? 0 : 1);
