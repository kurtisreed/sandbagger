<?php
require_once '../cors_headers.php';
// public/api/tournament_teams.php
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Expires: 0");
header("Pragma: no-cache");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");

// Handle preflight OPTIONS requests
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once 'db_connect.php';
require_once 'auth_middleware.php';

// GET - Fetch teams for a tournament (org-scoped)
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (!isset($_GET['tournament_id'])) {
        die(json_encode(['error' => 'Missing tournament_id']));
    }

    $stmt = $conn->prepare("
        SELECT t.team_id, t.name, t.color_hex
        FROM tournament_teams tt
        JOIN teams t ON tt.team_id = t.team_id
        JOIN tournaments tn ON tn.tournament_id = tt.tournament_id AND tn.org_id = ?
        WHERE tt.tournament_id = ?
    ");

    $stmt->bind_param("ii", $currentOrgId, $_GET['tournament_id']);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $teams = [];
    while ($row = $result->fetch_assoc()) {
        $teams[] = $row;
    }
    
    echo json_encode($teams);
}

// POST - Create new team (org-scoped)
else if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    requireAdmin();
    $data = json_decode(file_get_contents('php://input'), true);

    if (!isset($data['tournament_id']) || !isset($data['name']) || !isset($data['color'])) {
        die(json_encode(['error' => 'Missing required fields']));
    }

    // Verify tournament belongs to this org
    $checkStmt = $conn->prepare("SELECT tournament_id FROM tournaments WHERE tournament_id = ? AND org_id = ?");
    $checkStmt->bind_param("ii", $data['tournament_id'], $currentOrgId);
    $checkStmt->execute();
    if ($checkStmt->get_result()->num_rows === 0) {
        http_response_code(403);
        die(json_encode(['error' => 'Tournament not found or access denied']));
    }
    $checkStmt->close();

    $conn->begin_transaction();

    try {
        // First create the team
        $stmt = $conn->prepare("INSERT INTO teams (name, color_hex) VALUES (?, ?)");
        $stmt->bind_param("ss", $data['name'], $data['color']);
        $stmt->execute();
        $team_id = $conn->insert_id;

        // Then link it to the tournament
        $stmt = $conn->prepare("INSERT INTO tournament_teams (tournament_id, team_id) VALUES (?, ?)");
        $stmt->bind_param("ii", $data['tournament_id'], $team_id);
        $stmt->execute();

        $conn->commit();
        echo json_encode(['success' => true, 'team_id' => $team_id]);
    } catch (Exception $e) {
        $conn->rollback();
        echo json_encode(['error' => $e->getMessage()]);
    }
}

// PUT - Update existing team (org-scoped via tournament_teams)
else if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    requireAdmin();
    if (!isset($_GET['team_id'])) {
        die(json_encode(['error' => 'Missing team_id']));
    }

    $data = json_decode(file_get_contents('php://input'), true);

    // Verify this team belongs to a tournament in this org
    $checkStmt = $conn->prepare("
      SELECT tt.team_id FROM tournament_teams tt
      JOIN tournaments tn ON tn.tournament_id = tt.tournament_id AND tn.org_id = ?
      WHERE tt.team_id = ?
    ");
    $checkStmt->bind_param("ii", $currentOrgId, $_GET['team_id']);
    $checkStmt->execute();
    if ($checkStmt->get_result()->num_rows === 0) {
        http_response_code(403);
        die(json_encode(['error' => 'Team not found or access denied']));
    }
    $checkStmt->close();

    $stmt = $conn->prepare("UPDATE teams SET name = ?, color_hex = ? WHERE team_id = ?");
    $stmt->bind_param("ssi", $data['name'], $data['color'], $_GET['team_id']);

    if ($stmt->execute()) {
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['error' => 'Failed to update team']);
    }
}

// DELETE - Remove team from tournament (org-scoped)
else if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    requireAdmin();
    if (!isset($_GET['tournament_id']) || !isset($_GET['team_id'])) {
        die(json_encode(['error' => 'Missing tournament_id or team_id']));
    }

    // Verify tournament belongs to this org
    $checkStmt = $conn->prepare("SELECT tournament_id FROM tournaments WHERE tournament_id = ? AND org_id = ?");
    $checkStmt->bind_param("ii", $_GET['tournament_id'], $currentOrgId);
    $checkStmt->execute();
    if ($checkStmt->get_result()->num_rows === 0) {
        http_response_code(403);
        die(json_encode(['error' => 'Tournament not found or access denied']));
    }
    $checkStmt->close();

    $stmt = $conn->prepare("DELETE FROM tournament_teams WHERE tournament_id = ? AND team_id = ?");
    $stmt->bind_param("ii", $_GET['tournament_id'], $_GET['team_id']);

    if ($stmt->execute()) {
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['error' => 'Failed to delete team']);
    }
}