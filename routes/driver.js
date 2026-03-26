import { Router } from "express";
import { asyncHandler } from "../lib/helpers.js";
import { requireLocal } from "../lib/auth.js";

const router = Router();

export default (manager) => {
  /**
   * @openapi
   * /driver/status:
   *   get:
   *     tags: [Driver]
   *     summary: Get driver status
   *     responses:
   *       200:
   *         description: Driver status info
   */
  router.get("/status", (_req, res) => {
    const driver = manager.getDriver();
    res.json({
      ready: driver.ready,
      allNodesReady: driver.allNodesReady,
      statisticsEnabled: driver.statisticsEnabled,
    });
  });

  /**
   * @openapi
   * /driver/log-config:
   *   get:
   *     tags: [Driver]
   *     summary: Get current log configuration
   *     responses:
   *       200:
   *         description: Current log config
   */
  router.get("/log-config", (_req, res) => {
    res.json(manager.getDriver().getLogConfig());
  });

  /**
   * @openapi
   * /driver/log-config:
   *   put:
   *     tags: [Driver]
   *     summary: Update log configuration
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               enabled:
   *                 type: boolean
   *               level:
   *                 type: string
   *                 enum: [error, warn, info, http, verbose, debug, silly]
   *     responses:
   *       200:
   *         description: Log config updated
   */
  router.put("/log-config", (req, res) => {
    const driver = manager.getDriver();
    driver.updateLogConfig(req.body);
    res.json({ ok: true, config: driver.getLogConfig() });
  });

  /**
   * @openapi
   * /driver/soft-reset:
   *   post:
   *     tags: [Driver]
   *     summary: Soft-reset the controller
   *     responses:
   *       200:
   *         description: Soft reset completed
   */
  router.post("/soft-reset", requireLocal, asyncHandler(async (_req, res) => {
    await manager.getDriver().softReset();
    res.json({ ok: true });
  }));

  /**
   * @openapi
   * /driver/hard-reset:
   *   post:
   *     tags: [Driver]
   *     summary: Hard-reset the controller (WIPES ALL CONFIG)
   *     responses:
   *       200:
   *         description: Hard reset completed
   */
  router.post("/hard-reset", requireLocal, asyncHandler(async (_req, res) => {
    await manager.getDriver().hardReset();
    res.json({ ok: true });
  }));

  /**
   * @openapi
   * /driver/shutdown:
   *   post:
   *     tags: [Driver]
   *     summary: Shut down the Z-Wave API for safe power removal
   *     responses:
   *       200:
   *         description: Shutdown result
   */
  router.post("/shutdown", requireLocal, asyncHandler(async (_req, res) => {
    const success = await manager.getDriver().shutdown();
    res.json({ ok: success });
  }));

  /**
   * @openapi
   * /driver/config-updates/check:
   *   get:
   *     tags: [Driver]
   *     summary: Check for config DB updates
   *     responses:
   *       200:
   *         description: Available update version or null
   */
  router.get("/config-updates/check", asyncHandler(async (_req, res) => {
    const version = await manager.getDriver().checkForConfigUpdates();
    res.json({ availableVersion: version ?? null });
  }));

  /**
   * @openapi
   * /driver/config-updates/install:
   *   post:
   *     tags: [Driver]
   *     summary: Install config DB update
   *     responses:
   *       200:
   *         description: Whether an update was installed
   */
  router.post("/config-updates/install", requireLocal, asyncHandler(async (_req, res) => {
    const installed = await manager.getDriver().installConfigUpdate();
    res.json({ installed });
  }));

  // ─── Security Keys ──────────────────────────────────────────────────────

  /**
   * @openapi
   * /driver/security-keys:
   *   get:
   *     tags: [Driver]
   *     summary: Get currently configured security keys (hex strings)
   *     responses:
   *       200:
   *         description: Security keys
   */
  router.get("/security-keys", requireLocal, (_req, res) => {
    res.json(manager.getSecurityKeys());
  });

  /**
   * @openapi
   * /driver/security-keys:
   *   put:
   *     tags: [Driver]
   *     summary: Set security keys (auto-generates any missing keys)
   *     description: >
   *       Accepts optional hex strings for each key. Any key not provided
   *       will be auto-generated. Keys take effect on next driver restart.
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               S2_Unauthenticated:
   *                 type: string
   *                 description: 32-char hex string (16 bytes)
   *               S2_Authenticated:
   *                 type: string
   *                 description: 32-char hex string (16 bytes)
   *               S2_AccessControl:
   *                 type: string
   *                 description: 32-char hex string (16 bytes)
   *               S0_Legacy:
   *                 type: string
   *                 description: 32-char hex string (16 bytes)
   *               longRange:
   *                 type: object
   *                 properties:
   *                   S2_Authenticated:
   *                     type: string
   *                     description: 32-char hex string (16 bytes)
   *                   S2_AccessControl:
   *                     type: string
   *                     description: 32-char hex string (16 bytes)
   *     responses:
   *       200:
   *         description: Keys stored (takes effect on restart)
   */
  router.put("/security-keys", requireLocal, asyncHandler(async (req, res) => {
    const keys = await manager.setSecurityKeys(req.body || {});
    res.json(keys);
  }));

  // ─── Restart ────────────────────────────────────────────────────────────

  /**
   * @openapi
   * /driver/restart:
   *   post:
   *     tags: [Driver]
   *     summary: Restart the Z-Wave driver with current configuration
   *     description: >
   *       Destroys the current driver and creates a new one with the
   *       current security keys and config. Use after setting security keys.
   *     responses:
   *       200:
   *         description: Driver restarted successfully
   */
  router.post("/restart", requireLocal, asyncHandler(async (_req, res) => {
    await manager.restart();
    res.json({ ok: true });
  }));

  return router;
};
