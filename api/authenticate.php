<?php
require_once '../cors_headers.php';
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");

require_once 'db_connect.php';
require_once 'auth_middleware.php';

$golfer_id = $_POST['golfer_id'] ?? null;
$round_id = $_POST['round_id'] ?? null;
$tournament_id = $_POST['tournament_id'] ?? null;
if (!$golfer_id || !$round_id || !$tournament_id) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing golfer, round, or tournament ID']);
    exit;
}

$_SESSION['authenticated'] = true;
$_SESSION['login_time'] = time();
$_SESSION['golfer_id'] = $golfer_id;
$_SESSION['round_id'] = $round_id;
$_SESSION['tournament_id'] = $tournament_id;

// Fetch round details (scoped through tournament -> org)
$stmt = $conn->prepare("
    SELECT r.round_name, r.round_date
    FROM rounds r
    JOIN tournaments t ON r.tournament_id = t.tournament_id
    WHERE r.round_id = ? AND t.org_id = ?
");
$stmt->bind_param("ii", $round_id, $currentOrgId);
$stmt->execute();
$result = $stmt->get_result();
if ($row = $result->fetch_assoc()) {
    $_SESSION['round_name'] = $row['round_name'];
    $_SESSION['round_date'] = $row['round_date'];
}

// Fetch tournament name and handicap percentage (scoped by org)
$stmt = $conn->prepare("SELECT name, handicap_pct FROM tournaments WHERE tournament_id = ? AND org_id = ?");
$stmt->bind_param("ii", $tournament_id, $currentOrgId);
$stmt->execute();
$result = $stmt->get_result();
if ($row = $result->fetch_assoc()) {
    $_SESSION['tournament_name'] = $row['name'];
    $_SESSION['tournament_handicap_pct'] = $row['handicap_pct'];
}

// Fetch team for the golfer
$stmt = $conn->prepare("
    SELECT
     t.team_id
    FROM tournament_golfers tg
    JOIN teams t ON tg.team_id = t.team_id
    WHERE tg.golfer_id = ? AND tg.tournament_id = ?
");
$stmt->bind_param("ii", $golfer_id, $tournament_id);
$stmt->execute();
$result = $stmt->get_result();
if ($row = $result->fetch_assoc()) {
    $_SESSION['team_id'] = $row['team_id'];
}

echo json_encode([
    'success' => true,
    'round_name' => $_SESSION['round_name'],
    'round_date' => $_SESSION['round_date'],
    'tournament_name' => $_SESSION['tournament_name'],
    'team_id' => $_SESSION['team_id'],
    'tournament_handicap_pct' => $_SESSION['tournament_handicap_pct']
]);
?>
