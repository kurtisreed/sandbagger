<?php
session_start();
require_once 'cors_headers.php';
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");

$golfer_id = $_POST['golfer_id'] ?? null;
$round_id = $_POST['round_id'] ?? null;
$tournament_id = $_POST['tournament_id'] ?? null;
if (!$golfer_id || !$round_id || !$tournament_id) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing golfer, round, or tournament ID']);
    exit;
}
require_once 'db_connect.php';

$conn = new mysqli($servername, $username, $password, $dbname);
if ($conn->connect_error) {
  http_response_code(500);
  echo json_encode(['success' => false, 'message' => 'Database connection failed']);
  exit;
}

// if ($entered_pin === $correct_pin && $golfer_id && $round_id && $tournament_id) {
$_SESSION['authenticated'] = true;
$_SESSION['login_time'] = time();
$_SESSION['golfer_id'] = $golfer_id;
$_SESSION['round_id'] = $round_id;
$_SESSION['tournament_id'] = $tournament_id;

// Fetch round details
$stmt = $conn->prepare("SELECT round_name, round_date FROM rounds WHERE round_id = ?");
$stmt->bind_param("i", $round_id);
$stmt->execute();
$result = $stmt->get_result();
if ($row = $result->fetch_assoc()) {
    $_SESSION['round_name'] = $row['round_name'];
    $_SESSION['round_date'] = $row['round_date'];
}

// Fetch tournament name
$stmt = $conn->prepare("SELECT name FROM tournaments WHERE tournament_id = ?");
$stmt->bind_param("i", $tournament_id);
$stmt->execute();
$result = $stmt->get_result();
if ($row = $result->fetch_assoc()) {
    $_SESSION['tournament_name'] = $row['name'];
}

// Fetch tournament handicap percentage
$stmt = $conn->prepare("SELECT handicap_pct FROM tournaments WHERE tournament_id = ?");
$stmt->bind_param("i", $tournament_id);
$stmt->execute();
$result = $stmt->get_result();
if ($row = $result->fetch_assoc()) {
    $_SESSION['tournament_handicap_pct'] = $row['handicap_pct'];
}

// Fetch team name for the golfer
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
//} else {
//    echo json_encode(['success' => false]);
//}
?>