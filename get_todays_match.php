<?php
session_start();
$golfer_id = $_SESSION['golfer_id'] ?? null;

if (!$golfer_id) {
    echo json_encode(['error' => 'Not logged in']);
    exit;
}

// DB credentials
require_once 'db_connect.php';
$conn = new mysqli($servername, $username, $password, $dbname);

if ($conn->connect_error) {
    http_response_code(500);
    exit("DB connection failed");
}

$today = date('Y-m-d');

$sql = "
SELECT 
    mg.match_id,
    m.round_id,
    r.round_name,
    r.round_date,
    c.course_name,
    g.golfer_id,
    g.first_name,
    g.last_name,
    g.team
FROM match_golfers mg
JOIN matches m ON mg.match_id = m.match_id
JOIN rounds r ON m.round_id = r.round_id
JOIN courses c ON m.course_id = c.course_id
JOIN match_golfers mg2 ON mg.match_id = mg2.match_id
JOIN golfers g ON g.golfer_id = mg2.golfer_id
WHERE mg.golfer_id = ? AND r.round_date = CURDATE()
ORDER BY 
    CASE 
        WHEN g.golfer_id = ? THEN 0                  -- logged-in user first
        WHEN g.team = (SELECT team FROM golfers WHERE golfer_id = ?) THEN 1  -- teammate
        ELSE 2                                       -- opponents
    END,
    g.last_name,
    g.first_name
";

$stmt = $conn->prepare($sql);
$stmt->bind_param("iii", $golfer_id, $golfer_id, $golfer_id);
$stmt->execute();
$result = $stmt->get_result();

$matchData = [];
while ($row = $result->fetch_assoc()) {
    $matchData[] = $row;
}

echo json_encode($matchData);
?>