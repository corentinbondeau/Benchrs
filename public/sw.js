self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? { title: "SportPlus", body: "" };
  const options: NotificationOptions = {
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
  const urlToOpen = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.openWindow(urlToOpen)
  );
});
