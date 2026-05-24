<?php
require_once 'db_connect.php';
require_once 'auth_middleware.php';

$golfer_id = $_SESSION['golfer_id'] ?? null;

if (!$golfer_id) {
    echo json_encode(['error' => 'Not logged in']);
    exit;
}

$today = date('Y-m-d');

// NOTE: the original query referenced g.team which may not exist in the new schema.
// We scope by org_id via the golfer record.
$sql = "
SELECT
    mg.match_id,
    m.round_id,
    r.round_name,
    r.round_date,
    c.course_name,
    g.golfer_id,
    g.first_name,
    g.last_name
FROM match_golfers mg
JOIN matches m ON mg.match_id = m.match_id
JOIN rounds r ON m.round_id = r.round_id
JOIN tournaments t ON r.tournament_id = t.tournament_id
JOIN courses c ON m.course_id = c.course_id
JOIN match_golfers mg2 ON mg.match_id = mg2.match_id
JOIN golfers g ON g.golfer_id = mg2.golfer_id
WHERE mg.golfer_id = ? AND r.round_date = CURDATE() AND t.org_id = ?
ORDER BY
    CASE
        WHEN g.golfer_id = ? THEN 0
        ELSE 2
    END,
    g.last_name,
    g.first_name
";

$stmt = $conn->prepare($sql);
$stmt->bind_param("iii", $golfer_id, $currentOrgId, $golfer_id);
$stmt->execute();
$result = $stmt->get_result();

$matchData = [];
while ($row = $result->fetch_assoc()) {
    $matchData[] = $row;
}

echo json_encode($matchData);
?>
