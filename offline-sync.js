// offline-sync.js — IndexedDB queue for offline score entry

const OFFLINE_DB_NAME = 'sandbagger-offline';
const OFFLINE_DB_VERSION = 1;
const SCORES_STORE = 'pending_scores';

let _db = null;

async function openOfflineDB() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(SCORES_STORE)) {
        db.createObjectStore(SCORES_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror = e => reject(e.target.error);
  });
}

async function queueScore(payload) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCORES_STORE, 'readwrite');
    tx.objectStore(SCORES_STORE).add({ ...payload, timestamp: Date.now() });
    tx.oncomplete = resolve;
    tx.onerror = e => reject(e.target.error);
  });
}

async function getPendingScores() {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(SCORES_STORE, 'readonly').objectStore(SCORES_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = e => reject(e.target.error);
  });
}

async function deletePendingScore(id) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCORES_STORE, 'readwrite');
    tx.objectStore(SCORES_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = e => reject(e.target.error);
  });
}

async function getPendingCount() {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(SCORES_STORE, 'readonly').objectStore(SCORES_STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = e => reject(e.target.error);
  });
}

// After loading server scores, overlay any locally-queued scores for this match
// so the UI stays consistent while offline.
async function applyPendingScores(matchId) {
  const pending = await getPendingScores();
  const mine = pending.filter(s => s.match_id === matchId);
  mine.forEach(score => {
    // Editable scorecard (select dropdowns)
    const sel = document.querySelector(
      `select.score-input[data-hole="${score.hole}"][data-golfer="${score.golfer_id}"]`
    );
    if (sel) sel.value = score.strokes;

    // Read-only scorecard (text cells)
    const cell = document.querySelector(
      `td.readonly-score-cell[data-hole="${score.hole}"][data-golfer="${score.golfer_id}"]`
    );
    if (cell) {
      const existing = cell.querySelector('.corner-dot, .penalty-dot');
      const dotsHtml = existing ? existing.outerHTML : '';
      cell.innerHTML = dotsHtml + score.strokes;
    }
  });
}

// Drain the queue to the server, oldest first so replay preserves the order the
// golfer entered scores in.
//
// Returns { synced, failed, unauthorized }. Callers should surface a non-zero
// `failed` — a silent drain is how this went unnoticed for ten weeks: the URL
// below was missing its /api/ prefix after save_score.php moved in 3e49906, so
// every attempt came back 404. A 404 is a *successful* HTTP response, so no
// exception fired, and the old `if (res.ok)` had no else branch. Scores stayed
// queued forever while the UI showed them as saved.
async function syncPendingScores(apiBaseUrl) {
  const pending = await getPendingScores();
  if (!pending.length) return { synced: 0, failed: 0, unauthorized: false };

  pending.sort((a, b) => a.timestamp - b.timestamp);

  let synced = 0;
  let failed = 0;
  let unauthorized = false;

  for (const score of pending) {
    const { id, timestamp, ...payload } = score;
    let res;

    try {
      res = await fetch(`${apiBaseUrl}/api/save_score.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      });
    } catch {
      // Genuinely offline again. Stop and keep everything queued; the next
      // reconnect picks up where this left off.
      break;
    }

    if (res.ok) {
      await deletePendingScore(id);
      synced++;
      continue;
    }

    // The session died while the phone was out of range. The scores are still
    // good - keep them queued and let the caller prompt for a re-login rather
    // than discarding a round's work.
    if (res.status === 401 || res.status === 403) {
      unauthorized = true;
      break;
    }

    // Anything else (404, 500, a rejected payload) is a real failure. Keep the
    // score queued and report it rather than dropping it on the floor.
    failed++;
    console.error(`Offline sync failed for hole ${payload.hole} (HTTP ${res.status})`);
  }

  return { synced, failed, unauthorized };
}
