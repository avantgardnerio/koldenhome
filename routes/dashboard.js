import { Router } from "express";
import { asyncHandler } from "../lib/helpers.js";
import {
  getAllDashboardItems,
  createDashboardItem,
  updateDashboardItem,
  deleteDashboardItem,
} from "../lib/db.js";

const router = Router();

export default (manager) => {
  /**
   * @openapi
   * /dashboard:
   *   get:
   *     tags: [Dashboard]
   *     summary: Get all dashboard items with current values
   *     responses:
   *       200:
   *         description: Array of dashboard items enriched with live values
   */
  router.get("/", asyncHandler(async (_req, res) => {
    const items = await getAllDashboardItems();
    const driver = manager.getDriver();
    const enriched = items.map((item) => {
      const node = driver.controller.nodes.get(item.node_id);
      if (!node) return { ...item, value: null, metadata: null };
      const writeId = {
        commandClass: item.command_class,
        property: item.property,
        propertyKey: item.property_key ?? undefined,
        endpoint: item.endpoint ?? undefined,
      };
      // If read_property is set, display from that but write to property
      const readId = item.read_property
        ? { ...writeId, property: item.read_property, propertyKey: item.read_property_key ?? undefined }
        : writeId;
      const metadata = node.getValueMetadata(writeId);
      if (item.true_value != null && item.false_value != null && metadata.states) {
        metadata.states = {
          [item.false_value]: metadata.states[String(item.false_value)] ?? String(item.false_value),
          [item.true_value]: metadata.states[String(item.true_value)] ?? String(item.true_value),
        };
        metadata.trueValue = item.true_value;
      }
      return {
        ...item,
        value: node.getValue(readId),
        metadata,
      };
    });
    res.json(enriched);
  }));

  /**
   * @openapi
   * /dashboard:
   *   post:
   *     tags: [Dashboard]
   *     summary: Create a dashboard item
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [node_id, label, command_class, property]
   *             properties:
   *               node_id:
   *                 type: integer
   *               label:
   *                 type: string
   *               command_class:
   *                 type: integer
   *               property:
   *                 type: string
   *               property_key:
   *                 type: string
   *               endpoint:
   *                 type: integer
   *               sort_order:
   *                 type: integer
   *     responses:
   *       201:
   *         description: Created dashboard item
   */
  router.post("/", asyncHandler(async (req, res) => {
    const item = await createDashboardItem(req.body);
    res.status(201).json(item);
  }));

  /**
   * @openapi
   * /dashboard/{id}:
   *   put:
   *     tags: [Dashboard]
   *     summary: Update a dashboard item
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
   *               label:
   *                 type: string
   *               sort_order:
   *                 type: integer
   *               node_id:
   *                 type: integer
   *               command_class:
   *                 type: integer
   *               property:
   *                 type: string
   *               property_key:
   *                 type: string
   *               endpoint:
   *                 type: integer
   *     responses:
   *       200:
   *         description: Updated dashboard item
   *       404:
   *         description: Item not found
   */
  router.put("/:id", asyncHandler(async (req, res) => {
    const item = await updateDashboardItem(Number(req.params.id), req.body);
    if (!item) return res.status(404).json({ error: "Dashboard item not found" });
    res.json(item);
  }));

  /**
   * @openapi
   * /dashboard/{id}:
   *   delete:
   *     tags: [Dashboard]
   *     summary: Delete a dashboard item
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Deleted
   *       404:
   *         description: Item not found
   */
  router.delete("/:id", asyncHandler(async (req, res) => {
    const deleted = await deleteDashboardItem(Number(req.params.id));
    if (!deleted) return res.status(404).json({ error: "Dashboard item not found" });
    res.json({ ok: true });
  }));

  return router;
};
