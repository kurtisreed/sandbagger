// service-worker.js
const CACHE_NAME = 'sandbagger-v2';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/script.js',
  '/style.css',
  '/manifest.json',
  '/offline-sync.js',
];

// Match data endpoints to cache for offline scorecard rendering
const MATCH_DATA_PATTERNS = [
  'get_wolf_match.php',
  'get_rabbit_match.php',
  'get_best_ball_match.php',
  'get_match_by_round.php',
  'get_scores.php',
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Remove old caches
      caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
      ),
    ])
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;

  // Only intercept GET requests — POST (save_score.php) falls through to network
  // and is handled offline by the main-thread queue in offline-sync.js
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Match data: network-first, cache as fallback for offline scorecard rendering
  const isMatchData = MATCH_DATA_PATTERNS.some(p => url.pathname.endsWith(p));
  if (isMatchData) {
    event.respondWith(
      fetch(request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return response;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // Static assets: cache-first
  const isStatic = STATIC_ASSETS.some(a => url.pathname === a || url.pathname.endsWith(a.replace('/', '')));
  if (isStatic) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request))
    );
    return;
  }

  // Everything else: network only
  event.respondWith(fetch(request));
});
