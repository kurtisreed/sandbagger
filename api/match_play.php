<?php
/**
 * match_play.php - the single definition of "who won this best-ball match".
 *
 * Include this; do not request it. It is a library, not an endpoint.
 *
 * WHY IT EXISTS
 * -------------
 * That one question used to be answered by five separate implementations:
 *
 *   check_and_finalize_match.php  PHP, gross scores, no handicaps at all
 *   calculateMatchPoints()        JS, net, no early exit - WROTE match_results
 *   calculateMatchPlayResult()    JS, net, early exit    - scorecard + modal
 *   computeTeamMatchStatus()      JS, net, but LIVE handicaps - Round tab
 *   live.js                       JS, net, snapshot handicaps - spectator page
 *
 * They disagreed on the two things that decide a match - gross vs net, and
 * live vs snapshot handicaps - so the Tournament tab, the Round tab and the
 * scorecard could each report a different winner for the same match. This file
 * replaces all of them.
 *
 * WHAT IT GUARANTEES
 * ------------------
 * Every input is read from the match's own row rather than from ambient state:
 *
 *   handicap   COALESCE(tg.handicap_at_assignment, g.handicap)
 *   percentage COALESCE(tg.handicap_pct_at_assignment, t.handicap_pct)
 *   rule       COALESCE(m.handicap_mode_at_finalize, t.handicap_mode)
 *   slope/rating/par   the round's own tee
 *   stroke indexes     the round's own course
 *
 * The JS equivalents took holes, slope, rating and percentage from mutable
 * globals that whichever screen loaded last happened to leave behind, so the
 * Round tab could score a round using a different course's stroke indexes.
 * Nothing here reads a global.
 *
 * THE TWO RULES
 * -------------
 *   'full'           every golfer plays off their full playing handicap
 *                    (in force before 2026-05-20)
 *   'match_relative' the lowest handicap in the match plays off 0 and everyone
 *                    else is reduced by the same amount (from 2026-05-20)
 *
 * Both live here permanently. A finished match is replayed under the rule it
 * was actually played under, never under whatever rule is current - that is
 * what keeps Big Cedar Lodge 2025 reading 7.5-7.5 forever.
 */

if (!defined('MP_RULE_FULL')) {
    define('MP_RULE_FULL',  'full');
    define('MP_RULE_MATCH', 'match_relative');
}

/**
 * Playing handicap for one golfer.
 *
 * Course rating is measured against the tee's par, not a hardcoded 72 - three
 * of the courses in play (Ozarks National, Buffalo Ridge, TPC Stadium) are par
 * 71. A negative percentage is the manual-handicap sentinel: the number entered
 * is used verbatim, with no slope/rating conversion and no scaling.
 */
function mp_playing_handicap($index, $slope, $rating, $par, $pct) {
    if ($pct < 0) return (float) $index;
    if (!$slope || !$rating) return 0.0;
    $courseHandicap = ($index * ($slope / 113)) + ($rating - ($par ?: 72));
    return round($courseHandicap * $pct / 100, 1);
}

/**
 * Strokes received on each hole. Mirrors buildStrokeMapForGolfer() in script.js.
 * A plus handicapper (negative) pays strokes back on the easiest holes.
 *
 * $holes is [hole_number => handicap_index]. The handicap is rounded to one
 * decimal before comparing: subtracting one playing handicap from another
 * yields values like 4.000000000000001, and a bare >= against an integer
 * stroke index would hand out a stroke on a floating-point artifact.
 */
function mp_stroke_map($handicap, array $holes) {
    $handicap = round($handicap, 1);
    $map = [];
    foreach ($holes as $holeNumber => $strokeIndex) {
        $strokes = 0;
        if ($handicap >= 0) {
            if ($handicap >= $strokeIndex)                        $strokes = 1;
            if ($handicap > 18 && $handicap - 18 >= $strokeIndex)  $strokes = 2;
        } else {
            if ($strokeIndex > 18 - abs($handicap))                $strokes = -1;
        }
        $map[$holeNumber] = $strokes;
    }
    return $map;
}

/**
 * Load everything needed to score one match. Returns null if the match does not
 * exist, or an array carrying its own course, tee, golfers, rule and scores.
 *
 * $orgId, when given, scopes the lookup so a match from another organisation is
 * simply not found.
 */
