import webPush from "web-push";
import { getConfig, setConfig, pool } from "./db.js";

let vapidPublicKey = null;

export async function initPush() {
  let publicKey = await getConfig("vapid.publicKey");
  let privateKey = await getConfig("vapid.privateKey");

  if (!publicKey || !privateKey) {
    const keys = webPush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    await setConfig("vapid.publicKey", publicKey);
    await setConfig("vapid.privateKey", privateKey);
    console.log("[push] generated new VAPID keys");
  }

  webPush.setVapidDetails("mailto:bgardner@squarelabs.net", publicKey, privateKey);
  vapidPublicKey = publicKey;
  console.log("[push] VAPID configured");
}

export function getVapidPublicKey() {
  return vapidPublicKey;
}

export async function saveSubscription(userId, subscription) {
  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, keys)
     VALUES ($1, $2, $3)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, keys = $3`,
    [userId ?? null, subscription.endpoint, JSON.stringify(subscription.keys)],
  );
}

export async function notify({ title, body, data }) {
  const { rows } = await pool.query("SELECT id, endpoint, keys FROM push_subscriptions");
  if (rows.length === 0) return;

  const payload = JSON.stringify({ title, body, data });
  const dead = [];

  await Promise.allSettled(
    rows.map(async (sub) => {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: typeof sub.keys === "string" ? JSON.parse(sub.keys) : sub.keys },
          payload,
        );
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          dead.push(sub.id);
        } else {
          console.error(`[push] failed to send to sub ${sub.id}: ${err.message}`);
        }
      }
    }),
  );

  if (dead.length > 0) {
    await pool.query("DELETE FROM push_subscriptions WHERE id = ANY($1)", [dead]);
    console.log(`[push] removed ${dead.length} dead subscription(s)`);
  }
}
