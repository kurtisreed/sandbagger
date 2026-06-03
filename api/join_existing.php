<?php
// Lets an already-logged-in user join an additional org using an invite code.
// Does NOT create a new account — uses the existing user_id from the session.
require_once '../cors_headers.php';
header('Content-Type: application/json');

require_once __DIR__ . '/session_setup.php';

if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Not logged in']);
    exit;
}

$userId = (int) $_SESSION['user_id'];

// GET: validate code and return org name for preview
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $code = strtoupper(trim($_GET['code'] ?? ''));
    if (!$code) {
        http_response_code(400);
        echo json_encode(['error' => 'Invite code required']);
        exit;
    }

    $stmt = $conn->prepare("
        SELECT i.org_id, o.name AS org_name
        FROM org_invites i
        JOIN organizations o ON o.org_id = i.org_id
        WHERE i.code = ?
          AND (i.expires_at IS NULL OR i.expires_at > NOW())
    ");
    $stmt->bind_param('s', $code);
    $stmt->execute();
    $result = $stmt->get_result();
    $invite = $result->fetch_assoc();
    $stmt->close();

    if (!$invite) {
        http_response_code(404);
        echo json_encode(['error' => 'Invalid or expired invite code']);
        exit;
    }

    // Check if user is already in this org
    $orgId = (int) $invite['org_id'];
    $stmt = $conn->prepare("SELECT 1 FROM user_organizations WHERE user_id = ? AND org_id = ?");
    $stmt->bind_param('ii', $userId, $orgId);
    $stmt->execute();
    $stmt->store_result();
    $alreadyMember = $stmt->num_rows > 0;
    $stmt->close();

    echo json_encode([
        'valid'          => true,
        'org_name'       => $invite['org_name'],
        'already_member' => $alreadyMember,
    ]);
    exit;
}

// POST: join the org
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$data          = json_decode(file_get_contents('php://input'), true);
$code          = strtoupper(trim($data['code'] ?? ''));
$claimGolferId = isset($data['claim_golfer_id']) ? intval($data['claim_golfer_id']) : null;

if (!$code) {
    http_response_code(400);
    echo json_encode(['error' => 'Invite code required']);
    exit;
}

// Validate invite
$stmt = $conn->prepare("
    SELECT i.invite_id, i.org_id, o.name AS org_name
    FROM org_invites i
    JOIN organizations o ON o.org_id = i.org_id
    WHERE i.code = ?
      AND (i.expires_at IS NULL OR i.expires_at > NOW())
");
$stmt->bind_param('s', $code);
$stmt->execute();
$result = $stmt->get_result();
$invite = $result->fetch_assoc();
$stmt->close();

if (!$invite) {
    http_response_code(404);
    echo json_encode(['error' => 'Invalid or expired invite code']);
    exit;
}

$orgId = (int) $invite['org_id'];

// Check already a member
$stmt = $conn->prepare("SELECT 1 FROM user_organizations WHERE user_id = ? AND org_id = ?");
$stmt->bind_param('ii', $userId, $orgId);
$stmt->execute();
$stmt->store_result();
if ($stmt->num_rows > 0) {
    $stmt->close();
    http_response_code(409);
    echo json_encode(['error' => 'You are already a member of this group']);
    exit;
}
$stmt->close();

$conn->begin_transaction();
try {
    // Add user to org as scorer
    $role = 'scorer';
    $stmt = $conn->prepare("INSERT INTO user_organizations (user_id, org_id, role) VALUES (?, ?, ?)");
    $stmt->bind_param('iis', $userId, $orgId, $role);
    $stmt->execute();
    $stmt->close();

    $nameParts = explode(' ', $_SESSION['name'] ?? '', 2);
    $firstName = trim($nameParts[0] ?? '');
    $lastName  = trim($nameParts[1] ?? '');

    if ($claimGolferId !== null && $claimGolferId > 0) {
        // Link to a specific golfer the user picked
        $stmt = $conn->prepare("SELECT golfer_id FROM golfers WHERE golfer_id = ? AND org_id = ? AND user_id IS NULL");
        $stmt->bind_param('ii', $claimGolferId, $orgId);
        $stmt->execute();
        $claimed = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if ($claimed) {
            $stmt = $conn->prepare("UPDATE golfers SET user_id = ? WHERE golfer_id = ?");
            $stmt->bind_param('ii', $userId, $claimGolferId);
            $stmt->execute();
            $stmt->close();
        } else {
            // Golfer no longer available — create new
            $handicap = 0.0;
            $stmt = $conn->prepare("INSERT INTO golfers (first_name, last_name, handicap, org_id, user_id, active) VALUES (?, ?, ?, ?, ?, 1)");
            $stmt->bind_param('ssdii', $firstName, $lastName, $handicap, $orgId, $userId);
            $stmt->execute();
            $stmt->close();
        }
        $conn->commit();
        echo json_encode(['success' => true, 'org_name' => $invite['org_name']]);

    } else {
        // Auto-match by name
        $stmt = $conn->prepare("
            SELECT golfer_id FROM golfers
            WHERE org_id = ? AND user_id IS NULL
              AND LOWER(first_name) = LOWER(?) AND LOWER(last_name) = LOWER(?)
            LIMIT 1
        ");
        $stmt->bind_param('iss', $orgId, $firstName, $lastName);
        $stmt->execute();
        $existing = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if ($existing) {
            // Exact match — link
            $stmt = $conn->prepare("UPDATE golfers SET user_id = ? WHERE golfer_id = ?");
            $existingId = (int) $existing['golfer_id'];
            $stmt->bind_param('ii', $userId, $existingId);
            $stmt->execute();
            $stmt->close();
            $conn->commit();
            echo json_encode(['success' => true, 'org_name' => $invite['org_name']]);
        } elseif ($claimGolferId === null) {
            // No match — check for unlinked golfers to claim
            $stmt = $conn->prepare("
                SELECT golfer_id, first_name, last_name, handicap
                FROM golfers WHERE org_id = ? AND user_id IS NULL
                ORDER BY last_name, first_name
            ");
            $stmt->bind_param('i', $orgId);
            $stmt->execute();
            $candidates = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
            $stmt->close();

            if (!empty($candidates)) {
                // Org joined successfully, but ask user to claim a profile
                $conn->commit();
                echo json_encode([
                    'success'     => true,
                    'org_name'    => $invite['org_name'],
                    'needs_claim' => true,
                    'candidates'  => $candidates,
                ]);
            } else {
                // No candidates — create a new golfer
                $handicap = 0.0;
                $stmt = $conn->prepare("INSERT INTO golfers (first_name, last_name, handicap, org_id, user_id, active) VALUES (?, ?, ?, ?, ?, 1)");
                $stmt->bind_param('ssdii', $firstName, $lastName, $handicap, $orgId, $userId);
                $stmt->execute();
                $stmt->close();
                $conn->commit();
                echo json_encode(['success' => true, 'org_name' => $invite['org_name']]);
            }
        } else {
            // claim_golfer_id === 0: explicitly create new
            $handicap = 0.0;
            $stmt = $conn->prepare("INSERT INTO golfers (first_name, last_name, handicap, org_id, user_id, active) VALUES (?, ?, ?, ?, ?, 1)");
            $stmt->bind_param('ssdii', $firstName, $lastName, $handicap, $orgId, $userId);
            $stmt->execute();
            $stmt->close();
            $conn->commit();
            echo json_encode(['success' => true, 'org_name' => $invite['org_name']]);
        }
    }
} catch (Exception $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode(['error' => 'Failed to join group: ' . $e->getMessage()]);
}
