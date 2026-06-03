<?php
// Update the avatar for the current user's org.
// POST with JSON {"icon":"⛳"}  → stores "icon:⛳" in avatar_url
// POST multipart with file field "avatar" → resizes & saves image, stores URL
require_once '../cors_headers.php';
header('Content-Type: application/json');
require_once '../db_connect.php';
require_once __DIR__ . '/auth_middleware.php';

requireAdmin();

$contentType = $_SERVER['CONTENT_TYPE'] ?? '';

// ── Icon selection ──────────────────────────────────────────────────────────
if (strpos($contentType, 'application/json') !== false) {
    $data = json_decode(file_get_contents('php://input'), true);
    $icon = trim($data['icon'] ?? '');
    if (!$icon) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing icon value']);
        exit;
    }
    $avatarUrl = 'icon:' . $icon;
    $stmt = $conn->prepare("UPDATE organizations SET avatar_url = ? WHERE org_id = ?");
    $stmt->bind_param('si', $avatarUrl, $currentOrgId);
    $stmt->execute();
    echo json_encode(['success' => true, 'avatar_url' => $avatarUrl]);
    exit;
}

// ── Photo upload ────────────────────────────────────────────────────────────
if (empty($_FILES['avatar'])) {
    http_response_code(400);
    echo json_encode(['error' => 'No file uploaded']);
    exit;
}

$file  = $_FILES['avatar'];
$error = $file['error'];
if ($error !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['error' => 'Upload error: ' . $error]);
    exit;
}

// Validate type
$allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
$mimeType = mime_content_type($file['tmp_name']);
if (!in_array($mimeType, $allowed)) {
    http_response_code(400);
    echo json_encode(['error' => 'Only JPEG, PNG, GIF, and WebP images are allowed']);
    exit;
}

// Max 8 MB
if ($file['size'] > 8 * 1024 * 1024) {
    http_response_code(400);
    echo json_encode(['error' => 'Image must be under 8 MB']);
    exit;
}

// Load into GD
$src = null;
switch ($mimeType) {
    case 'image/jpeg': $src = imagecreatefromjpeg($file['tmp_name']); break;
    case 'image/png':  $src = imagecreatefrompng($file['tmp_name']);  break;
    case 'image/gif':  $src = imagecreatefromgif($file['tmp_name']);  break;
    case 'image/webp': $src = imagecreatefromwebp($file['tmp_name']); break;
}
if (!$src) {
    http_response_code(500);
    echo json_encode(['error' => 'Could not read image']);
    exit;
}

// Resize to 256×256 square (crop to center)
$origW = imagesx($src);
$origH = imagesy($src);
$size  = min($origW, $origH);
$srcX  = (int)(($origW - $size) / 2);
$srcY  = (int)(($origH - $size) / 2);

$dst = imagecreatetruecolor(256, 256);
// Preserve transparency for PNG
imagealphablending($dst, false);
imagesavealpha($dst, true);
imagecopyresampled($dst, $src, 0, 0, $srcX, $srcY, 256, 256, $size, $size);
imagedestroy($src);

// Save as JPEG
$dir      = __DIR__ . '/../images/group-avatars/';
$filename = 'org_' . $currentOrgId . '_' . time() . '.jpg';
$filepath = $dir . $filename;

if (!imagejpeg($dst, $filepath, 88)) {
    http_response_code(500);
    echo json_encode(['error' => 'Could not save image']);
    exit;
}
imagedestroy($dst);

// Delete old upload for this org (keep built-in icons, only clean up uploads)
$stmt = $conn->prepare("SELECT avatar_url FROM organizations WHERE org_id = ?");
$stmt->bind_param('i', $currentOrgId);
$stmt->execute();
$old = $stmt->get_result()->fetch_assoc();
$stmt->close();
if ($old && $old['avatar_url'] && !str_starts_with($old['avatar_url'], 'icon:')) {
    $oldFile = $dir . basename($old['avatar_url']);
    if (file_exists($oldFile)) @unlink($oldFile);
}

$avatarUrl = '/images/group-avatars/' . $filename;
$stmt = $conn->prepare("UPDATE organizations SET avatar_url = ? WHERE org_id = ?");
$stmt->bind_param('si', $avatarUrl, $currentOrgId);
$stmt->execute();

echo json_encode(['success' => true, 'avatar_url' => $avatarUrl]);
?>
