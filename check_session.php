<?php
session_start();
header('Content-Type: application/json');

if (isset($_SESSION['authenticated']) && $_SESSION['authenticated'] === true) {
    // DB credentials
    require_once 'db_connect.php';

    $golfer_id = $_SESSION['golfer_id'] ?? null;
    $name = null;
    $team = null;

    if ($golfer_id) {
        $conn = new mysqli($servername, $username, $password, $dbname);
        $stmt = $conn->prepare("SELECT first_name, last_name FROM golfers WHERE golfer_id = ?");
        $stmt->bind_param("i", $golfer_id);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($row = $result->fetch_assoc()) {
            $name = $row['first_name'] . ' ' . $row['last_name'];
        }
    }

    echo json_encode([
        'authenticated' => true,
        'golfer_id' => $golfer_id,
        'round_id' => $_SESSION['round_id'] ?? null,
        'tournament_id' => $_SESSION['tournament_id'] ?? null,
        'tournament_name' => $_SESSION['tournament_name'] ?? null,
        'tournament_handicap_pct' => $_SESSION['tournament_handicap_pct'] ?? null,
        'golfer_name' => $name,
        'round_name' => $_SESSION['round_name'] ?? null,
        'round_date' => $_SESSION['round_date'] ?? null,
        'team_id' => $_SESSION['team_id'] ?? null,
        'primary_team_name' => $_SESSION['primary_team_name'] ?? null,
        'primary_team_color' => $_SESSION['primary_team_color'] ?? null,
        'secondary_team_name' => $_SESSION['secondary_team_name'] ?? null,
        'secondary_team_color' => $_SESSION['secondary_team_color'] ?? null
    ]);
} else {
    echo json_encode(['authenticated' => false]);
}
