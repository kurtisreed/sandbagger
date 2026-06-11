// service-worker.js
const CACHE_NAME = 'sandbagger-v7';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/script.js',
  '/help-content.js',
  '/style.css',
  '/manifest.json',
  '/offline-sync.js',
];

// Match data cached for offline scorecard rendering
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
      caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
      ),
    ])
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;

  // Only handle GET — let POST (save_score etc.) go straight to network
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // API calls: never cache, pass straight through to the network.
  // Not calling event.respondWith means the browser handles them natively
  // without service worker involvement — cleanest for auth-sensitive endpoints.
  if (url.pathname.startsWith('/api/')) return;

  // Match data: network-first, cache as fallback for offline scorecard rendering
  const isMatchData = MATCH_DATA_PATTERNS.some(p => url.pathname.endsWith(p));
  if (isMatchData) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // HTML, JS, CSS, root: network-first so updates are always picked up
  const isAppShell = url.pathname === '/'
    || url.pathname.endsWith('.html')
    || url.pathname.endsWith('.js')
    || url.pathname.endsWith('.css');
  if (isAppShell) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Everything else (images, icons, fonts): cache-first, network fallback.
  // Always resolve — never let a failed fetch reject the FetchEvent promise.
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request)
        .then(response => {
          // Cache successful responses for next time
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => new Response('', { status: 503, statusText: 'Offline' }));
    })
  );
});
