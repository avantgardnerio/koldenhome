import { Router } from "express";
import { asyncHandler } from "../lib/helpers.js";
import { getAllDevices } from "../lib/db.js";

const router = Router();

export default (manager) => {
  /**
   * @openapi
   * /battery:
   *   get:
   *     tags: [Battery]
   *     summary: Get battery levels for all battery-powered nodes
   *     responses:
   *       200:
   *         description: Array of battery status objects
   */
  router.get("/", asyncHandler(async (_req, res) => {
    const driver = manager.getDriver();
    const devices = await getAllDevices();
    const deviceMap = Object.fromEntries(devices.map((d) => [d.node_id, d]));

    const results = [];
    for (const node of driver.controller.nodes.values()) {
      if (!node.supportsCC(0x80)) continue; // CC 128 = Battery
      const level = node.getValue({ commandClass: 0x80, property: "level" });
      const isLow = node.getValue({ commandClass: 0x80, property: "isLow" });
      const lastSeen = node.getValueTimestamp({ commandClass: 0x80, property: "level" });
      const dev = deviceMap[node.id];
      results.push({
        nodeId: node.id,
        name: dev?.name || node.name || `Node ${node.id}`,
        level,
        isLow: isLow ?? false,
        lastSeen: lastSeen ?? null,
      });
    }

    results.sort((a, b) => (a.level ?? 999) - (b.level ?? 999));
    res.json(results);
  }));

  return router;
};
