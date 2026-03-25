import { Router } from "express";
import { asyncHandler } from "../lib/helpers.js";

const router = Router();

export default (manager) => {
  /**
   * @openapi
   * /controller/firmware-updates:
   *   get:
   *     tags: [Controller - Firmware]
   *     summary: Get available firmware updates for all nodes
   *     responses:
   *       200:
   *         description: Map of node ID to available updates
   */
  router.get("/", asyncHandler(async (_req, res) => {
    const updates = await manager.getDriver().controller.getAllAvailableFirmwareUpdates();
    const result = {};
    for (const [nodeId, info] of updates) {
      result[nodeId] = info;
    }
    res.json(result);
  }));

  /**
   * @openapi
   * /controller/firmware-updates/nodes/{id}:
   *   get:
   *     tags: [Controller - Firmware]
   *     summary: Get available firmware updates for a node
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Available updates
   */
  router.get("/nodes/:id", asyncHandler(async (req, res) => {
    const updates = await manager.getDriver().controller.getAvailableFirmwareUpdates(Number(req.params.id));
    res.json(updates);
  }));

  return router;
};
