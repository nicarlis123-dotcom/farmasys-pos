// Service Worker — Farmacia Davalsi PWA v3.2
// Soporte de Carga Instantánea, Cache-First y Funcionamiento Offline de Emergencia
const CACHE_NAME = 'farmacia-davalsi-pwa-v3.2';
const STATIC_ASSETS = [
  '/',
  '/app',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/favicon.ico',
  '/farmasys.ico',
  '/icon-192.png',
  '/icon-512.png',
  '/farmaia_model.jpg'
];

// 1. Instalación y Precaché de Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// 2. Activación y Limpieza de Versiones Antiguas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Estrategia de Fetch: Network-First con Fallback de Caché Offline
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solicitudes API
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          // Si es catálogo de productos o kits, actualizar caché para uso offline
          if (networkRes.ok && (url.pathname === '/api/products' || url.pathname === '/api/promotional-kits' || url.pathname.startsWith('/api/delivery/tracking'))) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkRes;
        })
        .catch(() => {
          // Si no hay red, responder desde caché offline
          return caches.match(req).then((cached) => {
            if (cached) return cached;
            // Payload de emergencia offline
            return new Response(JSON.stringify({
              ok: true,
              offline_mode: true,
              mensaje: "Operando en modo offline de emergencia. Mostrando datos locales cacheados."
            }), {
              headers: { 'Content-Type': 'application/json' }
            });
          });
        })
    );
    return;
  }

  // Navegación HTML o Recursos Estáticos
  event.respondWith(
    caches.match(req).then((cachedRes) => {
      const fetchPromise = fetch(req)
        .then((networkRes) => {
          if (networkRes.ok) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkRes;
        })
        .catch(() => {
          // Si es navegación a /app y falla la red, devolver index.html cacheado
          if (req.mode === 'navigate' || url.pathname === '/app') {
            return caches.match('/app').then((fallback) => fallback || caches.match('/index.html'));
          }
          return cachedRes;
        });

      // Retornar caché primero si existe para carga instantánea, actualizando en segundo plano
      return cachedRes || fetchPromise;
    })
  );
});
