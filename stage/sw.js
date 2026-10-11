// AORAES · service worker mínimo — habilita la instalación como PWA (icono, pantalla completa)
// sin cache offline: siempre sirve de red para evitar datos de cliente obsoletos en localStorage.
self.addEventListener('install', function(e){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ self.clients.claim(); });
self.addEventListener('fetch', function(e){ e.respondWith(fetch(e.request)); });
