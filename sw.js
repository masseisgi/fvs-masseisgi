// MGI PRO — Service Worker
// Cache para funcionamento offline + atualização automática

// IMPORTANTE: ao publicar nova versão do app, incremente este número.
// Isso força todos os dispositivos a baixarem a versão nova (limpa cache antigo).
const CACHE_NAME = 'mgi-pro-v81';

const ASSETS = [
  './manifest.json',
  './manual.html',
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
  try { const u = new URL(event.request.url); if (/\/(admin|login|demo)\.html$/.test(u.pathname)) return; } catch(e) {}

  const req = event.request;

  // Nunca intercepta chamadas externas (API, Firebase, Google)
  if (req.url.includes('api.anthropic.com') ||
      req.url.includes('googleapis.com') ||
      req.url.includes('gstatic.com') ||
      req.url.includes('firebaseio.com') ||
      req.url.includes('cloudfunctions.net') ||
      req.url.includes('open-meteo.com')) {
    return;
  }

  // HTML/navegação: SEMPRE network first (nunca serve HTML velho havendo rede)
  if (req.mode === 'navigate' ||
      req.destination === 'document' ||
      req.url.endsWith('.html') ||
      req.url.endsWith('/')) {
    // sempre confere com o servidor (ignora o cache do navegador de até 10 min)
    const fresca = req.method === 'GET' ? new Request(req.url, {cache:'no-cache', credentials:'same-origin'}) : req;
    event.respondWith(
      fetch(fresca).then(res => {
        // guarda a última versão para abrir sem internet (manual e app)
        if (res.ok && req.method === 'GET' && new URL(req.url).origin === location.origin) {
          const copy = res.clone(); caches.open(CACHE_NAME).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req, {ignoreSearch:true}).then(c => c || caches.match('./app.html')))
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

// ─── Notificações (v81): aviso que chega com o app fechado ───
self.addEventListener('push', event => {
  let d = {};
  try { const j = event.data ? event.data.json() : {}; d = Object.assign({}, j.notification || {}, j.data || {}); } catch (e) { try { d = { body: event.data.text() }; } catch (x) {} }
  const titulo = d.title || d.titulo || 'MGI PRO';
  const opt = {
    body: d.body || d.corpo || '',
    icon: './icons/icon-192x192.png',
    badge: './icons/icon-192x192.png',
    tag: d.tag || d.chave || undefined,
    data: { url: d.url || 'app.html', wa: d.wa || '' },
    actions: d.wa ? [{ action: 'abrir', title: 'Abrir' }, { action: 'wa', title: '📲 WhatsApp' }] : []
  };
  event.waitUntil(self.registration.showNotification(titulo, opt));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const d = event.notification.data || {};
  let url = new URL(d.url || 'app.html', self.registration.scope).href;
  if (event.action === 'wa' && d.wa) url = 'https://wa.me/?text=' + encodeURIComponent(d.wa);
  event.waitUntil((async () => {
    if (event.action !== 'wa') {
      const abertos = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of abertos) { if (c.url.includes('app.html') && 'focus' in c) { try { await c.focus(); return; } catch (e) {} } }
    }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});
