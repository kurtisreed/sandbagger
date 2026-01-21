<?php
require_once '../cors_headers.php';
header('Content-Type: application/json; charset=utf-8');
require_once 'db_connect.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    exit;
}

try {
    $data = json_decode(file_get_contents('php://input'), true);

    if (!$data || !isset($data['round_id']) || !isset($data['matches'])) {
        throw new Exception('Invalid request data');
    }

    $roundId = intval($data['round_id']);
    $tournamentId = intval($data['tournament_id']);
    $matches = $data['matches'];

    $conn->begin_transaction();

    try {
        // Get existing match IDs for this round
        $stmt = $conn->prepare("SELECT match_id FROM matches WHERE round_id = ?");
        $stmt->bind_param('i', $roundId);
        $stmt->execute();
        $result = $stmt->get_result();
        $existingMatchIds = [];
        while ($row = $result->fetch_assoc()) {
            $existingMatchIds[] = $row['match_id'];
        }

        // Track which match IDs are in the new data
        $newMatchIds = [];
        $idMapping = []; // Maps client IDs to server IDs

        foreach ($matches as $idx => $match) {
            $matchId = $match['match_id'];
            $matchName = $match['match_name'] ?? "Match " . ($idx + 1);
            $golfers = $match['golfers'] ?? [];

            if ($matchId === null || (is_string($matchId) && strpos($matchId, 'new-') === 0)) {
                // Create new match
                $stmt = $conn->prepare("
                    INSERT INTO matches (round_id, match_name)
                    VALUES (?, ?)
                ");
                $stmt->bind_param('is', $roundId, $matchName);
                $stmt->execute();
                $newId = $conn->insert_id;
                $idMapping[$matchId] = $newId;
                $newMatchIds[] = $newId;
            } else {
                // Update existing match
                $stmt = $conn->prepare("UPDATE matches SET match_name = ? WHERE match_id = ?");
                $stmt->bind_param('si', $matchName, $matchId);
                $stmt->execute();
                $newMatchIds[] = intval($matchId);
            }

            // Get the actual match_id (either new or existing)
            $actualMatchId = isset($idMapping[$matchId]) ? $idMapping[$matchId] : intval($matchId);

            // Delete existing golfer assignments for this match
            $stmt = $conn->prepare("DELETE FROM match_golfers WHERE match_id = ?");
            $stmt->bind_param('i', $actualMatchId);
            $stmt->execute();

            // Insert golfer assignments with player_order to track team position
            // player_order 1,2 = Team 1
            // player_order 3,4 = Team 2
            $stmt = $conn->prepare("
                INSERT INTO match_golfers (match_id, golfer_id, player_order)
                VALUES (?, ?, ?)
            ");

            foreach ($golfers as $golfer) {
                $golferId = intval($golfer['golfer_id']);
                $teamPosition = intval($golfer['team_position']);

                $stmt->bind_param('iii', $actualMatchId, $golferId, $teamPosition);
                $stmt->execute();
            }
        }

        // Delete matches that are no longer in the data
        foreach ($existingMatchIds as $existingId) {
            if (!in_array($existingId, $newMatchIds)) {
                // Delete match golfers first
                $stmt = $conn->prepare("DELETE FROM match_golfers WHERE match_id = ?");
                $stmt->bind_param('i', $existingId);
                $stmt->execute();

                // Delete match
                $stmt = $conn->prepare("DELETE FROM matches WHERE match_id = ?");
                $stmt->bind_param('i', $existingId);
                $stmt->execute();
            }
        }

        $conn->commit();

        echo json_encode([
            'success' => true,
            'id_mapping' => $idMapping,
            'match_count' => count($newMatchIds)
        ]);

    } catch (Exception $e) {
        $conn->rollback();
        throw $e;
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
