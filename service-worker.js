// service-worker.js

// Skip the install caching step entirely
self.addEventListener('install', event => {
  // Activate immediately, no waiting on old caches
  self.skipWaiting();
});

// Claim clients as soon as the SW activates
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// For every fetch, just go to the network
self.addEventListener('fetch', event => {
  event.respondWith(
    // You can clone the request if you need to reuse it
    fetch(event.request).catch(err => {
      // Optional: handle a failed network here (e.g. show a custom offline page)
      console.error('Network request failed for', event.request.url, err);
      throw err;
    })
  );
});
