<?php
require_once 'db_connect.php';

$tournament_id = isset($_GET['tournament_id']) ? intval($_GET['tournament_id']) : 0;
if (!$tournament_id) {
    echo json_encode([]);
    exit;
}

$sql = "
    SELECT
        c.course_id,
        c.course_name,
        c.slope,
        c.rating,
        c.tees,
        t.handicap_pct
    FROM rounds r
    JOIN courses c ON r.course_id = c.course_id
    JOIN tournaments t ON r.tournament_id = t.tournament_id
    WHERE r.tournament_id = ?
    GROUP BY
        c.course_id,
        c.course_name,
        c.slope,
        c.rating,
        c.tees,
        t.handicap_pct
    ORDER BY
        MIN(r.round_date)
";
$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $tournament_id);
$stmt->execute();
$result = $stmt->get_result();

$courses = [];
while ($row = $result->fetch_assoc()) {
    $courses[] = [
        'course_id'    => $row['course_id'],
        'course_name'  => $row['course_name'],
        'slope'        => $row['slope'],
        'rating'       => $row['rating'],
        'tees'         => $row['tees'],
        'handicap_pct' => $row['handicap_pct']
    ];
}
echo json_encode($courses);