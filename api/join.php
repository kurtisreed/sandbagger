<?php
// Public endpoint — no auth required.
// Validates an invite code and creates a user + golfer in one step.
require_once '../cors_headers.php';
header('Content-Type: application/json');

require_once __DIR__ . '/session_setup.php'; // db_connect included by session_setup

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // Validate code and return org name so the join form can show it
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

    echo json_encode(['valid' => true, 'org_name' => $invite['org_name']]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$data           = json_decode(file_get_contents('php://input'), true);
$code           = strtoupper(trim($data['code']       ?? ''));
$firstName      = trim($data['first_name'] ?? '');
$lastName       = trim($data['last_name']  ?? '');
$email          = trim($data['email']      ?? '');
$password       = trim($data['password']   ?? '');
$handicap       = isset($data['handicap']) ? floatval($data['handicap']) : 0.0;
$name           = trim("$firstName $lastName");
// claim_golfer_id: positive int = link to that golfer, 0 = explicitly create new, null = auto-match
$claimGolferId  = isset($data['claim_golfer_id']) ? intval($data['claim_golfer_id']) : null;

// Validation
if (!$code || !$firstName || !$lastName || !$email || !$password) {
    http_response_code(400);
    echo json_encode(['error' => 'All fields are required']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid email address']);
    exit;
}

if (strlen($password) < 8) {
    http_response_code(400);
    echo json_encode(['error' => 'Password must be at least 8 characters']);
    exit;
}

// Validate invite code (must not be expired)
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

// Check email not already taken
$stmt = $conn->prepare("SELECT user_id FROM users WHERE email = ?");
$stmt->bind_param('s', $email);
$stmt->execute();
$stmt->store_result();
if ($stmt->num_rows > 0) {
    http_response_code(409);
    echo json_encode(['error' => 'An account with that email already exists. Please sign in instead.']);
    exit;
}
$stmt->close();

$conn->begin_transaction();

try {
    // Create user account
    $passwordHash = password_hash($password, PASSWORD_BCRYPT);
    $stmt = $conn->prepare("INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)");
    $stmt->bind_param('sss', $email, $passwordHash, $name);
    $stmt->execute();
    $userId = $conn->insert_id;
    $stmt->close();

    // Add to org as scorer
    $role = 'scorer';
    $stmt = $conn->prepare("INSERT INTO user_organizations (user_id, org_id, role) VALUES (?, ?, ?)");
    $stmt->bind_param('iis', $userId, $orgId, $role);
    $stmt->execute();
    $stmt->close();

    if ($claimGolferId !== null && $claimGolferId > 0) {
        // Admin explicitly claimed a specific unlinked golfer
        $stmt = $conn->prepare("
            SELECT golfer_id, first_name, last_name FROM golfers
            WHERE golfer_id = ? AND org_id = ? AND user_id IS NULL
        ");
        $stmt->bind_param('ii', $claimGolferId, $orgId);
        $stmt->execute();
        $claimed = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if ($claimed) {
            $golferId = (int) $claimed['golfer_id'];
            $stmt = $conn->prepare("UPDATE golfers SET user_id = ?, handicap = ? WHERE golfer_id = ?");
            $stmt->bind_param('idi', $userId, $handicap, $golferId);
            $stmt->execute();
            $stmt->close();
            // Use the existing golfer's name for the session
            $firstName = $claimed['first_name'];
            $lastName  = $claimed['last_name'];
        } else {
            // Claimed golfer no longer available — create a new one
            $stmt = $conn->prepare("INSERT INTO golfers (first_name, last_name, handicap, org_id, user_id, active) VALUES (?, ?, ?, ?, ?, 1)");
            $stmt->bind_param('ssdii', $firstName, $lastName, $handicap, $orgId, $userId);
            $stmt->execute();
            $golferId = $conn->insert_id;
            $stmt->close();
        }
    } else {
        // Auto-match: look for an unlinked golfer with the same name (case-insensitive)
        $stmt = $conn->prepare("
            SELECT golfer_id, handicap FROM golfers
            WHERE org_id = ? AND user_id IS NULL
              AND LOWER(first_name) = LOWER(?) AND LOWER(last_name) = LOWER(?)
            LIMIT 1
        ");
        $stmt->bind_param('iss', $orgId, $firstName, $lastName);
        $stmt->execute();
        $existing = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if ($existing) {
            // Exact match — link and update handicap
            $golferId = (int) $existing['golfer_id'];
            $stmt = $conn->prepare("UPDATE golfers SET user_id = ?, handicap = ? WHERE golfer_id = ?");
            $stmt->bind_param('idi', $userId, $handicap, $golferId);
            $stmt->execute();
            $stmt->close();
        } elseif ($claimGolferId === null) {
            // No match and no explicit "create new" signal — check if there are unlinked golfers to claim
            $stmt = $conn->prepare("
                SELECT golfer_id, first_name, last_name, handicap
                FROM golfers
                WHERE org_id = ? AND user_id IS NULL
                ORDER BY last_name, first_name
            ");
            $stmt->bind_param('i', $orgId);
            $stmt->execute();
            $candidates = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
            $stmt->close();

            if (!empty($candidates)) {
                // Roll back — don't create the account yet, ask the user to claim a profile
                $conn->rollback();
                echo json_encode([
                    'needs_claim' => true,
                    'candidates'  => $candidates,
                ]);
                exit;
            }
            // No candidates — create a new golfer record
            $stmt = $conn->prepare("INSERT INTO golfers (first_name, last_name, handicap, org_id, user_id, active) VALUES (?, ?, ?, ?, ?, 1)");
            $stmt->bind_param('ssdii', $firstName, $lastName, $handicap, $orgId, $userId);
            $stmt->execute();
            $golferId = $conn->insert_id;
            $stmt->close();
        } else {
            // claim_golfer_id === 0: user explicitly said "I'm not listed, create new"
            $stmt = $conn->prepare("INSERT INTO golfers (first_name, last_name, handicap, org_id, user_id, active) VALUES (?, ?, ?, ?, ?, 1)");
            $stmt->bind_param('ssdii', $firstName, $lastName, $handicap, $orgId, $userId);
            $stmt->execute();
            $golferId = $conn->insert_id;
            $stmt->close();
        }
    }

    $conn->commit();

    // Log user in immediately
    $_SESSION['user_id']   = $userId;
    $_SESSION['org_id']    = $orgId;
    $_SESSION['role']      = $role;
    $_SESSION['name']      = $name;
    $_SESSION['org_name']  = $invite['org_name'];
    $_SESSION['golfer_id'] = $golferId;

    session_regenerate_id(true);

    echo json_encode([
        'success'  => true,
        'org_name' => $invite['org_name'],
        'golfer'   => [
            'golfer_id'  => $golferId,
            'first_name' => $firstName,
            'last_name'  => $lastName,
            'handicap'   => $handicap,
            'role'       => null
        ]
    ]);

} catch (Exception $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode(['error' => 'Registration failed: ' . $e->getMessage()]);
}
