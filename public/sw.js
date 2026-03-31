self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const { title = "KoldenHome", body = "", data: payload } = data;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      data: payload,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          return client.focus();
        }
      }
      return clients.openWindow("/");
    }),
  );
});
