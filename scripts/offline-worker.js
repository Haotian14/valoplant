const scope = new URL(self.registration.scope);
const prefix = `team-playbook:${scope.pathname}:`;
const cacheName = prefix + version;
const strategyCache = prefix + 'entries';
const app = new URL('index.html', scope);
const prepared = new Set(files.map(path => new URL(path, scope).href));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll(prepared);
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(prefix) && name !== cacheName && name !== strategyCache).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.open(cacheName)).match(app)));
  } else if (prepared.has(url.href)) {
    event.respondWith((async () => (await (await caches.open(cacheName)).match(request)) ?? fetch(request))());
  } else if (url.pathname.startsWith(new URL('strategies/', scope).pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(strategyCache);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return (await cache.match(request)) ?? Response.error();
      }
    })());
  }
});
