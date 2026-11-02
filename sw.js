/* Meu Bloquinho — guarda o app no celular para abrir sem internet. */
var VERSION = 'bloquinho-v2';
var CORE = ['./', 'index.html', 'app.css', 'app.js', 'manifest.json'];
var EXTRA = [
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'icon-32.png',
  'newsreader-latin-400-normal.woff2', 'newsreader-latin-500-normal.woff2', 'newsreader-latin-400-italic.woff2',
  'figtree-latin-400-normal.woff2', 'figtree-latin-500-normal.woff2', 'figtree-latin-600-normal.woff2'
];

// Cada arquivo é guardado separadamente: se um deles faltar, o resto continua funcionando.
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return Promise.all(CORE.concat(EXTRA).map(function (u) {
      return fetch(u, { cache: 'reload' }).then(function (r) { if (r.ok) return c.put(u, r); }).catch(function () {});
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // a nuvem (GitHub) nunca passa pelo cache

  var isCode = req.mode === 'navigate' || /\.(html|js|css|json)$/.test(url.pathname) || url.pathname.endsWith('/');
  if (isCode) {
    // tenta a versão nova; sem internet, usa a guardada
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
        return res;
      }).catch(function () {
        return caches.match(req, { ignoreSearch: true }).then(function (hit) {
          return hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error());
        });
      })
    );
    return;
  }
  // ícones e fontes: do cache primeiro
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
    return hit || fetch(req).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
      return res;
    });
  }));
});
