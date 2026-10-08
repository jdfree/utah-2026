/* Offline copy of the trip site. Byway 12, Capitol Reef, Kayenta and the San
   Juans have no signal, which is exactly where the day plan gets opened. One
   visit with signal stores everything below; after that the site opens without
   a network.

   Bump VERSION to throw the stored copy away on the next visit. The page,
   script, styles and itinerary refresh themselves whenever there is signal;
   photos and Leaflet do not, so a replaced photo needs a bump. */
const VERSION = 'v1';
const PREFIX = 'utah-2026-';
const CACHE = PREFIX + VERSION;

const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist/';

const PRECACHE = [
  'index.html',
  'assets/css/style.css',
  'assets/js/app.js',
  'data/itinerary.json',
  'assets/favicon.svg',
  'assets/favicon.ico',
  'assets/apple-touch-icon.png',
  `${LEAFLET}leaflet.css`,
  `${LEAFLET}leaflet.js`,
];

/* How long a request with one bar of signal gets before the stored copy is
   shown instead. Out there "no signal" is as often a request that never
   answers as one that fails. */
const PATIENCE_MS = 4000;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    /* 'reload' skips the HTTP cache, where GitHub Pages lets a file sit for ten
       minutes — otherwise a fresh deploy could store the previous one. */
    const store = (url) => cache.add(new Request(url, { cache: 'reload' }));
    await Promise.all(PRECACHE.map(store));
    /* The photo list comes from the itinerary rather than a second list here,
       so adding a view stays a one-file edit. */
    const data = await (await cache.match('data/itinerary.json')).json();
    await Promise.all((data.views ?? []).map((v) => store(v.src)));
    await self.skipWaiting();
  })());
});

/* Cache storage is shared by everything on jdfree.github.io, so only clear
   out this site's own old versions. */
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.url.startsWith(LEAFLET)) return e.respondWith(cacheFirst(req));

  /* Anything else off-site goes straight to the network, untouched: the
     booking sheet is only worth showing live, and OpenStreetMap's tile policy
     forbids storing its tiles in bulk. */
  if (new URL(req.url).origin !== location.origin) return;

  if (req.destination === 'image') return e.respondWith(cacheFirst(req));
  if (req.mode === 'navigate') return e.respondWith(networkFirst(e, 'index.html'));
  e.respondWith(networkFirst(e, req));
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

/* 'no-cache' asks the server whether the file changed rather than trusting
   the browser's ten-minute copy, so an edit shows up on the next load. A late
   answer still refreshes the stored copy for next time. */
async function networkFirst(e, key) {
  const cache = await caches.open(CACHE);
  const fresh = fetch(e.request, { cache: 'no-cache' });
  e.waitUntil(fresh.then((res) => res.ok && cache.put(key, res.clone())).catch(() => {}));

  const timeout = new Promise((_, reject) => setTimeout(reject, PATIENCE_MS));
  try {
    return await Promise.race([fresh, timeout]);
  } catch {
    return (await cache.match(key)) ?? fresh;
  }
}
