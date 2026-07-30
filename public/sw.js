const PUBLIC_VAPID_KEY = "BF7jzGmN0q0w0x0y0z0A0B0C0D0E0F0G0H0I0J0K0L0M0N0O0P0Q0R0S0T0U0V0W0X0Y0Z0";

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
