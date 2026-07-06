<?php
// ghin_status.php — is the GHIN sync feature enabled for the current session's org?
// Used by the admin Golfers page to decide whether to show GHIN controls.
// (The lookup/sync endpoints enforce the same gate server-side regardless.)
require_once '../cors_headers.php';
header('Content-Type: application/json; charset=utf-8');
require_once 'db_connect.php';
require_once 'auth_middleware.php';
require_once 'ghin_helpers.php';

echo json_encode(['enabled' => ghinFeatureAllowed($currentOrgId)]);
