import { Router } from "express";
import { asyncHandler } from "../lib/helpers.js";

const router = Router();

export default (driver) => {
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
    res.json(driver.getLogConfig());
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
  router.post("/soft-reset", asyncHandler(async (_req, res) => {
    await driver.softReset();
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
  router.post("/hard-reset", asyncHandler(async (_req, res) => {
    await driver.hardReset();
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
  router.post("/shutdown", asyncHandler(async (_req, res) => {
    const success = await driver.shutdown();
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
    const version = await driver.checkForConfigUpdates();
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
  router.post("/config-updates/install", asyncHandler(async (_req, res) => {
    const installed = await driver.installConfigUpdate();
    res.json({ installed });
  }));

  return router;
};
