/* Service worker: giúp app mở được khi mất mạng.
   Đổi CACHE_VERSION mỗi khi sửa file giao diện để máy người dùng nhận bản mới. */
const CACHE_VERSION = 'duifarm-v4';
const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/util.js',
  './js/auth.js',
  './js/sync.js',
  './js/auth-ui.js',
  './js/db.js',
  './js/search.js',
  './js/map.js',
  './js/ai.js',
  './js/app.js',
  './js/map-ui.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // API và dữ liệu trang trại không bao giờ được lưu trong bộ nhớ đệm của service worker
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== self.location.origin && !isFont) return;

  // Mở trang: ưu tiên bản mới từ mạng, mất mạng thì dùng bản đã lưu
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // File của app: ưu tiên bản mới từ mạng (tránh HTML mới chạy với JS cũ), mất mạng thì dùng bản đã lưu.
  // Font: dùng bản đã lưu ngay, cập nhật ngầm.
  if (!isFont) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
