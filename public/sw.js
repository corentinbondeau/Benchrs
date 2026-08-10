const CACHE_NAME = "benchrs-cache-v1";
const OFFLINE_URL = "/offline";
const PRECACHE_URLS = ["/", "/calendar", "/matches", "/trainings", "/stats", OFFLINE_URL];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.allSettled(
        PRECACHE_URLS.map((url) => cache.add(url).catch(() => null))
      );
    })()
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/auth/")) return;

  // Navigations (pages) : network-first avec repli sur le cache puis sur la page hors-ligne
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match(request);
          return cached || (await cache.match(OFFLINE_URL));
        }
      })()
    );
    return;
  }

  // Assets Next.js (JS/CSS hachés) et fichiers statiques : stale-while-revalidate
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || networkPromise;
      })()
    );
    return;
  }
});

self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? { title: "Benchrs", body: "" };
  const options = {
    body: data.body,
    icon: "/logo.svg",
    badge: "/logo.svg",
    vibrate: [200, 100, 200],
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen = new URL(
    event.notification.data?.url || "/",
    self.registration.scope
  ).toString();

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windowClients) {
        if (client.url.startsWith(new URL("/", self.registration.scope).toString())) {
          await client.navigate(urlToOpen);
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow(urlToOpen);
    })()
  );
});
