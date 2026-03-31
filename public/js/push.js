function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function registerPush() {
  if (!("PushManager" in window)) return;

  const registration = await navigator.serviceWorker.ready;

  // Already subscribed?
  const existing = await registration.pushManager.getSubscription();
  if (existing) return;

  // Fetch VAPID key
  const res = await fetch("/api/push/vapidPublicKey");
  if (!res.ok) return;
  const { publicKey } = await res.json();

  // Subscribe
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  // Send to server
  await fetch("/api/push/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
}
