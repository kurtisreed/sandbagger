<?php
/**
 * verify_scoring.php - READ-ONLY scoring audit.
 *
 * Recomputes every finalized match from raw hole scores and compares the result
 * against the points stored in match_results. Nothing is ever written.
 *
 * It scores through api/match_play.php - the same library the app itself uses -
 * rather than reimplementing the rules. That is deliberate: an audit that
 * carries its own copy of the logic only proves the copy agrees with the data,
 * not that the shipping code does.
 *
 * WHY: on 2026-05-20 the handicap rule changed (full playing handicaps ->
 * match-relative, lowest player in the match plays off 0). Completed
 * tournaments kept their correct stored results, but the app began re-scoring
 * them under the new rule, so three screens disagreed with each other and with
 * history. The rule is now recorded per tournament and frozen onto each match
 * at finalize. This script proves every stored result still reproduces exactly.
 *
 * Run it after applying migrations 010/011, and before every release that
 * touches scoring. A clean run is the guarantee that a code change has not
 * silently rewritten a finished tournament.
 *
 * USAGE
 *   CLI      php api/verify_scoring.php     (all orgs; exit 1 on drift)
 *   Browser  /api/verify_scoring.php        (logged-in admin; own org only)
 *
 * For each tournament the report also shows which rule(s) actually fit the
 * stored data, so a mis-tagged tournament is caught rather than assumed.
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

require_once __DIR__ . '/match_play.php';

// ---------------------------------------------------------------------------

$sql = "
    SELECT m.match_id, t.name AS tournament_name, r.round_name,
           COALESCE(m.handicap_mode_at_finalize, t.handicap_mode) AS handicap_mode
    FROM matches m
    JOIN rounds      r ON r.round_id      = m.round_id
    JOIN tournaments t ON t.tournament_id = r.tournament_id
    WHERE m.finalized = 1
";
if ($scopeOrgId !== null) $sql .= " AND t.org_id = " . (int) $scopeOrgId;
$sql .= " ORDER BY t.start_date, r.round_id, m.match_id";

$rows = [];
$res = $conn->query($sql);
while ($row = $res->fetch_assoc()) $rows[] = $row;

$audited = 0; $drift = 0; $skipped = 0;
$byTournament = [];
$lines = [];

foreach ($rows as $row) {
    $matchId = (int) $row['match_id'];

    // Load once, then score under each rule by overriding the mode on the
    // context. Same loader, same maths, same early-exit as the app.
    $ctx = mp_load_match($conn, $matchId, $scopeOrgId);
    if (!$ctx || count($ctx['holes']) !== 18 || count($ctx['golfers']) < 2) { $skipped++; continue; }

    // Formats that never write points (Guys Trip, quick rounds) have nothing
    // to verify. Their protection is the mode flag at display time.
    if (count($ctx['stored_points']) !== 2) { $skipped++; continue; }
    if (empty($ctx['scores']))              { $skipped++; continue; }

    $stored = $ctx['stored_points'];

    // Which rule(s) actually reproduce the stored result?
    $fits = [];
    foreach ([MP_RULE_FULL, MP_RULE_MATCH] as $rule) {
        $probe = $ctx;
        $probe['handicap_mode'] = $rule;
        $r = mp_compute($probe);
        if (!empty($r['valid']) && mp_points_match($r['points'], $stored)) $fits[] = $rule;
    }

    $result = mp_compute($ctx);
    if (empty($result['valid'])) { $skipped++; continue; }

    $mode = $ctx['handicap_mode'];
    $ok   = mp_points_match($result['points'], $stored);

    $audited++;
    $key = $row['tournament_name'];
    if (!isset($byTournament[$key])) $byTournament[$key] = [0, 0, $mode, []];
    $byTournament[$key][1]++;
    $byTournament[$key][3] = array_unique(array_merge($byTournament[$key][3], $fits));

    if (!$ok) {
        $drift++;
        $byTournament[$key][0]++;
        $fmt = function (array $p) {
            $o = []; foreach ($p as $t => $v) $o[] = "team{$t}={$v}"; return implode(' ', $o);
        };
        $lines[] = sprintf(
            "  DRIFT  match %-6d %-32s mode=%-14s stored[%s]  computed[%s]  rules that fit: %s",
            $matchId, substr($row['round_name'], 0, 32), $mode,
            $fmt($stored), $fmt($result['points']), $fits ? implode(',', $fits) : 'NONE'
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
    $note = !$fits                          ? '  <- NO rule reproduces this data'
          : (in_array($mode, $fits, true)   ? ''
          : '  <- assigned mode does not fit; data matches: ' . implode(',', $fits));
    $out[] = sprintf('  %-32s %-14s %d/%d verified%s',
        substr($name, 0, 32), $mode, $total - $bad, $total, $note);
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
