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

async function syncPendingScores(apiBaseUrl) {
  const pending = await getPendingScores();
  if (!pending.length) return 0;

  pending.sort((a, b) => a.timestamp - b.timestamp);

  let synced = 0;
  for (const score of pending) {
    try {
      const { id, timestamp, ...payload } = score;
      const res = await fetch(`${apiBaseUrl}/save_score.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      });
      if (res.ok) {
        await deletePendingScore(id);
        synced++;
      }
    } catch {
      break; // still offline, stop draining
    }
  }
  return synced;
}
