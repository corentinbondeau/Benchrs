self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
