<?php
header('Content-Type: application/json');
require_once '../cors_headers.php';
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");

require_once 'db_connect.php';
require_once 'auth_middleware.php';

$tournament_id = isset($_GET['tournament_id']) ? intval($_GET['tournament_id']) : 0;
if (!$tournament_id) {
    echo json_encode([]);
    exit;
}

$sql = "
    SELECT g.golfer_id, g.first_name, g.last_name,
           COALESCE(tg.handicap_at_assignment, g.handicap) AS handicap
    FROM tournament_golfers tg
    JOIN golfers g ON tg.golfer_id = g.golfer_id
    JOIN tournaments t ON tg.tournament_id = t.tournament_id
    WHERE tg.tournament_id = ? AND t.org_id = ?
    ORDER BY g.last_name, g.first_name
";
$stmt = $conn->prepare($sql);
$stmt->bind_param("ii", $tournament_id, $currentOrgId);
$stmt->execute();
$result = $stmt->get_result();

$golfers = [];
while ($row = $result->fetch_assoc()) {
    $golfers[] = [
        'golfer_id'  => $row['golfer_id'],
        'first_name' => $row['first_name'],
        'last_name'  => $row['last_name'],
        'handicap'   => $row['handicap']
    ];
}
echo json_encode($golfers);
