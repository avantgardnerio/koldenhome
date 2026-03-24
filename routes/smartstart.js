import { Router } from "express";

const router = Router();

export default (driver) => {
  /**
   * @openapi
   * /controller/provisioning:
   *   get:
   *     tags: [Controller - SmartStart]
   *     summary: Get all SmartStart provisioning entries
   *     responses:
   *       200:
   *         description: List of provisioning entries
   */
  router.get("/", (_req, res) => {
    res.json(driver.controller.getProvisioningEntries());
  });

  /**
   * @openapi
   * /controller/provisioning/{dsk}:
   *   get:
   *     tags: [Controller - SmartStart]
   *     summary: Get a provisioning entry by DSK
   *     parameters:
   *       - name: dsk
   *         in: path
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Provisioning entry or null
   */
  router.get("/:dsk", (req, res) => {
    const entry = driver.controller.getProvisioningEntry(req.params.dsk);
    res.json(entry ?? null);
  });

  /**
   * @openapi
   * /controller/provisioning:
   *   post:
   *     tags: [Controller - SmartStart]
   *     summary: Add or update a SmartStart provisioning entry
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [dsk, securityClasses]
   *             properties:
   *               dsk:
   *                 type: string
   *               securityClasses:
   *                 type: array
   *                 items:
   *                   type: number
   *     responses:
   *       200:
   *         description: Entry provisioned
   */
  router.post("/", (req, res) => {
    driver.controller.provisionSmartStartNode(req.body);
    res.json({ ok: true });
  });

  /**
   * @openapi
   * /controller/provisioning/{dsk}:
   *   delete:
   *     tags: [Controller - SmartStart]
   *     summary: Remove a SmartStart provisioning entry
   *     parameters:
   *       - name: dsk
   *         in: path
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Entry removed
   */
  router.delete("/:dsk", (req, res) => {
    driver.controller.unprovisionSmartStartNode(req.params.dsk);
    res.json({ ok: true });
  });

  return router;
};
