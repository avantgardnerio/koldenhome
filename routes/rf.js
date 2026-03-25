import { Router } from "express";
import { asyncHandler } from "../lib/helpers.js";

const router = Router();

export default (manager) => {
  /**
   * @openapi
   * /controller/rf/region:
   *   get:
   *     tags: [Controller - RF]
   *     summary: Get current RF region
   *     responses:
   *       200:
   *         description: Current RF region
   */
  router.get("/region", asyncHandler(async (_req, res) => {
    const region = await manager.getDriver().controller.getRFRegion();
    res.json({ region });
  }));

  /**
   * @openapi
   * /controller/rf/region:
   *   put:
   *     tags: [Controller - RF]
   *     summary: Set RF region
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [region]
   *             properties:
   *               region:
   *                 type: number
   *     responses:
   *       200:
   *         description: Whether region was set
   */
  router.put("/region", asyncHandler(async (req, res) => {
    const success = await manager.getDriver().controller.setRFRegion(req.body.region);
    res.json({ success });
  }));

  /**
   * @openapi
   * /controller/rf/regions:
   *   get:
   *     tags: [Controller - RF]
   *     summary: Get supported RF regions
   *     responses:
   *       200:
   *         description: List of supported regions
   */
  router.get("/regions", (_req, res) => {
    const regions = manager.getDriver().controller.getSupportedRFRegions();
    res.json(regions ?? null);
  });

  /**
   * @openapi
   * /controller/rf/powerlevel:
   *   get:
   *     tags: [Controller - RF]
   *     summary: Get current powerlevel settings
   *     responses:
   *       200:
   *         description: Powerlevel info
   */
  router.get("/powerlevel", asyncHandler(async (_req, res) => {
    const pl = await manager.getDriver().controller.getPowerlevel();
    res.json(pl);
  }));

  /**
   * @openapi
   * /controller/rf/powerlevel:
   *   put:
   *     tags: [Controller - RF]
   *     summary: Set powerlevel
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [powerlevel, measured0dBm]
   *             properties:
   *               powerlevel:
   *                 type: number
   *               measured0dBm:
   *                 type: number
   *     responses:
   *       200:
   *         description: Whether powerlevel was set
   */
  router.put("/powerlevel", asyncHandler(async (req, res) => {
    const success = await manager.getDriver().controller.setPowerlevel(req.body.powerlevel, req.body.measured0dBm);
    res.json({ success });
  }));

  /**
   * @openapi
   * /controller/rf/long-range/powerlevel:
   *   get:
   *     tags: [Controller - RF]
   *     summary: Get max Long Range powerlevel
   *     responses:
   *       200:
   *         description: Max LR powerlevel
   */
  router.get("/long-range/powerlevel", asyncHandler(async (_req, res) => {
    const limit = await manager.getDriver().controller.getMaxLongRangePowerlevel();
    res.json({ maxPowerlevel: limit });
  }));

  /**
   * @openapi
   * /controller/rf/long-range/powerlevel:
   *   put:
   *     tags: [Controller - RF]
   *     summary: Set max Long Range powerlevel
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [limit]
   *             properties:
   *               limit:
   *                 type: number
   *     responses:
   *       200:
   *         description: Whether limit was set
   */
  router.put("/long-range/powerlevel", asyncHandler(async (req, res) => {
    const success = await manager.getDriver().controller.setMaxLongRangePowerlevel(req.body.limit);
    res.json({ success });
  }));

  /**
   * @openapi
   * /controller/rf/long-range/channel:
   *   get:
   *     tags: [Controller - RF]
   *     summary: Get Long Range channel setting
   *     responses:
   *       200:
   *         description: LR channel info
   */
  router.get("/long-range/channel", asyncHandler(async (_req, res) => {
    const info = await manager.getDriver().controller.getLongRangeChannel();
    res.json(info);
  }));

  /**
   * @openapi
   * /controller/rf/long-range/channel:
   *   put:
   *     tags: [Controller - RF]
   *     summary: Set Long Range channel
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [channel]
   *             properties:
   *               channel:
   *                 type: number
   *     responses:
   *       200:
   *         description: Whether channel was set
   */
  router.put("/long-range/channel", asyncHandler(async (req, res) => {
    const success = await manager.getDriver().controller.setLongRangeChannel(req.body.channel);
    res.json({ success });
  }));

  /**
   * @openapi
   * /controller/rf/toggle:
   *   post:
   *     tags: [Controller - RF]
   *     summary: Turn Z-Wave radio on or off
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [enabled]
   *             properties:
   *               enabled:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Whether toggle succeeded
   */
  router.post("/toggle", asyncHandler(async (req, res) => {
    const success = await manager.getDriver().controller.toggleRF(req.body.enabled);
    res.json({ success });
  }));

  /**
   * @openapi
   * /controller/rf/rssi:
   *   get:
   *     tags: [Controller - RF]
   *     summary: Get background RSSI levels
   *     responses:
   *       200:
   *         description: RSSI readings per channel
   */
  router.get("/rssi", asyncHandler(async (_req, res) => {
    const rssi = await manager.getDriver().controller.getBackgroundRSSI();
    res.json(rssi);
  }));

  return router;
};
