import { Router } from "express";
import { asyncHandler } from "../lib/helpers.js";

const router = Router();

export default (driver) => {
  /**
   * @openapi
   * /controller/nodes/{id}/associations:
   *   get:
   *     tags: [Controller - Associations]
   *     summary: Get all associations for a node (all endpoints)
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Association map
   */
  router.get("/:id/associations", (req, res) => {
    const id = Number(req.params.id);
    const assocMap = driver.controller.getAllAssociations(id);
    const result = {};
    for (const [source, groups] of assocMap) {
      const key = `${source.nodeId}:${source.endpoint ?? 0}`;
      result[key] = {};
      for (const [groupId, destinations] of groups) {
        result[key][groupId] = [...destinations];
      }
    }
    res.json(result);
  });

  /**
   * @openapi
   * /controller/nodes/{id}/association-groups:
   *   get:
   *     tags: [Controller - Associations]
   *     summary: Get all association groups for a node (all endpoints)
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Association groups map
   */
  router.get("/:id/association-groups", (req, res) => {
    const id = Number(req.params.id);
    const groupsMap = driver.controller.getAllAssociationGroups(id);
    const result = {};
    for (const [endpointIndex, groups] of groupsMap) {
      result[endpointIndex] = {};
      for (const [groupId, group] of groups) {
        result[endpointIndex][groupId] = group;
      }
    }
    res.json(result);
  });

  /**
   * @openapi
   * /controller/nodes/{id}/associations/add:
   *   post:
   *     tags: [Controller - Associations]
   *     summary: Add associations
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
   *             required: [group, destinations]
   *             properties:
   *               endpoint:
   *                 type: integer
   *                 default: 0
   *               group:
   *                 type: integer
   *               destinations:
   *                 type: array
   *                 items:
   *                   type: object
   *                   properties:
   *                     nodeId:
   *                       type: integer
   *                     endpoint:
   *                       type: integer
   *               force:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Associations added
   */
  router.post("/:id/associations/add", asyncHandler(async (req, res) => {
    const source = { nodeId: Number(req.params.id), endpoint: req.body.endpoint ?? 0 };
    const { group, destinations, force } = req.body;
    await driver.controller.addAssociations(source, group, destinations, { force });
    res.json({ ok: true });
  }));

  /**
   * @openapi
   * /controller/nodes/{id}/associations/remove:
   *   post:
   *     tags: [Controller - Associations]
   *     summary: Remove associations
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
   *             required: [group, destinations]
   *             properties:
   *               endpoint:
   *                 type: integer
   *                 default: 0
   *               group:
   *                 type: integer
   *               destinations:
   *                 type: array
   *                 items:
   *                   type: object
   *                   properties:
   *                     nodeId:
   *                       type: integer
   *                     endpoint:
   *                       type: integer
   *     responses:
   *       200:
   *         description: Associations removed
   */
  router.post("/:id/associations/remove", asyncHandler(async (req, res) => {
    const source = { nodeId: Number(req.params.id), endpoint: req.body.endpoint ?? 0 };
    const { group, destinations } = req.body;
    await driver.controller.removeAssociations(source, group, destinations);
    res.json({ ok: true });
  }));

  /**
   * @openapi
   * /controller/nodes/{id}/associations/remove-all:
   *   post:
   *     tags: [Controller - Associations]
   *     summary: Remove node from all other nodes' associations
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Node removed from all associations
   */
  router.post("/:id/associations/remove-all", asyncHandler(async (req, res) => {
    await driver.controller.removeNodeFromAllAssociations(Number(req.params.id));
    res.json({ ok: true });
  }));

  return router;
};
