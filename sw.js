/* Meu Bloquinho — guarda o app no celular para abrir sem internet. */
var VERSION = 'bloquinho-v1';
var SHELL = [
  './', 'index.html', 'app.css', 'app.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/icon-32.png',
  'fonts/newsreader-latin-400-normal.woff2', 'fonts/newsreader-latin-500-normal.woff2', 'fonts/newsreader-latin-400-italic.woff2',
  'fonts/figtree-latin-400-normal.woff2', 'fonts/figtree-latin-500-normal.woff2', 'fonts/figtree-latin-600-normal.woff2'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
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

  // páginas e código: tenta a versão nova; sem internet, usa a guardada
  if (req.mode === 'navigate' || /\.(html|js|css|webmanifest)$/.test(url.pathname) || url.pathname.endsWith('/')) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
        return res;
      }).catch(function () {
        return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || caches.match('index.html'); });
      })
    );
    return;
  }
  // fontes e ícones: do cache primeiro
  e.respondWith(caches.match(req).then(function (hit) {
    return hit || fetch(req).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
      return res;
    });
  }));
});
