<?php
/**
 * skins.php - individual skins for one round.
 *
 * Include this; do not request it. get_individual_skins.php is the endpoint.
 *
 * Extracted verbatim from that endpoint so the Money List and the skins table
 * cannot disagree about who won what. Behaviour is deliberately unchanged.
 *
 * KNOWN ISSUE, preserved on purpose: the handicap below is g.handicap - the
 * golfer's CURRENT index - rather than tournament_golfers.handicap_at_assignment.
 * That is the same defect that made the Round tab re-score finished matches with
 * today's handicaps, and it means a completed round's skins can move when
 * somebody's index changes. Fixing it here would change historical skins
 * displays, so it is left alone and flagged rather than quietly altered. When it
 * is fixed, it should be fixed here once and both callers inherit it.
 *
 * Skins use half strokes: a handicap stroke is worth 0.5, so a stroke receiver
 * ties rather than beats a scratch player on equal gross.
 */

/**
 * Returns ['skins' => [...], 'skins_total' => float, 'error' => string|null].
 * A hole only awards a skin when every golfer in the round has a score on it
 * and exactly one net score is lowest.
 */
function computeRoundSkins(mysqli $conn, $round_id, $tournament_id, $orgId) {
    $round_id      = (int) $round_id;
    $tournament_id = (int) $tournament_id;
    $orgId         = (int) $orgId;

    // Matches in this round, and the course they were played on.
    $stmt = $conn->prepare("
        SELECT m.match_id, r.course_id
        FROM matches m
        JOIN rounds r      ON m.round_id = r.round_id
        JOIN tournaments t ON r.tournament_id = t.tournament_id
        WHERE m.round_id = ? AND t.org_id = ?
    ");
    $stmt->bind_param('ii', $round_id, $orgId);
    $stmt->execute();
    $res = $stmt->get_result();
    $matches = []; $course_id = null;
    while ($row = $res->fetch_assoc()) { $matches[] = $row['match_id']; $course_id = $row['course_id']; }
    $stmt->close();

    if (empty($matches) || !$course_id) {
        return ['skins' => [], 'skins_total' => 0, 'error' => 'No matches found'];
    }

    $ph = implode(',', array_fill(0, count($matches), '?'));

    $stmt = $conn->prepare("
        SELECT g.golfer_id, g.first_name, g.handicap, mg.match_id,
               t.name AS team_name, t.color_hex AS team_color
        FROM match_golfers mg
        JOIN golfers g ON mg.golfer_id = g.golfer_id
        JOIN tournament_golfers tg ON g.golfer_id = tg.golfer_id AND tg.tournament_id = ?
        LEFT JOIN teams t ON tg.team_id = t.team_id
        WHERE mg.match_id IN ($ph)
    ");
    $stmt->bind_param(str_repeat('i', count($matches) + 1), $tournament_id, ...$matches);
    $stmt->execute();
    $res = $stmt->get_result();
    $golfers = [];
    while ($row = $res->fetch_assoc()) {
        $golfers[$row['golfer_id']] = [
            'name'       => $row['first_name'],
            'handicap'   => floatval($row['handicap']),
            'team'       => $row['team_name'],
            'team_color' => $row['team_color'],
            'match_id'   => $row['match_id'],
        ];
    }
    $stmt->close();
    $totalGolfers = count($golfers);

    // Pot, tee, and the tournament's handicap percentage.
    $stmt = $conn->prepare("SELECT tee_id, skins_total FROM rounds WHERE round_id = ?");
    $stmt->bind_param('i', $round_id);
    $stmt->execute();
    $teeRow = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    $tee_id = $teeRow ? $teeRow['tee_id'] : null;
    // No pool unless the admin set one.
    $skins_total = ($teeRow && $teeRow['skins_total'] !== null) ? (float) $teeRow['skins_total'] : 0;
    if (!$tee_id) {
        return ['skins' => [], 'skins_total' => $skins_total, 'error' => 'No tee_id found for this round'];
    }

    $stmt = $conn->prepare("SELECT slope, rating FROM course_tees WHERE tee_id = ?");
    $stmt->bind_param('i', $tee_id);
    $stmt->execute();
    $ct = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    $slope  = floatval($ct['slope'] ?? 0);
    $rating = floatval($ct['rating'] ?? 0);

    $stmt = $conn->prepare("SELECT handicap_pct FROM tournaments WHERE tournament_id = ? AND org_id = ?");
    $stmt->bind_param('ii', $tournament_id, $orgId);
    $stmt->execute();
    $tr = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    $handicap_pct = floatval($tr['handicap_pct'] ?? 100);

    foreach ($golfers as $gid => &$g) {
        $g['playing_handicap'] =
            round(($g['handicap'] * ($slope / 113) + ($rating - 72)) * ($handicap_pct / 100), 1);
    }
    unset($g);

    $stmt = $conn->prepare("SELECT hole_number, handicap_index FROM holes WHERE course_id = ?");
    $stmt->bind_param('i', $course_id);
    $stmt->execute();
    $res = $stmt->get_result();
    $holeMap = [];
    while ($row = $res->fetch_assoc()) $holeMap[(int) $row['hole_number']] = (int) $row['handicap_index'];
    $stmt->close();

    $stmt = $conn->prepare("
        SELECT hs.match_id, hs.golfer_id, hs.hole_number, hs.strokes
        FROM hole_scores hs WHERE hs.match_id IN ($ph)
    ");
    $stmt->bind_param(str_repeat('i', count($matches)), ...$matches);
    $stmt->execute();
    $res = $stmt->get_result();

    // Net scores, with a handicap stroke worth half a shot.
    $holes = [];
    while ($row = $res->fetch_assoc()) {
        $hole      = (int) $row['hole_number'];
        $golfer_id = $row['golfer_id'];
        $strokes   = (int) $row['strokes'];
        $handicap  = $golfers[$golfer_id]['playing_handicap'] ?? 0;
        $index     = $holeMap[$hole] ?? 0;

        $bonus = 0;
        if ($handicap >= 0) {
            if ($handicap >= $index)                       $bonus += 0.5;
            if ($handicap > 18 && $handicap - 18 >= $index) $bonus += 0.5;
        } else {
            if ($index > 18 - abs($handicap))              $bonus -= 0.5;
        }

        $holes[$hole][$golfer_id] = $strokes - $bonus;
    }
    $stmt->close();

    // A skin goes to the single lowest net score, and only once the whole field
    // has played the hole.
    $skins = [];
    foreach ($holes as $holeNum => $scores) {
        if (count($scores) < $totalGolfers) continue;
        $winners = array_keys($scores, min($scores));
        if (count($winners) !== 1) continue;

        $winnerId = $winners[0];
        if (!isset($golfers[$winnerId])) continue;

        $skins[] = [
            'hole'        => $holeNum,
            'golfer_id'   => $winnerId,
            'golfer_name' => $golfers[$winnerId]['name'] ?? 'Unknown',
            'team'        => $golfers[$winnerId]['team'] ?? 'Unknown',
            'team_color'  => $golfers[$winnerId]['team_color'] ?? '#000000',
            'net_score'   => $scores[$winnerId],
        ];
    }

    return ['skins' => $skins, 'skins_total' => $skins_total, 'error' => null];
}
