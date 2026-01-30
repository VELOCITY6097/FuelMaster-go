const CACHE_NAME = 'fuelmaster-v2';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './staff.js',
  './densityData.js'
];

// Install Event
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Fetch Event (Offline Capability)
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});
