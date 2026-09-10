// ============================================================================
// DRISHTI-NER Service Worker | Offline-First Lifeline & Hazard Cache Engine
// ============================================================================

const CACHE_NAME = 'drishti-ner-v2.0';

// Core static assets required for the app shell & in-browser AI model
const PRECACHE_ASSETS = [
    './',
    './index.html',
    './style.css?v=5.0',
    './script.js?v=6.0',
    './india-boundary.js',
    './manifest.json',
    './model/model.json',
    './model/weights.bin',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://cdn.tailwindcss.com',
    'https://unpkg.com/lucide@latest',
    'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Service Worker Install: Cache Application Shell & TensorFlow Model
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[DRISHTI SW] Pre-caching offline application shell & AI model...');
                return Promise.allSettled(
                    PRECACHE_ASSETS.map(url =>
                        fetch(url, { mode: 'cors', cache: 'reload' })
                            .then(response => {
                                if (response.ok || response.type === 'opaque') {
                                    return cache.put(url, response);
                                }
                            })
                            .catch(err => console.warn('[DRISHTI SW] Precache skip for:', url, err))
                    )
                );
            })
            .then(() => self.skipWaiting())
    );
});

// Service Worker Activate: Clean up outdated caches & claim clients
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(name => name !== CACHE_NAME)
                        .map(name => {
                            console.log('[DRISHTI SW] Deleting legacy cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => self.clients.claim())
    );
});

// Service Worker Fetch: Offline-First cache strategy
self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') return;

    // Handle Open-Meteo & External APIs: Network-First with Cache Fallback
    if (url.hostname.includes('open-meteo.com') || url.hostname.includes('bhuvan')) {
        event.respondWith(
            fetch(request)
                .then(networkResponse => {
                    if (networkResponse.ok) {
                        const cloned = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(request, cloned));
                    }
                    return networkResponse;
                })
                .catch(() => {
                    console.log('[DRISHTI SW] Serving cached telemetry for:', request.url);
                    return caches.match(request);
                })
        );
        return;
    }

    // Handle Map Tiles (Esri / OSM): Cache-First to keep viewed tiles offline
    if (url.hostname.includes('tile.openstreetmap.org') || url.hostname.includes('arcgisonline.com')) {
        event.respondWith(
            caches.match(request)
                .then(cachedTile => {
                    if (cachedTile) return cachedTile;
                    return fetch(request)
                        .then(networkResponse => {
                            if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
                                const cloned = networkResponse.clone();
                                caches.open(CACHE_NAME).then(cache => cache.put(request, cloned));
                            }
                            return networkResponse;
                        })
                        .catch(() => {
                            // Return an empty transparent tile if completely offline and un-cached
                            return new Response('', { status: 200, headers: { 'Content-Type': 'image/png' } });
                        });
                })
        );
        return;
    }

    // Strategy for App Shell, Scripts, & Styles: Network-First (with offline cache fallback)
    // Ensures developers and users always see current updates immediately when online
    event.respondWith(
        fetch(request)
            .then(networkResponse => {
                if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
                    const cloned = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, cloned));
                }
                return networkResponse;
            })
            .catch(() => {
                // Fallback to cache when offline
                return caches.match(request, { ignoreSearch: false })
                    .then(cachedResponse => {
                        if (cachedResponse) return cachedResponse;
                        if (request.mode === 'navigate') {
                            return caches.match('./index.html');
                        }
                    });
            })
    );
});
