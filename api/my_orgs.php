<?php
// Returns all organizations the currently logged-in user belongs to.
require_once '../cors_headers.php';
header('Content-Type: application/json');

require_once __DIR__ . '/session_setup.php';

if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Not logged in']);
    exit;
}

$userId = (int) $_SESSION['user_id'];

$stmt = $conn->prepare("
    SELECT o.org_id, o.name AS org_name, uo.role,
           (o.org_id = ?) AS is_current
    FROM user_organizations uo
    JOIN organizations o ON o.org_id = uo.org_id
    WHERE uo.user_id = ?
    ORDER BY o.name ASC
");
$currentOrgId = (int) ($_SESSION['org_id'] ?? 0);
$stmt->bind_param('ii', $currentOrgId, $userId);
$stmt->execute();
$result = $stmt->get_result();

$orgs = [];
while ($row = $result->fetch_assoc()) {
    $orgs[] = [
        'org_id'     => (int) $row['org_id'],
        'org_name'   => $row['org_name'],
        'role'       => $row['role'],
        'is_current' => (bool) $row['is_current'],
    ];
}
$stmt->close();

echo json_encode(['orgs' => $orgs]);
