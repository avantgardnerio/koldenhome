import { Router } from "express";
import { asyncHandler } from "../lib/helpers.js";

const router = Router();

export default (driver) => {
  // ─── Network-wide routes ─────────────────────────────────────────────

  /**
   * @openapi
   * /controller/routes/rebuild/start:
   *   post:
   *     tags: [Controller - Routing]
   *     summary: Start rebuilding routes for all nodes
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               includeSleeping:
   *                 type: boolean
   *               deletePriorityReturnRoutes:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Whether route rebuild was started
   */
  router.post("/rebuild/start", (req, res) => {
    const started = driver.controller.beginRebuildingRoutes(req.body);
    res.json({ started });
  });

  /**
   * @openapi
   * /controller/routes/rebuild/stop:
   *   post:
   *     tags: [Controller - Routing]
   *     summary: Stop rebuilding routes
   *     responses:
   *       200:
   *         description: Whether route rebuild was stopped
   */
  router.post("/rebuild/stop", (_req, res) => {
    const stopped = driver.controller.stopRebuildingRoutes();
    res.json({ stopped });
  });

  /**
   * @openapi
   * /controller/routes/rebuild/progress:
   *   get:
   *     tags: [Controller - Routing]
   *     summary: Get route rebuild progress
   *     responses:
   *       200:
   *         description: Rebuild progress map or null
   */
  router.get("/rebuild/progress", (_req, res) => {
    const progress = driver.controller.rebuildRoutesProgress;
    if (!progress) return res.json(null);
    const result = {};
    for (const [nodeId, status] of progress) {
      result[nodeId] = status;
    }
    res.json(result);
  });

  /**
   * @openapi
   * /controller/routes/lifeline:
   *   get:
   *     tags: [Controller - Routing]
   *     summary: Get known lifeline routes for all nodes
   *     responses:
   *       200:
   *         description: Map of node ID to lifeline routes
   */
  router.get("/lifeline", (_req, res) => {
    const routes = driver.controller.getKnownLifelineRoutes();
    const result = {};
    for (const [nodeId, route] of routes) {
      result[nodeId] = route;
    }
    res.json(result);
  });

  // ─── Per-node routes ─────────────────────────────────────────────────

  /**
   * @openapi
   * /controller/routes/nodes/{id}/rebuild:
   *   post:
   *     tags: [Controller - Routing]
   *     summary: Rebuild routes for a single node
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Whether rebuild succeeded
   */
  router.post("/nodes/:id/rebuild", asyncHandler(async (req, res) => {
    const success = await driver.controller.rebuildNodeRoutes(Number(req.params.id));
    res.json({ success });
  }));

  /**
   * @openapi
   * /controller/routes/nodes/{id}/neighbors:
   *   get:
   *     tags: [Controller - Routing]
   *     summary: Get known neighbors for a node
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Array of neighbor node IDs
   */
  router.get("/nodes/:id/neighbors", asyncHandler(async (req, res) => {
    const neighbors = await driver.controller.getNodeNeighbors(Number(req.params.id));
    res.json([...neighbors]);
  }));

  /**
   * @openapi
   * /controller/routes/nodes/{id}/neighbors/discover:
   *   post:
   *     tags: [Controller - Routing]
   *     summary: Instruct a node to discover its neighbors
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Whether discovery succeeded
   */
  router.post("/nodes/:id/neighbors/discover", asyncHandler(async (req, res) => {
    const success = await driver.controller.discoverNodeNeighbors(Number(req.params.id));
    res.json({ success });
  }));

  /**
   * @openapi
   * /controller/routes/nodes/{id}/assign-return:
   *   post:
   *     tags: [Controller - Routing]
   *     summary: Assign return routes between two nodes
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [destinationNodeId]
   *             properties:
   *               destinationNodeId:
   *                 type: integer
   *     responses:
   *       200:
   *         description: Whether assignment succeeded
   */
  router.post("/nodes/:id/assign-return", asyncHandler(async (req, res) => {
    const success = await driver.controller.assignReturnRoutes(
      Number(req.params.id),
      req.body.destinationNodeId,
    );
    res.json({ success });
  }));

  /**
   * @openapi
   * /controller/routes/nodes/{id}/delete-return:
   *   post:
   *     tags: [Controller - Routing]
   *     summary: Delete all return routes for a node
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Whether deletion succeeded
   */
  router.post("/nodes/:id/delete-return", asyncHandler(async (req, res) => {
    const success = await driver.controller.deleteReturnRoutes(Number(req.params.id));
    res.json({ success });
  }));

  /**
   * @openapi
   * /controller/routes/nodes/{id}/assign-suc-return:
   *   post:
   *     tags: [Controller - Routing]
   *     summary: Assign SUC return routes for a node
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Whether assignment succeeded
   */
  router.post("/nodes/:id/assign-suc-return", asyncHandler(async (req, res) => {
    const success = await driver.controller.assignSUCReturnRoutes(Number(req.params.id));
    res.json({ success });
  }));

  /**
   * @openapi
   * /controller/routes/nodes/{id}/delete-suc-return:
   *   post:
   *     tags: [Controller - Routing]
   *     summary: Delete SUC return routes for a node
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Whether deletion succeeded
   */
  router.post("/nodes/:id/delete-suc-return", asyncHandler(async (req, res) => {
    const success = await driver.controller.deleteSUCReturnRoutes(Number(req.params.id));
    res.json({ success });
  }));

  /**
   * @openapi
   * /controller/routes/nodes/{id}/priority:
   *   get:
   *     tags: [Controller - Routing]
   *     summary: Get priority route to a node
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Priority route or null
   */
  router.get("/nodes/:id/priority", asyncHandler(async (req, res) => {
    const route = await driver.controller.getPriorityRoute(Number(req.params.id));
    res.json(route ?? null);
  }));

  /**
   * @openapi
   * /controller/routes/nodes/{id}/priority:
   *   put:
   *     tags: [Controller - Routing]
   *     summary: Set priority route to a node
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [repeaters, routeSpeed]
   *             properties:
   *               repeaters:
   *                 type: array
   *                 items:
   *                   type: integer
   *               routeSpeed:
   *                 type: number
   *     responses:
   *       200:
   *         description: Whether setting succeeded
   */
  router.put("/nodes/:id/priority", asyncHandler(async (req, res) => {
    const { repeaters, routeSpeed } = req.body;
    const success = await driver.controller.setPriorityRoute(Number(req.params.id), repeaters, routeSpeed);
    res.json({ success });
  }));

  /**
   * @openapi
   * /controller/routes/nodes/{id}/priority:
   *   delete:
   *     tags: [Controller - Routing]
   *     summary: Remove priority route to a node
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Whether removal succeeded
   */
  router.delete("/nodes/:id/priority", asyncHandler(async (req, res) => {
    const success = await driver.controller.removePriorityRoute(Number(req.params.id));
    res.json({ success });
  }));

  return router;
};
