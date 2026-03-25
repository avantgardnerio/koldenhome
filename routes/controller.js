import { Router } from "express";
import { asyncHandler } from "../lib/helpers.js";

const router = Router();

export default (manager) => {
  /**
   * @openapi
   * /controller:
   *   get:
   *     tags: [Controller]
   *     summary: Get controller info
   *     responses:
   *       200:
   *         description: Controller information
   */
  router.get("/", (_req, res) => {
    const ctrl = manager.getDriver().controller;
    res.json({
      type: ctrl.type,
      homeId: ctrl.homeId?.toString(16),
      ownNodeId: ctrl.ownNodeId,
      role: ctrl.role,
      status: ctrl.status,
      protocolVersion: ctrl.protocolVersion,
      sdkVersion: ctrl.sdkVersion,
      firmwareVersion: ctrl.firmwareVersion,
      manufacturerId: ctrl.manufacturerId,
      productType: ctrl.productType,
      productId: ctrl.productId,
      nodeIdType: ctrl.nodeIdType,
      isSIS: ctrl.isSIS,
      isSUC: ctrl.isSUC,
      isSISPresent: ctrl.isSISPresent,
      sucNodeId: ctrl.sucNodeId,
      supportsTimers: ctrl.supportsTimers,
      supportsLongRange: ctrl.supportsLongRange,
      rfRegion: ctrl.rfRegion,
      txPower: ctrl.txPower,
      maxLongRangePowerlevel: ctrl.maxLongRangePowerlevel,
      longRangeChannel: ctrl.longRangeChannel,
      supportsLongRangeAutoChannelSelection: ctrl.supportsLongRangeAutoChannelSelection,
      maxPayloadSize: ctrl.maxPayloadSize,
      maxPayloadSizeLR: ctrl.maxPayloadSizeLR,
      inclusionState: ctrl.inclusionState,
      isRebuildingRoutes: ctrl.isRebuildingRoutes,
      nodeCount: ctrl.nodes.size,
    });
  });

  /**
   * @openapi
   * /controller/inclusion/start:
   *   post:
   *     tags: [Controller - Inclusion]
   *     summary: Start inclusion mode
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               strategy:
   *                 type: number
   *                 description: "0=Default, 2=Insecure, 3=S0, 4=S2"
   *     responses:
   *       200:
   *         description: Whether inclusion was started
   */
  router.post("/inclusion/start", asyncHandler(async (req, res) => {
    const options = req.body || { strategy: 0 };
    const started = await manager.getDriver().controller.beginInclusion(options);
    res.json({ started });
  }));

  /**
   * @openapi
   * /controller/inclusion/stop:
   *   post:
   *     tags: [Controller - Inclusion]
   *     summary: Stop inclusion mode
   *     responses:
   *       200:
   *         description: Whether inclusion was stopped
   */
  router.post("/inclusion/stop", asyncHandler(async (_req, res) => {
    const stopped = await manager.getDriver().controller.stopInclusion();
    res.json({ stopped });
  }));

  /**
   * @openapi
   * /controller/exclusion/start:
   *   post:
   *     tags: [Controller - Inclusion]
   *     summary: Start exclusion mode
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               strategy:
   *                 type: number
   *                 description: "0=ExcludeOnly, 1=DisableProvisioningEntry, 2=Unprovision"
   *     responses:
   *       200:
   *         description: Whether exclusion was started
   */
  router.post("/exclusion/start", asyncHandler(async (req, res) => {
    const options = req.body || { strategy: 0 };
    const started = await manager.getDriver().controller.beginExclusion(options);
    res.json({ started });
  }));

  /**
   * @openapi
   * /controller/exclusion/stop:
   *   post:
   *     tags: [Controller - Inclusion]
   *     summary: Stop exclusion mode
   *     responses:
   *       200:
   *         description: Whether exclusion was stopped
   */
  router.post("/exclusion/stop", asyncHandler(async (_req, res) => {
    const stopped = await manager.getDriver().controller.stopExclusion();
    res.json({ stopped });
  }));

  /**
   * @openapi
   * /controller/nodes/{id}/is-failed:
   *   get:
   *     tags: [Controller - Nodes]
   *     summary: Check if a node is marked as failed
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Whether the node is marked as failed
   */
  router.get("/nodes/:id/is-failed", asyncHandler(async (req, res) => {
    const failed = await manager.getDriver().controller.isFailedNode(Number(req.params.id));
    res.json({ failed });
  }));

  /**
   * @openapi
   * /controller/nodes/{id}/remove-failed:
   *   post:
   *     tags: [Controller - Nodes]
   *     summary: Remove a failed node
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Node removed
   */
  router.post("/nodes/:id/remove-failed", asyncHandler(async (req, res) => {
    await manager.getDriver().controller.removeFailedNode(Number(req.params.id));
    res.json({ ok: true });
  }));

  /**
   * @openapi
   * /controller/nodes/{id}/configure-suc:
   *   post:
   *     tags: [Controller]
   *     summary: Configure a node as SUC/SIS
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
   *             properties:
   *               enableSUC:
   *                 type: boolean
   *               enableSIS:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Whether configuration succeeded
   */
  router.post("/nodes/:id/configure-suc", asyncHandler(async (req, res) => {
    const success = await manager.getDriver().controller.configureSUC(
      Number(req.params.id),
      req.body.enableSUC,
      req.body.enableSIS,
    );
    res.json({ success });
  }));

  return router;
};