function mp_load_match(mysqli $conn, $matchId, $orgId = null) {
    $matchId = (int) $matchId;

    $sql = "
        SELECT m.match_id, m.finalized,
               r.round_id, r.round_name, r.course_id,
               t.tournament_id, t.name AS tournament_name,
               t.handicap_pct, t.org_id,
               COALESCE(m.handicap_mode_at_finalize, t.handicap_mode) AS handicap_mode,
               ct.slope, ct.rating, ct.par
        FROM matches m
        JOIN rounds      r  ON r.round_id      = m.round_id
        JOIN tournaments t  ON t.tournament_id = r.tournament_id
        LEFT JOIN course_tees ct ON ct.tee_id  = r.tee_id
        WHERE m.match_id = ?";
    if ($orgId !== null) $sql .= " AND t.org_id = " . (int) $orgId;

    $stmt = $conn->prepare($sql);
    $stmt->bind_param('i', $matchId);
    $stmt->execute();
    $ctx = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$ctx) return null;

    // Stroke indexes come from this round's own course, never from a global.
    $ctx['holes'] = [];
    $stmt = $conn->prepare("SELECT hole_number, par, handicap_index FROM holes
                            WHERE course_id = ? ORDER BY hole_number");
    $stmt->bind_param('i', $ctx['course_id']);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($h = $res->fetch_assoc()) {
        $ctx['holes'][(int) $h['hole_number']] = (int) $h['handicap_index'];
        $ctx['pars'][(int) $h['hole_number']]  = (int) $h['par'];
    }
    $stmt->close();

    // Handicap and percentage as snapshotted when the golfer was assigned.
    $ctx['golfers'] = [];
    $stmt = $conn->prepare("
        SELECT mg.golfer_id, mg.player_order, g.first_name, tg.team_id,
               tm.name AS team_name, tm.color_hex AS team_color,
               COALESCE(tg.handicap_at_assignment, g.handicap)     AS handicap,
               COALESCE(tg.handicap_pct_at_assignment, ?)          AS handicap_pct
        FROM match_golfers mg
        JOIN golfers g ON g.golfer_id = mg.golfer_id
        JOIN tournament_golfers tg
          ON tg.golfer_id = mg.golfer_id AND tg.tournament_id = ?
        LEFT JOIN teams tm ON tm.team_id = tg.team_id
        WHERE mg.match_id = ?
        ORDER BY COALESCE(tm.name,''), mg.player_order, g.first_name");
    $stmt->bind_param('dii', $ctx['handicap_pct'], $ctx['tournament_id'], $matchId);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($g = $res->fetch_assoc()) {
        $ctx['golfers'][(int) $g['golfer_id']] = [
            'golfer_id'    => (int) $g['golfer_id'],
            'first_name'   => $g['first_name'],
            'team_id'      => $g['team_id'] !== null ? (int) $g['team_id'] : null,
            'team_name'    => $g['team_name'],
            'team_color'   => $g['team_color'],
            'player_order' => $g['player_order'],
            'handicap'     => (float) $g['handicap'],
            'playing'      => mp_playing_handicap(
                (float) $g['handicap'], (float) $ctx['slope'], (float) $ctx['rating'],
                (float) $ctx['par'], (float) $g['handicap_pct']
            ),
        ];
    }
    $stmt->close();

    $ctx['scores'] = [];
    $stmt = $conn->prepare("SELECT golfer_id, hole_number, strokes FROM hole_scores
                            WHERE match_id = ?");
    $stmt->bind_param('i', $matchId);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($s = $res->fetch_assoc()) {
        $ctx['scores'][(int) $s['hole_number']][(int) $s['golfer_id']] = (int) $s['strokes'];
    }
    $stmt->close();

    // A stored result is keyed by team for Ryder Cup matches and by side ('A'
    // or 'B') for partnership formats, which have no teams. Both shapes live in
    // match_results; whichever is present becomes the key here, matching the
    // keys mp_compute() produces.
    $ctx['stored_points'] = [];
    $stmt = $conn->prepare("SELECT team_id, side, points FROM match_results WHERE match_id = ?");
    $stmt->bind_param('i', $matchId);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($p = $res->fetch_assoc()) {
        $key = $p['team_id'] !== null ? (int) $p['team_id'] : $p['side'];
        if ($key === null) continue;
        $ctx['stored_points'][$key] = (float) $p['points'];
    }
    $stmt->close();

    return $ctx;
}

/**
 * Strokes each golfer receives, after applying the match's rule.
 *
 * Under 'match_relative' the whole field is shifted down so the lowest player
 * receives none. Manual-handicap tournaments are never shifted - the entered
 * numbers are taken as given.
 */
function mp_stroke_maps(array $ctx) {
    $adjust = 0.0;
    $manual = ((float) $ctx['handicap_pct']) < 0;

    if ($ctx['handicap_mode'] === MP_RULE_MATCH && !$manual && $ctx['golfers']) {
        $adjust = min(array_column($ctx['golfers'], 'playing'));
    }

    $maps = [];
    foreach ($ctx['golfers'] as $id => $g) {
        $maps[$id] = mp_stroke_map($g['playing'] - $adjust, $ctx['holes']);
    }
    return $maps;
}

/**
 * Score the match.
 *
 * Sides are the two teams, or - for Guys Trip, which has no teams - player
 * order 1-2 against 3-4. Play stops once the match is mathematically decided,
 * so a match won 2&1 reports 2&1 rather than being diluted by a hole 18 that
 * would not have been played.
 */
function mp_compute(array $ctx) {
    $maps    = mp_stroke_maps($ctx);
    $golfers = $ctx['golfers'];

    // Group golfers into exactly two sides.
    $sides = [];
    $byTeam = array_filter(array_column($golfers, 'team_id'), fn($t) => $t !== null);
    if (count(array_unique($byTeam)) === 2) {
        foreach ($golfers as $id => $g) $sides[$g['team_id']][] = $id;
    } else {
        foreach ($golfers as $id => $g) {
            $sides[((int) $g['player_order']) <= 2 ? 'A' : 'B'][] = $id;
        }
    }
    $sideKeys = array_keys($sides);
    if (count($sideKeys) !== 2) {
        return ['valid' => false, 'reason' => 'match does not have two sides'];
    }
    [$sideA, $sideB] = $sideKeys;

    $label = function ($side) use ($golfers, $sides) {
        foreach ($sides[$side] as $id) {
            if (!empty($golfers[$id]['team_name'])) return $golfers[$id]['team_name'];
        }
        return implode(' & ', array_map(fn($id) => $golfers[$id]['first_name'], $sides[$side]));
    };
    $colour = function ($side) use ($golfers, $sides) {
        foreach ($sides[$side] as $id) {
            if (!empty($golfers[$id]['team_color'])) return $golfers[$id]['team_color'];
        }
        return null;
    };
    // Ryder Cup sides are teams ("Team Tiger wins"); Guys Trip sides are two
    // named golfers ("Jordan & Shane win"), which takes no "Team" and a plural
    // verb.
    $isTeam = function ($side) use ($golfers, $sides) {
        foreach ($sides[$side] as $id) {
            if (!empty($golfers[$id]['team_name'])) return true;
        }
        return false;
    };
    $name = fn($side) => ($isTeam($side) ? 'Team ' : '') . $label($side);

    $differential = 0;
    $holesPlayed  = 0;
    $endedAt      = null;
    $perHole      = [];

    for ($hole = 1; $hole <= 18; $hole++) {
        if (empty($ctx['scores'][$hole])) continue;

        $best = [];
        foreach ($ctx['scores'][$hole] as $golferId => $strokes) {
            if (!isset($golfers[$golferId])) continue;
            $side = in_array($golferId, $sides[$sideA], true) ? $sideA
                  : (in_array($golferId, $sides[$sideB], true) ? $sideB : null);
            if ($side === null) continue;
            $net = $strokes - ($maps[$golferId][$hole] ?? 0);
            if (!isset($best[$side]) || $net < $best[$side]) $best[$side] = $net;
        }
        if (!isset($best[$sideA]) || !isset($best[$sideB])) continue;

        $holesPlayed++;
        $winner = null;
        if     ($best[$sideA] < $best[$sideB]) { $differential++; $winner = $sideA; }
        elseif ($best[$sideB] < $best[$sideA]) { $differential--; $winner = $sideB; }

        $perHole[$hole] = [
            'net_a'  => $best[$sideA],
            'net_b'  => $best[$sideB],
            'winner' => $winner,
            'running_differential' => $differential,
        ];

        if (abs($differential) > 18 - $hole) { $endedAt = $hole; break; }
    }

    // Points. A decided match is worth 1 to the winner, a halved match 0.5 each.
    if     ($differential > 0) $points = [$sideA => 1.0, $sideB => 0.0];
    elseif ($differential < 0) $points = [$sideA => 0.0, $sideB => 1.0];
    else                       $points = [$sideA => 0.5, $sideB => 0.5];

    // Status text, worded exactly as the existing UI words it.
    $margin = abs($differential);
    if ($holesPlayed === 0) {
        $status = 'No scores yet';
        $leadColour = null;
    } elseif ($endedAt !== null) {
        // "3&2" means three up with two to play. A match still alive on the
        // 18th tee is won "1 up", never "1&0" - there is no hole left to name.
        // Both original JS implementations emitted "1&0" here.
        $winner    = $differential > 0 ? $sideA : $sideB;
        $remaining = 18 - $endedAt;
        $margin_text = $remaining > 0 ? "{$margin}&{$remaining}" : "{$margin} up";
        $status = $name($winner) . ' ' . ($isTeam($winner) ? 'wins' : 'win') . ' ' . $margin_text;
        $leadColour = $colour($winner);
    } elseif ($differential === 0) {
        $status = $holesPlayed === 18 ? 'Match Halved' : "Tied – Thru {$holesPlayed}";
        $leadColour = null;
    } else {
        $leader = $differential > 0 ? $sideA : $sideB;
        $status = $name($leader) . " up {$margin} – Thru {$holesPlayed}";
        $leadColour = $colour($leader);
    }

    return [
        'valid'         => true,
        'match_id'      => (int) $ctx['match_id'],
        'finalized'     => (int) $ctx['finalized'] === 1,
        'handicap_mode' => $ctx['handicap_mode'],
        'sides'         => [$sideA, $sideB],
        'side_labels'   => [$sideA => $label($sideA), $sideB => $label($sideB)],
        'differential'  => $differential,
        'holes_played'  => $holesPlayed,
        'ended_at'      => $endedAt,
        'status_text'   => $status,
        'lead_color'    => $leadColour,
        'points'        => $points,
        'stored_points' => $ctx['stored_points'],
        'stroke_maps'   => $maps,
        'per_hole'      => $perHole,
    ];
}

/**
 * Score one match by id. Convenience wrapper over mp_load_match() + mp_compute().
 * Returns null when the match does not exist or is out of the caller's org.
 */
function computeMatchPlay(mysqli $conn, $matchId, $orgId = null) {
    $ctx = mp_load_match($conn, $matchId, $orgId);
    if (!$ctx) return null;
    if (count($ctx['holes']) !== 18 || count($ctx['golfers']) < 2) {
        return ['valid' => false, 'reason' => 'incomplete course or field'];
    }
    return mp_compute($ctx);
}

/**
 * Score a match for DISPLAY, applying the contract that keeps every screen
 * agreeing with every other:
 *
 *   finalized   the stored result is authoritative and is never recomputed.
 *               A finished match is a matter of record, not of arithmetic.
 *   in progress computed live under the tournament's current rule.
 *
 * This is the whole fix for the three-way disagreement. Previously the
 * Tournament tab read stored points, while the Round tab and the scorecard each
 * recomputed - so any change to the scoring code made finished matches
 * disagree with their own recorded result. Now only one of those is ever the
 * source, decided by whether the match is closed.
 *
 * status_text is still computed for finalized matches, because only points are
 * stored and the margin ("2&1") is not. That is safe: the rule is frozen, so it
 * reproduces the stored points - the audit checks exactly this. If a hole score
 * is edited after finalization the two can part company, so 'drift' reports it
 * rather than letting the screens quietly diverge again.
 */
function mp_match_status(mysqli $conn, $matchId, $orgId = null) {
    $r = computeMatchPlay($conn, $matchId, $orgId);
    if (!$r || empty($r['valid'])) return null;

    $points = $r['points'];
    $drift  = false;

    if ($r['finalized'] && count($r['stored_points']) === 2) {
        $points = $r['stored_points'];
        $drift  = !mp_points_match($r['points'], $r['stored_points']);
    }

    return [
        'match_id'        => $r['match_id'],
        'finalized'       => $r['finalized'],
        'handicap_mode'   => $r['handicap_mode'],
        'status_text'     => $r['status_text'],
        'lead_color'      => $r['lead_color'],
        'points'          => $points,          // authoritative
        'computed_points' => $r['computed_points'] ?? $r['points'],
        'drift'           => $drift,
        'differential'    => $r['differential'],
        'holes_played'    => $r['holes_played'],
        'stroke_maps'     => $r['stroke_maps'],
    ];
}

/** True when two points arrays agree, within rounding tolerance. */
function mp_points_match(array $a, array $b) {
    if (count($a) !== count($b)) return false;
    foreach ($a as $team => $points) {
        if (!isset($b[$team]) || abs($b[$team] - $points) > 0.01) return false;
    }
    return true;
}
