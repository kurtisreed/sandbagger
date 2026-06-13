<?php
// Returns non-finalized quick rounds (Best Ball, Rabbit, Wolf) that include the current user's golfer.
// Used by the dashboard to show "resume" cards for in-progress quick rounds.
require_once '../cors_headers.php';
header('Content-Type: application/json');
require_once '../db_connect.php';
require_once __DIR__ . '/auth_middleware.php';

$golferId = (int) ($_SESSION['golfer_id'] ?? 0);

if (!$golferId) {
    echo json_encode(['rounds' => []]);
    exit;
}

$stmt = $conn->prepare("
    SELECT
        m.match_id,
        m.match_code,
        t.tournament_id,
        r.round_name,
        c.course_name,
        r.round_date,
        GROUP_CONCAT(
            CONCAT(g.first_name, ' ', g.last_name)
            ORDER BY g.last_name, g.first_name
            SEPARATOR ', '
        ) AS players
    FROM match_golfers mg
    JOIN matches m ON mg.match_id = m.match_id
        AND (m.finalized IS NULL OR m.finalized = 0)
    JOIN rounds r ON m.round_id = r.round_id
        AND r.round_name IN ('Best Ball', 'Rabbit', 'Wolf', 'Rolling Skins')
    JOIN tournaments t ON r.tournament_id = t.tournament_id
        AND t.org_id = ?
    JOIN courses c ON m.course_id = c.course_id
    JOIN match_golfers mg2 ON m.match_id = mg2.match_id
    JOIN golfers g ON mg2.golfer_id = g.golfer_id
    WHERE mg.golfer_id = ?
    GROUP BY m.match_id, t.tournament_id, r.round_name, c.course_name, r.round_date
    ORDER BY m.match_id DESC
    LIMIT 10
");
$stmt->bind_param('ii', $currentOrgId, $golferId);
$stmt->execute();
$result = $stmt->get_result();

$rounds = [];
while ($row = $result->fetch_assoc()) {
    $rounds[] = $row;
}

echo json_encode(['rounds' => $rounds]);
$stmt->close();
$conn->close();
?>
