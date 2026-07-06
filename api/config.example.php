<?php
// Copy this file to config.php and fill in your keys.
// config.php is gitignored — never commit real keys.

// GolfCourseAPI key — sign up free at https://golfcourseapi.com
define('GOLF_COURSE_API_KEY', 'YOUR_API_KEY_HERE');

// ── GHIN handicap sync (optional) ────────────────────────────────────────────
// Lets admins pull Handicap Indexes from GHIN. This is intentionally limited to
// specific groups (orgs) via the allowlist below — leave the array empty to keep
// the feature off everywhere. The credentials below are a single GHIN account
// used only on behalf of the allowlisted group(s); no other group can invoke it.
define('GHIN_EMAIL', 'your-ghin-login@example.com');
define('GHIN_PASSWORD', 'your-ghin-password');

// Org IDs allowed to use GHIN sync. Empty = feature disabled for everyone.
// Example: [7] enables it only for the group whose org_id is 7 on this server.
$GHIN_ENABLED_ORG_IDS = [];
