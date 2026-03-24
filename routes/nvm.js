import { Router } from "express";
import { asyncHandler } from "../lib/helpers.js";

const router = Router();

export default (driver) => {
  /**
   * @openapi
   * /controller/nvm/backup:
   *   post:
   *     tags: [Controller - NVM]
   *     summary: Create NVM backup (returns base64)
   *     responses:
   *       200:
   *         description: NVM backup data as base64 string
   */
  router.post("/backup", asyncHandler(async (_req, res) => {
    const data = await driver.controller.backupNVMRaw();
    res.json({ data: Buffer.from(data).toString("base64"), length: data.length });
  }));

  /**
   * @openapi
   * /controller/nvm/restore:
   *   post:
   *     tags: [Controller - NVM]
   *     summary: Restore NVM from backup (base64 input)
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [data]
   *             properties:
   *               data:
   *                 type: string
   *                 description: base64-encoded NVM data
   *     responses:
   *       200:
   *         description: Restore completed
   */
  router.post("/restore", asyncHandler(async (req, res) => {
    const data = Buffer.from(req.body.data, "base64");
    await driver.controller.restoreNVM(data);
    res.json({ ok: true });
  }));

  return router;
};
