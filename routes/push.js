import { Router } from "express";
import { getVapidPublicKey, saveSubscription } from "../lib/notify.js";

const router = Router();

export default () => {
  /**
   * @openapi
   * /push/vapidPublicKey:
   *   get:
   *     tags: [Push]
   *     summary: Get VAPID public key for push subscription
   *     responses:
   *       200:
   *         description: VAPID public key
   */
  router.get("/vapidPublicKey", (_req, res) => {
    const publicKey = getVapidPublicKey();
    if (!publicKey) return res.status(503).json({ error: "Push not configured" });
    res.json({ publicKey });
  });

  /**
   * @openapi
   * /push/register:
   *   post:
   *     tags: [Push]
   *     summary: Register a browser push subscription
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [endpoint, keys]
   *             properties:
   *               endpoint:
   *                 type: string
   *               keys:
   *                 type: object
   *                 properties:
   *                   p256dh:
   *                     type: string
   *                   auth:
   *                     type: string
   *     responses:
   *       201:
   *         description: Subscription saved
   */
  router.post("/register", async (req, res) => {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: "Missing endpoint or keys (p256dh, auth)" });
    }
    const userId = req.session?.userId ?? null;
    await saveSubscription(userId, { endpoint, keys });
    res.status(201).json({ ok: true });
  });

  return router;
};
