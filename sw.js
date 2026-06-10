// MGI PRO — Service Worker
// Cache para funcionamento offline + atualização automática

// IMPORTANTE: ao publicar nova versão do app, incremente este número.
// Isso força todos os dispositivos a baixarem a versão nova (limpa cache antigo).
const CACHE_NAME = 'mgi-pro-v7';

const ASSETS = [
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
];

// Instalação: pré-cacheia só assets estáticos (NÃO o HTML)
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// Ativação: limpa TODOS os caches antigos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;

  // Nunca intercepta chamadas externas (API, Firebase, Google)
  if (req.url.includes('api.anthropic.com') ||
      req.url.includes('googleapis.com') ||
      req.url.includes('gstatic.com') ||
      req.url.includes('firebaseio.com') ||
      req.url.includes('cloudfunctions.net')) {
    return;
  }

  // HTML/navegação: SEMPRE network first (nunca serve HTML velho havendo rede)
  if (req.mode === 'navigate' ||
      req.destination === 'document' ||
      req.url.endsWith('.html') ||
      req.url.endsWith('/')) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // Demais recursos: cache first
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
      return res;
    }))
  );
});
